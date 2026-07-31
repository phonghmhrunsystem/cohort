import { useLayoutEffect, useRef, useState, type Key, type ReactNode } from "react";

export function Table({ children }: { children: ReactNode }) {
  return <div className="table-scroll"><table>{children}</table></div>;
}

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  className?: string;
  /** Fixed column width (e.g. "12rem"); keeps the table from reflowing as pages/rows change content. */
  width?: string;
}

export function DataTable<T>({ columns, data, rowKey }: {
  columns: Column<T>[];
  data: T[];
  rowKey: (row: T) => Key;
}) {
  return <Table>
    <colgroup>{columns.map((column) => <col key={column.key} style={column.width ? { width: column.width } : undefined} />)}</colgroup>
    <thead><tr>{columns.map((column) => <th key={column.key}>{column.header}</th>)}</tr></thead>
    <tbody>{data.map((row) => <tr key={rowKey(row)}>{columns.map((column) => <td key={column.key} className={column.className}>{column.render(row)}</td>)}</tr>)}</tbody>
  </Table>;
}

/** Truncates long text with an ellipsis; only shows a hover title when the text is actually clipped. */
export function TruncatedText({ children }: { children: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [truncated, setTruncated] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) setTruncated(el.scrollWidth > el.clientWidth);
  }, [children]);
  return <span ref={ref} className="cell-truncate" title={truncated ? children : undefined}>{children}</span>;
}
