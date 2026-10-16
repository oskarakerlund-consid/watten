/** Swedish electricity price areas. The only place the list of zones is defined. */
export const ZONES = ["SE1", "SE2", "SE3", "SE4"] as const;

export type Zone = (typeof ZONES)[number];

/** A price that applies from `start` (inclusive) to `end` (exclusive). Both are UTC epoch milliseconds. */
export interface PriceInterval {
  start: number;
  end: number;
  sekPerKwh: number;
}

/** A calendar date in Swedish local time. `month` is 1–12. */
export interface LocalDate {
  year: number;
  month: number;
  day: number;
}
