import type { ReactElement } from "react";

export interface PromptChipsProps {
  readonly selected: readonly string[];
  readonly available: readonly string[];
  readonly onChange: (templateNames: readonly string[]) => void;
}

export function PromptChips({ selected, available, onChange }: PromptChipsProps): ReactElement {
  const addable = available.filter((templateName) => !selected.includes(templateName));
  return (
    <div className="chips-edit">
      {selected.map((templateName) => (
        <span key={templateName} className="chip on">
          {templateName.replace(/^prompts\//, "")}
          <button
            type="button"
            className="chip-x"
            title="Remove"
            onClick={() => {
              onChange(selected.filter((name) => name !== templateName));
            }}
          >
            ×
          </button>
        </span>
      ))}
      {addable.length > 0 && (
        <select
          className="inp"
          value=""
          onChange={(event) => {
            if (event.target.value !== "") {
              onChange([...selected, event.target.value]);
            }
          }}
        >
          <option value="">+ prompt</option>
          {addable.map((templateName) => (
            <option key={templateName} value={templateName}>
              {templateName.replace(/^prompts\//, "")}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
