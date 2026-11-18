export interface RefreshProgressDTO {
  readonly ticketKey: string;
  readonly columnIndex: number;
  readonly levelIndex: number;
  readonly columnName: string;
  readonly levelTitles: readonly string[];
  readonly isFinished: boolean;
}

export const RefreshProgress = {
  checking(
    ticketKey: string,
    position: { readonly columnIndex: number; readonly levelIndex: number },
    columnName: string,
    levelTitles: readonly string[],
  ): RefreshProgressDTO {
    return { ticketKey, ...position, columnName, levelTitles, isFinished: false };
  },

  finished(ticketKey: string): RefreshProgressDTO {
    return { ticketKey, columnIndex: -1, levelIndex: -1, columnName: "", levelTitles: [], isFinished: true };
  },
};
