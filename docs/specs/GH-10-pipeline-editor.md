# Edit the pipeline in the app (M5, part 1)

**Ticket:** GH-10
**Status:** Implemented
**Domains:** pipeline, cockpit

## Context

Every flow of blocks is written by hand in `projects/<name>/pipeline.yaml`, and a typo only shows at the next start, in the startup dialog. Milestone M5 of [v1-scope.md](v1-scope.md) §9 brings the **Pipeline editor** (v1 "done when" item 7, mockup *Pipeline editor*). The developer edits a column's block flow in the app, sees the problems at once, and saves to `pipeline.yaml`. The board picks up the change without a restart.

The first-run screen, the **?** help popover and the rest of M5's polish are the next ticket.

## User story

**As a** developer adapting the pipeline to a project
**I want** to edit each column's blocks, their checks and their prompts in the app, and save them to `pipeline.yaml`
**So that** I don't hand-edit YAML or restart the app to try a change

## Acceptance criteria

### The screen

- [ ] **✎ Pipeline** in the My tickets header opens the editor. **←** goes back. It shows:
  - The board's columns, read-only, in Jira's order, with "Columns come from Jira board <id>". **⟳ Resync columns** reads the board again.
  - Each column's flow, drawn like the graph: one row per level, side by side for parallel blocks, stacked for `each_change`. The gates sit between the columns.
  - The file path and "<n> unsaved changes", with **Save** and **Discard**.
- [ ] Clicking a block opens the side panel:

  | Field | Applies to | Edit |
  |---|---|---|
  | id, title | all | text; the id stays snake_case and unique |
  | type | all | change, deploy, attest, tracker, prompt |
  | runs | all | each change (`each_change`) or once; only change blocks can run per change |
  | done when | per type | change: `change.ready` / `change.merged`; tracker: `tracker.status_after("<column>")`; deploy: `env("<env>").contains(changes)`; attest: `attested`; prompt: `session.checkpoint(<kind>)` |
  | env | deploy, attest | one of the project's envs (`pin` is written for attest) |
  | prompt | prompt | one of the prompt files |
  | prompts per state | all | for each state of the type, zero or more prompt files (`actions.<state>: [ { session: … } ]`) |

- [ ] The panel also shows the block's YAML, as it will be saved.
- [ ] Clicking a gate opens the gate panel: the fixed rule ("opens when every block of <column> is done; you move the status"), and the prompts it sends after a forward move (`gate.then`).
- [ ] **+ Level** adds a level at the end of a column. **+ Block** adds a block to a level (not to an `each_change` level, which holds one block). Blocks can be moved up or down a level, and deleted with a confirm.
- [ ] The Environments table (from `project.yaml`, read-only) shows each repo's dev, stage and prod delivery, as in the mockup.

### Validation

- [ ] Every change is checked at once with the same rules as at startup:
  - pipeline rules (ids, levels, checks, envs, actions, prompt blocks);
  - column keys exist on the board;
  - every referenced prompt file exists and has only known placeholders.
- [ ] Problems show next to the block they belong to, and in a list above the board. **Save** is disabled while there are problems.

### Saving

- [ ] **Save** writes `pipeline.yaml`. It edits the file in place, so comments, key order, and fields the app doesn't use yet (for example `actions.behind: [code.update_branch]`) are kept. The previous file is kept once as `pipeline.yaml.bak`.
- [ ] If `pipeline.yaml` changed on disk since the editor opened it, **Save** refuses ("pipeline.yaml changed outside the app — reload to see it"), and offers **Reload**.
- [ ] After a save, the app uses the new pipeline at once: My tickets redraws its graphs, and a **Refresh all** runs. No restart is needed.
- [ ] **Discard** drops the unsaved changes. Leaving the editor with unsaved changes asks first.
- [ ] `projects/` stays gitignored, so the app never commits it. The mockup's "Save & commit" becomes **Save**.
- [ ] `make check` passes.

## Out of scope

