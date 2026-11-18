export interface TicketCommentDTO {
  readonly authorName: string;
  readonly createdAt: string;
  readonly body: string;
}

export interface TicketDetailsDTO {
  readonly ticketKey: string;
  readonly title: string;
  readonly statusName: string;
  readonly description: string;
  readonly comments: readonly TicketCommentDTO[];
}

export const MAXIMUM_TICKET_COMMENTS = 10;

export const TicketDetails = {
  latestComments(comments: readonly TicketCommentDTO[]): readonly TicketCommentDTO[] {
    return comments.slice(-MAXIMUM_TICKET_COMMENTS);
  },
};
