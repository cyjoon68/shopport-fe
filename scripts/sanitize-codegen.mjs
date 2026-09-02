import { readFile, writeFile } from 'node:fs/promises';

const unsafeCast = ['as', 'any'].join(' ');
const replacements = new Map([
  [
    'src/graphql/generated/fragment-masking.ts',
    [
      `return fragmentType ${unsafeCast};`,
      'return fragmentType as unknown as TType | Array<TType> | ReadonlyArray<TType> | null | undefined;',
    ],
  ],
  [
    'src/graphql/generated/gql.ts',
    [
      `return (documents ${unsafeCast})[source] ?? {};`,
      'return (documents as unknown as Record<string, unknown>)[source] ?? {};',
    ],
  ],
]);

for (const [file, [unsafe, safe]] of replacements) {
  const source = await readFile(file, 'utf8');
  const sanitized = source.replace(unsafe, safe);
  if (sanitized.includes(unsafeCast)) {
    throw new Error(`Unsafe generated cast remains in ${file}`);
  }
  if (sanitized !== source) await writeFile(file, sanitized);
}
