import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: boolean;
  categoryName: string;
  setCategoryName: (v: string) => void;
  categorySortOrder: string;
  setCategorySortOrder: (v: string) => void;
  onSave: () => void;
};

export function CategoryDialog({
  open,
  onOpenChange,
  editing,
  categoryName,
  setCategoryName,
  categorySortOrder,
  setCategorySortOrder,
  onSave,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{editing ? "カテゴリを編集" : "カテゴリを追加"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4">
          <div>
            <div className="text-sm font-semibold">カテゴリ名</div>
            <Input className="mt-2" placeholder="例: SUPPORT PARTNER" value={categoryName} onChange={(e) => setCategoryName(e.target.value)} />
          </div>

          <div>
            <div className="text-sm font-semibold">並び順（小さいほど上）</div>
            <Input
              className="mt-2"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={categorySortOrder}
              onChange={(e) => setCategorySortOrder(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button className="bg-emerald-600 text-white hover:bg-emerald-700 hover:text-white" onClick={onSave}>
            {editing ? "更新" : "追加"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
