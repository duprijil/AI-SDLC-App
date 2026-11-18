import { InvalidAttestationError } from "@/attestation/models/errors";
import { ensure } from "@/core/models/invariant";

const COMMIT_ID_PATTERN = /^[0-9a-f]{7,40}$/;

export type PinsDTO = Readonly<Record<string, string>>;

export const Pins = {
  ensureValid(pins: PinsDTO): PinsDTO {
    const entries = Object.entries(pins);
    ensure(entries.length > 0, () => new InvalidAttestationError("An attestation pins at least one commit"));
    ensure(
      entries.every(([repoName, commitId]) => repoName !== "" && COMMIT_ID_PATTERN.test(commitId)),
      () => new InvalidAttestationError(`Pins must map repos to commit ids: ${JSON.stringify(pins)}`),
    );
    return Object.freeze(Object.fromEntries([...entries].sort(([left], [right]) => left.localeCompare(right))));
  },

  equal(left: PinsDTO, right: PinsDTO): boolean {
    const leftKeys = Object.keys(left);
    return (
      leftKeys.length === Object.keys(right).length && leftKeys.every((repoName) => left[repoName] === right[repoName])
    );
  },
};
