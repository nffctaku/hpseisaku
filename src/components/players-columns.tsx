"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Player } from "../types/player";
import { ArrowUpDown, MoreHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { toast } from "sonner"

type PlayerRow = Player & { __raw?: Player };

async function writeClipboardText(text: string) {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // ignore
  }

  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export const columns = (openEditDialog: (player: Player) => void, setDeletingPlayer: (player: Player) => void): ColumnDef<PlayerRow>[] => [
  {
    accessorKey: "number",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          No.
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
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
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          POS
          <ArrowUpDown className="ml-2 h-4 w-4" />
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
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                void (async () => {
                  const payload = {
                    id: source.id,
                    name: source.name,
                    number: source.number,
                    position: source.position,
                    mainPosition: (source as any).mainPosition,
                    subPositions: (source as any).subPositions,
                    nationality: (source as any).nationality,
                    age: (source as any).age,
                    height: (source as any).height,
                    weight: (source as any).weight,
                    preferredFoot: (source as any).preferredFoot,
                    contractEndDate: (source as any).contractEndDate,
                    photoUrl: (source as any).photoUrl,
                    profile: (source as any).profile,
                    snsLinks: (source as any).snsLinks,
                    params: (source as any).params,
                  };
                  const ok = await writeClipboardText(JSON.stringify(payload, null, 2));
                  if (ok) {
                    toast.success("選手情報をコピーしました。", { id: `player-copy-${source.id}` });
                  } else {
                    toast.error("コピーに失敗しました（クリップボード権限をご確認ください）。", { id: `player-copy-${source.id}` });
                  }
                })();
              }}
            >
              選手情報のコピー
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openEditDialog(raw || player)}>編集</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive" onClick={() => setDeletingPlayer(raw || player)}>削除</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  },
]
