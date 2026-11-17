import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  { ignores: ["out/**", "node_modules/**", "docs/**"] },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      globals: { ...globals.node, ...globals.browser },
    },
    plugins: { "simple-import-sort": simpleImportSort, "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      "simple-import-sort/imports": "error",
      "simple-import-sort/exports": "error",
      "no-console": "error",
      complexity: ["error", 20],
      "prefer-const": "error",
      "no-var": "error",
      "object-shorthand": "error",
      "prefer-template": "error",
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["./*", "../*"], message: "Use absolute imports from @/." }] },
      ],
      "@typescript-eslint/explicit-function-return-type": "error",
      "@typescript-eslint/explicit-module-boundary-types": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": ["error", { args: "after-used", caughtErrors: "all" }],
      "@typescript-eslint/naming-convention": [
        "error",
        { selector: "default", format: ["camelCase"] },
        { selector: "import", format: ["camelCase", "PascalCase"] },
        { selector: "variable", format: ["camelCase", "UPPER_CASE", "PascalCase"] },
        { selector: "function", format: ["camelCase", "PascalCase"] },
        { selector: "parameter", format: ["camelCase"], leadingUnderscore: "allow" },
        { selector: "typeLike", format: ["PascalCase"] },
        { selector: "enumMember", format: ["PascalCase"] },
        { selector: ["objectLiteralProperty", "typeProperty"], format: null },
      ],
    },
  },
  {
    files: ["**/*.mjs"],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
