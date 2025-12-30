"use client";

import { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type { TransferLog } from "@/types/transfer";

const currencySymbol = (c: string | undefined): string => {
  if (c === "GBP") return "￡";
  if (c === "EUR") return "€";
  return "￥";
};

const formatAmount = (v: number): string => {
  return new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 }).format(v);
};

export const transferColumns = (
  direction: "in" | "out",
  openEditDialog: (row: TransferLog) => void,
  setDeleting: (row: TransferLog) => void
): ColumnDef<TransferLog>[] => {
  const counterpartyHeader = direction === "in" ? "移籍元" : "移籍先";

  return [
    {
      accessorKey: "kind",
      header: "種類",
      cell: ({ row }) => {
        const v = (row.original as any).kind as string | undefined;
        return v && v.length > 0 ? v : "完全";
      },
    },
    {
      accessorKey: "playerName",
      header: "選手名",
      cell: ({ row }) => <span>{row.original.playerName}</span>,
    },
    {
      accessorKey: "counterparty",
      header: counterpartyHeader,
      cell: ({ row }) => <span>{row.original.counterparty || "-"}</span>,
    },
    {
      accessorKey: "age",
      header: "年齢",
      cell: ({ row }) => {
        const v = row.original.age;
        return v != null ? v : "-";
      },
    },
    {
      accessorKey: "position",
      header: "Pos",
      cell: ({ row }) => {
        const v = row.original.position;
        return v ? v : "-";
      },
    },
    {
      accessorKey: "fee",
      header: "金額",
      cell: ({ row }) => {
        const v = row.original.fee;
        if (v == null) return "-";
        return `${currencySymbol((row.original as any).feeCurrency)}${formatAmount(v)}`;
      },
    },
    {
      accessorKey: "annualSalary",
      header: "年俸",
      cell: ({ row }) => {
        const v = (row.original as any).annualSalary as number | undefined;
        if (v == null) return "-";
        return `${currencySymbol((row.original as any).annualSalaryCurrency)}${formatAmount(v)}`;
      },
    },
    {
      accessorKey: "contractYears",
      header: "年数",
      cell: ({ row }) => {
        const v = (row.original as any).contractYears as number | undefined;
        return v != null ? v : "-";
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const item = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-white text-gray-900">
              <DropdownMenuItem onClick={() => openEditDialog(item)}>編集</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" onClick={() => setDeleting(item)}>
                削除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
};
