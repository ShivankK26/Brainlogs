/** Relative due-date parsing for commitments ("by Friday", "tomorrow", "end of week", "in 3 days", ISO dates). Times are local noon. */
const WEEKDAYS: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6 };

function noon(d: Date): Date {
  const x = new Date(d);
  x.setHours(12, 0, 0, 0);
  return x;
}

export function parseDue(text: string, now: Date): string | null {
  const t = text.toLowerCase();
  const iso = t.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) return new Date(`${iso[1]}T12:00:00`).toISOString();
  if (/\b(today|by eod|end of (the )?day|tonight)\b/.test(t)) return noon(now).toISOString();
  if (/\btomorrow\b/.test(t)) {
    const d = noon(now);
    d.setDate(d.getDate() + 1);
    return d.toISOString();
  }
  const inDays = t.match(/\bin (\d{1,2}) days?\b/);
  if (inDays) {
    const d = noon(now);
    d.setDate(d.getDate() + Number(inDays[1]));
    return d.toISOString();
  }
  if (/\b(end of (the |this )?week|by eow|this week)\b/.test(t)) {
    const d = noon(now);
    const add = (5 - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + (d.getDay() === 5 ? 0 : add));
    return d.toISOString();
  }
  if (/\bnext week\b/.test(t)) {
    const d = noon(now);
    d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
    return d.toISOString();
  }
  const wd = t.match(/\b(?:(?:by|on|before|until|till|this)\s+)?(?:next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues?|wed|thur?s?|fri|sat)\b/);
  if (wd) {
    const target = WEEKDAYS[wd[1]!]!;
    const d = noon(now);
    let add = (target - d.getDay() + 7) % 7;
    if (add === 0) add = 7;
    if (/next\s+\w+day/.test(wd[0]) && add < 7) add += 7;
    d.setDate(d.getDate() + add);
    return d.toISOString();
  }
  const md = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/);
  if (md) {
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const m = months.indexOf(md[1]!.slice(0, 3));
    const d = new Date(now.getFullYear(), m, Number(md[2]), 12, 0, 0, 0);
    if (d.getTime() < now.getTime() - 30 * 86_400_000) d.setFullYear(d.getFullYear() + 1);
    return d.toISOString();
  }
  return null;
}
