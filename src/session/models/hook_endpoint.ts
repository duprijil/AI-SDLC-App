import { ensure } from "@/core/models/invariant";
import { InvalidHookEndpointError } from "@/session/models/errors";

const LOOPBACK_URL_PATTERN = /^http:\/\/127\.0\.0\.1:\d+\/hooks$/;
const MINIMUM_TOKEN_LENGTH = 32;

export interface HookEndpointDTO {
  readonly url: string;
  readonly token: string;
}

export class HookEndpoint {
  readonly url: string;
  readonly token: string;

  private constructor(url: string, token: string) {
    this.url = url;
    this.token = token;
  }

  static create(endpoint: HookEndpointDTO): HookEndpoint {
    ensure(
      LOOPBACK_URL_PATTERN.test(endpoint.url),
      () => new InvalidHookEndpointError(`Hook endpoint must be a loopback /hooks URL: ${endpoint.url}`),
    );
    ensure(
      endpoint.token.length >= MINIMUM_TOKEN_LENGTH,
      () => new InvalidHookEndpointError("Hook token is too short"),
    );
    return new HookEndpoint(endpoint.url, endpoint.token);
  }

  mcpUrl(): string {
    return this.url.replace(/\/hooks$/, "/mcp");
  }

  acceptsToken(token: string): boolean {
    return token === this.token;
  }
}
