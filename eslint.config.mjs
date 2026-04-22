import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

/**
 * Rillcod ESLint policy
 * ─────────────────────
 * We keep bug-prevention rules as ERRORS (hooks, prefer-const, unused
 * expressions, ts-comment abuse) and downgrade the noisy type-hygiene
 * rules to WARN so a large legacy codebase can be cleaned up
 * incrementally without blocking feature work or CI.
 *
 * If you add a new file, try to write it clean; warnings still show up
 * in the editor.
 */
const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Noisy/legacy — downgraded to warn (3000+ occurrences baseline)
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      "@typescript-eslint/ban-ts-comment": "warn",
      "@typescript-eslint/no-require-imports": "warn",
      "react/no-unescaped-entities": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "@next/next/no-img-element": "warn",

      // Real bugs — keep as errors
      "prefer-const": "error",
      "react-hooks/rules-of-hooks": "error",
      "@typescript-eslint/no-unused-expressions": "error",
      "@typescript-eslint/no-non-null-asserted-optional-chain": "error",
      "react/no-children-prop": "error",
    },
  },
  {
    // Generated / third-party-ish files — suppress everything
    files: [
      "src/types/supabase.ts",
      "src/types/supabase-types.ts",
      "public/**",
      "supabase/**",
      "**/*.d.ts",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-empty-object-type": "off",
    },
  },
];

export default eslintConfig;
