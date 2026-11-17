const MASK = "********";

export class SecretText {
  readonly #secret: string;

  constructor(secret: string) {
    this.#secret = secret;
  }

  reveal(): string {
    return this.#secret;
  }

  toString(): string {
    return MASK;
  }

  toJSON(): string {
    return MASK;
  }
}
