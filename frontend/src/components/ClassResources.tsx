import { useEffect, useState } from "react";

import { request } from "../lib/api";
import type { ClassResource } from "../types";
import { Alert } from "./Alert";
import { EmptyState } from "./EmptyState";
import { Spinner } from "./Spinner";

/** Hiển thị dùng chung cho tab Student và tab Teacher (07 §2.2, §2.3).
 * `reloadKey` để màn hình nhúng ép nạp lại sau khi tạo resource mới. */
export function ClassResources({ classId, reloadKey = 0 }: { classId: number; reloadKey?: number }) {
  const [resources, setResources] = useState<ClassResource[]>();
  const [failure, setFailure] = useState("");
  useEffect(() => {
    setFailure("");
    request<ClassResource[]>(`/classes/${classId}/resources`, { token: sessionStorage.getItem("access_token") ?? undefined })
      .then((value) => value && setResources(value))
      .catch(() => { setFailure("Không tải được tài liệu."); setResources([]); });
  }, [classId, reloadKey]);
  if (failure) return <Alert>{failure}</Alert>;
  if (!resources) return <Spinner label="Loading resources" />;
  if (resources.length === 0) return <EmptyState>Chưa có tài liệu nào.</EmptyState>;
  return <ul className="resource-list">
    {resources.map((resource) => <li key={resource.id}>
      {/* URL do giáo viên tự nhập, lưu nguyên văn, không fetch/preview (07 §6). */}
      <a href={resource.url} target="_blank" rel="noopener noreferrer">{resource.title}</a>
      {resource.description && <p className="muted">{resource.description}</p>}
    </li>)}
  </ul>;
}
