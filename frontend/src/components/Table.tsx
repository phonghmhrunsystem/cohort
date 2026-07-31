import type { Key, ReactNode } from "react";

export function Table({ children }: { children: ReactNode }) {
  return <div className="table-scroll"><table>{children}</table></div>;
}

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  className?: string;
}

export function DataTable<T>({ columns, data, rowKey }: {
  columns: Column<T>[];
  data: T[];
  rowKey: (row: T) => Key;
}) {
  return <Table>
    <thead><tr>{columns.map((column) => <th key={column.key}>{column.header}</th>)}</tr></thead>
    <tbody>{data.map((row) => <tr key={rowKey(row)}>{columns.map((column) => <td key={column.key} className={column.className}>{column.render(row)}</td>)}</tr>)}</tbody>
  </Table>;
}
