from pathlib import Path

path = Path('src/sync/multiDeviceSync.test.ts')
text = path.read_text()
old = """    await expect(deviceB.deviceMetadata.get('ledger-binding')).resolves.toMatchObject(
      remote.getVersion()
    );
"""
new = """    const restoredVersion = remote.getVersion();
    await expect(deviceB.deviceMetadata.get('ledger-binding')).resolves.toMatchObject({
      cloudRevision: restoredVersion.revision,
      cloudGeneration: restoredVersion.generation,
    });
"""
if old not in text:
    raise SystemExit('deviceB generation assertion not found')
text = text.replace(old, new, 1)

old = """    await expect(deviceA.deviceMetadata.get('ledger-binding')).resolves.toMatchObject(
      remote.getVersion()
    );
"""
new = """    const racedVersion = remote.getVersion();
    await expect(deviceA.deviceMetadata.get('ledger-binding')).resolves.toMatchObject({
      cloudRevision: racedVersion.revision,
      cloudGeneration: racedVersion.generation,
    });
"""
if old not in text:
    raise SystemExit('deviceA generation assertion not found')
text = text.replace(old, new, 1)
path.write_text(text)
