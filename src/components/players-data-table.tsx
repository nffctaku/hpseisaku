"use client"

import * as React from "react"
import { ColumnDef, ColumnFiltersState, SortingState, VisibilityState, flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
 

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  emptyState?: {
    title: string
    description: string
    actionLabel?: string
    onAction?: () => void
  }
}

export function PlayersDataTable<TData, TValue>({
  columns,
  data,
  emptyState,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})

  const getPositionColor = (position: string): string => {
    const pos = typeof position === 'string' ? position.trim().toUpperCase() : '';
    switch (pos) {
      case 'GK':
        return '#F5C542'; // Yellow
      case 'DF':
        return '#4A90D9'; // Blue
      case 'MF':
        return '#4CAF7D'; // Green
      case 'FW':
        return '#E0574C'; // Red
      default:
        return '#9CA3AF'; // Gray
    }
  }

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
    },
  })

  return (
    <div>
      <div className="rounded-md border bg-white text-gray-900">
        <Table className="w-full bg-white text-gray-900">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="bg-gray-50">
                {headerGroup.headers.map((header) => {
                  const colId = header.column.id;
                  const isNumber = colId === "number";
                  const isPosition = colId === "position";
                  const isName = colId === "name";
                  const isTight = isNumber || isPosition;
                  return (
                    <TableHead
                      key={header.id}
                      className={
                        isTight
                          ? `${isNumber ? "w-[4ch]" : "w-[3ch]"} whitespace-nowrap py-2 ${isNumber ? "!pl-[1ch] !pr-0" : (isPosition ? "!pl-[2ch] !pr-0" : "!px-1")} text-gray-900`
                          : isName
                            ? "py-2 !pl-[2ch] !pr-1.5 text-gray-900"
                            : "py-2 !px-1.5 text-gray-900"
                      }
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => {
                const position = (row.original as any)?.position || '';
                const positionColor = getPositionColor(position);
                return (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                    className="text-gray-900 odd:bg-white even:bg-gray-100"
                    style={{ borderLeft: `4px solid ${positionColor}` }}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const isPositionCell = cell.column.id === "position";
                      return (
                        <TableCell
                          key={cell.id}
                          className={
                            cell.column.id === "number"
                              ? "w-[4ch] whitespace-nowrap py-2 !pl-[1ch] !pr-0 text-gray-900 tabular-nums"
                              : isPositionCell
                                ? "w-[3ch] whitespace-nowrap py-2 !pl-[1ch] !pr-0 font-semibold"
                                : cell.column.id === "name"
                                  ? "py-2 !pl-[2ch] !pr-1.5 text-gray-900"
                                  : "py-2 !px-1.5 text-gray-900"
                          }
                          style={isPositionCell ? { color: positionColor } : undefined}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })
            ) : emptyState ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-64">
                  <div className="flex flex-col items-center justify-center space-y-4">
                    <div className="text-center">
                      <p className="text-lg font-semibold text-gray-900">{emptyState.title}</p>
                      <p className="text-sm text-gray-600 mt-1">{emptyState.description}</p>
                    </div>
                    {emptyState.actionLabel && emptyState.onAction && (
                      <Button
                        type="button"
                        onClick={emptyState.onAction}
                        className="bg-blue-600 text-white hover:bg-blue-700"
                      >
                        {emptyState.actionLabel}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  結果なし。
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-end space-x-2 py-4">
        <Button
          variant="outline"
          size="sm"
          className="bg-white text-gray-900 border border-border hover:bg-gray-100"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          前へ
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="bg-white text-gray-900 border border-border hover:bg-gray-100"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          次へ
        </Button>
      </div>
    </div>
  )
}
