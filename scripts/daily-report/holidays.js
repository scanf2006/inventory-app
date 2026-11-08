/**
 * Ontario holidays, computed per year. A holiday marked "observe" that falls on
 * a weekend moves to the next free weekday (e.g. Boxing Day on Saturday -> Monday).
 */

const pad = (n) => String(n).padStart(2, "0");
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
// Day of week for a calendar date (0 = Sunday), independent of time zone
const dow = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();
const addDays = (dateStr, n) => {
  const t = new Date(`${dateStr}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
const isWeekend = (dateStr) => [0, 6].includes(new Date(`${dateStr}T00:00:00Z`).getUTCDay());

// n-th given weekday of a month (n = 1..5)
const nthWeekday = (y, m, weekday, n) => {
  const first = dow(y, m, 1);
  return iso(y, m, 1 + ((weekday - first + 7) % 7) + (n - 1) * 7);
};

// Easter Sunday (Gregorian, anonymous algorithm)
const easter = (y) => {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(y, month, day);
};

const definitions = (y) => [
  { name: "New Year's Day", date: iso(y, 1, 1), observe: true },
  { name: "Family Day", date: nthWeekday(y, 2, 1, 3) },
  { name: "Good Friday", date: addDays(easter(y), -2) },
  { name: "Easter Monday", date: addDays(easter(y), 1) },
  // Monday before May 25
  { name: "Victoria Day", date: addDays(iso(y, 5, 24), -((dow(y, 5, 24) + 6) % 7)) },
  { name: "Canada Day", date: iso(y, 7, 1), observe: true },
  { name: "Civic Holiday", date: nthWeekday(y, 8, 1, 1) },
  { name: "Labour Day", date: nthWeekday(y, 9, 1, 1) },
  { name: "Truth and Reconciliation Day", date: iso(y, 9, 30), observe: true },
  { name: "Thanksgiving", date: nthWeekday(y, 10, 1, 2) },
  { name: "Remembrance Day", date: iso(y, 11, 11), observe: true },
  { name: "Christmas Day", date: iso(y, 12, 25), observe: true },
  { name: "Boxing Day", date: iso(y, 12, 26), observe: true },
];

// Holidays in effect for a year: { "YYYY-MM-DD": name }, limited to the chosen names
const holidaysForYear = (year, names) => {
  const wanted = new Set(names);
  const chosen = definitions(year)
    .filter((h) => wanted.has(h.name))
    .sort((a, b) => a.date.localeCompare(b.date));
  const result = {};
  // Holidays on their own date first, then move weekend ones to the next free weekday
  chosen.filter((h) => !h.observe || !isWeekend(h.date)).forEach(({ name, date }) => {
    result[date] = name;
  });
  chosen.filter((h) => h.observe && isWeekend(h.date)).forEach(({ name, date }) => {
    let day = date;
    while (isWeekend(day) || result[day]) day = addDays(day, 1);
    result[day] = `${name} (observed)`;
  });
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
};

// Name of the holiday on this date, or null. Also checks December of the
// previous year, since a late-December holiday can be observed in January.
const holidayOn = (dateStr, names = [], extraDates = []) => {
  if (extraDates.includes(dateStr)) return "Company closure";
  const year = Number(dateStr.slice(0, 4));
  return holidaysForYear(year, names)[dateStr] || holidaysForYear(year - 1, names)[dateStr] || null;
};

const ALL_NAMES = definitions(2000).map((h) => h.name);

module.exports = { holidaysForYear, holidayOn, easter, ALL_NAMES };
