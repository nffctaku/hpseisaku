import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pencil, Trash2 } from "lucide-react";

export type PartnerCategory = {
  id: string;
  name: string;
  sortOrder: number;
};

type Props = {
  sortedCategories: PartnerCategory[];
  onAdd: () => void;
  onEdit: (category: PartnerCategory) => void;
  onDelete: (category: PartnerCategory) => void;
  saving: boolean;
  addDisabled: boolean;
};

export function CategoryCard({ sortedCategories, onAdd, onEdit, onDelete, saving, addDisabled }: Props) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 sm:p-6 text-white mb-6 shadow-lg shadow-black/20 backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-bold">カテゴリ管理</div>
          <div className="text-sm text-white/70 mt-1">PARTNERページの見出し（セクション）を追加/変更できます。</div>
          {saving ? <div className="text-xs text-white/60 mt-2">保存中…</div> : null}
          {addDisabled ? <div className="text-xs text-white/60 mt-2">カテゴリは最大5件までです。</div> : null}
        </div>
        <Button
          className="bg-blue-600 text-white hover:bg-blue-700 hover:text-white h-10 px-5 shadow-lg shadow-blue-600/20 disabled:opacity-50 disabled:pointer-events-none"
          onClick={onAdd}
          disabled={addDisabled}
        >
          追加
        </Button>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 overflow-hidden bg-black/20">
        <Table>
          <TableHeader>
            <TableRow className="bg-white/5">
              <TableHead className="text-xs uppercase tracking-wide text-white/70">カテゴリ名</TableHead>
              <TableHead className="w-[90px] text-xs uppercase tracking-wide text-white/70">並び</TableHead>
              <TableHead className="w-[96px] text-right text-xs uppercase tracking-wide text-white/70">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedCategories.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-sm text-white/70 py-10">
                  まだカテゴリがありません。
                </TableCell>
              </TableRow>
            ) : (
              sortedCategories.map((c) => (
                <TableRow key={c.id} className="hover:bg-white/5">
                  <TableCell className="font-semibold">{c.name}</TableCell>
                  <TableCell className="tabular-nums text-white/70">{c.sortOrder}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="hover:bg-white/10 text-white" onClick={() => onEdit(c)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        className="text-red-300 hover:text-white hover:bg-red-600/20"
                        variant="ghost"
                        size="icon"
                        onClick={() => onDelete(c)}
                      >
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
    </div>
  );
}
