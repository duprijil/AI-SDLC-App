export interface PromptTemplatePort {
  read(projectKey: string, templateName: string): string | null;
  list(projectKey: string): readonly string[];
  writeIfMissing(projectKey: string, templateName: string, text: string): boolean;
}
