import js from '@eslint/js';
import parser from '@typescript-eslint/parser';
import typescript from '@typescript-eslint/eslint-plugin';
import react from 'eslint-plugin-react';
import hooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  { ignores: ['.next/**', 'node_modules/**'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { parser, parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } }, globals: { ...globals.browser, ...globals.node } },
    plugins: { '@typescript-eslint': typescript, react, 'react-hooks': hooks },
    rules: {
      ...js.configs.recommended.rules,
      'no-undef': 'off', // TypeScript checks names in both value and type namespaces.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'react/jsx-uses-vars': 'error', 'react/jsx-uses-react': 'error',
      'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['src/components/management/**/*.{ts,tsx}', 'src/components/contracts/**/*.{ts,tsx}', 'src/lib/management/**/*.ts', 'src/app/(management)/**/*.tsx', 'src/fixtures/management-data.ts'],
    rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
  },
];
