import { spawn } from 'node:child_process';
import process, { loadEnvFile } from 'node:process';
import { fileURLToPath, URL } from 'node:url';

try {
  loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url)));
} catch (error) {
  if (
    !error ||
    typeof error !== 'object' ||
    !('code' in error) ||
    error.code !== 'ENOENT'
  ) {
    throw error;
  }
}

const [command, ...arguments_] = process.argv.slice(2);
if (!command) throw new Error('Command is required');

const child = spawn(command, arguments_, {
  env: process.env,
  stdio: 'inherit',
});

child.on('error', (error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
