import type { LogFields, LoggerPort } from "@/core/adapters/logger_port";

type LogLevel = "info" | "error";

export class LoggerConsole implements LoggerPort {
  readonly #loggerName: string;

  constructor(loggerName: string) {
    this.#loggerName = loggerName;
  }

  info(message: string, fields: LogFields = {}): void {
    this.#write("info", message, fields);
  }

  error(message: string, fields: LogFields = {}): void {
    this.#write("error", message, fields);
  }

  #write(level: LogLevel, message: string, fields: LogFields): void {
    const line = JSON.stringify({ level, logger: this.#loggerName, message, ...fields });
    // eslint-disable-next-line no-console
    console.log(line);
  }
}
