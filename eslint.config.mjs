// G2: lint de api/ e web/. Erro e aviso contam igual (o gate reprova qualquer mensagem).
import js from '@eslint/js'
import { defineConfig } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig(
  { ignores: ['**/node_modules/**', '**/dist/**'] },
  {
    files: ['api/**/*.{ts,mts,cts}', 'web/**/*.{ts,tsx,mts}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { vars: 'all', args: 'after-used', argsIgnorePattern: '^_', caughtErrors: 'all', ignoreRestSiblings: false },
      ],
    },
  },
  { files: ['api/**'], languageOptions: { globals: globals.node } },
  { files: ['web/**'], languageOptions: { globals: globals.browser } },
)
