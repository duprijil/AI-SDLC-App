const NORMAL_DOMAINS = "(session|pipeline|ticket|change|delivery|attestation)";
const COMBINED_DOMAINS = "(cockpit)";
const ROOT_DELEGATES = "^src/(main\\.ts|preload\\.ts|renderer\\.ts)$";
const RENDERER_ENTRY = "^src/renderer\\.ts$";
const NODE_ONLY =
  "^(node:)?(fs|path|os|child_process|http|https|net|crypto|stream|util)$|node_modules/(electron|node-pty)/";

module.exports = {
  forbidden: [
    {
      name: "layers-models",
      severity: "error",
      from: { path: "^src/[^/]+/models/" },
      to: { path: "^src/[^/]+/(use_cases|adapters|entrypoints)/" },
    },
    {
      name: "layers-models-no-io",
      severity: "error",
      from: { path: "^src/[^/]+/models/" },
      to: { path: `${NODE_ONLY}|node_modules/(react|react-dom|@xterm)/` },
    },
    {
      name: "layers-adapters",
      severity: "error",
      from: { path: "^src/[^/]+/adapters/" },
      to: { path: "^src/[^/]+/(use_cases|entrypoints)/" },
    },
    {
      name: "layers-use-cases",
      severity: "error",
      from: { path: "^src/[^/]+/use_cases/" },
      to: { path: "^src/[^/]+/entrypoints/" },
    },
    {
      name: "config-access",
      severity: "error",
      from: { path: "^src/[^/]+/(models|adapters|use_cases)/" },
      to: { path: "^src/config\\.ts$" },
    },
    {
      name: "core-isolated",
      severity: "error",
      from: { path: "^src/core/" },
      to: { path: "^src/[^/]+/", pathNot: "^src/core/" },
    },
    {
      name: "domain-independence",
      severity: "error",
      from: { path: `^src/${NORMAL_DOMAINS}/` },
      to: { path: `^src/${NORMAL_DOMAINS}/`, pathNot: "^src/$1/" },
    },
    {
      name: "combined-domains-on-top",
      severity: "error",
      from: { pathNot: `^src/${COMBINED_DOMAINS}/|${ROOT_DELEGATES}` },
      to: { path: `^src/${COMBINED_DOMAINS}/` },
    },
    {
      name: "use-cases-depend-on-ports",
      severity: "error",
      from: { path: "^src/[^/]+/use_cases/" },
      to: { path: "^src/[^/]+/adapters/", pathNot: "_port\\.tsx?$" },
    },
    {
      name: "ui-has-no-adapters",
      severity: "error",
      from: { path: "^src/[^/]+/entrypoints/ui/" },
      to: { path: "^src/[^/]+/adapters/", pathNot: "_port\\.tsx?$" },
    },
    {
      name: "renderer-stays-sandboxed",
      severity: "error",
      from: { path: RENDERER_ENTRY },
      to: { path: NODE_ONLY, reachable: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      extensions: [".ts", ".tsx", ".js", ".mjs", ".cjs", ".json"],
      conditionNames: ["import", "require", "node", "default", "types"],
    },
  },
};
