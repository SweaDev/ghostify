import { browser } from 'wxt/browser';
import { expireSnoozes } from '../store/items';

export const SNOOZE_ALARM = 'snooze-check';

/** Expires due snoozes now and every few minutes (alarms survive service-worker restarts). */
export async function initSnooze(): Promise<void> {
  browser.alarms.onAlarm.addListener((a) => {
    if (a.name === SNOOZE_ALARM) void expireSnoozes();
  });
  if (!(await browser.alarms.get(SNOOZE_ALARM))) {
    await browser.alarms.create(SNOOZE_ALARM, { periodInMinutes: 5, delayInMinutes: 1 });
  }
  await expireSnoozes();
}
