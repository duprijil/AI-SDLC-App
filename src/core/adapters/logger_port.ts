export type LogFields = Readonly<Record<string, string | number | boolean | null>>;

export interface LoggerPort {
  info(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}
