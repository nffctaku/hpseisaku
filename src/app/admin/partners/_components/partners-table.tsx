import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pencil, Trash2 } from "lucide-react";

export type PartnerRow = {
  id: string;
  name: string;
  categoryId: string;
  linkUrl?: string;
  sortOrder?: number;
  isPublished?: boolean;
};

type Props = {
  partners: PartnerRow[];
  getCategoryName: (categoryId: string) => string;
  onEdit: (partner: PartnerRow) => void;
  onDelete: (partner: PartnerRow) => void;
};

export function PartnersTable({ partners, getCategoryName, onEdit, onDelete }: Props) {
  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 overflow-hidden shadow-lg shadow-black/20 backdrop-blur">
      <Table>
        <TableHeader>
          <TableRow className="bg-white/5">
            <TableHead className="w-[160px] text-xs uppercase tracking-wide text-white/70">カテゴリ</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-white/70">企業名</TableHead>
            <TableHead className="w-[90px] text-xs uppercase tracking-wide text-white/70">表示</TableHead>
            <TableHead className="w-[90px] text-xs uppercase tracking-wide text-white/70">並び</TableHead>
            <TableHead className="w-[96px] text-right text-xs uppercase tracking-wide text-white/70">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {partners.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-sm text-white/70 py-12">
                まだ登録がありません。
              </TableCell>
            </TableRow>
          ) : (
            partners.map((p) => (
              <TableRow key={p.id} className="odd:bg-transparent even:bg-white/[0.03] hover:bg-white/5">
                <TableCell className="text-sm font-medium text-white">{getCategoryName(p.categoryId)}</TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <div className="font-semibold text-white">{p.name}</div>
                    {p.linkUrl ? <div className="text-xs text-white/60 truncate max-w-[520px]">{p.linkUrl}</div> : null}
                  </div>
                </TableCell>
                <TableCell>
                  <span className={p.isPublished ? "text-emerald-300 font-semibold" : "text-white/60"}>{p.isPublished ? "ON" : "OFF"}</span>
                </TableCell>
                <TableCell className="tabular-nums text-white/70">{p.sortOrder ?? 0}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" className="hover:bg-white/10 text-white" onClick={() => onEdit(p)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button className="text-red-300 hover:text-white hover:bg-red-600/20" variant="ghost" size="icon" onClick={() => onDelete(p)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
