import { cpSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'dist', 'student-service');
const target = 'C:\\xampp\\htdocs\\students';
mkdirSync(target, { recursive: true });
cpSync(output, target, { recursive: true, force: true });
console.log(`Built student service and copied it to ${target}`);
