import { existsSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Search for a .env file starting from the given directory,
 * walking up to the project root.
 */
export function findEnvFile(startDir) {
  let current = resolve(startDir);
  const root = resolve(__dirname, '..', '..');

  while (current.length >= root.length) {
    const envPath = join(current, '.env');
    if (existsSync(envPath)) {
      return envPath;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  const defaultPath = join(root, '.env');
  if (existsSync(defaultPath)) {
    return defaultPath;
  }

  return null;
}