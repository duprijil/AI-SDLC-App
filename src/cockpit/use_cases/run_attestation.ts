import type { RecordAttestation } from "@/attestation/use_cases/record_attestation";
import type { FindTicketChanges } from "@/change/use_cases/find_ticket_changes";
import type { ListRecentChanges } from "@/change/use_cases/list_recent_changes";
import type { AttestTickRequestDTO } from "@/cockpit/models/attest_action";
import { DeployView } from "@/cockpit/models/deploy_view";
import { CockpitError } from "@/cockpit/models/errors";
import { ProjectQueries } from "@/cockpit/models/project_queries";
import type { CheckTicketEnvironments } from "@/cockpit/use_cases/check_ticket_environments";
import type { Project } from "@/pipeline/models/project";

export interface AttestationSteps {
  readonly listRecentChanges: ListRecentChanges;
  readonly findTicketChanges: FindTicketChanges;
  readonly checkTicketEnvironments: CheckTicketEnvironments;
  readonly recordAttestation: RecordAttestation;
}

export class RunAttestation {
  readonly #steps: AttestationSteps;
  readonly #project: Project;

  constructor(steps: AttestationSteps, project: Project) {
    this.#steps = steps;
    this.#project = project;
  }

  async execute(request: AttestTickRequestDTO): Promise<void> {
    const listing = await this.#steps.listRecentChanges.execute(ProjectQueries.changeQuery(this.#project));
    const ticketChanges = await this.#steps.findTicketChanges.execute({ listing, ticketKey: request.ticketKey });
    const repos = await this.#steps.checkTicketEnvironments.execute({
      changes: ticketChanges.changes.map((ticketChange) => ticketChange.change),
      envName: request.envName,
    });
    const pinned = DeployView.pins(repos);
    if ("waitReason" in pinned) {
      throw new CockpitError(`Nothing to tick yet: ${pinned.waitReason}`);
    }
    this.#steps.recordAttestation.execute({
      attestation: {
        projectKey: this.#project.projectKey,
        ticketKey: request.ticketKey,
        blockId: request.blockId,
        pins: pinned.pins,
        tickedBy: listing.viewerLogin,
        tickedAt: new Date().toISOString(),
      },
      expectedPins: request.expectedPins,
    });
  }
}
