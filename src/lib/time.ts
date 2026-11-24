// London wall-clock time <-> UTC, correct across the clock changes (GMT/BST).
const TZ = "Europe/London";

function offsetMinutes(utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - utcMs) / 60000);
}

/** "2027-03-28T12:00" meaning London time -> ISO string in UTC. */
export function londonToUtc(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let utc = guess - offsetMinutes(guess) * 60000;
  utc = guess - offsetMinutes(utc) * 60000; // second pass settles times near the change
  return new Date(utc).toISOString();
}

/** UTC ISO -> "2027-03-28T12:00" in London time, for <input type="datetime-local">. */
export function utcToLondonInput(iso: string): string {
  const ms = new Date(iso).getTime() + offsetMinutes(new Date(iso).getTime()) * 60000;
  return new Date(ms).toISOString().slice(0, 16);
}

export const londonLabel = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
