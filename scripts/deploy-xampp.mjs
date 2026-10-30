import { cpSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'dist');
const target = 'C:\\xampp\\htdocs\\alexore';
mkdirSync(target, { recursive: true });
cpSync(output, target, { recursive: true, force: true });
console.log(`Built React site and copied it to ${target}`);
