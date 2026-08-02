import { describe, expect, it } from "vitest";

import { actionLabel } from "../../lib/auditActions";

describe("actionLabel", () => {
  it("maps every documented action to a sentence", () => {
    expect(actionLabel({ action: "account.created", metadata: {} })).toBe("Tạo tài khoản");
    expect(actionLabel({ action: "account.self_updated", metadata: {} })).toBe("Cập nhật hồ sơ cá nhân");
    expect(actionLabel({ action: "account.password_changed", metadata: {} })).toBe("Đổi mật khẩu của mình");
    expect(actionLabel({ action: "account.password_set", metadata: {} })).toBe("Đặt mật khẩu cho tài khoản");
    expect(actionLabel({ action: "class.reopened", metadata: {} })).toBe("Gia hạn ngày kết thúc lớp");
    expect(actionLabel({ action: "class.teacher_changed", metadata: {} })).toBe("Đổi giáo viên");
    expect(actionLabel({ action: "enrollment.replaced", metadata: {} })).toBe("Thay danh sách lớp");
    expect(actionLabel({ action: "assignment.rubric.updated", metadata: {} })).toBe("Cập nhật rubric");
    expect(actionLabel({ action: "submission.created", metadata: {} })).toBe("Nộp bài");
    expect(actionLabel({ action: "grade.created", metadata: {} })).toBe("Ghi điểm");
    expect(actionLabel({ action: "class_resource.created", metadata: {} })).toBe("Thêm tài liệu");
  });

  it("reads class.status_changed as two different sentences from metadata", () => {
    expect(actionLabel({ action: "class.status_changed", metadata: { is_active: true } })).toBe("Bật lớp");
    expect(actionLabel({ action: "class.status_changed", metadata: { is_active: false } })).toBe("Tắt lớp");
  });

  it("falls back to the raw dotted code rather than hiding an unknown action", () => {
    expect(actionLabel({ action: "something.new", metadata: {} })).toBe("something.new");
  });
});
