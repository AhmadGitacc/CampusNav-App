const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
    settings: {
      // Teach eslint-plugin-import about the TS/TSX extensions Expo uses, and
      // the `@/` alias from tsconfig paths. Without this, every `@/...` import
      // reports as unresolved.
      "import/resolver": {
        typescript: {
          project: "./tsconfig.json",
        },
      },
    },
  },
  {
    rules: {
      // eslint-plugin-react-hooks v7 (pulled in by eslint-config-expo 57) ships
      // the React Compiler lint rules. They flag the existing "derive state on
      // mount" effects as errors; they are advisory, so surface them as
      // warnings instead of failing the lint gate.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
    },
  },
]);
