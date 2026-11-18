import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { AgentTranscriptPort } from "@/session/adapters/agent_transcript_port";

const PROJECTS_FOLDER = join(".claude", "projects");
const TRANSCRIPT_EXTENSION = ".jsonl";

export class AgentTranscriptClaudeCode implements AgentTranscriptPort {
  exists(workspacePath: string, sessionId: string): boolean {
    const projectFolder = workspacePath.replace(/[^a-zA-Z0-9]/g, "-");
    return existsSync(join(homedir(), PROJECTS_FOLDER, projectFolder, `${sessionId}${TRANSCRIPT_EXTENSION}`));
  }
}
