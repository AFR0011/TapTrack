from pathlib import Path

path = Path('src/components/SettingsWorkspace.tsx')
text = path.read_text()

old_import = "import { CloudLedgerLink } from './CloudLedgerLink';"
new_import = old_import + "\nimport { CloudDeviceDisconnect } from './CloudDeviceDisconnect';"
if old_import not in text:
    raise SystemExit('CloudLedgerLink import not found')
text = text.replace(old_import, new_import, 1)

old_block = """        {syncStatus?.bindingState === 'unlinked' ? (
          <CloudLedgerLink onLinked={refreshSyncStatus} />
        ) : null}
"""
new_block = old_block + """        <CloudDeviceDisconnect onDisconnected={refreshSyncStatus} />
"""
if old_block not in text:
    raise SystemExit('CloudLedgerLink render block not found')
text = text.replace(old_block, new_block, 1)

path.write_text(text)
