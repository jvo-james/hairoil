import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const files = ['scripts.js', 'admin.js', 'images.js', 'firebase-config.js'];
function collect(dir) {
  for (const item of readdirSync(dir)) {
    const path = join(dir, item);
    if (statSync(path).isDirectory()) collect(path);
    else if (path.endsWith('.js')) files.push(path.slice(root.length + 1));
  }
}
collect(join(root, 'netlify', 'functions'));
const unique = [...new Set(files)];
let failed = false;
for (const file of unique) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) failed = true;
}
if (failed) process.exit(1);
console.log(`JavaScript syntax check passed for ${unique.length} files.`);
