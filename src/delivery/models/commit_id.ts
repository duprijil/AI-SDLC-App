import { ensure } from "@/core/models/invariant";
import { InvalidDeliveryTargetError } from "@/delivery/models/errors";

const COMMIT_ID_PATTERN = /^[0-9a-f]{7,40}$/;

export const CommitId = {
  ensureValid(commitId: string): string {
    ensure(COMMIT_ID_PATTERN.test(commitId), () => new InvalidDeliveryTargetError(`Not a commit id: ${commitId}`));
    return commitId;
  },

  short(commitId: string): string {
    return commitId.slice(0, 7);
  },
};
