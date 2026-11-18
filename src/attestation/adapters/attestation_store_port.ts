import type { Attestation, AttestationKeyDTO } from "@/attestation/models/attestation";

export interface AttestationStorePort {
  latest(key: AttestationKeyDTO): Attestation | null;
  record(attestation: Attestation): void;
}
