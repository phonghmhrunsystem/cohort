import { ChevronLeftIcon } from "./icons";

export function BackButton({ fallbackHref }: { fallbackHref: string }) {
  return <button className="btn btn-outline-secondary btn-sm d-inline-flex align-items-center gap-1" type="button" onClick={() => history.length > 1 ? history.back() : location.assign(fallbackHref)}><ChevronLeftIcon className="nav-icon" />Quay lại</button>;
}
