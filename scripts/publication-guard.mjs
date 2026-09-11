import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

function read(relativePath) {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) {
    failures.push(`missing required publication file: ${relativePath}`);
    return '';
  }
  return fs.readFileSync(absolute, 'utf8');
}

function walkTextFiles(relativePath) {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) return [];
  const stat = fs.statSync(absolute);
  if (stat.isFile()) return [relativePath];

  const files = [];
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const child = path.join(relativePath, entry.name);
    if (entry.isDirectory()) files.push(...walkTextFiles(child));
    else if (/\.(?:ts|tsx|js|mjs|json|webmanifest|html|css|svg)$/i.test(entry.name)) files.push(child);
  }
  return files;
}

const readme = read('README.md');
const security = read('SECURITY.md');
const publication = read('PUBLICATION.md');
const license = read('LICENSE');
const packageJson = read('package.json');
const envExample = read('.env.example');
const gitignore = read('.gitignore');
const projectState = read('docs/PROJECT_STATE.md');
const devState = read('DEV_STATE.md');
const qaReport = read('QA_REPORT.md');
const architecture = read('docs/ARCHITECTURE.md');
const repoMap = read('docs/REPO_MAP.md');
const productionChecklist = read('docs/PRODUCTION_CHECKLIST.md');
const compatibility = read('docs/RAVEL_COMPATIBILITY.md');
const dependencyRecord = read('docs/DEPENDENCY_SECURITY_UPGRADE_PLAN.md');
const categorizeRoute = read('app/api/categorize/route.ts');

for (const phrase of ['local-first', 'Supabase Auth', 'not a banking', 'License']) {
  if (!readme.includes(phrase)) failures.push(`README missing required publication boundary: ${phrase}`);
}
if (!readme.includes('https://ravel-fawn.vercel.app')) {
  failures.push('README must link the canonical Ravel production URL');
}
if (!readme.includes('Node.js 22.x')) {
  failures.push('README local-development runtime must match Node 22.x');
}

for (const phrase of ['SUPABASE_SERVICE_ROLE_KEY', 'TELEGRAM_BOT_TOKEN', 'IndexedDB']) {
  if (!security.includes(phrase)) failures.push(`SECURITY.md missing boundary: ${phrase}`);
}

if (!publication.includes('MIT License')) failures.push('PUBLICATION.md must document the MIT License');
if (!license.startsWith('MIT License') || !license.includes('Copyright (c) 2026 Ali Farrokhnejad')) {
  failures.push('LICENSE must contain the project MIT license and copyright notice');
}

try {
  const parsedPackage = JSON.parse(packageJson);
  if (parsedPackage.license !== 'MIT') failures.push('package.json must declare MIT');
  if (parsedPackage.name !== 'ravel') failures.push('package.json package name must be ravel');
  if (parsedPackage.engines?.node !== '22.x') failures.push('package.json Node engine must remain aligned with CI at 22.x');
} catch {
  failures.push('package.json is not valid JSON');
}

if (readme.includes('Next.js 14') || projectState.includes('Next.js 14')) {
  failures.push('stale Next.js 14 publication documentation remains');
}
if (dependencyRecord.includes('intentionally deferred') || dependencyRecord.includes('Current Finding')) {
  failures.push('dependency security document still describes the completed migration as deferred');
}

for (const ignored of ['.env', '.env.local', '.env.production.local']) {
  if (!gitignore.split(/\r?\n/).includes(ignored)) failures.push(`.gitignore must include ${ignored}`);
}

const placeholderExpectations = new Map([
  ['NEXT_PUBLIC_SUPABASE_URL', 'your-supabase-project-url'],
  ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'your-supabase-anon-key'],
  ['SUPABASE_SERVICE_ROLE_KEY', 'your-supabase-service-role-key'],
  ['TELEGRAM_BOT_TOKEN', 'your-telegram-bot-token'],
  ['TELEGRAM_WEBHOOK_SECRET', 'your-webhook-secret-token'],
  ['RAVEL_OWNER_TELEGRAM_CHAT_ID', 'your-telegram-chat-id'],
  ['RAVEL_OWNER_USER_ID', 'supabase-user-id'],
  ['GROQ_API_KEY', 'your-groq-api-key'],
  ['GROQ_MODEL', 'openai/gpt-oss-20b'],
]);

for (const [key, expected] of placeholderExpectations) {
  const match = envExample.match(new RegExp(`^${key}=(.*)$`, 'm'));
  if (!match) failures.push(`.env.example missing ${key}`);
  else if (match[1].trim() !== expected) failures.push(`.env.example contains unexpected/non-placeholder value for ${key}`);
}

if (/^NEXT_PUBLIC_GROQ_/m.test(envExample) || categorizeRoute.includes('NEXT_PUBLIC_GROQ_')) {
  failures.push('Groq secrets/configuration must never use NEXT_PUBLIC_ variables');
}
if (/^OLLAMA_/m.test(envExample) || /OLLAMA_(BASE_URL|MODEL)/.test(categorizeRoute)) {
  failures.push('obsolete Ollama configuration remains after hosted Groq migration');
}
if (!categorizeRoute.includes("process.env.GROQ_API_KEY")) {
  failures.push('AI categorization route must read GROQ_API_KEY server-side');
}
if (/\bOllama\b/i.test(productionChecklist) || !productionChecklist.includes('GROQ_API_KEY')) {
  failures.push('production checklist must describe the current Groq categorization deployment, not Ollama');
}

const staleCurrentDocMarkers = new Map([
  ['DEV_STATE.md', ['PRE_MAIN_PROMOTION', 'Promotion PR: #15']],
  ['QA_REPORT.md', ['PR #16 may be promoted', 'Promotion PR: #16']],
  ['docs/PROJECT_STATE.md', ['final release hardening on `hardening/conversion-corrections`', 'promoted through PR #16']],
  ['PUBLICATION.md', ['TT-B002 is now deployed', 'The B002 automated gate']],
  ['SECURITY.md', ['Cloud-link initialization residual', 'before the B002-compatible application is live']],
  ['docs/ARCHITECTURE.md', ['outside TT-B001', 'until an atomic remote replacement design is separately approved']],
  ['docs/REPO_MAP.md', ['Presentation, merge/release, and deployment are blocked', 'server-side TOCTOU race']],
]);
const currentDocs = new Map([
  ['DEV_STATE.md', devState],
  ['QA_REPORT.md', qaReport],
  ['docs/PROJECT_STATE.md', projectState],
  ['PUBLICATION.md', publication],
  ['SECURITY.md', security],
  ['docs/ARCHITECTURE.md', architecture],
  ['docs/REPO_MAP.md', repoMap],
]);
for (const [file, markers] of staleCurrentDocMarkers) {
  const content = currentDocs.get(file) ?? '';
  for (const marker of markers) {
    if (content.includes(marker)) failures.push(`${file} contains stale release marker: ${marker}`);
  }
}

for (const phrase of ['AFR0011/Ravel', 'Vercel project is `ravel`', 'Supabase project ref']) {
  if (!compatibility.includes(phrase)) failures.push(`RAVEL_COMPATIBILITY.md missing current provider boundary: ${phrase}`);
}

const publicBrandFiles = [
  ...walkTextFiles('app'),
  ...walkTextFiles('src/components'),
  ...walkTextFiles('public'),
  'src/brand.ts',
];
for (const file of publicBrandFiles) {
  const content = read(file);
  if (/\bTapTrack\b/.test(content)) {
    failures.push(`user-facing/runtime brand surface still contains TapTrack: ${file}`);
  }
}

if (failures.length) {
  console.error('publication guard failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('publication guard ok');