import { ChangePrompt, type ChangePromptRequestDTO } from "@/cockpit/models/change_prompt";
import type { PrepareTicketWorkspace } from "@/cockpit/use_cases/prepare_ticket_workspace";

export class BuildChangePrompt {
  readonly #prepareTicketWorkspace: PrepareTicketWorkspace;

  constructor(prepareTicketWorkspace: PrepareTicketWorkspace) {
    this.#prepareTicketWorkspace = prepareTicketWorkspace;
  }

  async execute(request: ChangePromptRequestDTO): Promise<string> {
    const brief = await this.#prepareTicketWorkspace.briefFor(request.ticketKey);
    return ChangePrompt.text(request, brief);
  }
}
