import tseslint from 'typescript-eslint';
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/.next-production/**',
      'node_modules/**',
      '.venv/**',
      '.runtime/**',
      'playwright-report/**',
      'test-results/**',
      '**/next-env.d.ts',
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
);
