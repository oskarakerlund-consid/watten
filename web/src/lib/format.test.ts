import { describe, expect, it } from "vitest";
import { formatPrice, formatSpan, formatTime } from "./format";

// 2026-10-16 14:00 Swedish summer time.
const NOW = new Date("2026-10-16T12:00:00Z");

describe("formatPrice", () => {
  it("shows whole öre per kWh", () => {
    expect(formatPrice(1.184)).toBe("118 öre/kWh");
    expect(formatPrice(-0.004)).toBe("0 öre/kWh");
  });
});

describe("formatTime", () => {
  it("shows Swedish local time today", () => {
    expect(formatTime(new Date("2026-10-16T20:30:00Z"), NOW)).toBe("22:30");
  });

  it("prefixes times tomorrow", () => {
    expect(formatTime(new Date("2026-10-16T22:30:00Z"), NOW)).toBe("i morgon 00:30");
  });

  it("uses winter time after the change", () => {
    expect(formatTime(new Date("2026-10-26T12:00:00Z"), NOW)).toBe("2026-10-26 13:00");
  });
});

describe("formatSpan", () => {
  it("shows a span", () => {
    expect(formatSpan(new Date("2026-10-16T20:30:00Z"), new Date("2026-10-16T22:30:00Z"), NOW)).toBe("22:30–00:30");
  });

  it("says nu when the span has started", () => {
    expect(formatSpan(NOW, new Date("2026-10-16T14:00:00Z"), NOW)).toBe("nu–16:00");
  });
});
