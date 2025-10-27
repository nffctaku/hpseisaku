"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { useClub } from '@/contexts/ClubContext';
import { doc, setDoc, getDoc, collection, getDocs, writeBatch, query, where } from "firebase/firestore";
import { toast } from "sonner";
import { db } from "@/lib/firebase";
import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { ClubEmblemUploader } from "./club-emblem-uploader";

const formSchema = z.object({
  clubId: z.string()
    .min(3, { message: "クラブIDは3文字以上で入力してください。" })
    .regex(/^[a-z0-9-]+$/, { message: "クラブIDは小文字の英数字とハイフンのみ使用できます。" }),
  clubName: z.string().min(3, { message: "クラブ名は3文字以上で入力してください。" }),
  description: z.string().max(200, { message: "紹介文は200文字以内で入力してください。" }).optional(),
  logoUrl: z.string().url({ message: "無効なURLです。" }).optional(),
});

export function ClubInfoForm({ userId }: { userId: string }) {
  const { user } = useAuth();
  const { fetchClubInfo } = useClub();
  const [loading, setLoading] = useState(false);
  const [formLoading, setFormLoading] = useState(true);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      clubId: "",
      clubName: "",
      description: "",
      logoUrl: "",
    },
  });

  useEffect(() => {
    async function loadClubData() {
      if (!userId) {
        setFormLoading(false);
        return;
      }

      try {
        // 1. Find the club profile using the clubId from the URL (which is passed as userId prop)
        const clubProfilesQuery = query(collection(db, "club_profiles"), where("clubId", "==", userId));
        const querySnapshot = await getDocs(clubProfilesQuery);

        if (querySnapshot.empty) {
          toast.error("クラブプロファイルが見つかりません。");
          setFormLoading(false);
          return;
        }

        const clubProfileSnap = querySnapshot.docs[0];

        if (!clubProfileSnap.exists()) {
          toast.error("クラブプロファイルが見つかりません。");
          setFormLoading(false);
          return;
        }

        const clubProfileData = clubProfileSnap.data();
        const ownerUid = clubProfileSnap.id; // The document ID is the owner's UID

        
        // 2. Fetch the main club data from the 'clubs' collection using the owner's UID
        const clubDocRef = doc(db, "clubs", ownerUid);
        const clubDocSnap = await getDoc(clubDocRef);
        const clubData = clubDocSnap.exists() ? clubDocSnap.data() : {};

        // 3. Fetch the team data from the subcollection
        const teamDocRef = doc(db, `clubs/${ownerUid}/teams`, ownerUid);
        const teamDocSnap = await getDoc(teamDocRef);
        const teamData = teamDocSnap.exists() ? teamDocSnap.data() : {};

        // 4. Reset the form with all the fetched data
        form.reset({
          clubId: clubProfileSnap.data().clubId || '',
          clubName: clubData.clubName || teamData.name || '',
          description: clubData.description || '',
          logoUrl: clubData.logoUrl || teamData.logoUrl || '',
        });

      } catch (error) {
        console.error("Error loading club data:", error);
        toast.error("クラブデータの読み込みに失敗しました。");
      } finally {
        setFormLoading(false);
      }
    }

    loadClubData();
  }, [userId, form]);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!user) return;
    const ownerUid = user.uid; // Use the authenticated user's UID for writing
    setLoading(true);

    const clubDocRef = doc(db, "clubs", ownerUid);

    try {
      // Save club data
      await setDoc(clubDocRef, {
        clubId: values.clubId, // この行を追加
        clubName: values.clubName,
        description: values.description,
        logoUrl: values.logoUrl,
        updatedAt: new Date(),
      }, { merge: true });

      // Save own team data into the teams subcollection
      const ownTeamDocRef = doc(db, `clubs/${ownerUid}/teams`, ownerUid);
      await setDoc(ownTeamDocRef, {
        name: values.clubName,
        logoUrl: values.logoUrl,
      }, { merge: true });

      
      // Also update the club_profiles collection for the header
      const clubProfileRef = doc(db, "club_profiles", ownerUid);
      await setDoc(clubProfileRef, {
        clubId: values.clubId,
        clubName: values.clubName,
        logoUrl: values.logoUrl,
      }, { merge: true });

      alert("クラブ情報を保存しました！");
      fetchClubInfo(); // Refresh the club info in the header
    } catch (error) {
      console.error("Error saving club info: ", error);
      alert("情報の保存に失敗しました。" + (error instanceof Error ? `\n${error.message}` : ''));
    } finally {
      setLoading(false);
    }
  }

  if (formLoading) {
    return (
      <div className="flex justify-center items-center h-40">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="logoUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>クラブエンブレム</FormLabel>
              <FormControl>
                <ClubEmblemUploader
                  value={field.value || ''}
                  onChange={field.onChange}
                />
              </FormControl>
              <FormDescription>
                クラブの象徴となるエンブレムをアップロードしてください。
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="clubId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>クラブID</FormLabel>
              <FormControl>
                <Input placeholder="例: fc-cascade" {...field} disabled={!!field.value} />
              </FormControl>
              <FormDescription>
                あなたのクラブページのURLになります (例: example.com/fc-cascade)。<br />
                <strong>小文字の英数字とハイフンのみ</strong>使用できます。<strong>後から変更はできません。</strong>
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="clubName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>クラブ名</FormLabel>
              <FormControl>
                <Input placeholder="例: FC Cascade" {...field} />
              </FormControl>
              <FormDescription>
                あなたのクラブの名前を入力してください。
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>クラブ紹介</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="クラブの歴史や目標などを入力してください。"
                  className="resize-none"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                サポーターにあなたのクラブをアピールしましょう。
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          保存する
        </Button>
      </form>
    </Form>
  );
}
