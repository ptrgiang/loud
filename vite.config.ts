// Workspace-wide format and lint settings, following T3 Code's. Packages keep their own build and test configs.
import { defineConfig } from "vite-plus";

const IGNORE = [
  "dist",
  "dist-electron",
  "release",
  "node_modules",
  "pnpm-lock.yaml",
  "*.tsbuildinfo",
  ".shots",
];

export default defineConfig({
  fmt: {
    ignorePatterns: IGNORE,
    sortPackageJson: {},
  },
  lint: {
    ignorePatterns: IGNORE,
    plugins: ["eslint", "oxc", "react", "unicorn", "typescript"],
    categories: {
      correctness: "warn",
      suspicious: "warn",
      perf: "warn",
    },
    rules: {
      "oxc/no-accumulating-spread": "error",
      "eslint/no-control-regex": "off",
      "unicorn/prefer-add-event-listener": "off",
      "unicorn/prefer-string-starts-ends-with": "off",
      "unicorn/prefer-set-has": "off",
      "unicorn/no-array-sort": "off",
      "unicorn/consistent-function-scoping": "off",
      "react/no-array-index-key": "error",
      "react/no-unstable-nested-components": "error",
      "react-in-jsx-scope": "off",
      "react-hooks/exhaustive-deps": "off",
      "eslint/no-empty-pattern": "error",
      "eslint/no-new": "error",
      "eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "eslint/no-unneeded-ternary": "error",
      "eslint/no-shadow": "off",
      "eslint/no-await-in-loop": "off",
      "eslint/no-underscore-dangle": "off",
      "oxc/no-map-spread": "off",
    },
  },
});
