import { CockpitError } from "@/cockpit/models/errors";
import { PromptRequest, type PromptRequestDTO } from "@/cockpit/models/prompt_request";
import { PromptValues } from "@/cockpit/models/prompt_values";
import type { PrepareTicketWorkspace } from "@/cockpit/use_cases/prepare_ticket_workspace";
import { PipelineError } from "@/pipeline/models/errors";
import { PromptTemplate } from "@/pipeline/models/prompt_template";
import type { ReadPromptTemplate } from "@/pipeline/use_cases/read_prompt_template";

export class RenderBlockPrompt {
  readonly #prepareTicketWorkspace: PrepareTicketWorkspace;
  readonly #readPromptTemplate: ReadPromptTemplate;
  readonly #projectKey: string;

  constructor(
    prepareTicketWorkspace: PrepareTicketWorkspace,
    readPromptTemplate: ReadPromptTemplate,
    projectKey: string,
  ) {
    this.#prepareTicketWorkspace = prepareTicketWorkspace;
    this.#readPromptTemplate = readPromptTemplate;
    this.#projectKey = projectKey;
  }

  async execute(request: PromptRequestDTO): Promise<readonly string[]> {
    const templateNames = PromptRequest.templateNames(request);
    if (templateNames.length === 0) {
      throw new CockpitError(`No prompt to send for ${request.ticketKey}`);
    }
    const texts = templateNames.map((templateName) => this.#template(templateName, request.change !== null));
    const values = PromptValues.of(request, await this.#prepareTicketWorkspace.briefFor(request.ticketKey));
    return texts.map((text) => PromptTemplate.render(text, values).trim());
  }

  #template(templateName: string, hasChange: boolean): string {
    try {
      const text = this.#readPromptTemplate.execute(this.#projectKey, templateName);
      const problems = PromptTemplate.problems(templateName, text, hasChange);
      if (problems.length > 0) {
        throw new CockpitError(problems.join("; "));
      }
      return text;
    } catch (error) {
      if (error instanceof PipelineError) {
        throw new CockpitError(error.message);
      }
      throw error;
    }
  }
}
