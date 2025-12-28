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
    header: "No.",
    size: 60,
    minSize: 50,
    cell: ({ row }) => {
      const value = row.getValue<number | undefined>("number");
      return value != null ? value : "-";
    },
  },
  {
    accessorKey: "name",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Name
          <ArrowUpDown className="ml-2 h-4 w-4" />
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
    accessorKey: "position",
    header: "POS",
    size: 70,
    minSize: 60,
  },
  {
    id: "actions",
    size: 50,
    minSize: 50,
    cell: ({ row }) => {
      const player = row.original
      const raw = (player as any)?.__raw as Player | undefined;
 
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
