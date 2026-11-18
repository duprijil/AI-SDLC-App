import { ensure } from "@/core/models/invariant";
import { InvalidProjectConfigError } from "@/pipeline/models/errors";

const TEMPLATE_NAME_PATTERN = /^prompts\/[\w][\w.-]*\.md$/;
const PLACEHOLDER_PATTERN = /\{\{\s*([\w.]+)\s*\}\}/g;

export const CHANGE_PLACEHOLDERS = ["change.url", "change.repo", "change.branch", "change.folder"] as const;

export const PROMPT_PLACEHOLDERS = [
  "ticket.key",
  "ticket.title",
  "ticket.url",
  "ticket.description",
  "ticket.comments",
  "repos",
  "threads",
  "runs",
  ...CHANGE_PLACEHOLDERS,
] as const;

export type PromptPlaceholder = (typeof PROMPT_PLACEHOLDERS)[number];

export type PromptValues = Readonly<Partial<Record<PromptPlaceholder, string>>>;

const isKnown = (name: string): name is PromptPlaceholder => (PROMPT_PLACEHOLDERS as readonly string[]).includes(name);

const isChangePlaceholder = (name: string): boolean => (CHANGE_PLACEHOLDERS as readonly string[]).includes(name);

export const PromptTemplate = {
  isName(templateName: string): boolean {
    return TEMPLATE_NAME_PATTERN.test(templateName) && !templateName.includes("..");
  },

  ensureName(templateName: string): string {
    ensure(
      PromptTemplate.isName(templateName),
      () => new InvalidProjectConfigError([`A prompt is a file prompts/<name>.md: ${templateName}`]),
    );
    return templateName;
  },

  placeholders(text: string): readonly string[] {
    return [...new Set([...text.matchAll(PLACEHOLDER_PATTERN)].map((match) => match[1] ?? ""))];
  },

  problems(templateName: string, text: string, hasChange: boolean): readonly string[] {
    return PromptTemplate.placeholders(text).flatMap((name) => {
      if (!isKnown(name)) {
        return [`${templateName}: unknown placeholder {{${name}}}`];
      }
      if (isChangePlaceholder(name) && !hasChange) {
        return [`${templateName}: {{${name}}} needs a pull request, but this block has none`];
      }
      return [];
    });
  },

  render(text: string, values: PromptValues): string {
    return text.replace(PLACEHOLDER_PATTERN, (_whole, name: string) => (isKnown(name) ? (values[name] ?? "") : ""));
  },
};
