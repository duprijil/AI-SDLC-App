export interface CheckpointRequestDTO {
  readonly ticketKey: string;
  readonly blockId: string;
  readonly state: "done" | "open";
  readonly note: string;
}
