import { describe, it, expect } from "vitest";
import { jobHealth, needsAttention, STALE_AFTER_HOURS, type JobRunSummary } from "../jobHealth";

const NOW = new Date("2026-08-02T09:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 60 * 60 * 1000);

function run(overrides: Partial<JobRunSummary> = {}): JobRunSummary {
  return {
    startedAt: hoursAgo(8),
    finishedAt: hoursAgo(8),
    ok: true,
    errors: 0,
    ...overrides,
  };
}

describe("jobHealth", () => {
  it("is ok for a recent clean run", () => {
    expect(jobHealth(run(), NOW)).toBe("ok");
  });

  // The case the whole feature exists for: nothing has happened, and nothing
  // is what a silently-dead cron produces.
  it("flags a job that has never run", () => {
    expect(jobHealth(null, NOW)).toBe("never");
  });

  it("flags a run that finished but reported errors", () => {
    expect(jobHealth(run({ errors: 3 }), NOW)).toBe("errors");
    expect(jobHealth(run({ ok: false }), NOW)).toBe("errors");
  });

  it("treats an in-flight run as running, not broken", () => {
    expect(jobHealth(run({ startedAt: hoursAgo(0.05), finishedAt: null }), NOW)).toBe("running");
  });

  // A run that started and never finished is a crashed process, not activity.
  it("flags an unfinished run as stale once it is past the window", () => {
    expect(jobHealth(run({ startedAt: hoursAgo(48), finishedAt: null }), NOW)).toBe("stale");
  });

  it.each([
    [1, "ok"],
    [24, "ok"],
    [STALE_AFTER_HOURS, "ok"],          // exactly at the boundary is still fine
    [STALE_AFTER_HOURS + 0.5, "stale"], // just past it is not
    [72, "stale"],
  ] as const)("a run %s hours old is %s", (age, expected) => {
    expect(jobHealth(run({ startedAt: hoursAgo(age), finishedAt: hoursAgo(age) }), NOW)).toBe(expected);
  });

  // Staleness outranks a clean result: a run that succeeded two days ago is
  // not evidence that alerts went out today.
  it("prefers stale over ok for an old successful run", () => {
    expect(jobHealth(run({ startedAt: hoursAgo(40), finishedAt: hoursAgo(40) }), NOW)).toBe("stale");
  });
});

describe("needsAttention", () => {
  it("demands attention for every silent-failure state", () => {
    expect(needsAttention("stale")).toBe(true);
    expect(needsAttention("never")).toBe(true);
    expect(needsAttention("errors")).toBe(true);
  });

  it("stays quiet when things are working", () => {
    expect(needsAttention("ok")).toBe(false);
    expect(needsAttention("running")).toBe(false);
  });
});
