import { api } from "./api";
export type Notification = { id: number; title: string; link: string; read_at: string | null };
export const listNotifications = () => api<{ unread_count: number; items: Notification[] }>("/notifications");
export const readNotification = (id: number) => api<Notification>(`/notifications/${id}/read`, { method: "POST" });
