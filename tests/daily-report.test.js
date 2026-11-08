const report = require("../scripts/daily-report/report");

const config = {
  syncId: "shop",
  category: "Bulk Oil",
  unit: "L",
  timeZone: "America/Toronto",
  sendWindow: { start: "17:00", end: "21:00" },
  lowStock: { default: 500, products: { BIG: 5000 } },
};

const data = {
  products: { "Bulk Oil": ["A", "BIG", "EMPTY"], "Case Oil": ["X"] },
  inventory: { "Bulk Oil-A": "200+400", "Bulk Oil-BIG": "10*400", "Case Oil-X": "99" },
};

describe("send time (Toronto)", () => {
  test("winter: sends on the 22:30 UTC run, not the 21:30 one", () => {
    expect(report.shouldSend(new Date("2026-11-09T21:30:00Z"), config).send).toBe(false); // 4:30 PM EST
    expect(report.shouldSend(new Date("2026-11-09T22:30:00Z"), config).send).toBe(true); // 5:30 PM EST
  });

  test("summer: sends on the 21:30 UTC run", () => {
    expect(report.shouldSend(new Date("2026-07-06T21:30:00Z"), config).send).toBe(true); // 5:30 PM EDT
  });

  test("only once per day, and never on weekends", () => {
    expect(report.shouldSend(new Date("2026-11-09T23:30:00Z"), config, "2026-11-09").send).toBe(false);
    expect(report.shouldSend(new Date("2026-11-07T22:30:00Z"), config).send).toBe(false); // Saturday
  });
});

describe("report rows", () => {
  test("totals use the app's math, only for the Bulk Oil category", () => {
    expect(report.currentTotals(data, "Bulk Oil")).toEqual([
      { name: "A", value: 600 },
      { name: "BIG", value: 4000 },
      { name: "EMPTY", value: 0 },
    ]);
  });

  test("compares with the latest earlier report and flags low stock", () => {
    const state = {
      reports: {
        "2026-11-05": { totals: { A: 100 } },
        "2026-11-06": { totals: { A: 700, BIG: 4000 } },
        "2026-11-09": { totals: { A: 1 } }, // same day: ignored
      },
    };
    const prev = report.previousReport(state, "2026-11-09");
    expect(prev.date).toBe("2026-11-06");

    const rows = report.buildRows(data, config, prev);
    expect(rows.map((r) => [r.name, r.change, r.low])).toEqual([
      ["A", -100, false],
      ["BIG", 0, true], // per-product minimum 5000
      ["EMPTY", null, true],
    ]);
  });

  test("detects whether any quantity changed since the previous report", () => {
    const rows = report.currentTotals(data, "Bulk Oil"); // A 600, BIG 4000, EMPTY 0
    expect(report.hasChanged(rows, null)).toBe(true); // first report always sends
    expect(report.hasChanged(rows, { date: "d", totals: { A: 600, BIG: 4000 } })).toBe(false); // EMPTY missing = 0
    expect(report.hasChanged(rows, { date: "d", totals: { A: 600, BIG: 3990 } })).toBe(true);
    expect(report.hasChanged(rows, { date: "d", totals: { A: 600, BIG: 4000, OLD: 50 } })).toBe(true); // removed product
  });

  test("stored history keeps the newest days only", () => {
    const state = { reports: { "2026-01-01": { totals: {} }, "2026-01-02": { totals: {} } } };
    const next = report.updateState(state, "2026-01-03", [{ name: "A", value: 5 }], "ts", 2);
    expect(next.lastSentDate).toBe("2026-01-03");
    expect(Object.keys(next.reports)).toEqual(["2026-01-02", "2026-01-03"]);
    expect(next.reports["2026-01-03"].totals).toEqual({ A: 5 });
  });
});

describe("email", () => {
  const now = new Date("2026-11-09T22:30:00Z");

  test("subject counts low items and body warns when no count was made today", () => {
    const rows = report.buildRows(data, config, null);
    const email = report.buildEmail({
      rows,
      config,
      today: "2026-11-09",
      prev: null,
      lastUpdatedMs: Date.parse("2026-11-06T15:00:00Z"),
      now,
    });
    // EMPTY is at zero with no earlier value, so it is hidden and not counted
    expect(email.subject).toBe("Bulk Oil Inventory — Mon, Nov 9, 2026 — 1 low");
    expect(email.html).toContain("figures are from 3 days ago");
    expect(email.html).toContain("Low stock (1)");
  });

  test("hides products at zero unless they just dropped to zero", () => {
    const prev = { date: "2026-11-06", totals: { A: 700, BIG: 300 } };
    const zeroData = {
      products: { "Bulk Oil": ["A", "BIG", "EMPTY"] },
      inventory: { "Bulk Oil-A": "600" }, // BIG went 300 -> 0, EMPTY stays 0
    };
    const rows = report.buildRows(zeroData, config, prev);
    const email = report.buildEmail({ rows, config, today: "2026-11-09", prev, lastUpdatedMs: now.getTime(), now });

    expect(email.html).toContain(">BIG");
    expect(email.html).not.toContain(">EMPTY");
    expect(email.html).toContain("1 product at zero not shown.");
    expect(email.text).not.toContain("EMPTY");
  });

  test("product names are escaped", () => {
    const rows = [{ name: "<b>x</b>", value: 1, prevValue: null, change: null, min: null, low: false }];
    const email = report.buildEmail({ rows, config, today: "2026-11-09", prev: null, lastUpdatedMs: now.getTime(), now });
    expect(email.html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(email.html).not.toContain("figures are from");
  });
});
