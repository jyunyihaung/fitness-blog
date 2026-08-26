import { defineConfig } from "eslint/config";

const browserGlobals = {
  atob: "readonly",
  btoa: "readonly",
  console: "readonly",
  crypto: "readonly",
  CustomEvent: "readonly",
  document: "readonly",
  DOMException: "readonly",
  fetch: "readonly",
  FormData: "readonly",
  HTMLInputElement: "readonly",
  navigator: "readonly",
  queueMicrotask: "readonly",
  TextDecoder: "readonly",
  TextEncoder: "readonly",
  URLSearchParams: "readonly",
  window: "readonly",
};

const testGlobals = {
  process: "readonly",
};

export default defineConfig([
  {
    ignores: ["_site/**", "vendor/**", "node_modules/**"],
  },
  {
    files: ["assets/js/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: browserGlobals,
    },
    rules: {
      "no-constant-condition": "error",
      "no-debugger": "error",
      "no-duplicate-imports": "error",
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
      "no-var": "error",
      "prefer-const": "error",
    },
  },
  {
    files: ["tests/**/*.js", "vitest.config.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: testGlobals,
    },
    rules: {
      "no-debugger": "error",
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
      "no-var": "error",
      "prefer-const": "error",
    },
  },
]);
