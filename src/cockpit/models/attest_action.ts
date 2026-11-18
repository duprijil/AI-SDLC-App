import type { PinsDTO } from "@/attestation/models/pins";

export interface AttestTickRequestDTO {
  readonly ticketKey: string;
  readonly blockId: string;
  readonly envName: string;
  readonly expectedPins: PinsDTO;
}
