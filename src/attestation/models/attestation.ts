import { InvalidAttestationError } from "@/attestation/models/errors";
import { Pins, type PinsDTO } from "@/attestation/models/pins";
import { ensure } from "@/core/models/invariant";

export type AttestationStatus = "open" | "stale" | "done";

export interface AttestationKeyDTO {
  readonly projectKey: string;
  readonly ticketKey: string;
  readonly blockId: string;
}

export interface AttestationDTO extends AttestationKeyDTO {
  readonly pins: PinsDTO;
  readonly tickedBy: string;
  readonly tickedAt: string;
}

export class Attestation {
  readonly projectKey: string;
  readonly ticketKey: string;
  readonly blockId: string;
  readonly pins: PinsDTO;
  readonly tickedBy: string;
  readonly tickedAt: string;

  private constructor(attestation: AttestationDTO) {
    this.projectKey = attestation.projectKey;
    this.ticketKey = attestation.ticketKey;
    this.blockId = attestation.blockId;
    this.pins = Pins.ensureValid(attestation.pins);
    this.tickedBy = attestation.tickedBy;
    this.tickedAt = attestation.tickedAt;
  }

  static create(attestation: AttestationDTO): Attestation {
    ensure(
      attestation.projectKey !== "" && attestation.ticketKey !== "" && attestation.blockId !== "",
      () => new InvalidAttestationError("An attestation needs a project, a ticket and a block"),
    );
    ensure(attestation.tickedBy !== "", () => new InvalidAttestationError("An attestation needs who ticked it"));
    ensure(
      !Number.isNaN(Date.parse(attestation.tickedAt)),
      () => new InvalidAttestationError(`Not a time: ${attestation.tickedAt}`),
    );
    return new Attestation(attestation);
  }

  static statusOf(attestation: Attestation | null, currentPins: PinsDTO): AttestationStatus {
    if (attestation === null) {
      return "open";
    }
    return Pins.equal(attestation.pins, currentPins) ? "done" : "stale";
  }

  toDTO(): AttestationDTO {
    return {
      projectKey: this.projectKey,
      ticketKey: this.ticketKey,
      blockId: this.blockId,
      pins: this.pins,
      tickedBy: this.tickedBy,
      tickedAt: this.tickedAt,
    };
  }
}
