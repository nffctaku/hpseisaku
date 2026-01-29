"use client"

import * as React from "react"
import { ColumnDef, ColumnFiltersState, SortingState, VisibilityState, flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
 

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
}

export function PlayersDataTable<TData, TValue>({
  columns,
  data,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})

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
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className="text-gray-900 odd:bg-white even:bg-gray-100"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={
                        cell.column.id === "number"
                          ? "w-[4ch] whitespace-nowrap py-2 !pl-[1ch] !pr-0 text-gray-900 tabular-nums"
                          : cell.column.id === "position"
                            ? "w-[3ch] whitespace-nowrap py-2 !pl-[2ch] !pr-0 text-gray-900"
                            : cell.column.id === "name"
                              ? "py-2 !pl-[2ch] !pr-1.5 text-gray-900"
                              : "py-2 !px-1.5 text-gray-900"
                      }
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
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
