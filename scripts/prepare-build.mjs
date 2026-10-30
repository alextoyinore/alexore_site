import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const publicRoot = resolve(root, 'public');
mkdirSync(publicRoot, { recursive: true });
for (const name of ['api', 'uploads']) {
  const target = resolve(publicRoot, name);
  rmSync(target, { recursive: true, force: true });
  cpSync(resolve(root, name), target, { recursive: true, force: true });
}
