"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { collection, addDoc, writeBatch, doc, getDocs, query } from "firebase/firestore";
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

// Generate a list of seasons from 1960/61 to 2050/51
const seasons = Array.from({ length: 91 }, (_, i) => {
  const startYear = 1960 + i;
  const endYear = startYear + 1;
  return `${startYear}/${String(endYear).slice(-2)}`;
});

const formSchema = z.object({
  name: z.string().min(1, "大会名は必須です。"),
  season: z.string().min(1, "シーズンを選択してください。"),
  format: z.enum(["league", "cup", "league_cup"]),
  leagueRounds: z.preprocess(
    (v) => {
      if (v === '' || v == null) return undefined;
      if (typeof v === 'number') return v;
      if (typeof v === 'string') {
        const s = v.trim();
        if (!s) return undefined;
        const n = Number(s);
        return Number.isFinite(n) ? n : undefined;
      }
      return undefined;
    },
    z.number().int().positive("1以上の数値を入力してください。").optional()
  ),
  cupRounds: z.array(z.object({ name: z.string().min(1, "回戦名は必須です。") })).optional(),
  teams: z.array(z.string()).min(1, "最低1チームは選択してください。"),
  logoUrl: z.string().url().optional().or(z.literal('')),
}).refine(data => {
  if (data.format === 'league' || data.format === 'league_cup') {
    return !!data.leagueRounds && data.leagueRounds > 0;
  }
  return true;
}, {
  message: "総節数を入力してください。",
  path: ["leagueRounds"],
}).refine(data => {
  if (data.format === 'cup' || data.format === 'league_cup') {
    return !!data.cupRounds && data.cupRounds.length > 0;
  }
  return true;
}, {
  message: "最低1つの回戦を追加してください。",
  path: ["cupRounds"],
});

type FormValues = z.infer<typeof formSchema>;

interface Team {
  id: string;
  name: string;
  logoUrl?: string;
  categoryId?: string | null;
}

interface TeamCategory {
  id: string;
  name: string;
}

