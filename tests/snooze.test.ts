import { fakeBrowser } from 'wxt/testing/fake-browser';
import { initSnooze, SNOOZE_ALARM } from '@/src/background/snooze';
import { db } from '@/src/store/db';
import { ghostify, setState } from '@/src/store/items';
import { snoozePresets, toLocalInput } from '@/src/ui/snooze';

beforeEach(() => db.items.clear());

describe('snooze presets', () => {
  it('computes later today, tomorrow 9:00 and next Monday 9:00', () => {
    const wed = new Date(2026, 9, 28, 14, 30); // Wednesday
    const p = Object.fromEntries(snoozePresets(wed).map((x) => [x.label, x.until]));
    expect(p['Later today']?.getHours()).toBe(17);
    expect(p.Tomorrow).toEqual(new Date(2026, 9, 29, 9));
    expect(p['This weekend']).toEqual(new Date(2026, 9, 31, 9));
    expect(p['Next week']).toEqual(new Date(2026, 10, 2, 9));
  });

  it('skips "This weekend" on Fridays and weekends', () => {
    const fri = new Date(2026, 9, 30, 10);
    const sun = new Date(2026, 10, 1, 10);
    expect(snoozePresets(fri).map((p) => p.label)).not.toContain('This weekend');
    expect(snoozePresets(sun).map((p) => p.label)).not.toContain('This weekend');
    expect(snoozePresets(sun).find((p) => p.label === 'Next week')?.until).toEqual(
      new Date(2026, 10, 2, 9),
    );
  });

  it('formats datetime-local values', () => {
    expect(toLocalInput(new Date(2026, 0, 2, 3, 4))).toBe('2026-01-02T03:04');
  });
});

describe('snooze alarm', () => {
  it('creates the alarm, expires on startup and on alarm', async () => {
    await ghostify({ id: 'a', host: 'h', siteId: 's', view: 'any', title: 'A', excerpt: '' });
    await ghostify({ id: 'b', host: 'h', siteId: 's', view: 'any', title: 'B', excerpt: '' });
    const soon = Date.now() + 50;
    await setState('h:a', 'snoozed', soon);
    await setState('h:b', 'snoozed', soon);
    await db.items.update('h:a', { snoozeUntil: Date.now() - 1 });
    await initSnooze();
    expect(await fakeBrowser.alarms.get(SNOOZE_ALARM)).toBeTruthy();
    expect((await db.items.get('h:a'))?.state).toBe('ghost');
    expect((await db.items.get('h:b'))?.state).toBe('snoozed');

    await new Promise((r) => setTimeout(r, 60));
    await fakeBrowser.alarms.onAlarm.trigger({
      name: SNOOZE_ALARM,
      scheduledTime: Date.now(),
      persistAcrossSessions: true,
    });
    await vi.waitFor(async () => expect((await db.items.get('h:b'))?.state).toBe('ghost'));
  });
});
