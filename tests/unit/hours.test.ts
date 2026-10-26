import { describe, expect, it } from "vitest";
import { isOpenAt, overlappingHours } from "@/modules/hours";
describe("restaurant-local schedules", () => {
  it("detects overnight overlap across a week boundary", () => {
    expect(
      overlappingHours([
        { weekday: 6, opens: "22:00", closes: "02:00", nextDay: true },
        { weekday: 0, opens: "01:00", closes: "03:00" },
      ]),
    ).toBe(true);
    expect(
      overlappingHours([
        { weekday: 1, opens: "09:00", closes: "12:00" },
        { weekday: 1, opens: "12:00", closes: "17:00" },
      ]),
    ).toBe(false);
  });
  it("carries a service interval into the next local calendar day", () => {
    const hours = [
      { weekday: 1, opens: "22:00", closes: "02:00", nextDay: true },
    ];
    expect(isOpenAt(new Date("2026-10-20T01:30:00Z"), "UTC", hours, [])).toBe(
      true,
    );
    expect(isOpenAt(new Date("2026-10-20T02:00:00Z"), "UTC", hours, [])).toBe(
      false,
    );
  });
  it("replaces weekly intervals with holiday exceptions", () => {
    const hours = [{ weekday: 1, opens: "09:00", closes: "17:00" }];
    expect(
      isOpenAt(new Date("2026-10-19T12:00:00Z"), "UTC", hours, [
        { date: "2026-10-19", closed: true, intervals: [] },
      ]),
    ).toBe(false);
    expect(
      isOpenAt(new Date("2026-10-19T18:00:00Z"), "UTC", hours, [
        {
          date: "2026-10-19",
          closed: false,
          intervals: [{ opens: "17:00", closes: "20:00" }],
        },
      ]),
    ).toBe(true);
  });
  it("uses local clock times across spring DST changes", () => {
    const hours = [{ weekday: 0, opens: "01:00", closes: "05:00" }];
    expect(
      isOpenAt(new Date("2026-03-29T01:30:00Z"), "Europe/Sofia", hours, []),
    ).toBe(true);
    expect(
      isOpenAt(new Date("2026-03-29T02:00:00Z"), "Europe/Sofia", hours, []),
    ).toBe(false);
  });
  it("handles both occurrences of the repeated autumn hour", () => {
    const hours = [{ weekday: 0, opens: "03:00", closes: "04:00" }];
    expect(
      isOpenAt(new Date("2026-10-25T00:30:00Z"), "Europe/Sofia", hours, []),
    ).toBe(true);
    expect(
      isOpenAt(new Date("2026-10-25T01:30:00Z"), "Europe/Sofia", hours, []),
    ).toBe(true);
  });
});
