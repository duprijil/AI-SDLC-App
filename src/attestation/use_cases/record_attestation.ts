import type { AttestationStorePort } from "@/attestation/adapters/attestation_store_port";
import { Attestation, type AttestationDTO } from "@/attestation/models/attestation";
import { PinsChangedError } from "@/attestation/models/errors";
import { Pins, type PinsDTO } from "@/attestation/models/pins";

export interface RecordAttestationRequest {
  readonly attestation: AttestationDTO;
  readonly expectedPins: PinsDTO;
}

export class RecordAttestation {
  readonly #store: AttestationStorePort;

  constructor(store: AttestationStorePort) {
    this.#store = store;
  }

  execute(request: RecordAttestationRequest): AttestationDTO {
    const attestation = Attestation.create(request.attestation);
    if (!Pins.equal(attestation.pins, Pins.ensureValid(request.expectedPins))) {
      throw new PinsChangedError("The deployed commits changed since you opened this. Nothing was ticked.");
    }
    this.#store.record(attestation);
    return attestation.toDTO();
  }
}
