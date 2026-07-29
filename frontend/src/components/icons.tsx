type IconProps = { className?: string };
const base = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export function MenuIcon({ className }: IconProps) {
  return <svg {...base} className={className} aria-hidden="true"><line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" /></svg>;
}
export function CloseIcon({ className }: IconProps) {
  return <svg {...base} className={className} aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>;
}
export function ChevronLeftIcon({ className }: IconProps) {
  return <svg {...base} className={className} aria-hidden="true"><polyline points="15 18 9 12 15 6" /></svg>;
}
export function UsersIcon({ className }: IconProps) {
  return <svg {...base} className={className} aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
}
export function KeyIcon({ className }: IconProps) {
  return <svg {...base} className={className} aria-hidden="true"><circle cx="8" cy="15" r="4" /><path d="m10.85 12.15 7.65-7.65M15 5l2 2M18 2l2 2" /></svg>;
}
export function BookIcon({ className }: IconProps) {
  return <svg {...base} className={className} aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>;
}
export function ClipboardIcon({ className }: IconProps) {
  return <svg {...base} className={className} aria-hidden="true"><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2" /></svg>;
}
export function UserIcon({ className }: IconProps) {
  return <svg {...base} className={className} aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;
}
export function BellIcon({ className }: IconProps) {
  return <svg {...base} className={className} aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>;
}
export function LogoutIcon({ className }: IconProps) {
  return <svg {...base} className={className} aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>;
}
