export interface ThreadCommentDTO {
  readonly authorLogin: string;
  readonly isBot: boolean;
  readonly body: string;
  readonly createdAt: string;
}

export interface ReviewThreadDTO {
  readonly threadId: string;
  readonly path: string;
  readonly line: number | null;
  readonly isResolved: boolean;
  readonly comments: readonly ThreadCommentDTO[];
}

export class ReviewThread {
  readonly threadId: string;
  readonly path: string;
  readonly line: number | null;
  readonly isResolved: boolean;
  readonly comments: readonly ThreadCommentDTO[];

  private constructor(thread: ReviewThreadDTO) {
    this.threadId = thread.threadId;
    this.path = thread.path;
    this.line = thread.line;
    this.isResolved = thread.isResolved;
    this.comments = Object.freeze([...thread.comments]);
  }

  static create(thread: ReviewThreadDTO): ReviewThread {
    return new ReviewThread(thread);
  }

  awaitsReplyFrom(viewerLogin: string): boolean {
    const lastComment = this.comments.at(-1);
    return !this.isResolved && lastComment !== undefined && lastComment.authorLogin !== viewerLogin;
  }

  location(): string {
    return this.line === null ? this.path : `${this.path}:${String(this.line)}`;
  }

  toDTO(): ReviewThreadDTO {
    return {
      threadId: this.threadId,
      path: this.path,
      line: this.line,
      isResolved: this.isResolved,
      comments: this.comments,
    };
  }
}
