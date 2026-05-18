import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{js,jsx}"],
    extends: [
      js.configs.recommended,
      // eslint-plugin-react-hooks v5 uses configs['recommended-latest'] for flat config
      reactHooks.configs["recommended-latest"],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // PascalCase identifiers used as JSX element names are not detected as "used"
      // by eslint's no-unused-vars without eslint-plugin-react. Ignore them via pattern.
      "no-unused-vars": [
        "error",
        { varsIgnorePattern: "^[A-Z]", args: "none" },
      ],
    },
  },
]);