- Editing `project.yaml` (repos, envs, tracker), `prompts/*.md`, or the harness. They're shown read-only, or not at all.
- Prompt template editing in the app (files stay the developer's, edited in their editor).
- The first-run screen, the **?** help popover, more transitions and the ● Live checks for kube contexts (the next M5 ticket).
- Undo beyond Discard, and several people editing at once.

## Technical aspects

### Flow

**Open** (renderer → `cockpit_ipc` `pipeline:open`):
- `OpenPipelineDraft` (pipeline) reads `pipeline.yaml` as text, with a content hash.
- It returns a `PipelineDraftDTO`: the columns, their levels and blocks with the fields above, the gates' prompts, and the hash.
- It also returns the board's columns, the project's envs and the prompt file names, for the side panel's choices.

**Edit:**
- The renderer keeps a list of edit operations (`set_block_field`, `add_level`, `add_block`, `move_block`, `remove_block`, `set_state_prompts`, `set_gate_prompts`). After each one, it asks the main process to check the draft (`pipeline:check`).
- `CheckPipelineDraft` applies the operations to a copy of the YAML document, parses it with the same schema and models as at startup (`Pipeline.create`, `ProjectDefinition.combine`, the template checks), and returns the problems, each with its block id.

**Save** (`pipeline:save`, with the hash and the operations):
- `SavePipelineDraft` re-reads the file and refuses if its hash differs.
- Otherwise it applies the operations to the parsed YAML `Document` (the `yaml` library keeps comments and unknown keys), checks it again, writes `pipeline.yaml.bak`, then writes the file.
- The cockpit then reloads its `ProjectDefinition` (`ReloadProject`) and runs **Refresh all**.

**Reload in the cockpit:** `CockpitContainer` holds the project definition in one place that `reloadProject()` replaces. Use cases are built per call, so they pick up the new pipeline.

### Files

| File | Change |
|---|---|
| `src/pipeline/models/pipeline_draft.ts`, `pipeline_edit.ts` | new: the draft DTO, the edit operations and their rules (each_change holds one block, ids unique) |
| `src/pipeline/adapters/pipeline_document_port.ts`, `pipeline_document_yaml.ts` | new: read with a hash, apply operations to a `Document`, write with a backup |
| `src/pipeline/adapters/project_source_yaml.ts` | parse from text as well as from the file, so a draft is checked exactly like the saved file |
| `src/pipeline/use_cases/open_pipeline_draft.ts`, `check_pipeline_draft.ts`, `save_pipeline_draft.ts`, `check_prompt_references.ts`, `list_prompt_templates.ts` | new; the template checks move out of `load_project.ts` so drafts reuse them |
| `src/pipeline/adapters/prompt_template_port.ts`, `prompt_template_files.ts` | list the prompt files |
| `src/cockpit/entrypoints/container.ts` | `reloadProject()` |
| `src/cockpit/models/sprint_board_bridge.ts`, `entrypoints/api/cockpit_ipc.ts`, `cockpit_payload.ts`, `ui/cockpit_preload.ts` | channels `pipeline:open`, `pipeline:check`, `pipeline:save` |
| `src/cockpit/models/pipeline_editor.ts` | new: the editor DTO, the save result, and the Environments rows |
| `src/cockpit/entrypoints/ui/pipeline_editor_screen.tsx`, `editor_flow.tsx`, `editor_side_panel.tsx`, `editor_gate_panel.tsx`, `environments_table.tsx`, `prompt_chips.tsx`, `use_pipeline_draft.ts` | new: the screen |
| `src/cockpit/entrypoints/ui/cockpit_root.tsx`, `my_tickets_screen.tsx`, `resources/cockpit.css` | the ✎ Pipeline button, the screen, its styles |
| `docs/domains/pipeline.md`, `cockpit.md` | updated |

### Failure handling

- **The file changed on disk:** Save refuses and offers Reload. The draft is kept until then.
- **The file can't be written:** the error shows next to Save, and nothing changes in the app.
- **A draft with problems:** Save stays disabled. Problems name the block and the rule, as in the startup dialog.
- **The reload after a save fails** (it shouldn't, since the draft was checked): the app keeps the old pipeline, and the banner says to restart.

### Decisions

- **Edit the YAML document, don't regenerate it.** The parser drops fields the app doesn't use yet (other actions, `runs`, comments), and regenerating the file would delete them.
- **The main process checks drafts with the startup rules,** so the editor and the startup dialog never disagree.
- **Save, not Save & commit,** because `projects/` is gitignored (v1-scope §2).
- **A hash guards against overwriting** edits made in a text editor while the app is open.
- **One backup file,** `pipeline.yaml.bak`, replaced at each save. Real history belongs in the developer's own tools.
- **An edit the document can't take is rejected at once** (changed during implementation), for example moving a block into an `each_change` level. The editor shows why, and the edit isn't kept, so later edits still apply.
- **New blocks start as tracker blocks** with `tracker.status_after("<column>")`. Changing the type sets that type's default check and drops fields that don't apply.

## What to test

1. Open **✎ Pipeline**. The KAN board's To Do, In Progress and Done columns should show the current flows, and the Environments table should list dev, stage and prod for the test repo.
2. Rename "Validated in dev" and Save. `pipeline.yaml` should keep its comments and other lines, `pipeline.yaml.bak` should hold the old file, and the board should show the new title without a restart.
3. Add a prompt block to In Progress with `prompts/note-to-pm.md` and `session.checkpoint(pm_note)`. Before the file exists, the block shows "doesn't exist" and Save is disabled. Write the file, and the problem clears.
4. Set a deploy block's env to one no repo has. The problem should appear on that block.
5. Edit `pipeline.yaml` in a text editor while the editor is open, then Save. It should refuse and offer Reload.
6. Add `actions: { behind: [code.update_branch] }` by hand, then rename that block in the editor and Save. The `behind` action should still be in the file.
7. Make a change, then click **←**. The app should ask before dropping it.