export default function NewCompetitionPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [allTeams, setAllTeams] = useState<Team[]>([]);
  const [categories, setCategories] = useState<TeamCategory[]>([]);
  const [teamCategoryFilter, setTeamCategoryFilter] = useState<string>("all");

  const clubUid = (user as any)?.ownerUid || user?.uid;

  const getTeamInitial = (name: string) => {
    const s = (name || '').trim();
    if (!s) return '?';
    return s.slice(0, 1).toUpperCase();
  };

  const getTeamCategoryFilterLabel = () => {
    if (teamCategoryFilter === 'all') return 'すべて';
    if (teamCategoryFilter === 'uncategorized') return '未分類';
    const found = categories.find((c) => c.id === teamCategoryFilter);
    return found?.name || '（不明）';
  };

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as any,
    defaultValues: {
      name: "",
      season: `${new Date().getFullYear()}/${String(new Date().getFullYear() + 1).slice(-2)}`,
      format: "league",
      leagueRounds: undefined,
      cupRounds: [],
      teams: [],
      logoUrl: "",
    },
  });

  const { fields: cupRoundFields, append: appendCupRound, remove: removeCupRound } = useFieldArray({
    control: form.control,
    name: "cupRounds",
  });

  useEffect(() => {
    if (!user) return;
    if (!clubUid) return;
    const fetchTeams = async () => {
      const teamsColRef = collection(db, `clubs/${clubUid}/teams`);
      const q = query(teamsColRef);
      const querySnapshot = await getDocs(q);
      const teamsData = querySnapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      } as Team));
      setAllTeams(teamsData);
    };
    const fetchCategories = async () => {
      const categoriesColRef = collection(db, `clubs/${clubUid}/team_categories`);
      const q = query(categoriesColRef);
      const querySnapshot = await getDocs(q);
      const categoriesData = querySnapshot.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) } as TeamCategory))
        .filter((c) => typeof c.name === 'string')
        .sort((a, b) => a.name.localeCompare(b.name));
      setCategories(categoriesData);
    };
    fetchTeams();
    fetchCategories();
  }, [user, clubUid]);

  const selectedFormat = form.watch("format");

  const onSubmit: SubmitHandler<FormValues> = async (data) => {
    if (!user) {
      toast.error("ログインしていません。");
      return;
    }
    if (!clubUid) return;
    setLoading(true);
    try {
      const compRef = await addDoc(collection(db, `clubs/${clubUid}/competitions`), {
        name: data.name,
        season: data.season,
        format: data.format,
        teams: data.teams, // Save array of team IDs
        logoUrl: data.logoUrl || null,
      });

      const batch = writeBatch(db);
      const roundsColRef = collection(db, `clubs/${clubUid}/competitions`, compRef.id, 'rounds');

      if (data.format === 'league' || data.format === 'league_cup') {
        for (let i = 1; i <= data.leagueRounds!; i++) {
          const roundDoc = doc(roundsColRef);
          batch.set(roundDoc, { name: `第${i}節` });
        }
      }
      
      if (data.format === 'cup' || data.format === 'league_cup') {
        data.cupRounds?.forEach(round => {
          const roundDoc = doc(roundsColRef);
          batch.set(roundDoc, { name: round.name });
        });
      }

      await batch.commit();
      toast.success("新しい大会が作成されました。");
      router.push(`/admin/competitions/${compRef.id}`);
    } catch (error) {
      console.error("Error creating competition: ", error);
      toast.error("大会の作成に失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-10 max-w-2xl">
      <h1 className="text-3xl font-bold mb-8 text-white">新規大会登録</h1>
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
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>大会名</FormLabel>
                <FormControl><Input placeholder="プレミアリーグ" {...field} /></FormControl>
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
            name="format"
            render={({ field }) => (
              <FormItem className="space-y-3">
                <FormLabel>大会フォーマット</FormLabel>
                <FormControl>
                  <div className="flex flex-col space-y-2">
                    <label className="flex items-center space-x-3">
                      <input type="radio" {...field} value="league" checked={field.value === 'league'} className="form-radio" />
                      <span className="font-normal">リーグ戦</span>
                    </label>
                    <label className="flex items-center space-x-3">
                      <input type="radio" {...field} value="cup" checked={field.value === 'cup'} className="form-radio" />
                      <span className="font-normal">カップ戦</span>
                    </label>
                    <label className="flex items-center space-x-3">
                      <input type="radio" {...field} value="league_cup" checked={field.value === 'league_cup'} className="form-radio" />
                      <span className="font-normal">リーグ & トーナメント</span>
                    </label>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

            {(selectedFormat === 'league' || selectedFormat === 'league_cup') && (
              <FormField
              control={form.control}
              name="leagueRounds"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>総節数</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="38"
                      {...field}
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
              />
            )}

            {(selectedFormat === 'cup' || selectedFormat === 'league_cup') && (
              <div className="space-y-4">
              <FormLabel>回戦名</FormLabel>
              {cupRoundFields.map((field, index) => (
                <div key={field.id} className="flex items-center gap-2">
                  <FormField
                    control={form.control}
                    name={`cupRounds.${index}.name`}
                    render={({ field }) => (
                      <FormItem className="flex-grow">
                        <FormControl><Input placeholder={`例: 準々決勝`} {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="button" variant="destructive" size="icon" onClick={() => removeCupRound(index)} disabled={cupRoundFields.length <= 1}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
                <Button type="button" variant="outline" size="sm" onClick={() => appendCupRound({ name: "" })}>
                <Plus className="mr-2 h-4 w-4" />
                回戦を追加
              </Button>
              </div>
            )}

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
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-4">
                  <div className="text-xs sm:text-sm text-muted-foreground">表示カテゴリ</div>
                  <Select value={teamCategoryFilter} onValueChange={setTeamCategoryFilter}>
                    <SelectTrigger className="w-full sm:w-[260px] bg-white text-gray-900 border border-border">
                      <span className="text-sm text-gray-900">表示カテゴリ: {getTeamCategoryFilterLabel()}</span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">すべて</SelectItem>
                      <SelectItem value="uncategorized">未分類</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {allTeams
                    .filter((t) => {
                      if (teamCategoryFilter === 'all') return true;
                      if (teamCategoryFilter === 'uncategorized') return !t.categoryId;
                      return t.categoryId === teamCategoryFilter;
                    })
                    .map((team) => (
                    <FormField
                      key={team.id}
                      control={form.control}
                      name="teams"
                      render={({ field }) => {
                        return (
                          <FormItem
                            key={team.id}
                            className="flex flex-row items-start gap-3 space-y-0 rounded-md border p-3 transition-colors hover:bg-muted/50 data-[state=checked]:bg-primary/10"
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
                                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-slate-100 to-slate-300 text-slate-800 flex items-center justify-center font-bold text-xs">
                                    {getTeamInitial(team.name)}
                                  </div>
                                )}
                                <span className="min-w-0 text-sm leading-tight break-words line-clamp-2">{team.name}</span>
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

            <Button type="submit" disabled={loading} className="w-full">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              大会を作成する
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
}
