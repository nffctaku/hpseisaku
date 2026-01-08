"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc, collection, query, getDocs } from "firebase/firestore";
import { useForm, useFieldArray, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormDescription, FormMessage } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import Image from 'next/image';
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ClubEmblemUploader } from "@/components/club-emblem-uploader";

const rankLabelColors = ["green", "red", "orange", "blue", "yellow"] as const;

// NOTE: This is largely a copy of the new page, but adapted for editing.
// It does not support changing the competition format or re-generating rounds after creation.

const seasons = Array.from({ length: 91 }, (_, i) => {
  const startYear = 1960 + i;
  const endYear = startYear + 1;
  return `${startYear}/${String(endYear).slice(-2)}`;
});

const formSchema = z.object({
  name: z.string().min(1, "大会名は必須です。"),
  season: z.string().min(1, "シーズンを選択してください。"),
  teams: z.array(z.string()).min(1, "最低1チームは選択してください。"),
  logoUrl: z.string().url().optional().or(z.literal('')),
  rankLabels: z
    .array(
      z
        .object({
          from: z.coerce.number().int().positive("1以上の数値を入力してください。"),
          to: z.coerce.number().int().positive("1以上の数値を入力してください。"),
          color: z.enum(rankLabelColors),
        })
        .refine((v) => v.from <= v.to, {
          message: "開始順位は終了順位以下にしてください。",
          path: ["to"],
        })
    )
    .max(5, "ラベルは最大5つまでです。")
    .optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface Team {
  id: string;
  name: string;
  logoUrl?: string;
}

export default function EditCompetitionPage() {
  const { user, ownerUid } = useAuth();
  const router = useRouter();
  const params = useParams();
  const competitionId = params.competitionId as string;

  const clubUid = ownerUid || user?.uid;

  const [loading, setLoading] = useState(true);
  const [allTeams, setAllTeams] = useState<Team[]>([]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as any,
    defaultValues: {
      name: "",
      season: "",
      teams: [],
      logoUrl: "",
      rankLabels: [],
    },
  });

  const {
    fields: rankLabelFields,
    append: appendRankLabel,
    remove: removeRankLabel,
  } = useFieldArray({
    control: form.control as any,
    name: "rankLabels",
  });


  useEffect(() => {
    if (!user || !competitionId) return;
    if (!clubUid) return;
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch all teams
        const teamsQuery = query(collection(db, `clubs/${clubUid}/teams`));
        const teamsSnapshot = await getDocs(teamsQuery);
        const teamsData = teamsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Team));
        setAllTeams(teamsData);

        // Fetch the specific competition
        const docRef = doc(db, `clubs/${clubUid}/competitions`, competitionId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          form.reset({
            name: data.name,
            season: data.season,
            teams: data.teams || [],
            logoUrl: data.logoUrl || "",
            rankLabels: Array.isArray((data as any).rankLabels) ? (data as any).rankLabels : [],
          });
        } else {
          toast.error("大会が見つかりません。");
          router.push("/admin/competitions");
        }
      } catch (error) {
        console.error("Error fetching data: ", error);
        toast.error("データの読み込みに失敗しました。");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user, clubUid, competitionId, router, form]);

  const onSubmit: SubmitHandler<FormValues> = async (data) => {
    if (!user || !competitionId) return;
    if (!clubUid) return;
    setLoading(true);
    try {
      const compRef = doc(db, `clubs/${clubUid}/competitions`, competitionId);
      await updateDoc(compRef, {
        name: data.name,
        season: data.season,
        teams: data.teams, // Save array of team IDs
        logoUrl: data.logoUrl || null,
        rankLabels: Array.isArray((data as any).rankLabels) ? (data as any).rankLabels : [],
      });
      toast.success("大会情報が更新されました。");
      router.push("/admin/competitions");
    } catch (error) {
      console.error("Error updating competition: ", error);
      toast.error("更新に失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-screen"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="container mx-auto py-10 max-w-2xl">
      <h1 className="text-3xl font-bold mb-8 text-white">大会を編集</h1>
      <div className="bg-white text-gray-900 rounded-lg shadow p-8 space-y-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <FormField
              control={form.control}
              name="logoUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>大会ロゴ</FormLabel>
                  <FormControl>
                    <ClubEmblemUploader
                      value={field.value || ''}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormDescription>
                    大会ごとのロゴ画像を設定できます（任意）。
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
            control={form.control}
            name="season"
            render={({ field }) => (
              <FormItem>
                <FormLabel>シーズン</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="シーズンを選択" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {seasons.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
            
            <FormField
            control={form.control}
            name="teams"
            render={() => (
              <FormItem>
                <div className="mb-4">
                  <FormLabel className="text-base">参加チーム</FormLabel>
                  <FormDescription>
                    大会に参加するチームを選択してください。
                  </FormDescription>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {allTeams.map((team) => (
                    <FormField
                      key={team.id}
                      control={form.control}
                      name="teams"
                      render={({ field }) => {
                        return (
                          <FormItem
                            key={team.id}
                            className="flex flex-row items-start gap-2 space-y-0 rounded-md border p-2 transition-colors hover:bg-muted/50 data-[state=checked]:bg-primary/10"
                          >
                            <FormControl>
                              <Checkbox
                                checked={field.value?.includes(team.id)}
                                onCheckedChange={(checked) => {
                                  return checked
                                    ? field.onChange([...(field.value || []), team.id])
                                    : field.onChange(
                                        field.value?.filter(
                                          (value) => value !== team.id
                                        )
                                      );
                                }}
                              />
                            </FormControl>
                            <FormLabel className="font-normal flex-1 min-w-0 cursor-pointer">
                              <div className="flex items-start gap-2 min-w-0">
                                {team.logoUrl ? (
                                  <Image src={team.logoUrl} alt={team.name} width={24} height={24} className="rounded-full object-contain" />
                                ) : (
                                  <div className="w-6 h-6 bg-muted rounded-full" />
                                )}
                                <span className="min-w-0 text-xs leading-snug line-clamp-2">{team.name}</span>
                              </div>
                            </FormLabel>
                          </FormItem>
                        );
                      }}
                    />
                  ))}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

            <div className="space-y-4">
              <div>
                <FormLabel className="text-base">順位ラベル</FormLabel>
                <FormDescription>
                  順位表の左端に色付きラベルを表示します（最大5つ）。
                </FormDescription>
              </div>

              <div className="space-y-3">
                {rankLabelFields.map((f, idx) => (
                  <div key={f.id} className="grid grid-cols-12 gap-2 rounded-md border p-2 overflow-hidden">
                    <div className="col-span-4">
                      <FormField
                        control={form.control}
                        name={`rankLabels.${idx}.from`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-[11px]">開始</FormLabel>
                            <FormControl>
                              <Input type="number" placeholder="1" className="h-7 w-[72px] px-2 text-xs" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="col-span-1 flex items-end justify-center pb-2 text-sm text-muted-foreground">
                      〜
                    </div>
                    <div className="col-span-4">
                      <FormField
                        control={form.control}
                        name={`rankLabels.${idx}.to`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-[11px]">終了</FormLabel>
                            <FormControl>
                              <Input type="number" placeholder="4" className="h-7 w-[72px] px-2 text-xs" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="col-span-3 min-w-0">
                      <div className="h-[11px]" />
                    </div>

                    <div className="col-span-10 min-w-0">
                      <FormField
                        control={form.control}
                        name={`rankLabels.${idx}.color`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-[11px]">色</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger className="h-7 w-full min-w-0 text-xs">
                                  <SelectValue placeholder="色" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {rankLabelColors.map((c) => (
                                  <SelectItem key={c} value={c}>
                                    {c}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="col-span-2 flex justify-end items-end">
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        onClick={() => removeRankLabel(idx)}
                        className="h-8 w-8 bg-red-600 text-white hover:bg-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}

                <div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (rankLabelFields.length >= 5) return;
                      appendRankLabel({ from: 1, to: 1, color: "green" } as any);
                    }}
                    disabled={rankLabelFields.length >= 5}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    ラベルを追加
                  </Button>
                </div>
              </div>
            </div>

            <Button type="submit" disabled={loading} className="w-full">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              更新する
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
}
