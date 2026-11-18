import { randomBytes, timingSafeEqual } from "node:crypto";

import type { AgentTokenPort } from "@/session/adapters/agent_token_port";

const TOKEN_BYTES = 32;

export class AgentTokenMemory implements AgentTokenPort {
  readonly #sessionsByToken = new Map<string, string>();

  issue(sessionId: string): string {
    for (const [token, knownSessionId] of this.#sessionsByToken) {
      if (knownSessionId === sessionId) {
        this.#sessionsByToken.delete(token);
      }
    }
    const token = randomBytes(TOKEN_BYTES).toString("hex");
    this.#sessionsByToken.set(token, sessionId);
    return token;
  }

  sessionFor(token: string): string | null {
    const candidate = Buffer.from(token);
    for (const [knownToken, sessionId] of this.#sessionsByToken) {
      const known = Buffer.from(knownToken);
      if (known.length === candidate.length && timingSafeEqual(known, candidate)) {
        return sessionId;
      }
    }
    return null;
  }
}
