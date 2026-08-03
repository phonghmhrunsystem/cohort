"""Biến (action, target_type, target_id, metadata) thành một chuỗi người đọc được.

Hai ràng buộc định hình module này:
  * metadata không bao giờ chứa chuỗi (safe_metadata loại sạch), nên tên phải
    lấy từ bảng gốc chứ không thể lưu sẵn trong row audit;
  * enrollment.removed ghi audit rồi xoá chính row nó trỏ tới, nên với họ
    action enrollment.* ta phân giải theo metadata (class_id/student_id),
    không theo target_id.
Đổi lại toàn bộ pass này là 4 truy vấn cố định, bất kể log dài bao nhiêu.
"""
from accounts.models import User
from assignments.models import Assignment
from classes.models import Class, ClassResource

SEPARATOR = " · "


def _ids(logs, predicate, extract):
    return {value for log in logs if predicate(log) for value in (extract(log),) if isinstance(value, int)}


def _family(log):
    return log.action.split(".")[0]


def resolve_labels(logs):
    logs = list(logs)

    user_ids = _ids(logs, lambda log: log.target_type == "accounts.user", lambda log: log.target_id)
    user_ids |= _ids(logs, lambda log: True, lambda log: (log.metadata or {}).get("student_id"))
    class_ids = _ids(logs, lambda log: log.target_type == "classes.class", lambda log: log.target_id)
    class_ids |= _ids(logs, lambda log: _family(log) in {"enrollment", "class_resource"},
                      lambda log: (log.metadata or {}).get("class_id"))
    assignment_ids = _ids(logs, lambda log: log.target_type == "assignments.assignment", lambda log: log.target_id)
    assignment_ids |= _ids(logs, lambda log: True, lambda log: (log.metadata or {}).get("assignment_id"))
    resource_ids = _ids(logs, lambda log: log.target_type == "classes.classresource", lambda log: log.target_id)

    people = {row.id: (row.role, row.full_name or row.email)
              for row in User.objects.filter(id__in=user_ids).only("id", "role", "full_name", "email")}
    # Dòng account nêu cả vai trò ("Student Tran Minh Anh", 08 §2.1); nhãn ghép
    # đã có tên lớp/bài nên chỉ cần tên để khỏi dài dòng.
    users = {id_: f"{role.capitalize()} {name}" for id_, (role, name) in people.items()}
    names = {id_: name for id_, (_, name) in people.items()}
    classes = {row.id: row.name for row in Class.objects.filter(id__in=class_ids).only("id", "name")}
    assignments = {row.id: row.title
                   for row in Assignment.objects.filter(id__in=assignment_ids).only("id", "title")}
    resources = {row.id: row.title
                 for row in ClassResource.objects.filter(id__in=resource_ids).only("id", "title")}

    def label(log):
        data = log.metadata or {}
        group = _family(log)
        if group == "account":
            return users.get(log.target_id, "")
        if group == "class":
            return classes.get(log.target_id, "")
        if group == "enrollment":
            # target_id có thể trỏ vào một Enrollment đã bị xoá (08 §5.1 A7).
            parts = [classes.get(data.get("class_id"), "") or classes.get(log.target_id, ""),
                     names.get(data.get("student_id"), "")]
            return SEPARATOR.join(part for part in parts if part)
        if group == "class_resource":
            return resources.get(log.target_id, "")
        if group == "assignment":
            return assignments.get(log.target_id, "")
        if group == "submission":
            parts = [assignments.get(data.get("assignment_id"), ""), names.get(data.get("student_id"), "")]
            return SEPARATOR.join(part for part in parts if part)
        if group == "grade":
            parts = [assignments.get(data.get("assignment_id"), ""), names.get(data.get("student_id"), "")]
            score = data.get("total_score")
            if score is not None:
                parts.append(str(score))
            return SEPARATOR.join(part for part in parts if part)
        return ""

    return {log.id: label(log) for log in logs}
