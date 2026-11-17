import { ensure } from "@/core/models/invariant";
import { InvalidTerminalSizeError } from "@/session/models/errors";

export interface TerminalSizeDTO {
  readonly columns: number;
  readonly rows: number;
}

const isPositiveInteger = (number: number): boolean => Number.isInteger(number) && number > 0;

export class TerminalSize {
  readonly columns: number;
  readonly rows: number;

  private constructor(columns: number, rows: number) {
    this.columns = columns;
    this.rows = rows;
  }

  static create(size: TerminalSizeDTO): TerminalSize {
    ensure(
      isPositiveInteger(size.columns) && isPositiveInteger(size.rows),
      () =>
        new InvalidTerminalSizeError(
          `Terminal size must be positive integers: ${String(size.columns)}x${String(size.rows)}`,
        ),
    );
    return new TerminalSize(size.columns, size.rows);
  }

  toDTO(): TerminalSizeDTO {
    return { columns: this.columns, rows: this.rows };
  }
}
