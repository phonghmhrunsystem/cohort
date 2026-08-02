import type { User } from "../types";

export const formatDate = (value?: string | null) => value ? new Intl.DateTimeFormat("en-GB").format(new Date(value)) : "—";
export const roleLabel = (role: User["role"]) => role[0] + role.slice(1).toLowerCase();

export function deadlineBadge(dueAt: string, now: Date): string {
  const due = new Date(dueAt);
  if (now >= due) return "Đã hết hạn";
  const dueDate = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((dueDate.getTime() - nowDate.getTime()) / 86_400_000);
  return days === 0 ? "Còn hôm nay" : `Còn ${days} ngày`;
}

const MINUTE = 60_000, HOUR = 3_600_000, DAY = 86_400_000;

/** Mốc thời gian tương đối cho panel thông báo (07 §2.1). Tính client-side từ
 * created_at, nên không có gì để đồng bộ với server. */
export function relativeTime(value: string, now: Date = new Date()): string {
  const elapsed = now.getTime() - new Date(value).getTime();
  if (elapsed < MINUTE) return "Vừa xong";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} phút trước`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} giờ trước`;
  const days = Math.floor(elapsed / DAY);
  if (days === 1) return "Hôm qua";
  if (days < 7) return `${days} ngày trước`;
  /** Nhánh cuối là đúng cái formatDate đã làm (Intl `en-GB` → dd/MM/yyyy) — dùng lại,
   * để một ngày đổi định dạng ngày thì chỉ phải đổi một chỗ. */
  return formatDate(value);
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  const datePart = new Intl.DateTimeFormat("en-CA").format(date);
  const timePart = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  return `${datePart} ${timePart}`;
}
