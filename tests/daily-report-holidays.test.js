const { holidaysForYear, holidayOn, easter, ALL_NAMES } = require("../scripts/daily-report/holidays");
const report = require("../scripts/daily-report/report");
const config = require("../scripts/daily-report/config.json");

const ONTARIO = config.skipHolidays;

describe("Ontario holiday dates", () => {
  test("every configured name is a known holiday", () => {
    ONTARIO.forEach((n) => expect(ALL_NAMES).toContain(n));
  });

  test("Easter", () => {
    expect(easter(2025)).toBe("2025-04-20");
    expect(easter(2026)).toBe("2026-04-05");
    expect(easter(2027)).toBe("2027-03-28");
  });

  test("2026 statutory holidays", () => {
    expect(holidaysForYear(2026, ONTARIO)).toEqual({
      "2026-01-01": "New Year's Day",
      "2026-02-16": "Family Day",
      "2026-04-03": "Good Friday",
      "2026-05-18": "Victoria Day",
      "2026-07-01": "Canada Day",
      "2026-09-07": "Labour Day",
      "2026-10-12": "Thanksgiving",
      "2026-12-25": "Christmas Day",
      "2026-12-28": "Boxing Day (observed)", // Dec 26 is a Saturday
    });
  });

  test("Victoria Day on May 24 when that is a Monday", () => {
    expect(holidaysForYear(2027, ["Victoria Day"])).toEqual({ "2027-05-24": "Victoria Day" });
  });

  test("Christmas on Sunday: Boxing Day Monday, Christmas observed Tuesday", () => {
    expect(holidaysForYear(2022, ["Christmas Day", "Boxing Day"])).toEqual({
      "2022-12-26": "Boxing Day",
      "2022-12-27": "Christmas Day (observed)",
    });
  });

  test("Canada Day and New Year's on a weekend move to Monday", () => {
    expect(holidayOn("2023-07-03", ONTARIO)).toBe("Canada Day (observed)"); // Jul 1 2023 is Saturday
    expect(holidayOn("2028-01-03", ONTARIO)).toBe("New Year's Day (observed)"); // Jan 1 2028 is Saturday
  });

  test("optional holidays are off unless listed; extra closure dates are skipped", () => {
    expect(holidayOn("2026-08-03", ONTARIO)).toBeNull(); // Civic Holiday
    expect(holidayOn("2026-08-03", [...ONTARIO, "Civic Holiday"])).toBe("Civic Holiday");
    expect(holidayOn("2026-12-24", ONTARIO, ["2026-12-24"])).toBe("Company closure");
  });
});

describe("send decision", () => {
  test("no email on a statutory holiday at 5:30 PM", () => {
    const gate = report.shouldSend(new Date("2026-10-12T21:30:00Z"), config); // Thanksgiving, 5:30 PM EDT
    expect(gate).toMatchObject({ send: false, reason: "holiday (Thanksgiving)" });
  });

  test("real config sends from 5:30 PM Toronto, not before", () => {
    expect(report.shouldSend(new Date("2026-11-10T22:20:00Z"), config).send).toBe(false); // 5:20 PM EST
    expect(report.shouldSend(new Date("2026-11-10T22:30:00Z"), config).send).toBe(true); // 5:30 PM EST
    expect(report.shouldSend(new Date("2026-07-07T21:30:00Z"), config).send).toBe(true); // 5:30 PM EDT
  });

  test("sends on the next working day", () => {
    expect(report.shouldSend(new Date("2026-10-13T21:30:00Z"), config).send).toBe(true);
  });
});
