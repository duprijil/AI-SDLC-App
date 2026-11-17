import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig({
  files: ["**/*.{ts,tsx}"],
  languageOptions: { parser: tseslint.parser },
  linterOptions: { reportUnusedDisableDirectives: "off" },
  rules: { complexity: ["error", 20] },
});
