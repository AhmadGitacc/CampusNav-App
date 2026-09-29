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
]);
