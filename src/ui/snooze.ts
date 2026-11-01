export interface SnoozePreset {
  label: string;
  until: Date;
}

const at9 = (d: Date) => {
  d.setHours(9, 0, 0, 0);
  return d;
};

/** Later today (+3h), tomorrow 9:00, this weekend (Sat 9:00, Mon–Thu only), next Monday 9:00. */
export function snoozePresets(now = new Date()): SnoozePreset[] {
  const day = now.getDay();
  const plus = (days: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    return at9(d);
  };
  return [
    { label: 'Later today', until: new Date(now.getTime() + 3 * 3_600_000) },
    { label: 'Tomorrow', until: plus(1) },
    ...(day >= 1 && day <= 4 ? [{ label: 'This weekend', until: plus(6 - day) }] : []),
    { label: 'Next week', until: plus((8 - day) % 7 || 7) },
  ];
}

/** Value for `<input type="datetime-local">` in local time. */
export function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
