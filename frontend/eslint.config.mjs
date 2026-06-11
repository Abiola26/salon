import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Downgrade rules to warnings: these are code-quality issues but should
  // not block commits in a fast-moving project.
  {
    rules: {
      // Valid patterns: hydration guards, reactive resets
      "react-hooks/set-state-in-effect": "warn",
      // 'any' types are used intentionally in several admin pages
      "@typescript-eslint/no-explicit-any": "warn",
      // Apostrophes in JSX text are harmless
      "react/no-unescaped-entities": "warn",
    },
  },
]);

export default eslintConfig;
