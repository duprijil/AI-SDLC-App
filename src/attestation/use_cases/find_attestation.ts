import type { AttestationStorePort } from "@/attestation/adapters/attestation_store_port";
import {
  Attestation,
  type AttestationDTO,
  type AttestationKeyDTO,
  type AttestationStatus,
} from "@/attestation/models/attestation";
import type { PinsDTO } from "@/attestation/models/pins";

export interface AttestationCheckDTO {
  readonly status: AttestationStatus;
  readonly attestation: AttestationDTO | null;
}

export class FindAttestation {
  readonly #store: AttestationStorePort;

  constructor(store: AttestationStorePort) {
    this.#store = store;
  }

  execute(key: AttestationKeyDTO, currentPins: PinsDTO): AttestationCheckDTO {
    const attestation = this.#store.latest(key);
    return { status: Attestation.statusOf(attestation, currentPins), attestation: attestation?.toDTO() ?? null };
  }
}
