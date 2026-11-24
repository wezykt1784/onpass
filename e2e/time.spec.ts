import { test, expect } from "@playwright/test";
import { londonToUtc, utcToLondonInput } from "../src/lib/time";

// Go-live times are picked in London time; a launch at noon must stay at noon across the clock changes.
test("TIME London wall clock to UTC and back, including both clock-change days", () => {
  const cases: [string, string][] = [
    ["2027-01-15T12:00", "2027-01-15T12:00:00.000Z"],
    ["2027-07-01T12:00", "2027-07-01T11:00:00.000Z"],
    ["2027-03-28T12:00", "2027-03-28T11:00:00.000Z"],
    ["2027-10-31T12:00", "2027-10-31T12:00:00.000Z"],
  ];
  for (const [local, utc] of cases) {
    expect(londonToUtc(local)).toBe(utc);
    expect(utcToLondonInput(utc)).toBe(local);
  }
  expect(londonToUtc("not a date")).toBeNull();
});
