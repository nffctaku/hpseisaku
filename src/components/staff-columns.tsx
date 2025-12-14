"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Staff } from "@/types/staff";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const staffColumns = (
  openEditDialog: (staff: Staff) => void,
  setDeletingStaff: (staff: Staff) => void
): ColumnDef<Staff>[] => [
  {
    accessorKey: "name",
    header: "名前",
    cell: ({ row }) => <span>{row.original.name}</span>,
  },
  {
    accessorKey: "position",
    header: "ポジション",
    cell: ({ row }) => {
      const v = row.getValue<string | undefined>("position");
      return v ? v : "-";
    },
  },
  {
    accessorKey: "nationality",
    header: "国籍",
    cell: ({ row }) => {
      const v = row.getValue<string | undefined>("nationality");
      return v ? v : "-";
    },
  },
  {
    accessorKey: "age",
    header: "年齢",
    cell: ({ row }) => {
      const v = row.getValue<number | undefined>("age");
      return v != null ? v : "-";
    },
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const staff = row.original;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-white text-gray-900">
            <DropdownMenuItem onClick={() => openEditDialog(staff)}>編集</DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => setDeletingStaff(staff)}
            >
              削除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];
