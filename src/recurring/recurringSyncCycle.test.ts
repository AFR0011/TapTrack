import { describe, expect, it, vi } from 'vitest';
import { runRecurringSyncCycle } from './recurringSyncCycle';

const emptyResult = { created: 0, skipped: 0, failed: 0, conflicts: [] };

describe('runRecurringSyncCycle', () => {
  it('does not generate recurring activity when the online pre-sync fails', async () => {
    const sync = vi.fn().mockRejectedValue(new Error('cloud unavailable'));
    const createDue = vi.fn().mockResolvedValue(emptyResult);

    await expect(
      runRecurringSyncCycle({ online: true, sync, createDue })
    ).rejects.toThrow('cloud unavailable');

    expect(sync).toHaveBeenCalledTimes(1);
    expect(createDue).not.toHaveBeenCalled();
  });

  it('syncs before and after recurring generation while online', async () => {
    const order: string[] = [];
    const sync = vi.fn(async () => {
      order.push('sync');
    });
    const createDue = vi.fn(async () => {
      order.push('recurring');
      return emptyResult;
    });

    await expect(
      runRecurringSyncCycle({ online: true, sync, createDue })
    ).resolves.toEqual(emptyResult);

    expect(order).toEqual(['sync', 'recurring', 'sync']);
  });

  it('generates from the local ledger without attempting sync while offline', async () => {
    const sync = vi.fn();
    const createDue = vi.fn().mockResolvedValue(emptyResult);

    await expect(
      runRecurringSyncCycle({ online: false, sync, createDue })
    ).resolves.toEqual(emptyResult);

    expect(sync).not.toHaveBeenCalled();
    expect(createDue).toHaveBeenCalledTimes(1);
  });
});
