import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import vue from 'eslint-plugin-vue';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'dist-api/**',
      'data/**',
      'preview/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  prettier,
  {
    files: ['**/*.ts', '**/*.vue'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { parser: tseslint.parser, extraFileExtensions: ['.vue'] },
    },
    rules: {
      curly: ['error', 'all'],
      'lines-between-class-members': ['error', 'always'],
      'padding-line-between-statements': [
        'error',
        { blankLine: 'always', prev: '*', next: ['function', 'class', 'return'] },
        { blankLine: 'always', prev: 'import', next: '*' },
        { blankLine: 'any', prev: 'import', next: 'import' },
      ],
      'one-var': ['error', 'never'],
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSUnknownKeyword',
          message: 'Use a specific domain type and validate external input.',
        },
        { selector: 'TSNeverKeyword', message: 'Use an explicit domain contract.' },
      ],
      'vue/block-order': ['error', { order: ['script', 'template', 'style'] }],
    },
  },
  {
    files: ['server/controllers/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'typeorm',
                '**/database/**',
                '**/repositories/**',
                '**/models/**',
                '**/shared/domain',
                '**/shared/finance',
              ],
              message:
                'Controllers handle HTTP and validation. Delegate business operations to a service.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['server/services/**/*.ts', 'server/guards/**/*.ts'],
    ignores: ['server/services/database.service.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'typeorm',
              message: 'Keep database queries and transactions in database repositories.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['server/**/*.ts'],
    rules: {
      // Nest constructor tokens must remain runtime imports for dependency injection.
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
);
