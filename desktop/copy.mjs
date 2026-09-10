import { mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..');
const out = join(here, 'app');
mkdirSync(out, { recursive: true });
for (const f of ['index.html', 'app.js']) {
  copyFileSync(join(src, f), join(out, f));
}
console.log('copied index.html + app.js -> desktop/app');