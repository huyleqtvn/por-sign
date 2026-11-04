import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["dist/"]),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    rules: {
      // A file longer than this does more than one thing: split it by what it does (CONTRIBUTING.md › Code).
      "max-lines": ["error", { max: 300 }],
    },
  },
]);
