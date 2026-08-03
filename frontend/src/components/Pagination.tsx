import { Icon } from "./Icon";
import { IconButton } from "./IconButton";

const PAGE_SIZE = 10;
const WINDOW_SIZE = 3;

function paginationItems(page: number, totalPages: number): (number | "ellipsis")[] {
  if (totalPages <= WINDOW_SIZE + 2) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const start = Math.min(Math.max(page - 1, 2), totalPages - WINDOW_SIZE - 1);
  const window = Array.from({ length: WINDOW_SIZE }, (_, index) => start + index);
  const items: (number | "ellipsis")[] = [1];
  if (window[0] > 2) items.push("ellipsis");
  items.push(...window);
  if (window[window.length - 1] < totalPages - 1) items.push("ellipsis");
  items.push(totalPages);
  return items;
}

export function Pagination({ page, count, pageSize = PAGE_SIZE, onChange, label }: {
  page: number;
  count: number;
  pageSize?: number;
  onChange: (page: number) => void;
  label: string;
}) {
  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  return <nav className="pagination" aria-label={label}>
    <IconButton icon={<Icon name="chevronLeft" />} label="Previous page" disabled={page <= 1} onClick={() => onChange(page - 1)} />
    <div className="pagination-pages">
      {paginationItems(page, totalPages).map((item, index) => item === "ellipsis"
        ? <span key={`ellipsis-${index}`} className="pagination-ellipsis" aria-hidden="true">…</span>
        : <button
            key={item}
            type="button"
            className={item === page ? "pagination-page pagination-page-active" : "pagination-page"}
            aria-current={item === page ? "page" : undefined}
            aria-label={`Page ${item}`}
            disabled={item === page}
            onClick={() => onChange(item)}
          >{item}</button>)}
    </div>
    <IconButton icon={<Icon name="chevronRight" />} label="Next page" disabled={page >= totalPages} onClick={() => onChange(page + 1)} />
  </nav>;
}
