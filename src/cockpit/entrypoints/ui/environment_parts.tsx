import type { ReactElement } from "react";

import type { PinsDTO } from "@/attestation/models/pins";
import { sprintBoardBridge } from "@/cockpit/entrypoints/ui/cockpit_bridges";
import { ConfirmButton } from "@/cockpit/entrypoints/ui/confirm_button";
import type { AttestTickRequestDTO } from "@/cockpit/models/attest_action";
import type { AttestationViewDTO, BlockStateDTO } from "@/cockpit/models/block_state";
import type { DeployLineDTO } from "@/cockpit/models/deploy_view";

const SHORT_COMMIT_LENGTH = 7;

const pinsText = (pins: PinsDTO): string =>
  Object.entries(pins)
    .map(([repoName, commitId]) => `${repoName} @ ${commitId.slice(0, SHORT_COMMIT_LENGTH)}`)
    .join(", ");

function DeployLine({ line }: { readonly line: DeployLineDTO }): ReactElement {
  const runUrl = line.runUrl;
  const promoteLink = line.promoteLink;
  return (
    <div className={`deploy-line dl-${line.state}`}>
      <div>
        <b>{line.repoName}</b> · {line.caption}
      </div>
      <div className="row">
        {runUrl !== null && (
          <button type="button" className="btn" onClick={() => void sprintBoardBridge().openExternal(runUrl)}>
            Open run ↗
          </button>
        )}
        {promoteLink !== null && (
          <button type="button" className="btn" onClick={() => void sprintBoardBridge().openExternal(promoteLink)}>
            Open promote link ↗
          </button>
        )}
      </div>
    </div>
  );
}

export function DeployLines({ block }: { readonly block: BlockStateDTO }): ReactElement {
  if (block.deployLines.length === 0) {
    return <div className="q">No merged change of this ticket is in a repo with {block.envName ?? "this env"}.</div>;
  }
  return (
    <>
      {block.deployLines.map((line) => (
        <DeployLine key={line.repoName} line={line} />
      ))}
    </>
  );
}

export interface AttestTickProps {
  readonly ticketKey: string;
  readonly block: BlockStateDTO;
  readonly attestation: AttestationViewDTO;
  readonly onTick: (request: AttestTickRequestDTO) => Promise<string | null>;
  readonly onDone: () => void;
}

export function AttestTick({ ticketKey, block, attestation, onTick, onDone }: AttestTickProps): ReactElement {
  return (
    <>
      <div className="q">Pins {pinsText(attestation.currentPins)}.</div>
      {attestation.tickedPins !== null && (
        <div className="q">
          Ticked by {attestation.tickedBy ?? "someone"} on {pinsText(attestation.tickedPins)}.
        </div>
      )}
      <ConfirmButton
        label={`Tick: ${block.title}`}
        confirmation={`Record that ${ticketKey} is validated in ${attestation.envName} on ${pinsText(attestation.currentPins)}?`}
        onConfirm={() =>
          onTick({
            ticketKey,
            blockId: block.blockId,
            envName: attestation.envName,
            expectedPins: attestation.currentPins,
          })
        }
        onDone={onDone}
      />
    </>
  );
}

export function AttestDone({ attestation }: { readonly attestation: AttestationViewDTO }): ReactElement {
  const tickedAt = attestation.tickedAt === null ? "" : new Date(attestation.tickedAt).toLocaleString();
  return (
    <div className="q">
      Ticked by {attestation.tickedBy ?? "someone"} {tickedAt} on {pinsText(attestation.currentPins)}.
    </div>
  );
}
