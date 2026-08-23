import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

/**
 * eslint-config-next 16 ships flat config natively.
 *
 * Until then this file reached it through FlatCompat.extends(), which is the
 * eslintrc-to-flat shim. Against v16 that shim walks the config object and
 * JSON.stringifies it to validate, and v16's react plugin references itself —
 * so every lint run died with "Converting circular structure to JSON" before a
 * single rule ran. The Lint CI step went from 0 errors to not executing at all.
 *
 * These two entry points are already flat-config arrays, so they are spread
 * directly. The rule decisions below are unchanged.
 */

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
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    // Flat config resolves a rule's plugin from the config objects that match the
    // same files. eslint-config-next registers react/react-hooks/@next under a
    // js+ts glob and @typescript-eslint under a ts-only one, so these two blocks
    // are scoped to match. An unscoped block asks for react rules on files where
    // that plugin was never registered, which is a hard error, not a warning.
    files: ["**/*.{js,jsx,mjs,ts,tsx,mts,cts}"],
    rules: {
      "react/no-unescaped-entities": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "@next/next/no-img-element": "warn",

      /**
       * React Compiler rules, new in eslint-plugin-react-hooks 6 (arrived with
       * the Next 16 upgrade). They default to ERROR and found 527 pre-existing
       * occurrences on their first run — no code changed, the ruleset did.
       *
       * Downgraded to warn under the same policy as the type-hygiene rules
       * above: a legacy backlog this size is cleaned up incrementally, not by
       * blocking every build until it is done. They stay visible in the editor
       * and in CI output. rules-of-hooks stays an ERROR below — that one
       * catches real bugs rather than missed compiler optimisations.
       *
       * Backlog at time of upgrade: set-state-in-effect 356, immutability 49,
       * purity 42, preserve-manual-memoization 34, refs 32, static-components 14.
       */
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/static-components": "warn",

      /**
       * Hand-rolled modals.
       *
       * components/ui/Modal.tsx already handles role="dialog", aria-modal,
       * Escape, a max height in dvh and safe-area padding — and nothing
       * imported it, while 103 files wrote their own `fixed inset-0` overlay.
       * Of those, 95 announced no dialog role, 74 ignored the Escape key, and
       * two dozen gave the panel no height limit, so on a phone anything taller
       * than the screen ran off the bottom with the submit button.
       *
       * Warn, not error, because the existing ones are still there: this is to
       * stop the next one being written, not to block work on the old ones.
       * Decorative full-bleed layers are unaffected — the pattern only matches
       * an overlay that centres a panel, which is what a dialog does.
       */
      "no-restricted-syntax": [
        "warn",
        {
          selector:
            "JSXAttribute[name.name='className'] Literal[value=/fixed inset-0[^\"]*items-center[^\"]*justify-center/]",
          message:
            "This looks like a hand-rolled modal. Use <Modal> from '@/components/ui/Modal' — it gives you role=dialog, Escape to close, and a panel that scrolls instead of running off the bottom of a phone.",
        },
      ],

      // Real bugs — keep as errors
      "prefer-const": "error",
      "react-hooks/rules-of-hooks": "error",
      "react/no-children-prop": "error",
    },
  },
  {
    // The @typescript-eslint rules, scoped to where that plugin is registered.
    files: ["**/*.{ts,tsx,mts,cts}"],
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

      // Real bugs — keep as errors
      "@typescript-eslint/no-unused-expressions": "error",
      "@typescript-eslint/no-non-null-asserted-optional-chain": "error",
    },
  },
  {
    // Generated / third-party-ish files — suppress everything.
    //
    // Turning rules off is not enough for src/types/supabase.ts: it is large
    // enough that the parser gives up with "File appears to be binary" before
    // any rule runs, so it reported a parse ERROR on every lint run. A rules
    // block cannot silence a parse failure — only not parsing it can, which is
    // the `ignores` entry below.
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
  {
    // Not linted at all. The generated Supabase types are too large for the
    // parser, which reported a parse error on every run — noise that buried the
    // real errors underneath it.
    ignores: ["src/types/supabase.ts", "src/types/supabase-types.ts"],
  },
];

export default eslintConfig;
