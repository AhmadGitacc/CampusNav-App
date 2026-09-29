module.exports = function (api) {
  api.cache(true);
  return {
    // SDK 57: `import.meta` is polyfilled by default, the react-native-worklets
    // plugin is auto-added when the package is installed, and the React Compiler
    // is wired up via `experiments.reactCompiler` in app.json.
    presets: ["babel-preset-expo"],
  };
};
