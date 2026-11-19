// Checks that the Supabase and GitHub schedules (UTC) reach the send window
// (Toronto time) on every weekday of a year, in both summer and winter time.
const fs = require("fs");
const path = require("path");
const report = require("../scripts/daily-report/report");
const config = require("../scripts/daily-report/config.json");

const read = (...p) => fs.readFileSync(path.join(__dirname, "..", ...p), "utf8");

// Minimal cron matcher for the forms used here: "*", "*/n", "a-b", "a,b", numbers
const fieldMatches = (field, value) =>
  field.split(",").some((part) => {
    if (part === "*") return true;
    const step = part.match(/^\*\/(\d+)$/);
    if (step) return value % Number(step[1]) === 0;
    const range = part.match(/^(\d+)-(\d+)$/);
    if (range) return value >= Number(range[1]) && value <= Number(range[2]);
    return Number(part) === value;
  });

const cronMatches = (expr, d) => {
  const [min, hour, dom, mon, dow] = expr.split(/\s+/);
  return (
    fieldMatches(min, d.getUTCMinutes()) &&
    fieldMatches(hour, d.getUTCHours()) &&
    fieldMatches(dom, d.getUTCDate()) &&
    fieldMatches(mon, d.getUTCMonth() + 1) &&
    fieldMatches(dow, d.getUTCDay())
  );
};

// Toronto dates on which some cron run falls inside the send window
const coveredDates = (exprs) => {
  const covered = new Set();
  for (let t = Date.UTC(2027, 0, 1); t < Date.UTC(2028, 0, 2); t += 10 * 60 * 1000) {
    const d = new Date(t);
    if (!exprs.some((e) => cronMatches(e, d))) continue;
    const local = report.localParts(d, config.timeZone);
    if (local.time >= config.sendWindow.start && local.time < config.sendWindow.end) covered.add(local.date);
  }
  return covered;
};

const weekdays2027 = () => {
  const days = [];
  for (let t = Date.UTC(2027, 0, 1); t < Date.UTC(2028, 0, 1); t += 86400000) {
    const d = new Date(t);
    if (d.getUTCDay() >= 1 && d.getUTCDay() <= 5) days.push(d.toISOString().slice(0, 10));
  }
  return days;
};

const supabaseCrons = [...read("scripts", "daily-report", "supabase-trigger.sql").matchAll(/cron\.schedule\('[^']+', '([^']+)'/g)].map(
  (m) => m[1],
);
const githubCrons = [...read(".github", "workflows", "daily-bulk-oil-report.yml").matchAll(/cron: "([^"]+)"/g)].map((m) => m[1]);

describe("schedules reach the send window", () => {
  test.each([
    ["Supabase", supabaseCrons],
    ["GitHub", githubCrons],
  ])("%s runs in the window on every weekday", (_name, exprs) => {
    expect(exprs.length).toBeGreaterThan(0);
    const covered = coveredDates(exprs);
    expect(weekdays2027().filter((d) => !covered.has(d))).toEqual([]);
  });

  test("Supabase's first run of the evening is at 7:00 PM Toronto in winter and summer", () => {
    const firstRun = (dateStr) => {
      for (let t = Date.parse(`${dateStr}T12:00:00Z`); ; t += 10 * 60 * 1000) {
        const d = new Date(t);
        if (!supabaseCrons.some((e) => cronMatches(e, d))) continue;
        const local = report.localParts(d, config.timeZone);
        if (local.time >= config.sendWindow.start) return local.time;
      }
    };
    expect(firstRun("2027-01-12")).toBe("19:00"); // winter
    expect(firstRun("2027-07-13")).toBe("19:00"); // summer
  });

  test("no run reaches the window on a weekend", () => {
    const covered = [...coveredDates([...supabaseCrons, ...githubCrons])];
    const weekend = covered.filter((d) => [0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay()));
    expect(weekend).toEqual([]);
  });
});
