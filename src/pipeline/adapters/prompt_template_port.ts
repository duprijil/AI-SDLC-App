export interface PromptTemplatePort {
  read(projectKey: string, templateName: string): string | null;
  writeIfMissing(projectKey: string, templateName: string, text: string): boolean;
}
