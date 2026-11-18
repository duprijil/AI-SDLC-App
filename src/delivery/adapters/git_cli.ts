import { execFile } from "node:child_process";
import { existsSync } from "node:fs";

import type { GitPort } from "@/delivery/adapters/git_port";
import { CommitId } from "@/delivery/models/commit_id";
import { CommitNotFoundError, GitCommandError } from "@/delivery/models/errors";

const FETCH_TIMEOUT_MILLISECONDS = 30_000;
const COMMAND_TIMEOUT_MILLISECONDS = 15_000;
const MAXIMUM_OUTPUT_BYTES = 64 * 1024 * 1024;
const MAXIMUM_CANDIDATE_COMMITS = 500;
const EXIT_NOT_ANCESTOR = 1;

interface GitOutcome {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

interface GitRun {
  readonly checkoutPath: string;
  readonly gitArguments: readonly string[];
  readonly timeoutMilliseconds?: number;
  readonly input?: string;
}

const exitCodeOf = (error: unknown): number => {
  if (error !== null && typeof error === "object" && "code" in error && typeof error.code === "number") {
    return error.code;
  }
  return -1;
};

function runGit(run: GitRun): Promise<GitOutcome> {
  return new Promise((resolveOutcome) => {
    const child = execFile(
      "git",
      ["-C", run.checkoutPath, ...run.gitArguments],
      {
        timeout: run.timeoutMilliseconds ?? COMMAND_TIMEOUT_MILLISECONDS,
        maxBuffer: MAXIMUM_OUTPUT_BYTES,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      },
      (error, stdout, stderr) => {
        resolveOutcome({ exitCode: error === null ? 0 : exitCodeOf(error), stdout, stderr });
      },
    );
    if (run.input !== undefined) {
      child.stdin?.end(run.input);
    }
  });
}

const firstWord = (line: string): string => line.trim().split(/\s+/)[0] ?? "";

export class GitCli implements GitPort {
  async fetch(checkoutPath: string): Promise<void> {
    const outcome = await runGit({
      checkoutPath,
      gitArguments: ["fetch", "--quiet", "origin"],
      timeoutMilliseconds: FETCH_TIMEOUT_MILLISECONDS,
    });
    if (outcome.exitCode !== 0) {
      throw new GitCommandError(outcome.stderr.trim() || `git fetch failed in ${checkoutPath}`);
    }
  }

  async contains(checkoutPath: string, deployedCommitId: string, commitId: string): Promise<boolean> {
    const deployed = CommitId.ensureValid(deployedCommitId);
    const commit = CommitId.ensureValid(commitId);
    await this.#ensureKnown(checkoutPath, deployed);
    await this.#ensureKnown(checkoutPath, commit);
    const ancestry = await runGit({ checkoutPath, gitArguments: ["merge-base", "--is-ancestor", commit, deployed] });
    if (ancestry.exitCode === 0) {
      return true;
    }
    if (ancestry.exitCode !== EXIT_NOT_ANCESTOR) {
      throw new GitCommandError(ancestry.stderr.trim() || "git merge-base failed");
    }
    return this.#hasSamePatch(checkoutPath, deployed, commit);
  }

  async originUrl(checkoutPath: string): Promise<string | null> {
    if (!existsSync(checkoutPath)) {
      return null;
    }
    const outcome = await runGit({ checkoutPath, gitArguments: ["remote", "get-url", "origin"] });
    return outcome.exitCode === 0 ? outcome.stdout.trim() : null;
  }

  async #ensureKnown(checkoutPath: string, commitId: string): Promise<void> {
    const outcome = await runGit({ checkoutPath, gitArguments: ["cat-file", "-e", `${commitId}^{commit}`] });
    if (outcome.exitCode !== 0) {
      throw new CommitNotFoundError(`Commit ${CommitId.short(commitId)} is not in ${checkoutPath}`);
    }
  }

  async #hasSamePatch(checkoutPath: string, deployed: string, commit: string): Promise<boolean> {
    const patchId = await this.#patchIds(checkoutPath, ["show", "--format=", commit]);
    const target = patchId[0];
    if (target === undefined) {
      return false;
    }
    const mergeBase = await runGit({ checkoutPath, gitArguments: ["merge-base", commit, deployed] });
    const base = firstWord(mergeBase.stdout);
    const range = mergeBase.exitCode === 0 && base !== "" ? `${base}..${deployed}` : deployed;
    const candidates = await this.#patchIds(checkoutPath, [
      "log",
      "-p",
      "--no-merges",
      `--max-count=${String(MAXIMUM_CANDIDATE_COMMITS)}`,
      range,
    ]);
    return candidates.includes(target);
  }

  async #patchIds(checkoutPath: string, logArguments: readonly string[]): Promise<readonly string[]> {
    const patches = await runGit({ checkoutPath, gitArguments: logArguments });
    if (patches.exitCode !== 0) {
      throw new GitCommandError(patches.stderr.trim() || `git ${logArguments[0] ?? ""} failed`);
    }
    const ids = await runGit({ checkoutPath, gitArguments: ["patch-id", "--stable"], input: patches.stdout });
    if (ids.exitCode !== 0) {
      throw new GitCommandError(ids.stderr.trim() || "git patch-id failed");
    }
    return ids.stdout
      .split("\n")
      .map(firstWord)
      .filter((patchId) => patchId !== "");
  }
}
