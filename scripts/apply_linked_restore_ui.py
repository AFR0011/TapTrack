from pathlib import Path

path = Path('src/components/SettingsWorkspace.tsx')
text = path.read_text()

old = "import { exportCSV, exportJSON, exportPDF, importJSON } from '@/exports/exportService';\n"
new = """import { exportCSV, exportJSON, exportPDF, importJSON } from '@/exports/exportService';
import { normalizeBackupJSON } from '@/exports/backupService';
import {
  restoreOnlyThisDevice,
  restoreSyncedAccount,
} from '@/exports/linkedRestoreService';
"""
if old not in text:
    raise SystemExit('export import marker not found')
text = text.replace(old, new, 1)

old = "import { CloudLedgerLink } from './CloudLedgerLink';\n"
new = """import { CloudLedgerLink } from './CloudLedgerLink';
import { RestoreScopeDialog } from './RestoreScopeDialog';
"""
if old not in text:
    raise SystemExit('CloudLedgerLink import marker not found')
text = text.replace(old, new, 1)

old = """  const [signingOut, setSigningOut] = useState(false);
  const darkModeEnabled = settings?.darkModeEnabled ?? resolveStoredTheme() === 'dark';
"""
new = """  const [signingOut, setSigningOut] = useState(false);
  const [pendingRestoreJson, setPendingRestoreJson] = useState<string | null>(null);
  const [showRestoreScope, setShowRestoreScope] = useState(false);
  const [showAccountRestoreConfirm, setShowAccountRestoreConfirm] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const darkModeEnabled = settings?.darkModeEnabled ?? resolveStoredTheme() === 'dark';
"""
if old not in text:
    raise SystemExit('state marker not found')
text = text.replace(old, new, 1)

start = text.index('  const handleImportFile = async (file: File | undefined) => {')
end = text.index('\n\n  const resetAppData = async () => {', start)
replacement = '''  const persistPreRestoreSafetyBackup = useCallback((safetyBackup: string) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadText(
      `taptrack-pre-restore-${timestamp}.json`,
      safetyBackup,
      'application/json'
    );
  }, []);

  const clearPendingRestore = useCallback(() => {
    setPendingRestoreJson(null);
    setShowRestoreScope(false);
    setShowAccountRestoreConfirm(false);
    if (importInputRef.current) importInputRef.current.value = '';
  }, []);

  const handleImportFile = async (file: File | undefined) => {
    if (!file) return;
    let keepPendingFile = false;

    try {
      const jsonData = await file.text();
      // Validate before asking a destructive-scope question.
      normalizeBackupJSON(jsonData);

      if (syncStatus?.bindingState === 'linked') {
        setPendingRestoreJson(jsonData);
        setShowRestoreScope(true);
        keepPendingFile = true;
        return;
      }

      const result = await importJSON(jsonData, db, {
        beforeReplace: persistPreRestoreSafetyBackup,
      });
      await refreshSyncStatus();
      toast.success(
        result.legacyMigrated
          ? 'Legacy backup restored locally and upgraded to the checkpoint ledger.'
          : 'Backup restored locally. A pre-restore safety backup was downloaded.'
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Backup could not be restored.');
    } finally {
      if (!keepPendingFile && importInputRef.current) importInputRef.current.value = '';
    }
  };

  const executeDeviceOnlyRestore = async () => {
    if (!pendingRestoreJson || restoreBusy) return;
    setRestoreBusy(true);
    try {
      const result = await restoreOnlyThisDevice(
        pendingRestoreJson,
        persistPreRestoreSafetyBackup,
        db
      );
      await refreshSyncStatus();
      toast.success(
        result.legacyMigrated
          ? 'Legacy backup restored on this device. Cloud sync was disconnected and the account was left unchanged.'
          : 'Backup restored on this device. Cloud sync was disconnected and the account was left unchanged.'
      );
      clearPendingRestore();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'This device could not be restored.');
      setShowRestoreScope(true);
    } finally {
      setRestoreBusy(false);
    }
  };

  const executeAccountRestore = async () => {
    if (!pendingRestoreJson || restoreBusy) return;
    setRestoreBusy(true);
    try {
      const result = await restoreSyncedAccount(
        pendingRestoreJson,
        persistPreRestoreSafetyBackup,
        db
      );
      await refreshSyncStatus();
      toast.success(
        result.legacyMigrated
          ? 'Legacy backup restored to the synced account. Other linked devices will adopt the restored ledger.'
          : 'Synced account restored. Other linked devices will adopt the restored ledger.'
      );
      clearPendingRestore();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Synced account could not be restored.');
      setShowRestoreScope(true);
    } finally {
      setRestoreBusy(false);
    }
  };
'''
text = text[:start] + replacement + text[end:]

old = '<p className="mt-1 text-sm text-muted">Export a canonical backup or restore/replace this local ledger from JSON. A safety backup is downloaded before replacement.</p>'
new = '<p className="mt-1 text-sm text-muted">Export a canonical backup or restore/replace from JSON. Linked browsers choose explicitly between replacing the synced account or detaching and restoring only this device. A safety backup is downloaded before replacement.</p>'
if old not in text:
    raise SystemExit('data export copy marker not found')
text = text.replace(old, new, 1)

marker = """      <ConfirmDialog
        open={showResetConfirm}
"""
dialogs = """      <RestoreScopeDialog
        open={showRestoreScope}
        busy={restoreBusy}
        onRestoreAccount={() => {
          setShowRestoreScope(false);
          setShowAccountRestoreConfirm(true);
        }}
        onRestoreDevice={() => void executeDeviceOnlyRestore()}
        onCancel={clearPendingRestore}
      />

      <ConfirmDialog
        open={showAccountRestoreConfirm}
        title="Replace synced account ledger"
        message="This will replace the signed-in account’s canonical finance ledger with the selected backup. Other linked devices will adopt the restored ledger, and stale pre-restore pending changes on those devices will be discarded."
        confirmLabel="Replace synced account"
        confirmVariant="danger"
        onConfirm={() => {
          setShowAccountRestoreConfirm(false);
          void executeAccountRestore();
        }}
        onCancel={() => {
          setShowAccountRestoreConfirm(false);
          setShowRestoreScope(true);
        }}
      />

      <ConfirmDialog
        open={showResetConfirm}
"""
if marker not in text:
    raise SystemExit('dialog marker not found')
text = text.replace(marker, dialogs, 1)
path.write_text(text)
