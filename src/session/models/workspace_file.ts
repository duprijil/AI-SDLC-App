import { ensure } from "@/core/models/invariant";
import { InvalidWorkspaceFileError } from "@/session/models/errors";

const FILE_NAME_PATTERN = /^[\w][\w.-]*$/;

export interface WorkspaceFileDTO {
  readonly ticketKey: string;
  readonly fileName: string;
  readonly content: string;
}

export const WorkspaceFile = {
  ensureValid(file: WorkspaceFileDTO): WorkspaceFileDTO {
    ensure(
      FILE_NAME_PATTERN.test(file.fileName) && !file.fileName.includes(".."),
      () => new InvalidWorkspaceFileError(`A workspace file is a plain file name: ${file.fileName}`),
    );
    return file;
  },
};
