import { ensure } from "@/core/models/invariant";
import { InvalidAgentPromptError } from "@/session/models/errors";

const BRACKETED_PASTE_START = "\u001b[200~";
const BRACKETED_PASTE_END = "\u001b[201~";
const SUBMIT_KEYSTROKE = "\r";

export class AgentPrompt {
  readonly promptText: string;

  private constructor(promptText: string) {
    this.promptText = promptText;
  }

  static create(promptText: string): AgentPrompt {
    ensure(promptText.trim() !== "", () => new InvalidAgentPromptError("Prompt must not be empty"));
    ensure(
      !promptText.includes(BRACKETED_PASTE_END),
      () => new InvalidAgentPromptError("Prompt must not contain a bracketed paste terminator"),
    );
    return new AgentPrompt(promptText);
  }

  pasteKeystrokes(): string {
    return `${BRACKETED_PASTE_START}${this.promptText}${BRACKETED_PASTE_END}`;
  }

  submitKeystrokes(): string {
    return SUBMIT_KEYSTROKE;
  }
}
