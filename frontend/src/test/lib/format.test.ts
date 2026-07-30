import { describe, expect, it } from "vitest";

import { deadlineBadge, formatDateTime } from "../../lib/format";

describe("deadlineBadge", () => {
  it("matches the backend's Vietnamese relative-time strings", () => {
    const now = new Date("2026-07-30T10:00:00Z");
    expect(deadlineBadge("2026-07-30T09:00:00Z", now)).toBe("Đã hết hạn");
    expect(deadlineBadge("2026-07-30T23:00:00Z", now)).toBe("Còn hôm nay");
    expect(deadlineBadge("2026-07-31T10:00:00Z", now)).toBe("Còn 1 ngày");
    expect(deadlineBadge("2026-08-02T10:00:00Z", now)).toBe("Còn 3 ngày");
  });
});

describe("formatDateTime", () => {
  it("formats an ISO string as yyyy-mm-dd HH:mm in 24-hour time", () => {
    expect(formatDateTime("2026-08-15T20:00:00Z")).toMatch(/^2026-08-15 \d{2}:\d{2}$/);
  });

  it("returns an em dash for a missing value", () => {
    expect(formatDateTime(undefined)).toBe("—");
    expect(formatDateTime(null)).toBe("—");
  });
});
