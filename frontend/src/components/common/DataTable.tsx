'use client';

import { type ColumnDef, flexRender, getCoreRowModel, getSortedRowModel, type SortingState, useReactTable } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

/**
 * Generic table on TanStack Table: sortable headers, a skeleton state that
 * matches the row height, and a composed empty state. Scrolls horizontally
 * inside its own bordered container instead of squashing on narrow screens.
 */
export function DataTable<T>({
  columns,
  data,
  isLoading,
  empty,
  label,
  skeletonRows = 5,
  rowKey,
}: {
  columns: ColumnDef<T>[];
  data: T[] | undefined;
  isLoading: boolean;
  empty: ReactNode;
  label: string;
  skeletonRows?: number;
  rowKey: (row: T) => string;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  // The React Compiler can't memoize TanStack Table's returned functions; that is fine for a table this size.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: data ?? [],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => rowKey(row),
  });

  const showEmpty = !isLoading && (data?.length ?? 0) === 0;

  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="overflow-x-auto">
        <Table aria-label={label} aria-live="polite">
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id} className="hover:bg-transparent">
                {group.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  const sortable = header.column.getCanSort();
                  return (
                    <TableHead
                      key={header.id}
                      scope="col"
                      aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
                      className="h-10 text-xs font-medium text-muted-foreground"
                    >
                      {header.isPlaceholder ? null : sortable ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="-ml-1 inline-flex items-center gap-1 rounded-sm px-1 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sorted === 'asc' ? <ArrowUp className="size-3" aria-hidden /> : sorted === 'desc' ? <ArrowDown className="size-3" aria-hidden /> : <ChevronsUpDown className="size-3 opacity-50" aria-hidden />}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: skeletonRows }, (_, i) => (
                  <TableRow key={i} className="h-14 hover:bg-transparent" aria-hidden>
                    {columns.map((_, c) => (
                      <TableCell key={c}>
                        <Skeleton className="h-4 w-full max-w-32" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id} className="h-14">
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className={cn('text-sm', (cell.column.columnDef.meta as { className?: string } | undefined)?.className)}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </div>
      {showEmpty && empty}
    </div>
  );
}
