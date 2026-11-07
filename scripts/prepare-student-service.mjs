import { cpSync, copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
const output = resolve(dist, 'student-service');
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
copyFileSync(resolve(dist, 'students.html'), resolve(output, 'index.html'));
copyFileSync(resolve(dist, 'favicon.svg'), resolve(output, 'favicon.svg'));
cpSync(resolve(dist, 'assets'), resolve(output, 'assets'), { recursive: true });
cpSync(resolve(dist, 'api'), resolve(output, 'api'), { recursive: true });
copyFileSync(resolve(root, 'api/schema.sql'), resolve(output, 'schema.sql'));
console.log(`Student subdomain package ready at ${output}`);
