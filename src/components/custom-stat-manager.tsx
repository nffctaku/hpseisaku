"use client";

import { useFormContext, useFieldArray } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { PlusCircle } from 'lucide-react';
import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

export function CustomStatManager() {
  const { control } = useFormContext();
  const { append } = useFieldArray({
    control,
    name: 'customStatHeaders',
  });
  const [newHeaderName, setNewHeaderName] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleAddHeader = () => {
    if (newHeaderName.trim() === '') return;
    append({ id: uuidv4(), name: newHeaderName.trim() });
    setNewHeaderName('');
    setIsDialogOpen(false);
  };

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <PlusCircle className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>カスタムスタッツ項目を追加</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <Input
            placeholder="項目名 (例: シュート数)"
            value={newHeaderName}
            onChange={(e) => setNewHeaderName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddHeader()}
          />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">キャンセル</Button>
          </DialogClose>
          <Button onClick={handleAddHeader}>追加</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
