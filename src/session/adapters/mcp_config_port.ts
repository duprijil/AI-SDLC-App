export interface McpConfigRequest {
  readonly sessionId: string;
  readonly url: string;
  readonly token: string;
}

export interface McpConfigPort {
  write(request: McpConfigRequest): string;
}
