import { SessionError } from "@/session/models/errors";
import type { TerminalSizeDTO } from "@/session/models/terminal_size";

export class InvalidIpcPayloadError extends SessionError {
  override readonly name: string = "InvalidIpcPayloadError";
}

const isRecord = (payload: unknown): payload is Readonly<Record<string, unknown>> =>
  typeof payload === "object" && payload !== null;

export function readText(payload: unknown, fieldName: string): string {
  if (typeof payload !== "string") {
    throw new InvalidIpcPayloadError(`${fieldName} must be text`);
  }
  return payload;
}

export function readTerminalSize(payload: unknown): TerminalSizeDTO {
  if (!isRecord(payload) || typeof payload["columns"] !== "number" || typeof payload["rows"] !== "number") {
    throw new InvalidIpcPayloadError("Terminal size must have numeric columns and rows");
  }
  return { columns: payload["columns"], rows: payload["rows"] };
}

export function readJsonText(payload: unknown, fieldName: string): string {
  if (!isRecord(payload)) {
    throw new InvalidIpcPayloadError("Payload must be a JSON object");
  }
  return readText(payload[fieldName], fieldName);
}
