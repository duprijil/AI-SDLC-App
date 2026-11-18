import { ChangePrompt, type ChangePromptRequestDTO } from "@/cockpit/models/change_prompt";

export class BuildChangePrompt {
  execute(request: ChangePromptRequestDTO): string {
    return ChangePrompt.text(request);
  }
}
