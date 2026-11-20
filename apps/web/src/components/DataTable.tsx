import { ArrowDown, ArrowUp } from "lucide-react";
import type * as React from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { cn } from "~/lib/utils";

export interface Column<T> {
  readonly key: string;
  readonly label: string;
  readonly numeric?: boolean;
  /** Missing values sort last either way. */
  readonly sortValue?: (row: T) => number | string | null | undefined;
  readonly cell: (row: T) => React.ReactNode;
  readonly className?: string;
}

export interface Sort {
  readonly key: string;
  readonly dir: 1 | -1;
}

export function sortRows<T>(rows: ReadonlyArray<T>, columns: ReadonlyArray<Column<T>>, sort: Sort) {
  const col = columns.find((c) => c.key === sort.key);
  if (!col?.sortValue) return rows;
  const value = col.sortValue;
  return [...rows].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1;
    return (x > y ? 1 : x < y ? -1 : 0) * sort.dir;
  });
}

/** Click a header to sort by it; again to flip. Numbers start high-to-low. */
export function DataTable<T>({
  rows,
  columns,
  sort,
  onSort,
  rowKey,
}: {
  rows: ReadonlyArray<T>;
  columns: ReadonlyArray<Column<T>>;
  sort: Sort;
  onSort: (sort: Sort) => void;
  rowKey: (row: T) => string;
}) {
  return (
    <Table>
      <TableHeader className="sticky top-0 z-10 bg-card">
        <TableRow className="hover:bg-transparent">
          {columns.map((c) => {
            const active = sort.key === c.key;
            const Arrow = sort.dir < 0 ? ArrowDown : ArrowUp;
            return (
              <TableHead
                key={c.key}
                className={cn("h-9 text-muted-foreground", c.numeric && "text-right")}
                aria-sort={active ? (sort.dir < 0 ? "descending" : "ascending") : undefined}
              >
                {c.sortValue ? (
                  <button
                    type="button"
                    onClick={() => onSort({ key: c.key, dir: active ? (-sort.dir as 1 | -1) : -1 })}
                    className={cn(
                      "inline-flex cursor-pointer items-center gap-1 hover:text-foreground",
                      active && "text-foreground",
                    )}
                  >
                    {c.label}
                    {active && <Arrow className="size-3" aria-hidden />}
                  </button>
                ) : (
                  c.label
                )}
              </TableHead>
            );
          })}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={rowKey(r)}>
            {columns.map((c) => (
              <TableCell
                key={c.key}
                className={cn("align-top", c.numeric && "text-right tabular-nums", c.className)}
              >
                {c.cell(r)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
