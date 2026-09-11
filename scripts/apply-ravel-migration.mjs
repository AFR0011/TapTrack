import { readdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const root = process.cwd();
const touched = new Set();

async function read(path) {
  return readFile(join(root, path), 'utf8');
}

async function write(path, content) {
  const absolute = join(root, path);
  const current = await readFile(absolute, 'utf8');
  if (current === content) return;
  await writeFile(absolute, content, 'utf8');
  touched.add(path);
}

async function replace(path, from, to, { required = true } = {}) {
  const current = await read(path);
  if (!current.includes(from)) {
    if (required && !current.includes(to)) {
      throw new Error(`${path}: expected migration source not found: ${from.slice(0, 100)}`);
    }
    return;
  }
  await write(path, current.split(from).join(to));
}

async function walk(dir, extensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])) {
  const result = [];
  for (const entry of await readdir(join(root, dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) result.push(...await walk(path, extensions));
    else if (entry.isFile() && extensions.has(extname(entry.name))) result.push(path);
  }
  return result;
}

// Public/source identity: Ravel. Preserve only the persisted IndexedDB database name.
for (const dir of ['app', 'src', 'e2e']) {
  for (const path of await walk(dir)) {
    let text = await read(path);
    const original = text;
    text = text.replaceAll('TapTrackDB', '__RAVEL_KEEP_INDEXEDDB_NAME__');
    text = text.replaceAll('TapTrackDatabase', 'RavelDatabase');
    text = text.replaceAll('TapTrackBackupV2', 'RavelBackupV2');
    text = text.replaceAll('TapTrackBackup', 'RavelBackup');
    text = text.replaceAll('TAPTRACK_BACKUP_FORMAT', 'RAVEL_BACKUP_FORMAT');
    text = text.replaceAll('TAPTRACK_BACKUP_VERSION', 'RAVEL_BACKUP_VERSION');
    text = text.replaceAll('TapTrack', 'Ravel');
    text = text.replaceAll('__RAVEL_KEEP_INDEXEDDB_NAME__', 'TapTrackDB');
    if (text !== original) await write(path, text);
  }
}

// Current documentation uses Ravel; historical logs, release notes, migrations and state snapshots remain historical.
for (const path of [
  'AGENTS.md',
  'PUBLICATION.md',
  'SECURITY.md',
  'docs/AI_CATEGORIZATION_BEHAVIOR.md',
  'docs/ARCHITECTURE.md',
  'docs/PRODUCTION_CHECKLIST.md',
  'docs/REPO_MAP.md',
]) {
  const current = await read(path);
  await write(path, current.replaceAll('TapTrack', 'Ravel'));
}

// New downloads and generated artifacts use the Ravel name. Existing backup wire format remains compatible.
for (const [path, from, to] of [
  ['src/components/SettingsWorkspace.tsx', 'taptrack-transactions.csv', 'ravel-transactions.csv'],
  ['src/components/SettingsWorkspace.tsx', 'taptrack-backup.json', 'ravel-backup.json'],
  ['src/components/SettingsWorkspace.tsx', 'taptrack-pre-restore-', 'ravel-pre-restore-'],
  ['src/components/SettingsWorkspace.tsx', 'taptrack-pre-reset-', 'ravel-pre-reset-'],
  ['src/components/CloudLedgerLink.tsx', 'taptrack-pre-sync-replace-', 'ravel-pre-sync-replace-'],
  ['src/components/ReportsWorkspace.tsx', 'taptrack-${mode}-report.pdf', 'ravel-${mode}-report.pdf'],
  ['src/server/categories/categorizeWithAI.ts', 'taptrack_category_evaluation', 'ravel_category_evaluation'],
  ['src/server/categories/categorizeWithAI.test.ts', 'taptrack_category_evaluation', 'ravel_category_evaluation'],
  ['src/balances/reconciliationEvents.ts', 'taptrack:open-balance-check', 'ravel:open-balance-check'],
]) {
  await replace(path, from, to, { required: false });
}

// Package identity is not a persistence contract.
{
  const packagePath = 'package.json';
  const pkg = JSON.parse(await read(packagePath));
  pkg.name = 'ravel';
  await write(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);

  const lockPath = 'package-lock.json';
  const lock = JSON.parse(await read(lockPath));
  lock.name = 'ravel';
  if (lock.packages?.['']) lock.packages[''].name = 'ravel';
  await write(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
}

// Prefer RAVEL_* configuration while retaining TAPTRACK_* fallbacks for already-configured deployments.
await replace(
  'src/components/QuickCaptureSettings.tsx',
  "  expense: process.env.NEXT_PUBLIC_TAPTRACK_EXPENSE_SHORTCUT_URL,\n  income: process.env.NEXT_PUBLIC_TAPTRACK_INCOME_SHORTCUT_URL,",
  "  expense: process.env.NEXT_PUBLIC_RAVEL_EXPENSE_SHORTCUT_URL ?? process.env.NEXT_PUBLIC_TAPTRACK_EXPENSE_SHORTCUT_URL,\n  income: process.env.NEXT_PUBLIC_RAVEL_INCOME_SHORTCUT_URL ?? process.env.NEXT_PUBLIC_TAPTRACK_INCOME_SHORTCUT_URL,"
);
for (const path of ['app/api/telegram/register/route.ts', 'app/api/telegram/webhook/route.ts']) {
  await replace(path, "process.env.TAPTRACK_OWNER_TELEGRAM_CHAT_ID", "process.env.RAVEL_OWNER_TELEGRAM_CHAT_ID ?? process.env.TAPTRACK_OWNER_TELEGRAM_CHAT_ID", { required: false });
  await replace(path, "process.env.TAPTRACK_OWNER_USER_ID", "process.env.RAVEL_OWNER_USER_ID ?? process.env.TAPTRACK_OWNER_USER_ID", { required: false });
  await replace(path, "process.env.TAPTRACK_TIME_ZONE", "process.env.RAVEL_TIME_ZONE ?? process.env.TAPTRACK_TIME_ZONE", { required: false });
}

await write('.env.example', `# Supabase Auth + optional finance-data sync
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key

# Privileged server-only Supabase access used by integration paths.
# Never expose this value to browser code or commit a real key.
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Optional Telegram integration
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
TELEGRAM_WEBHOOK_SECRET=your-webhook-secret-token
RAVEL_OWNER_TELEGRAM_CHAT_ID=your-telegram-chat-id
RAVEL_OWNER_USER_ID=supabase-user-id
RAVEL_TIME_ZONE=Europe/Istanbul

# Hosted AI categorization. Server-only: never prefix these with NEXT_PUBLIC_.
GROQ_API_KEY=your-groq-api-key
GROQ_MODEL=openai/gpt-oss-20b

# Optional public iCloud share links for the prebuilt iPhone Quick Capture templates.
# The templates themselves must contain no user capture key; use Apple Import Questions.
NEXT_PUBLIC_RAVEL_EXPENSE_SHORTCUT_URL=
NEXT_PUBLIC_RAVEL_INCOME_SHORTCUT_URL=
`);

// Browser theme preference migrates once from the historical key.
await write('src/theme.ts', `export const THEME_STORAGE_KEY = 'ravel-theme';
const LEGACY_THEME_STORAGE_KEY = 'taptrack-theme';

export type ThemeMode = 'light' | 'dark';

export function resolveStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  try {
    const current = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (current === 'dark' || current === 'light') return current;
    const legacy = window.localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
    if (legacy === 'dark' || legacy === 'light') {
      window.localStorage.setItem(THEME_STORAGE_KEY, legacy);
      return legacy;
    }
  } catch {
    // Theme preference is convenience only.
  }
  return 'light';
}

export function setStoredTheme(theme: ThemeMode): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Theme preference is convenience only.
  }
}

export function applyTheme(theme: ThemeMode): void {
  if (typeof document === 'undefined') return;
  const isDark = theme === 'dark';
  document.documentElement.classList.toggle('dark', isDark);
  document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
}
`);

// Onboarding/tip state migrates from the historical localStorage namespace.
await write('src/onboarding/onboardingState.ts', `export const ONBOARDING_VERSION = 1;

const ONBOARDING_KEY = 'ravel:onboarding-version';
const LEGACY_ONBOARDING_KEY = 'taptrack:onboarding-version';
const TIP_PREFIX = 'ravel:tip:';
const LEGACY_TIP_PREFIX = 'taptrack:tip:';

export type FeatureTipKey = 'quick-add' | 'smart-categories' | 'quick-capture' | 'command-entry';

export function markOnboardingComplete(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ONBOARDING_KEY, String(ONBOARDING_VERSION));
}

export function hasCompletedCurrentOnboarding(): boolean {
  if (typeof window === 'undefined') return false;
  const current = Number(window.localStorage.getItem(ONBOARDING_KEY) ?? 0);
  if (current >= ONBOARDING_VERSION) return true;
  const legacy = Number(window.localStorage.getItem(LEGACY_ONBOARDING_KEY) ?? 0);
  if (legacy >= ONBOARDING_VERSION) {
    window.localStorage.setItem(ONBOARDING_KEY, String(legacy));
    return true;
  }
  return false;
}

export function shouldShowFeatureTip(key: FeatureTipKey): boolean {
  if (typeof window === 'undefined') return false;
  const currentKey = \`${'${TIP_PREFIX}${key}'}\`;
  if (window.localStorage.getItem(currentKey) === 'dismissed') return false;
  const legacyKey = \`${'${LEGACY_TIP_PREFIX}${key}'}\`;
  if (window.localStorage.getItem(legacyKey) === 'dismissed') {
    window.localStorage.setItem(currentKey, 'dismissed');
    return false;
  }
  return true;
}

export function dismissFeatureTip(key: FeatureTipKey): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(\`${'${TIP_PREFIX}${key}'}\`, 'dismissed');
}
`);

// Transaction-entry preference uses the Ravel namespace and migrates the previous value lazily.
await write('src/transactions/inputPreferences.ts', `export type TransactionInputMode = 'quick' | 'command';

const STORAGE_KEY = 'ravel:transaction-input-mode';
const LEGACY_STORAGE_KEY = 'taptrack:transaction-input-mode';
const CHANGE_EVENT = 'ravel:transaction-input-mode-change';

export function getTransactionInputMode(): TransactionInputMode {
  if (typeof window === 'undefined') return 'quick';

  try {
    const current = window.localStorage.getItem(STORAGE_KEY);
    if (current === 'command' || current === 'quick') return current;
    const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy === 'command' || legacy === 'quick') {
      window.localStorage.setItem(STORAGE_KEY, legacy);
      return legacy;
    }
    return 'quick';
  } catch {
    return 'quick';
  }
}

export function getServerTransactionInputMode(): TransactionInputMode {
  return 'quick';
}

export function subscribeTransactionInputMode(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === LEGACY_STORAGE_KEY) listener();
  };
  window.addEventListener('storage', handleStorage);
  window.addEventListener(CHANGE_EVENT, listener);

  return () => {
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener(CHANGE_EVENT, listener);
  };
}

export function setTransactionInputMode(mode: TransactionInputMode): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // Input preference is device convenience only. Transaction correctness does
    // not depend on localStorage being writable.
  }
}
`);

// Exchange-rate cache uses Ravel for new writes and lazily copies the legacy cache when needed.
await replace('src/exchangeRates.ts',
  "const EXCHANGE_RATE_CACHE_KEY = 'taptrack.exchange-rates.v1';",
  "const EXCHANGE_RATE_CACHE_KEY = 'ravel.exchange-rates.v1';\nconst LEGACY_EXCHANGE_RATE_CACHE_KEY = 'taptrack.exchange-rates.v1';"
);
await replace('src/exchangeRates.ts',
  "    const raw = storage.getItem(EXCHANGE_RATE_CACHE_KEY);\n    if (!raw) return [];\n    const parsed = JSON.parse(raw) as unknown;",
  "    let raw = storage.getItem(EXCHANGE_RATE_CACHE_KEY);\n    if (!raw) {\n      raw = storage.getItem(LEGACY_EXCHANGE_RATE_CACHE_KEY);\n      if (raw) storage.setItem(EXCHANGE_RATE_CACHE_KEY, raw);\n    }\n    if (!raw) return [];\n    const parsed = JSON.parse(raw) as unknown;"
);
// Keep one legacy-cache test as migration evidence; use Ravel for the other cache fixture.
{
  const path = 'src/exchangeRates.test.ts';
  let text = await read(path);
  const first = "storage.set('taptrack.exchange-rates.v1', JSON.stringify([directNewer]));";
  const index = text.indexOf(first);
  if (index >= 0) {
    const second = text.indexOf(first, index + first.length);
    if (second >= 0) text = `${text.slice(0, second)}${text.slice(second).replace(first, "storage.set('ravel.exchange-rates.v1', JSON.stringify([directNewer]));")}`;
  }
  await write(path, text);
}

// Sync status timestamps migrate lazily; sync correctness never depended on these UI timestamps.
await replace('src/sync/syncService.ts',
  "const LAST_SYNC_PREFIX = 'taptrack_last_pull:';\nconst LAST_PUSH_PREFIX = 'taptrack_last_push:';",
  "const LAST_SYNC_PREFIX = 'ravel_last_pull:';\nconst LAST_PUSH_PREFIX = 'ravel_last_push:';\nconst LEGACY_LAST_SYNC_PREFIX = 'taptrack_last_pull:';\nconst LEGACY_LAST_PUSH_PREFIX = 'taptrack_last_push:';"
);
await replace('src/sync/syncService.ts',
  "function getStatusTimestamp(prefix: string, userId: string | null): string | null {\n  return userId ? readStorage(`${prefix}${userId}`) : null;\n}",
  "function getStatusTimestamp(prefix: string, legacyPrefix: string, userId: string | null): string | null {\n  if (!userId) return null;\n  const current = readStorage(`${prefix}${userId}`);\n  if (current) return current;\n  const legacy = readStorage(`${legacyPrefix}${userId}`);\n  if (legacy) writeStorage(`${prefix}${userId}`, legacy);\n  return legacy;\n}"
);
await replace('src/sync/syncService.ts',
  "lastSyncAt: getStatusTimestamp(LAST_SYNC_PREFIX, userId),\n      lastPushAt: getStatusTimestamp(LAST_PUSH_PREFIX, userId),",
  "lastSyncAt: getStatusTimestamp(LAST_SYNC_PREFIX, LEGACY_LAST_SYNC_PREFIX, userId),\n      lastPushAt: getStatusTimestamp(LAST_PUSH_PREFIX, LEGACY_LAST_PUSH_PREFIX, userId),"
);

// New capture tokens use Ravel; tokens already issued under the old prefix continue to validate.
await write('src/server/capture/captureTokens.ts', `import { createHash, randomBytes } from 'node:crypto';

export const CAPTURE_TOKEN_PREFIX = 'ravel_capture_';
const LEGACY_CAPTURE_TOKEN_PREFIX = 'taptrack_capture_';

export function createCaptureToken(): string {
  return \`${'${CAPTURE_TOKEN_PREFIX}${randomBytes(32).toString(\'base64url\')}'}\`;
}

export function isCaptureToken(value: string): boolean {
  const prefix = value.startsWith(CAPTURE_TOKEN_PREFIX)
    ? CAPTURE_TOKEN_PREFIX
    : value.startsWith(LEGACY_CAPTURE_TOKEN_PREFIX)
      ? LEGACY_CAPTURE_TOKEN_PREFIX
      : null;
  if (!prefix) return false;
  const secret = value.slice(prefix.length);
  return /^[A-Za-z0-9_-]{40,60}$/.test(secret);
}

export function hashCaptureToken(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
`);
await replace('src/server/capture/captureTokens.test.ts', '/^taptrack_capture_[A-Za-z0-9_-]{40,60}$/', '/^ravel_capture_[A-Za-z0-9_-]{40,60}$/', { required: false });
await replace('src/server/capture/captureTokens.test.ts',
  "  it('rejects malformed or unrelated bearer values', () => {",
  "  it('accepts capture tokens issued before the Ravel rename', () => {\n    expect(isCaptureToken(`taptrack_capture_${'a'.repeat(43)}`)).toBe(true);\n  });\n\n  it('rejects malformed or unrelated bearer values', () => {"
);

// Service-worker cache namespace moves to Ravel but activation cleans historical app-owned caches too.
await replace('public/sw.js',
  "const CACHE_PREFIX = 'taptrack-shell-';\nconst CACHE_NAME = `${CACHE_PREFIX}2026-09-11-v13`;",
  "const CACHE_PREFIX = 'ravel-shell-';\nconst LEGACY_CACHE_PREFIX = 'taptrack-shell-';\nconst CACHE_NAME = `${CACHE_PREFIX}2026-09-11-v14`;"
);
await replace('public/sw.js',
  ".filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)",
  ".filter((key) =>\n            (key.startsWith(CACHE_PREFIX) || key.startsWith(LEGACY_CACHE_PREFIX)) &&\n            key !== CACHE_NAME\n          )"
);
await replace('e2e/offline-mobile.spec.ts', "key.startsWith('taptrack-shell-')", "key.startsWith('ravel-shell-')", { required: false });
await replace('e2e/offline-mobile.spec.ts', 'tapTrackKeys', 'ravelKeys', { required: false });

// Route smoke prefers the new environment name while accepting the old one for existing automation.
await replace('scripts/route-smoke.mjs',
  "const baseUrl = process.env.TAPTRACK_SMOKE_BASE_URL ?? 'http://127.0.0.1:3000';",
  "const baseUrl = process.env.RAVEL_SMOKE_BASE_URL ?? process.env.TAPTRACK_SMOKE_BASE_URL ?? 'http://127.0.0.1:3000';"
);

// Publication placeholders use Ravel; old variable names remain runtime fallbacks only.
for (const [from, to] of [
  ["['TAPTRACK_OWNER_TELEGRAM_CHAT_ID', 'your-telegram-chat-id']", "['RAVEL_OWNER_TELEGRAM_CHAT_ID', 'your-telegram-chat-id']"],
  ["['TAPTRACK_OWNER_USER_ID', 'supabase-user-id']", "['RAVEL_OWNER_USER_ID', 'supabase-user-id']"],
]) {
  await replace('scripts/publication-guard.mjs', from, to, { required: false });
}

// Playwright explicitly clears both preferred and legacy server integration names.
await replace('playwright.config.ts',
  "      TAPTRACK_OWNER_TELEGRAM_CHAT_ID: '',\n      TAPTRACK_OWNER_USER_ID: '',",
  "      RAVEL_OWNER_TELEGRAM_CHAT_ID: '',\n      RAVEL_OWNER_USER_ID: '',\n      RAVEL_TIME_ZONE: '',\n      TAPTRACK_OWNER_TELEGRAM_CHAT_ID: '',\n      TAPTRACK_OWNER_USER_ID: '',\n      TAPTRACK_TIME_ZONE: '',"
);

// Current docs/configuration point to Ravel assets and preferred env names.
await replace('docs/PRODUCTION_CHECKLIST.md', '/icons/taptrack-icon.svg', '/icons/ravel-icon.svg', { required: false });
for (const path of ['AGENTS.md', 'docs/PRODUCTION_CHECKLIST.md']) {
  let text = await read(path);
  text = text.replaceAll('TAPTRACK_OWNER_TELEGRAM_CHAT_ID', 'RAVEL_OWNER_TELEGRAM_CHAT_ID');
  text = text.replaceAll('TAPTRACK_OWNER_USER_ID', 'RAVEL_OWNER_USER_ID');
  text = text.replaceAll('TAPTRACK_TIME_ZONE', 'RAVEL_TIME_ZONE');
  await write(path, text);
}

// README describes the compatibility boundary explicitly while the repository slug remains historical.
await replace('README.md',
  "Some environment-variable names retain the historical `TAPTRACK_` prefix for compatibility. They are technical contracts, not the current public product name.",
  "New configuration uses the `RAVEL_` prefix. Existing deployments using historical `TAPTRACK_` environment names remain supported as fallbacks. Persisted storage/database and deployed Supabase RPC identifiers may also retain historical names internally so the rebrand never strands existing data."
);

console.log(`Ravel migration updated ${touched.size} files.`);
for (const path of [...touched].sort()) console.log(`- ${path}`);
