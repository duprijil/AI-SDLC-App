const CLOSING = "Your workspace's CLAUDE.md has the full ticket and the conventions.";

export const DEFAULT_PROMPT_NAMES = Object.freeze({
  buildTicket: "prompts/build-ticket.md",
  fixCi: "prompts/fix-ci.md",
  resolveConflict: "prompts/resolve-conflict.md",
  addressFeedback: "prompts/address-review-feedback.md",
  diagnoseDeploy: "prompts/diagnose-deploy-failure.md",
});

export const DEFAULT_PROMPTS: Readonly<Record<string, string>> = Object.freeze({
  [DEFAULT_PROMPT_NAMES.buildTicket]: `Build {{ticket.key}}: {{ticket.title}}.

Ticket description:
{{ticket.description}}

Repos (each a git worktree on the ticket's branch):
{{repos}}

Plan the change, implement it in the right repo folder, commit, push the branch, and open a pull request whose title starts with {{ticket.key}}.

${CLOSING}
`,
  [DEFAULT_PROMPT_NAMES.fixCi]: `Fix the failing CI checks for {{ticket.key}}.
Pull request: {{change.url}} ({{change.repo}}, branch {{change.branch}}). Work in {{change.folder}}.
Find the failing checks, fix the cause, and push to the same branch.

${CLOSING}
`,
  [DEFAULT_PROMPT_NAMES.resolveConflict]: `Resolve the merge conflict for {{ticket.key}}.
Pull request: {{change.url}} ({{change.repo}}, branch {{change.branch}}). Work in {{change.folder}}.
Merge the base branch into this branch, resolve the conflicts, check that it builds, and push.

${CLOSING}
`,
  [DEFAULT_PROMPT_NAMES.addressFeedback]: `Address the review feedback for {{ticket.key}}.
Pull request: {{change.url}} ({{change.repo}}, branch {{change.branch}}). Work in {{change.folder}}.

Open threads waiting for a reply:
{{threads}}

Fix what the reviewers asked for and push. Draft a short reply for each thread, but don't post it.

${CLOSING}
`,
  [DEFAULT_PROMPT_NAMES.diagnoseDeploy]: `Diagnose the failed deployment for {{ticket.key}}: {{ticket.title}}.
{{runs}}

Repos (each a git worktree on the ticket's branch):
{{repos}}

Read the run's logs (for example with gh run view --log-failed), find the cause, and propose a fix.
Don't re-run or trigger any deployment.

${CLOSING}
`,
});
