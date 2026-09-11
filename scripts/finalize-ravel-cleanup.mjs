import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const touched = [];

async function replace(path, from, to, required = true) {
  const absolute = join(root, path);
  const current = await readFile(absolute, 'utf8');
  if (!current.includes(from)) {
    if (required && !current.includes(to)) throw new Error(`${path}: expected text not found: ${from}`);
    return;
  }
  const next = current.split(from).join(to);
  await writeFile(absolute, next, 'utf8');
  touched.push(path);
}

// Internal test database labels are not persistence contracts.
for (const [path, from, to] of [
  ['src/database.migration.test.ts', 'taptrack-migration-', 'ravel-migration-'],
  ['src/database.migration.test.ts', 'taptrack-seed-repair-', 'ravel-seed-repair-'],
  ['src/sync/disconnectDevice.test.ts', 'taptrack-disconnect-', 'ravel-disconnect-'],
  ['src/sync/syncAdoption.test.ts', 'taptrack-adoption-', 'ravel-adoption-'],
  ['src/sync/syncBinding.test.ts', 'taptrack-binding-', 'ravel-binding-'],
]) await replace(path, from, to, false);

// Current operational/project-state documents use the current product identity.
for (const path of [
  'DEV_STATE.md',
  'QA_REPORT.md',
  'RISK_REGISTER.md',
  'docs/DEPENDENCY_SECURITY_UPGRADE_PLAN.md',
  'docs/PROJECT_STATE.md',
  'docs/REPO_PROFILE.md',
  'docs/RUN_PROTOCOL.md',
  'docs/VERSION_LOG.md',
]) {
  const absolute = join(root, path);
  const current = await readFile(absolute, 'utf8');
  const next = current.replaceAll('TapTrack CI', 'Ravel CI').replaceAll('TapTrack', 'Ravel');
  if (next !== current) {
    await writeFile(absolute, next, 'utf8');
    touched.push(path);
  }
}

{
  const path = 'docs/REPO_PROFILE.json';
  const absolute = join(root, path);
  const profile = JSON.parse(await readFile(absolute, 'utf8'));
  if (profile.project_name === 'TapTrack') {
    profile.project_name = 'Ravel';
    await writeFile(absolute, `${JSON.stringify(profile, null, 2)}\n`, 'utf8');
    touched.push(path);
  }
}

// The agent notes had an unrelated stale Ollama sentence; keep the rebrand documentation truthful.
await replace(
  'AGENTS.md',
  '- AI categorization: Local Ollama via `app/api/categorize`. Requires `OLLAMA_BASE_URL` and `OLLAMA_MODEL`.',
  '- AI categorization: Hosted Groq via `app/api/categorize`. Requires server-only `GROQ_API_KEY`; `GROQ_MODEL` selects the configured model.'
);

console.log(`Final Ravel cleanup updated ${new Set(touched).size} files.`);
for (const path of [...new Set(touched)].sort()) console.log(`- ${path}`);
