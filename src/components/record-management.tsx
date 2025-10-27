"use client";

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, query, onSnapshot, addDoc, doc, updateDoc, deleteDoc, where } from 'firebase/firestore';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { ClubRecord, CompetitionForRecord } from '@/types/record';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PlusCircle, Edit, Trash2, Check, ChevronsUpDown } from 'lucide-react';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';

const recordSchema = z.object({
  competition: z.object({
    id: z.string(),
    name: z.string().min(1, '大会名は必須です。'),
    logoUrl: z.string().optional(),
  }),
  result: z.string().min(1, '結果は必須です。'),
});

interface RecordManagementProps {
  season: string;
}

export function RecordManagement({ season }: RecordManagementProps) {
  const { user } = useAuth();
  const [records, setRecords] = useState<ClubRecord[]>([]);
  const [competitions, setCompetitions] = useState<CompetitionForRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [comboboxInputValue, setComboboxInputValue] = useState('');
  const [editingRecord, setEditingRecord] = useState<ClubRecord | null>(null);

  const form = useForm<z.infer<typeof recordSchema>>({
    resolver: zodResolver(recordSchema),
  });

  useEffect(() => {
    if (!user) return;
    // Fetch competitions
    const compsColRef = collection(db, `clubs/${user.uid}/competitions`);
    const compsUnsub = onSnapshot(compsColRef, (snapshot) => {
      const compsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CompetitionForRecord));
      setCompetitions(compsData);
    });

    // Fetch records for the selected season
    const recordsColRef = collection(db, `clubs/${user.uid}/records`);
    const q = query(recordsColRef, where('season', '==', season));
    const recordsUnsub = onSnapshot(q, (snapshot) => {
      const recordsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ClubRecord));
      setRecords(recordsData);
      setLoading(false);
    });

    return () => {
      compsUnsub();
      recordsUnsub();
    };
  }, [user, season]);

  const handleDialogOpen = (record: ClubRecord | null = null) => {
    setEditingRecord(record);
    if (record) {
      form.reset(record);
    } else {
      form.reset({ competition: { id: '', name: '' }, result: '' });
    }
    setIsDialogOpen(true);
  };

  const onSubmit = async (values: z.infer<typeof recordSchema>) => {
    if (!user) return;
    try {
      const dataToSave = { ...values, season };
      if (editingRecord) {
        const recordDocRef = doc(db, `clubs/${user.uid}/records`, editingRecord.id);
        await updateDoc(recordDocRef, dataToSave);
        toast.success('記録を更新しました。');
      } else {
        const recordsColRef = collection(db, `clubs/${user.uid}/records`);
        await addDoc(recordsColRef, dataToSave);
        toast.success('記録を追加しました。');
      }
      setIsDialogOpen(false);
      setEditingRecord(null);
    } catch (error) {
      console.error('Error saving record:', error);
      toast.error('保存に失敗しました。');
    }
  };

  const handleDelete = async (id: string) => {
    if (!user || !window.confirm('本当にこの記録を削除しますか？')) return;
    try {
      const recordDocRef = doc(db, `clubs/${user.uid}/records`, id);
      await deleteDoc(recordDocRef);
      toast.success('記録を削除しました。');
    } catch (error) {
      console.error('Error deleting record:', error);
      toast.error('削除に失敗しました。');
    }
  };

  return (
    <div className="py-6">
      <div className="flex justify-end mb-4">
        <Button onClick={() => handleDialogOpen()}><PlusCircle className="mr-2 h-4 w-4" />記録を追加</Button>
      </div>
      {loading ? <p>読み込み中...</p> : (
        <Table>
          <TableHeader><TableRow><TableHead>大会</TableHead><TableHead>成績</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader>
          <TableBody>
            {records.length > 0 ? records.map((rec) => (
              <TableRow key={rec.id}>
                <TableCell className="font-medium flex items-center">
                  {rec.competition.logoUrl && <img src={rec.competition.logoUrl} alt={rec.competition.name} className="h-6 w-6 mr-2 object-contain" />}
                  {rec.competition.name}
                </TableCell>
                <TableCell>{rec.result}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => handleDialogOpen(rec)}><Edit className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(rec.id)}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={3} className="text-center">記録がありません。</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingRecord ? '記録を編集' : '記録を追加'}</DialogTitle></DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="competition" render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>大会</FormLabel>
                  <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button variant="outline" role="combobox" className={cn('w-full justify-between', !field.value?.name && 'text-muted-foreground')}>
                          {field.value?.name || '大会を選択または入力...'}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                      <Command>
                        <CommandInput placeholder="大会を検索または新規入力..." value={comboboxInputValue} onValueChange={setComboboxInputValue} />
                        <CommandList>
                                                                              <CommandEmpty>該当する大会がありません。</CommandEmpty>
                          <CommandGroup>
                            {comboboxInputValue && !competitions.find(c => c.name.toLowerCase() === comboboxInputValue.toLowerCase()) && (
                               <CommandItem
                                 value={comboboxInputValue}
                                 onSelect={() => {
                                   field.onChange({ id: `custom-${Date.now()}`, name: comboboxInputValue });
                                   setIsPopoverOpen(false);
                                 }}
                               >
                                 <PlusCircle className="mr-2 h-4 w-4" />
                                 <span>「{comboboxInputValue}」を新規追加</span>
                               </CommandItem>
                             )}
                            {competitions.map((comp) => (
                              <CommandItem
                                value={comp.name}
                                key={comp.id}
                                onSelect={() => {
                                  field.onChange(comp);
                                  setIsPopoverOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    'mr-2 h-4 w-4',
                                    field.value?.id === comp.id ? 'opacity-100' : 'opacity-0'
                                  )}
                                />
                                {comp.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="result" render={({ field }) => (
                <FormItem>
                  <FormLabel>成績</FormLabel>
                  <FormControl><Input placeholder="優勝" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="flex justify-end"><Button type="submit">保存</Button></div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
