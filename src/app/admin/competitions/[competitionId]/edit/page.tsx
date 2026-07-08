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
import { Loader2, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { ClubEmblemUploader } from "@/components/club-emblem-uploader";

const rankLabelColorValues = ["green", "red", "orange", "blue", "yellow", "purple", "pink", "gray"] as const;

const rankLabelColors = [
  { name: "green", bg: "bg-green-500", border: "border-green-500" },
  { name: "red", bg: "bg-red-500", border: "border-red-500" },
  { name: "orange", bg: "bg-orange-500", border: "border-orange-500" },
  { name: "blue", bg: "bg-blue-500", border: "border-blue-500" },
  { name: "yellow", bg: "bg-yellow-500", border: "border-yellow-500" },
  { name: "purple", bg: "bg-purple-500", border: "border-purple-500" },
  { name: "pink", bg: "bg-pink-500", border: "border-pink-500" },
  { name: "gray", bg: "bg-gray-500", border: "border-gray-500" }
] as const;

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
          name: z.string().optional(),
          from: z.coerce.number().int().positive("1以上の数値を入力してください。"),
          to: z.coerce.number().int().positive("1以上の数値を入力してください。"),
          color: z.enum(rankLabelColorValues),
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
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-white">大会を編集</h1>
        <Button
          type="button"
          size="icon"
          onClick={() => router.push('/admin/competitions')}
          className="bg-orange-500 hover:bg-orange-600 text-white"
        >
          <X className="h-6 w-6" />
        </Button>
      </div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pb-20">
          {/* セクション1: 基本情報 */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-sm font-semibold text-white/80 mb-4">基本情報</h2>
            <div className="space-y-6">
              <FormField
              control={form.control}
              name="logoUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white">大会ロゴ</FormLabel>
                  <FormControl>
                    <ClubEmblemUploader
                      value={field.value || ''}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormDescription className="text-white/50">
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
                <FormLabel className="text-white">シーズン <span className="text-red-500 text-xs">必須</span></FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger className="w-full bg-white/10 text-white border-white/20">
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
            </div>
          </div>

          {/* セクション2: 参加チーム */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-sm font-semibold text-white/80 mb-4">参加チーム <span className="text-red-500 text-xs">必須</span></h2>
            <FormField
            control={form.control}
            name="teams"
            render={() => (
              <FormItem>
                <div className="mb-4">
                  <FormDescription className="text-white/50">
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
                            className="flex flex-row items-start gap-2 space-y-0 rounded-md border border-white/20 p-2 transition-colors hover:bg-white/10 data-[state=checked]:bg-primary/20 bg-white/5"
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
                                  <div className="w-6 h-6 bg-white/10 rounded-full" />
                                )}
                                <span className="min-w-0 text-xs leading-snug line-clamp-2 text-white">{team.name}</span>
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
          </div>

          {/* セクション3: 順位ラベル */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-sm font-semibold text-white/80 mb-4">順位ラベル</h2>
            <div className="space-y-4">
              <div>
                <FormDescription className="text-white/50 text-xs">
                  順位表の左端に色付きラベルを表示します（最大5つ）。
                </FormDescription>
              </div>

              {/* ミニプレビュー */}
              <div className="rounded-md border border-white/20 bg-white/5 p-3">
                <div className="text-[10px] text-white/60 mb-2">プレビュー</div>
                <div className="space-y-1">
                  {[1, 2, 3, 4, 5].map((rank) => {
                    const rankLabels = form.getValues('rankLabels') || [];
                    const activeLabel = rankLabels.find(
                      (label: any) => label.from <= rank && label.to >= rank
                    );
                    const colorObj = activeLabel ? rankLabelColors.find(c => c.name === activeLabel.color) : null;

                    return (
                      <div key={rank} className="flex items-center gap-2 h-8 rounded bg-white/5">
                        {colorObj && (
                          <div className={`w-1.5 h-6 rounded-l ${colorObj.bg}`} />
                        )}
                        <div className="flex-1 flex items-center gap-3 px-2">
                          <span className="text-[10px] text-white/60 w-4">{rank}</span>
                          <span className="text-[10px] text-white">チーム {rank}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-3">
                {rankLabelFields.map((f, idx) => (
                  <div key={f.id} className="grid grid-cols-12 gap-2 rounded-md border border-white/20 p-2 overflow-hidden">
                    <div className="col-span-6">
                      <FormField
                        control={form.control}
                        name={`rankLabels.${idx}.name`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-[10px] text-white">ラベル名</FormLabel>
                            <FormControl>
                              <Input placeholder="昇格圏" {...field} className="h-6 w-full px-2 text-[10px] bg-white/10 text-white border-white/20" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="col-span-2">
                      <FormField
                        control={form.control}
                        name={`rankLabels.${idx}.from`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-[10px] text-white">開始</FormLabel>
                            <div className="flex items-center">
                              <FormControl>
                                <Input type="number" placeholder="1" className="h-6 w-full px-2 text-[10px] bg-white/10 text-white border-white/20" {...field} />
                              </FormControl>
                              <span className="text-[10px] text-white/60 ml-1">位</span>
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="col-span-1 flex items-end justify-center pb-2 text-sm text-white/60">
                      〜
                    </div>
                    <div className="col-span-2">
                      <FormField
                        control={form.control}
                        name={`rankLabels.${idx}.to`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-[10px] text-white">終了</FormLabel>
                            <div className="flex items-center">
                              <FormControl>
                                <Input type="number" placeholder="4" className="h-6 w-full px-2 text-[10px] bg-white/10 text-white border-white/20" {...field} />
                              </FormControl>
                              <span className="text-[10px] text-white/60 ml-1">位</span>
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="col-span-1">
                    </div>
                    <div className="col-span-11">
                      <FormField
                        control={form.control}
                        name={`rankLabels.${idx}.color`}
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex flex-wrap gap-1">
                              {rankLabelColors.map((color) => (
                                <button
                                  key={color.name}
                                  type="button"
                                  onClick={() => field.onChange(color.name as any)}
                                  className={`w-5 h-5 rounded-full ${color.bg} ${field.value === color.name ? `ring-2 ring-offset-1 ring-offset-gray-900 ${color.border}` : ''} transition-all`}
                                />
                              ))}
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="col-span-1 flex justify-start items-center">
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        onClick={() => removeRankLabel(idx)}
                        className="h-6 w-6 bg-red-600 text-white hover:bg-red-700"
                      >
                        <Trash2 className="h-3 w-3" />
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
                      appendRankLabel({ name: "", from: 1, to: 1, color: "green" } as any);
                    }}
                    disabled={rankLabelFields.length >= 5}
                    className="bg-white/10 text-white border-white/30 hover:bg-white/20"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    ラベルを追加
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Sticky submit button */}
          <div className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-white/10 p-4">
            <div className="container mx-auto max-w-2xl">
              <Button type="submit" disabled={loading} className="w-full bg-orange-500 hover:bg-orange-600 text-white">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                更新する
              </Button>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}
