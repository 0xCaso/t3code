import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";

import { isMissedFixedTimeRun, isSameSchedule, nextScheduledRunAt } from "./Schedule.ts";

describe("scheduled task schedule calculation", () => {
  it("skips to the next matching fixed-time weekday", () => {
    const next = nextScheduledRunAt(
      { type: "fixed_time", timeOfDay: "09:00", weekdays: [1, 2, 3, 4, 5] },
      DateTime.makeZonedUnsafe(
        {
          year: 2026,
          month: 7,
          day: 3,
          hour: 10,
          minute: 0,
          second: 0,
          millisecond: 0,
        },
        { timeZone: "America/Los_Angeles", adjustForTimeZone: true },
      ),
    );
    const parts = next ? DateTime.toParts(next) : null;
    expect(parts?.weekDay).toBe(1);
    expect(parts?.hour).toBe(9);
    expect(parts?.minute).toBe(0);
  });

  it("still runs a fixed-time run missed earlier the same morning", () => {
    const weekdays = { type: "fixed_time", timeOfDay: "08:00", weekdays: [1, 2, 3, 4, 5] } as const;
    const rome = (day: number, hour: number, minute = 0) =>
      DateTime.makeZonedUnsafe(
        { year: 2026, month: 10, day, hour, minute, second: 0, millisecond: 0 },
        { timeZone: "Europe/Rome", adjustForTimeZone: true },
      );
    // Monday 19 October 2026: the Mac was asleep at 08:00.
    expect(isMissedFixedTimeRun(weekdays, rome(19, 8), rome(19, 9, 30))).toBe(false);
    // A run due on Friday still starts on Monday morning, once.
    expect(isMissedFixedTimeRun(weekdays, rome(16, 8), rome(19, 9, 30))).toBe(false);
    expect(isMissedFixedTimeRun(weekdays, rome(19, 8), rome(19, 12, 0))).toBe(true);
    // Saturday is not a scheduled day.
    expect(isMissedFixedTimeRun(weekdays, rome(16, 8), rome(17, 9, 30))).toBe(true);
    // Today's slot is still ahead: wait for it instead of running now.
    const tenOClock = { type: "fixed_time", timeOfDay: "10:00" } as const;
    expect(isMissedFixedTimeRun(tenOClock, rome(18, 10), rome(19, 9, 30))).toBe(true);
  });

  it("compares schedules structurally", () => {
    expect(
      isSameSchedule({ type: "interval", everyMs: 60_000 }, { type: "interval", everyMs: 60_000 }),
    ).toBe(true);
    expect(
      isSameSchedule({ type: "interval", everyMs: 60_000 }, { type: "interval", everyMs: 30_000 }),
    ).toBe(false);
    expect(
      isSameSchedule(
        { type: "fixed_time", timeOfDay: "09:00", weekdays: [1, 2] },
        { type: "fixed_time", timeOfDay: "09:00", weekdays: [1, 2] },
      ),
    ).toBe(true);
    expect(
      isSameSchedule(
        { type: "fixed_time", timeOfDay: "09:00", weekdays: [5, 1] },
        { type: "fixed_time", timeOfDay: "09:00", weekdays: [1, 5, 5] },
      ),
    ).toBe(true);
    expect(
      isSameSchedule(
        { type: "fixed_time", timeOfDay: "09:00" },
        { type: "fixed_time", timeOfDay: "09:00", weekdays: [0, 1, 2, 3, 4, 5, 6] },
      ),
    ).toBe(true);
    expect(
      isSameSchedule(
        { type: "fixed_time", timeOfDay: "09:00", weekdays: [] },
        { type: "fixed_time", timeOfDay: "09:00" },
      ),
    ).toBe(true);
    expect(
      isSameSchedule(
        { type: "fixed_time", timeOfDay: "09:00", weekdays: [1, 2] },
        { type: "fixed_time", timeOfDay: "09:00", weekdays: [1, 3] },
      ),
    ).toBe(false);
    expect(
      isSameSchedule(
        { type: "fixed_time", timeOfDay: "09:00" },
        { type: "fixed_time", timeOfDay: "09:30" },
      ),
    ).toBe(false);
    expect(
      isSameSchedule(
        { type: "interval", everyMs: 60_000 },
        { type: "fixed_time", timeOfDay: "09:00" },
      ),
    ).toBe(false);
  });
});
