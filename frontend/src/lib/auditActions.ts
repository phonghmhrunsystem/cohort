import type { AuditLog } from "../types";

/** Một mã action, hai câu: class.status_changed mang cả bật lẫn tắt trong
 * metadata.is_active, thay vì tách thành hai mã chở đúng một bit (08 §2.1). */
const ACTION_LABEL: Record<string, string> = {
  "account.created": "Tạo tài khoản",
  "account.updated": "Cập nhật tài khoản",
  "account.self_updated": "Cập nhật hồ sơ cá nhân",
  "account.deactivated": "Vô hiệu hoá tài khoản",
  "account.reactivated": "Kích hoạt tài khoản",
  "account.deleted": "Xoá tài khoản",
  "account.password_changed": "Đổi mật khẩu của mình",
  "account.password_set": "Đặt mật khẩu cho tài khoản",
  "class.created": "Tạo lớp",
  "class.updated": "Cập nhật lớp",
  "class.reopened": "Gia hạn ngày kết thúc lớp",
  "class.teacher_changed": "Đổi giáo viên",
  "enrollment.created": "Thêm học viên",
  "enrollment.replaced": "Thay danh sách lớp",
  "enrollment.removed": "Gỡ học viên",
  "assignment.created": "Tạo bài tập",
  "assignment.updated": "Cập nhật bài tập",
  "assignment.rubric.updated": "Cập nhật rubric",
  "submission.created": "Nộp bài",
  "grade.created": "Ghi điểm",
  "class_resource.created": "Thêm tài liệu",
};

export function actionLabel({ action, metadata }: Pick<AuditLog, "action" | "metadata">): string {
  if (action === "class.status_changed") return metadata?.is_active ? "Bật lớp" : "Tắt lớp";
  /** Action lạ hiện nguyên mã: một cái log âm thầm nuốt dòng nó không hiểu
   * còn tệ hơn một cái log xấu (08 §2.1). */
  return ACTION_LABEL[action] ?? action;
}
