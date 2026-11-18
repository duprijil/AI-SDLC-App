interface RichNode {
  readonly type: string;
  readonly text: string;
  readonly attrs: Readonly<Record<string, unknown>>;
  readonly content: readonly RichNode[];
}

const BLOCK_SEPARATOR = "\n\n";

const asRecord = (value: unknown): Readonly<Record<string, unknown>> =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const asText = (value: unknown): string => (typeof value === "string" ? value : "");

function toNode(value: unknown): RichNode {
  const record = asRecord(value);
  const content = Array.isArray(record["content"]) ? record["content"].map(toNode) : [];
  return { type: asText(record["type"]), text: asText(record["text"]), attrs: asRecord(record["attrs"]), content };
}

const inlineOf = (node: RichNode): string => node.content.map(renderInline).join("");

function renderInline(node: RichNode): string {
  switch (node.type) {
    case "text":
      return node.text;
    case "hardBreak":
      return "\n";
    case "mention":
      return asText(node.attrs["text"]) || "@someone";
    case "emoji":
      return asText(node.attrs["shortName"]);
    case "inlineCard":
      return asText(node.attrs["url"]);
    default:
      return inlineOf(node);
  }
}

const indent = (text: string, prefix: string): string =>
  text
    .split("\n")
    .map((line, index) => (index === 0 ? `${prefix}${line}` : `${" ".repeat(prefix.length)}${line}`))
    .join("\n");

function renderList(node: RichNode, isOrdered: boolean): string {
  return node.content
    .map((item, index) => indent(renderBlocks(item.content, "\n"), isOrdered ? `${String(index + 1)}. ` : "- "))
    .join("\n");
}

function renderBlock(node: RichNode): string {
  switch (node.type) {
    case "paragraph":
      return inlineOf(node);
    case "heading":
      return `${"#".repeat(Math.min(Number(node.attrs["level"]) || 3, 6))} ${inlineOf(node)}`;
    case "bulletList":
      return renderList(node, false);
    case "orderedList":
      return renderList(node, true);
    case "codeBlock":
      return `\`\`\`\n${inlineOf(node)}\n\`\`\``;
    case "blockquote":
      return renderBlocks(node.content, BLOCK_SEPARATOR)
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
    case "rule":
      return "---";
    case "table":
      return node.content
        .map((row) => row.content.map((cell) => renderBlocks(cell.content, " ")).join(" | "))
        .join("\n");
    default:
      return node.content.length > 0 ? renderBlocks(node.content, BLOCK_SEPARATOR) : renderInline(node);
  }
}

function renderBlocks(nodes: readonly RichNode[], separator: string): string {
  return nodes
    .map(renderBlock)
    .filter((block) => block.trim() !== "")
    .join(separator);
}

export const RichText = {
  toPlain(document: unknown): string {
    if (typeof document === "string") {
      return document.trim();
    }
    return renderBlocks(toNode(document).content, BLOCK_SEPARATOR).trim();
  },
};
