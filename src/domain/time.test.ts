import { describe, expect, it } from "vitest";
import {
  addDays,
  HOUR_MS,
  stockholmDate,
  stockholmDayBounds,
  stockholmOffset,
  stockholmStartOfDay,
  toStockholmIso,
} from "./time";

describe("stockholmOffset", () => {
  it("is +1 h in winter and +2 h in summer", () => {
    expect(stockholmOffset(Date.UTC(2026, 0, 15, 12))).toBe(1 * HOUR_MS);
    expect(stockholmOffset(Date.UTC(2026, 6, 15, 12))).toBe(2 * HOUR_MS);
  });

  it("switches at 01:00 UTC on the DST change days", () => {
    expect(stockholmOffset(Date.UTC(2026, 2, 29, 0, 59))).toBe(1 * HOUR_MS);
    expect(stockholmOffset(Date.UTC(2026, 2, 29, 1, 0))).toBe(2 * HOUR_MS);
    expect(stockholmOffset(Date.UTC(2026, 9, 25, 0, 59))).toBe(2 * HOUR_MS);
    expect(stockholmOffset(Date.UTC(2026, 9, 25, 1, 0))).toBe(1 * HOUR_MS);
  });
});

describe("stockholmDate", () => {
  it("uses the Swedish calendar date, not the UTC date", () => {
    // 23:30 UTC on 31 Dec is 00:30 on 1 Jan in Sweden.
    expect(stockholmDate(Date.UTC(2025, 11, 31, 23, 30))).toEqual({ year: 2026, month: 1, day: 1 });
    // 22:30 UTC on 15 Jul is 00:30 on 16 Jul in Sweden (summer time).
    expect(stockholmDate(Date.UTC(2026, 6, 15, 22, 30))).toEqual({ year: 2026, month: 7, day: 16 });
  });
});

describe("addDays", () => {
  it("crosses month and year boundaries", () => {
    expect(addDays({ year: 2026, month: 12, day: 31 }, 1)).toEqual({ year: 2027, month: 1, day: 1 });
    expect(addDays({ year: 2026, month: 3, day: 1 }, -1)).toEqual({ year: 2026, month: 2, day: 28 });
  });
});

describe("stockholmStartOfDay", () => {
  it("is 23:00 UTC the day before in winter and 22:00 UTC in summer", () => {
    expect(stockholmStartOfDay({ year: 2026, month: 1, day: 15 })).toBe(Date.UTC(2026, 0, 14, 23));
    expect(stockholmStartOfDay({ year: 2026, month: 7, day: 15 })).toBe(Date.UTC(2026, 6, 14, 22));
  });

  it("is correct on both DST change days", () => {
    expect(stockholmStartOfDay({ year: 2026, month: 3, day: 29 })).toBe(Date.UTC(2026, 2, 28, 23));
    expect(stockholmStartOfDay({ year: 2026, month: 10, day: 25 })).toBe(Date.UTC(2026, 9, 24, 22));
  });
});

describe("stockholmDayBounds", () => {
  const lengthInHours = (date: Parameters<typeof stockholmDayBounds>[0]) => {
    const { start, end } = stockholmDayBounds(date);
    return (end - start) / HOUR_MS;
  };

  it("is 24 hours on a normal day", () => {
    expect(lengthInHours({ year: 2026, month: 10, day: 16 })).toBe(24);
  });

  it("is 23 hours (92 quarter-hours) when summer time starts", () => {
    expect(lengthInHours({ year: 2026, month: 3, day: 29 })).toBe(23);
  });

  it("is 25 hours (100 quarter-hours) when summer time ends", () => {
    expect(lengthInHours({ year: 2026, month: 10, day: 25 })).toBe(25);
  });
});

describe("toStockholmIso", () => {
  it("formats local time with the current offset", () => {
    expect(toStockholmIso(Date.UTC(2026, 0, 15, 12, 30))).toBe("2026-01-15T13:30:00+01:00");
    expect(toStockholmIso(Date.UTC(2026, 6, 15, 22, 0))).toBe("2026-07-16T00:00:00+02:00");
  });

  it("distinguishes the repeated hour when summer time ends", () => {
    expect(toStockholmIso(Date.UTC(2026, 9, 25, 0, 30))).toBe("2026-10-25T02:30:00+02:00");
    expect(toStockholmIso(Date.UTC(2026, 9, 25, 1, 30))).toBe("2026-10-25T02:30:00+01:00");
  });
});
