import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  hooks: {
    afterAllFileWrite: [
      'node scripts/sanitize-codegen.mjs',
      'prettier --write src/graphql/generated',
    ],
  },
  schema: 'schema.graphql',
  documents: ['src/**/*.graphql'],
  generates: {
    'src/graphql/generated/': {
      preset: 'client',
      presetConfig: {
        fragmentMasking: { unmaskFunctionName: 'readFragment' },
      },
      config: {
        arrayInputCoercion: false,
        enumsAsTypes: true,
        scalars: {
          BigInt: { input: 'string', output: 'string' },
          DateTime: { input: 'string', output: 'string' },
          URL: { input: 'string', output: 'string' },
          UUID: { input: 'string', output: 'string' },
        },
        useTypeImports: true,
      },
    },
  },
  ignoreNoDocuments: false,
};

export default config;
