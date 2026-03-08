"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Player } from "../types/player";
import { ArrowUpDown, MoreHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

type PlayerRow = Player & { __raw?: Player };

export const columns = (openEditDialog: (player: Player) => void, setDeletingPlayer: (player: Player) => void): ColumnDef<PlayerRow>[] => [
  {
    accessorKey: "number",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          className="h-7 w-full justify-start !px-0 text-[10px] leading-none"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          No.
          <ArrowUpDown className="ml-0.5 h-2.5 w-2.5" />
        </Button>
      )
    },
    size: 42,
    minSize: 34,
    cell: ({ row }) => {
      const value = row.getValue<number | undefined>("number");
      return value != null ? value : "-";
    },
  },
  {
    accessorKey: "position",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          className="h-7 w-full justify-start !px-0 text-[10px] leading-none"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          POS
          <ArrowUpDown className="ml-0.5 h-2.5 w-2.5" />
        </Button>
      )
    },
    sortingFn: (rowA, rowB, columnId) => {
      const order: Record<string, number> = { GK: 0, DF: 1, MF: 2, FW: 3 };
      const a = String(rowA.getValue(columnId) ?? "").trim().toUpperCase();
      const b = String(rowB.getValue(columnId) ?? "").trim().toUpperCase();
      const oa = order[a] ?? 999;
      const ob = order[b] ?? 999;
      return oa === ob ? a.localeCompare(b) : oa - ob;
    },
    size: 52,
    minSize: 44,
  },
  {
    accessorKey: "name",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          className="h-7 w-full justify-start !px-0 text-[10px] leading-none"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Name
          <ArrowUpDown className="ml-0.5 h-2.5 w-2.5" />
        </Button>
      )
    },
    size: 220,
    minSize: 160,
    cell: ({ row }) => {
      const player = row.original;
      return (
        <span className="block whitespace-nowrap truncate max-w-[15ch]">{player.name}</span>
      );
    }
  },
  {
    id: "actions",
    size: 50,
    minSize: 50,
    cell: ({ row }) => {
      const player = row.original
      const raw = (player as any)?.__raw as Player | undefined;
      const source = raw || player;

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-white text-gray-900">
            <DropdownMenuItem onClick={() => openEditDialog(raw || player)}>編集</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive" onClick={() => setDeletingPlayer(raw || player)}>削除</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  },
]
