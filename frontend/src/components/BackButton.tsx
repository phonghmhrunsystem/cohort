export function BackButton({ fallbackHref }: { fallbackHref: string }) {
  return <button className="btn btn-outline-secondary btn-sm" type="button" onClick={() => history.length > 1 ? history.back() : location.assign(fallbackHref)}>Quay lại</button>;
}
