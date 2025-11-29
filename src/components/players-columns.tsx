"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Player } from "../types/player";
import { ArrowUpDown, MoreHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import Image from "next/image";
import Link from 'next/link';

export const columns = (openEditDialog: (player: Player) => void, setDeletingPlayer: (player: Player) => void): ColumnDef<Player>[] => [
  {
    accessorKey: "photoUrl",
    header: "",
    cell: ({ row }) => {
      const player = row.original;
      return (
        <div className="relative h-10 w-10 flex-shrink-0">
          <Image 
            src={player.photoUrl || '/placeholder-person.svg'} 
            alt={player.name} 
            fill
            sizes="40px"
            className="rounded-full object-cover"
          />
        </div>
      );
    },
  },
  {
    accessorKey: "number",
    header: "背番号",
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
          名前
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      const player = row.original;
      return (
        <Link href={`/admin/players/${player.id}`} className="hover:underline">
          {player.name}
        </Link>
      );
    }
  },
  {
    accessorKey: "position",
    header: "ポジション",
  },
  {
    accessorKey: "nationality",
    header: "国籍",
  },
  {
    accessorKey: "height",
    header: "身長(cm)",
    cell: ({ row }) => {
      const value = row.getValue<number | undefined>("height");
      return value != null ? value : "-";
    },
  },
  {
    accessorKey: "age",
    header: "年齢",
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const player = row.original
 
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-white text-gray-900">
            <DropdownMenuLabel>操作</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => navigator.clipboard.writeText(player.id)}
            >
              選手IDをコピー
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => openEditDialog(player)}>編集</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive" onClick={() => setDeletingPlayer(player)}>削除</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  },
]
