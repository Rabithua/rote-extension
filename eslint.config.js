import js from '@eslint/js';
import ts from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
export default ts.config(
  { ignores: ['.wxt/**','.output/**','node_modules/**','test-results/**','playwright-report/**','work/**'] },
  js.configs.recommended, ...ts.configs.recommended,
  { files: ['**/*.ts','**/*.tsx'], languageOptions: { globals: { chrome:'readonly',console:'readonly' } },
    rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] } },
  { files: ['src/ui/**/*.tsx','src/ui/**/*.ts'], plugins: { 'react-hooks':hooks },
    rules: { 'react-hooks/rules-of-hooks':'error', 'react-hooks/exhaustive-deps':'error' } },
);
