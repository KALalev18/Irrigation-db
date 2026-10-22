import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  { ignores: ['dist/', 'coverage/', 'node_modules/', 'public/'] },
  js.configs.recommended,
  ...tsPlugin.configs['flat/recommended'],
  {
    files: ['**/*.ts'],
    rules: {
      'no-console': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    // CLI scripts report progress on stdout
    files: ['prisma/**/*.ts', 'scripts/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
];
