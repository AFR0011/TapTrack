import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const ROOT = process.cwd();
const SKIP_DIRS = new Set(['.git', '.next', 'node_modules', 'test-results', 'playwright-report', '.vercel']);
const TEXT_EXTENSIONS = new Set([
  '', '.md', '.txt', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.yml', '.yaml',
  '.css', '.scss', '.html', '.svg', '.webmanifest', '.sql', '.toml', '.ini', '.env', '.sh', '.ps1',
]);
const pattern = /TapTrack|taptrack|TAPTRACK/g;

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'name-migration-audit.mjs') continue;
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) await walk(absolute);
      continue;
    }
    if (!entry.isFile()) continue;
    const extension = extname(entry.name);
    if (!TEXT_EXTENSIONS.has(extension) && !entry.name.startsWith('.env')) continue;

    let text;
    try {
      text = await readFile(absolute, 'utf8');
    } catch {
      continue;
    }

    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!pattern.test(line)) {
        pattern.lastIndex = 0;
        return;
      }
      pattern.lastIndex = 0;
      console.log(`${relative(ROOT, absolute)}:${index + 1}: ${line.trim()}`);
    });
  }
}

console.log('--- RAVEL NAME MIGRATION AUDIT START ---');
await walk(ROOT);
console.log('--- RAVEL NAME MIGRATION AUDIT END ---');
