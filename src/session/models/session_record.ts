export interface SessionRecordDTO {
  readonly ticketKey: string;
  readonly sessionId: string;
  readonly workspacePath: string;
  readonly startedAt: string;
  readonly endedAt: string | null;
}

export const SessionRecord = {
  canResume(record: SessionRecordDTO | null, workspacePath: string): record is SessionRecordDTO {
    return record !== null && record.endedAt === null && record.workspacePath === workspacePath;
  },
};
