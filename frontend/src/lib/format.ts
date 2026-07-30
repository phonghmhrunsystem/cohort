import type { User } from "../types";

export const formatDate = (value?: string | null) => value ? new Intl.DateTimeFormat("en-GB").format(new Date(value)) : "—";
export const roleLabel = (role: User["role"]) => role[0] + role.slice(1).toLowerCase();
