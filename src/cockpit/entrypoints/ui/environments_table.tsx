import type { ReactElement } from "react";

import type { PipelineEditorDTO } from "@/cockpit/models/pipeline_editor";

export function EnvironmentsTable({ editor }: { readonly editor: PipelineEditorDTO }): ReactElement {
  return (
    <div className="env-table">
      <div className="env-title">
        Environments <span>project.yaml · used by deploy and attest blocks · read-only</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>Repo</th>
            {editor.envNames.map((envName) => (
              <th key={envName}>{envName}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {editor.environments.map((row) => (
            <tr key={row.repoName}>
              <td>{row.repoName}</td>
              {editor.envNames.map((envName) => (
                <td key={envName}>{row.cells[envName] ?? "—"}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
