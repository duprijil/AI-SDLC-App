export class AttestationError extends Error {
  override readonly name: string = "AttestationError";
}

export class InvalidAttestationError extends AttestationError {
  override readonly name: string = "InvalidAttestationError";
}

export class PinsChangedError extends AttestationError {
  override readonly name: string = "PinsChangedError";
}

export class AttestationStoreError extends AttestationError {
  override readonly name: string = "AttestationStoreError";
}
