import { createHash } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { type Document, isMap, isSeq, parseDocument, stringify, YAMLMap, YAMLSeq } from "yaml";

import type { PipelineDocumentPort } from "@/pipeline/adapters/pipeline_document_port";
import { PipelineEditError, PipelineFileError } from "@/pipeline/models/errors";
import type { PipelineEditDTO, PipelineFileDTO } from "@/pipeline/models/pipeline_edit";

const PIPELINE_FILE_NAME = "pipeline.yaml";
const BACKUP_SUFFIX = ".bak";
const EACH_CHANGE_KEY = "each_change";
const SESSION_KEY = "session";
const TO_STRING_OPTIONS = { lineWidth: 0 } as const;

interface BlockLocation {
  readonly columnKey: string;
  readonly flow: YAMLSeq;
  readonly levelIndex: number;
  readonly block: YAMLMap;
}

const hashOf = (text: string): string => createHash("sha256").update(text).digest("hex");

const isEachChangeLevel = (level: unknown): level is YAMLMap => isMap(level) && level.has(EACH_CHANGE_KEY);

const blocksOfLevel = (level: unknown): readonly YAMLMap[] => {
  if (isSeq(level)) {
    return level.items.filter((item): item is YAMLMap => isMap(item));
  }
  if (isEachChangeLevel(level)) {
    const block = level.get(EACH_CHANGE_KEY, true);
    return isMap(block) ? [block] : [];
  }
  return [];
};

const idOf = (block: YAMLMap): string => {
  const blockId = block.get("id");
  return typeof blockId === "string" ? blockId : "";
};

const isSessionAction = (item: unknown): boolean => isMap(item) && item.has(SESSION_KEY);

export class PipelineDocumentYaml implements PipelineDocumentPort {
  readonly #projectsRootPath: string;

  constructor(projectsRootPath: string) {
    this.#projectsRootPath = projectsRootPath;
  }

  read(projectKey: string): PipelineFileDTO {
    const filePath = this.#filePath(projectKey);
    try {
      const text = readFileSync(filePath, "utf8");
      return { text, hash: hashOf(text) };
    } catch (cause) {
      throw new PipelineFileError(`Could not read ${filePath}`, { cause });
    }
  }

  write(projectKey: string, text: string): void {
    const filePath = this.#filePath(projectKey);
    try {
      if (existsSync(filePath)) {
        copyFileSync(filePath, `${filePath}${BACKUP_SUFFIX}`);
      }
      writeFileSync(filePath, text, "utf8");
    } catch (cause) {
      throw new PipelineFileError(`Could not write ${filePath}`, { cause });
    }
  }

  apply(text: string, edits: readonly PipelineEditDTO[]): string {
    const document = parseDocument(text);
    if (document.errors.length > 0) {
      throw new PipelineEditError(`pipeline.yaml can't be parsed: ${document.errors[0]?.message ?? ""}`);
    }
    for (const edit of edits) {
      this.#applyEdit(document, edit);
    }
    return document.toString(TO_STRING_OPTIONS);
  }

  blockSnippets(text: string): Readonly<Record<string, string>> {
    const document = parseDocument(text);
    const snippets: Record<string, string> = {};
    for (const location of this.#blocks(document)) {
      const blockId = idOf(location.block);
      if (blockId !== "") {
        snippets[blockId] = stringify(location.block.toJSON(), TO_STRING_OPTIONS);
      }
    }
    return snippets;
  }

