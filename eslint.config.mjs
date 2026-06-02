import globals from 'globals';
import tseslint from 'typescript-eslint';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  { ignores: ['apps/web/dist/**', 'apps/api/src/generated/**'] },
  { files: ['**/*.js', '**/*.mjs'], languageOptions: { sourceType: 'module' } },
  { files: ['**/*.{js,mjs,cjs,ts,mts,cts}'], languageOptions: { globals: globals.node } },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },

  // --- Import direction guardrails ---
  // Layer 0: shared — zero @azure-burst-monitor/* deps
  {
    files: ['packages/shared/**/*.{ts,js}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@azure-burst-monitor/*'], message: 'shared must not import from other @azure-burst-monitor packages — it is a zero-dependency base layer' },
        ],
      }],
    },
  },
  // Layer 0: backend-errors — zero @azure-burst-monitor/* deps
  {
    files: ['packages/backend-errors/**/*.{ts,js}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@azure-burst-monitor/*'], message: 'backend-errors must not import from other @azure-burst-monitor packages — it is a zero-dependency base layer' },
        ],
      }],
    },
  },
  // Layer 1: backend-runtime — only shared and backend-errors
  {
    files: ['packages/backend-runtime/**/*.{ts,js}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@azure-burst-monitor/api', '@azure-burst-monitor/api/*'], message: 'backend-runtime must not import from apps/api' },
        ],
      }],
    },
  },
]);
