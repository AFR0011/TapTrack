from pathlib import Path

path = Path('src/sync/multiDeviceSync.test.ts')
text = path.read_text()
text = text.replace("  const getKey = (row: RemoteRow) => `${String(row.user_id)}:${String(row.id)}`;\n", "", 1)
text = text.replace(
    "vi.mocked(requireLinkedSyncAccess).mockImplementation(async (database: TapTrackDatabase) => {\n    const binding = await database.deviceMetadata.get('ledger-binding');",
    "vi.mocked(requireLinkedSyncAccess).mockImplementation(async (database?: TapTrackDatabase) => {\n    if (!database) return null;\n    const binding = await database.deviceMetadata.get('ledger-binding');",
    1,
)
path.write_text(text)