  #applyEdit(document: Document, edit: PipelineEditDTO): void {
    switch (edit.op) {
      case "set_block_field":
        this.#setField(this.#find(document, edit.blockId).block, edit.field, edit.value);
        return;
      case "set_runs":
        this.#setRuns(document, edit.blockId, edit.runsPerChange);
        return;
      case "add_level":
        this.#flow(document, edit.columnKey).items.push(new YAMLSeq());
        return;
      case "add_block":
        this.#addBlock(document, edit);
        return;
      case "move_block":
        this.#moveBlock(document, edit.blockId, edit.direction === "up" ? -1 : 1);
        return;
      case "remove_block":
        this.#removeBlock(this.#find(document, edit.blockId));
        return;
      case "set_state_prompts":
        this.#setStatePrompts(document, this.#find(document, edit.blockId).block, edit.state, edit.templateNames);
        return;
      case "set_gate_prompts":
        this.#setGatePrompts(document, edit.columnKey, edit.templateNames);
        return;
    }
  }

  #setField(block: YAMLMap, field: string, value: string | null): void {
    if ((field === "id" || field === "type") && (value === null || value === "")) {
      throw new PipelineEditError(`A block's ${field} can't be empty`);
    }
    if (value === null || value === "") {
      block.delete(field);
      return;
    }
    block.set(field, value);
  }

  #setRuns(document: Document, blockId: string, runsPerChange: boolean): void {
    const location = this.#find(document, blockId);
    const level = location.flow.items[location.levelIndex];
    if (runsPerChange === isEachChangeLevel(level)) {
      return;
    }
    if (runsPerChange) {
      if (blocksOfLevel(level).length > 1) {
        throw new PipelineEditError(`Move ${blockId} to its own level before it runs per change`);
      }
      const eachChange = new YAMLMap();
      eachChange.set(EACH_CHANGE_KEY, location.block);
      location.flow.items[location.levelIndex] = eachChange;
      return;
    }
    const list = new YAMLSeq();
    list.items.push(location.block);
    location.flow.items[location.levelIndex] = list;
  }

  #addBlock(document: Document, edit: Extract<PipelineEditDTO, { op: "add_block" }>): void {
    if (this.#blocks(document).some((location) => idOf(location.block) === edit.blockId)) {
      throw new PipelineEditError(`Block id ${edit.blockId} is used already`);
    }
    const flow = this.#flow(document, edit.columnKey);
    const level = flow.items[edit.levelIndex];
    if (!isSeq(level)) {
      throw new PipelineEditError("A block can be added only to a level that runs once (not an each_change level)");
    }
    const block = new YAMLMap();
    block.set("id", edit.blockId);
    block.set("type", edit.blockType);
    level.items.push(block);
  }

  #moveBlock(document: Document, blockId: string, step: number): void {
    const location = this.#find(document, blockId);
    const targetIndex = location.levelIndex + step;
    const target = location.flow.items[targetIndex];
    if (target === undefined) {
      throw new PipelineEditError(`${blockId} is already on the ${step < 0 ? "first" : "last"} level of its column`);
    }
    if (!isSeq(target)) {
      throw new PipelineEditError("An each_change level holds exactly one block, so nothing can move into it");
    }
    this.#removeBlock(location);
    target.items.push(location.block);
  }

  #removeBlock(location: BlockLocation): void {
    const level = location.flow.items[location.levelIndex];
    if (isSeq(level)) {
      level.items = level.items.filter((item) => item !== location.block);
      if (level.items.length > 0) {
        return;
      }
    }
    location.flow.items.splice(location.levelIndex, 1);
  }

  #setStatePrompts(document: Document, block: YAMLMap, state: string, templateNames: readonly string[]): void {
    const actions = this.#childMap(block, "actions");
    const kept = this.#otherActions(actions.get(state, true));
    const items = [...kept, ...templateNames.map((name) => document.createNode({ [SESSION_KEY]: name }))];
    if (items.length === 0) {
      actions.delete(state);
    } else {
      const list = new YAMLSeq();
      list.items.push(...items);
      actions.set(state, list);
    }
    if (actions.items.length === 0) {
      block.delete("actions");
    }
  }

  #setGatePrompts(document: Document, columnKey: string, templateNames: readonly string[]): void {
    const column = this.#column(document, columnKey);
    const gate = this.#childMap(column, "gate");
    const items = [
      ...this.#otherActions(gate.get("then", true)),
      ...templateNames.map((name) => document.createNode({ [SESSION_KEY]: name })),
    ];
    if (items.length === 0) {
      gate.delete("then");
    } else {
      const list = new YAMLSeq();
      list.items.push(...items);
      gate.set("then", list);
    }
    if (gate.items.length === 0) {
      column.delete("gate");
    }
  }

  #childMap(parent: YAMLMap, key: string): YAMLMap {
    const child = parent.get(key, true);
    if (isMap(child)) {
      return child;
    }
    const created = new YAMLMap();
    parent.set(key, created);
    return created;
  }

  #otherActions(actions: unknown): readonly unknown[] {
    return isSeq(actions) ? actions.items.filter((item) => !isSessionAction(item)) : [];
  }

  #column(document: Document, columnKey: string): YAMLMap {
    const columns = document.get("columns", true);
    if (!isMap(columns)) {
      throw new PipelineEditError("pipeline.yaml has no columns map");
    }
    return this.#childMap(columns, columnKey);
  }

  #flow(document: Document, columnKey: string): YAMLSeq {
    const column = this.#column(document, columnKey);
    const flow = column.get("flow", true);
    if (isSeq(flow)) {
      return flow;
    }
    const created = new YAMLSeq();
    column.set("flow", created);
    return created;
  }

  #blocks(document: Document): readonly BlockLocation[] {
    const columns = document.get("columns", true);
    if (!isMap(columns)) {
      return [];
    }
    return columns.items.flatMap((pair) => {
      const columnKey = String(pair.key);
      const flow = isMap(pair.value) ? pair.value.get("flow", true) : null;
      if (!isSeq(flow)) {
        return [];
      }
      return flow.items.flatMap((level, levelIndex) =>
        blocksOfLevel(level).map((block) => ({ columnKey, flow, levelIndex, block })),
      );
    });
  }

  #find(document: Document, blockId: string): BlockLocation {
    const location = this.#blocks(document).find((candidate) => idOf(candidate.block) === blockId);
    if (location === undefined) {
      throw new PipelineEditError(`There is no block ${blockId}`);
    }
    return location;
  }

  #filePath(projectKey: string): string {
    return join(this.#projectsRootPath, projectKey, PIPELINE_FILE_NAME);
  }
}
