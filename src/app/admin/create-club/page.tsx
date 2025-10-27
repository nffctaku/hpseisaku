"use client";

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, doc, setDoc, writeBatch } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const createClubSchema = z.object({
  clubName: z.string().min(2, { message: 'クラブ名は2文字以上で入力してください。' }),
  clubId: z.string().min(3, { message: 'クラブIDは3文字以上で入力してください。' }).regex(/^[a-z0-9-]+$/, { message: 'クラブIDは小文字の英数字とハイフンのみ使用できます。' }),
});

type CreateClubFormValues = z.infer<typeof createClubSchema>;

export default function CreateClubPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const form = useForm<CreateClubFormValues>({
    resolver: zodResolver(createClubSchema),
    defaultValues: {
      clubName: '',
      clubId: '',
    },
  });

  const handleFormSubmit = async (values: CreateClubFormValues) => {
    if (!user) {
      toast.error('ログインしていません。');
      return;
    }

    setLoading(true);
    try {
      const { clubName, clubId } = values;
      
      const batch = writeBatch(db);

      // 1. Create club_profile document
      const clubProfileRef = doc(db, 'club_profiles', clubId);
      batch.set(clubProfileRef, {
        clubName,
        ownerUid: user.uid,
        createdAt: new Date(),
      });

      // 2. Create team document in the user's teams subcollection
      const teamRef = doc(collection(db, `clubs/${user.uid}/teams`));
      batch.set(teamRef, {
        name: clubName,
        // You can add more fields like logoUrl here if needed
      });

      await batch.commit();

      toast.success('クラブを作成しました！');
      router.push('/admin/club'); // Redirect to the main admin page

    } catch (error) {
      console.error("Error creating club: ", error);
      toast.error('クラブの作成中にエラーが発生しました。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">
      <div className="w-full max-w-md p-8 space-y-8 bg-gray-800 rounded-lg shadow-lg">
        <div className="text-center">
          <h1 className="text-3xl font-bold">クラブへようこそ</h1>
          <p className="mt-2 text-gray-400">最初のステップとして、あなたのクラブ情報を登録してください。</p>
        </div>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="clubName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>クラブ名</FormLabel>
                  <FormControl>
                    <Input placeholder="例: Nottingham Forest" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="clubId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>クラブID (URL用)</FormLabel>
                  <FormControl>
                    <Input placeholder="例: nottingham-forest" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" disabled={loading} className="w-full">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              クラブを作成
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
}
