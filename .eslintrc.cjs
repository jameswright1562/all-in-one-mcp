module.exports = {
  root: true,
  env: {
    node: true,
    es2023: true,
  },
  parserOptions: {
    ecmaVersion: 2023,
    sourceType: 'module',
  },
  extends: ['eslint:recommended'],
  rules: {
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-undef': 'off', // Let TypeScript handle undefined variables
  },
  overrides: [
    {
      files: ['*.ts', '*.mts'],
      parser: '@typescript-eslint/parser',
      plugins: ['@typescript-eslint'],
      extends: ['plugin:@typescript-eslint/recommended'],
      rules: {
        '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/no-require-imports': 'off', // Allow require imports in build output
      },
    },
    {
      files: ['*.vue'],
      plugins: ['vue'],
      extends: ['plugin:vue/vue3-recommended'],
    },
  ],
  ignorePatterns: ['dist/**', 'build/**', '.nuxt/**', '.output/**', 'node_modules/**', 'packages/*/build/**'],
}
