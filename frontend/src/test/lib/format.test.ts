import { describe, expect, it } from "vitest";

import { deadlineBadge, formatDateTime, relativeTime } from "../../lib/format";

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

describe("relativeTime", () => {
  const now = new Date("2026-08-02T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

  it("reads Vừa xong under a minute", () => {
    expect(relativeTime(ago(30_000), now)).toBe("Vừa xong");
  });

  it("counts minutes then hours", () => {
    expect(relativeTime(ago(5 * 60_000), now)).toBe("5 phút trước");
    expect(relativeTime(ago(3 * 3_600_000), now)).toBe("3 giờ trước");
  });

  it("reads Hôm qua at one day and counts days up to a week", () => {
    expect(relativeTime(ago(26 * 3_600_000), now)).toBe("Hôm qua");
    expect(relativeTime(ago(3 * 86_400_000), now)).toBe("3 ngày trước");
  });

  it("falls back to dd/MM/yyyy from seven days out", () => {
    expect(relativeTime("2026-07-12T09:00:00Z", now)).toBe("12/07/2026");
  });
});
