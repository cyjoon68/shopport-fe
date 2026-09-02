import { createHash } from 'node:crypto';

import type { CodegenConfig } from '@graphql-codegen/cli';
import { addTypenameSelectionDocumentTransform } from '@graphql-codegen/client-preset';
import { stripIgnoredCharacters } from 'graphql';

const hashPersistedDocument = (document: string): string =>
  createHash('sha256').update(stripIgnoredCharacters(document)).digest('hex');

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
      documentTransforms: [addTypenameSelectionDocumentTransform],
      preset: 'client',
      presetConfig: {
        fragmentMasking: { unmaskFunctionName: 'readFragment' },
        persistedDocuments: { hashAlgorithm: hashPersistedDocument },
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
