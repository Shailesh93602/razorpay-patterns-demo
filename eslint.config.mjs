import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

// Next.js 16 removed the `next lint` bridge. This flat config replaces
// it — same `@typescript-eslint/recommended` baseline that
// stripe-payments-demo ships, kept deliberately minimal so it runs
// under plain `eslint .` with no compat layer.
export default [
  {
    files: ["app/**/*.{ts,tsx}", "lib/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { project: "./tsconfig.json" },
    },
    plugins: { "@typescript-eslint": tseslint },
    rules: {
      ...tseslint.configs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "coverage/**",
      "__tests__/**",
      "scripts/**",
    ],
  },
];
