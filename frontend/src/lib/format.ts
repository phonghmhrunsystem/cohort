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

export function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  const datePart = new Intl.DateTimeFormat("en-CA").format(date);
  const timePart = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  return `${datePart} ${timePart}`;
}
