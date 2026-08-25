import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

/**
 * The `lint` script had no config file, so it errored out instead of linting.
 * The rules that earn their place here are the ones that catch bugs this repo
 * has actually shipped — `react-hooks/rules-of-hooks` is the one that would
 * have caught the sign-in crash (a hook below an early return).
 *
 * Type-checking is tsc's job (`npm run typecheck`), so the type-aware
 * lint presets are deliberately not enabled — no duplicate reporting.
 */
export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'src/routeTree.gen.ts'] },
  {
    files: ['**/*.{ts,tsx,mts}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': 'off',
      // `any` is used deliberately at the solver/store boundaries; tsc governs types.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none',
      }],
      '@typescript-eslint/no-empty-object-type': 'off',
      // `next.has(x) ? next.delete(x) : next.add(x)` is the house toggle idiom,
      // used consistently across the panels. It is a side effect on purpose.
      '@typescript-eslint/no-unused-expressions': ['error', {
        allowShortCircuit: true, allowTernary: true,
      }],
    },
  },
  {
    // Verification harnesses run under tsx, outside the app build.
    files: ['*.mts'],
    languageOptions: { globals: globals.node },
  },
)
