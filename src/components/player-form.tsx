"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { PlayerPhotoUploader } from "./player-photo-uploader";
import { Textarea } from "@/components/ui/textarea";
import { collection, query, onSnapshot, setDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";

interface Team {
  id: string;
  name: string;
}

const POSITIONS = ["GK", "DF", "MF", "FW"] as const;

const formSchema = z.object({
  name: z.string().min(2, { message: "選手名は2文字以上で入力してください。" }),
  number: z.coerce.number().int().min(1, { message: "背番号は1以上です。" }).max(99, { message: "背番号は99以下です。" }),
  position: z.enum(POSITIONS),
  photoUrl: z.string().url({ message: "無効なURLです。" }).optional().or(z.literal('')), 
  height: z.coerce.number().optional(),
  age: z.coerce.number().int().optional(),
  profile: z.string().max(200, { message: "プロフィールは200文字以内です。" }).optional(),
  nationality: z.string().optional(),
  teamId: z.string().optional(),
  seasons: z.array(z.string()).optional(),
  isPublished: z.boolean().optional(),
});

export type PlayerFormValues = z.infer<typeof formSchema>;

interface PlayerFormProps {
  onSubmit: (values: PlayerFormValues) => Promise<void>;
  defaultValues?: Partial<PlayerFormValues>;
}

export function PlayerForm({ onSubmit, defaultValues }: PlayerFormProps) {
  const [loading, setLoading] = useState(false);
  const [seasonOptions, setSeasonOptions] = useState<string[]>([]);
  const [newSeason, setNewSeason] = useState("");
  const { user } = useAuth();

  const form = useForm<PlayerFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultValues || {
      name: "",
      number: undefined,
      position: undefined,
      photoUrl: "",
      height: undefined,
      age: undefined,
      profile: "",
      nationality: "",
      teamId: "",
      seasons: [],
      isPublished: true,
    },
  });

  // 1960-2050 の中で、まだ存在しないシーズン候補を生成（チーム側と同じ考え方）
  const generateSeasons = (startYear: number, endYear: number) => {
    const seasons: string[] = [];
    for (let year = endYear; year >= startYear; year--) {
      const end = (year + 1).toString().slice(-2);
      seasons.push(`${year}-${end}`);
    }
    return seasons;
  };

  const availableSeasonsToAdd = generateSeasons(1960, 2050).filter(
    (s) => !seasonOptions.includes(s)
  );

  // シーズン一覧を取得して、複数選択できるようにする
  useEffect(() => {
    if (!user) return;
    const seasonsColRef = collection(db, `clubs/${user.uid}/seasons`);
    const q = query(seasonsColRef);
    const unsub = onSnapshot(q, (snapshot) => {
      const ids = snapshot.docs.map((doc) => doc.id).sort((a, b) => b.localeCompare(a));
      setSeasonOptions(ids);
      const current = form.getValues("seasons") || [];
      if (current.length === 0 && ids.length > 0) {
        form.setValue("seasons", [ids[0]]);
      }
    });
    return () => unsub();
  }, [user, form]);

  const handleSubmit = async (values: PlayerFormValues) => {
    setLoading(true);
    await onSubmit(values);
    setLoading(false);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="photoUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>選手写真</FormLabel>
              <FormControl>
                <PlayerPhotoUploader
                  value={field.value || ''}
                  onChange={field.onChange}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {/* 所属シーズン（複数選択可） */}
        <FormField
          control={form.control}
          name="seasons"
          render={({ field }) => (
            <FormItem>
              <FormLabel>所属シーズン（複数選択可）</FormLabel>
              <div className="space-y-1">
                <div className="flex flex-wrap gap-2">
                  {seasonOptions.map((seasonId) => {
                    const checked = (field.value || []).includes(seasonId);
                    return (
                      <button
                        key={seasonId}
                        type="button"
                        className={`px-2 py-1 rounded-full border text-xs font-medium transition-colors ${
                          checked
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-white text-gray-900 border-border hover:bg-gray-100"
                        }`}
                        onClick={() => {
                          const current: string[] = field.value || [];
                          if (current.includes(seasonId)) {
                            field.onChange(current.filter((s) => s !== seasonId));
                          } else {
                            field.onChange([...current, seasonId]);
                          }
                        }}
                      >
                        {seasonId}
                      </button>
                    );
                  })}
                </div>
                {seasonOptions.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    シーズンがまだ作成されていません。下のプルダウンから追加してください。
                  </p>
                )}
                <div className="flex items-center gap-2 pt-1">
                  <Select
                    value={newSeason}
                    onValueChange={(value) => setNewSeason(value)}
                  >
                    <SelectTrigger className="w-[150px] h-8 text-xs">
                      <SelectValue placeholder="シーズンを追加" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableSeasonsToAdd.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!newSeason}
                    className="h-8 px-3 text-xs bg-white text-gray-900 border border-border hover:bg-gray-100 disabled:opacity-50 disabled:hover:bg-white"
                    onClick={async () => {
                      if (!user || !newSeason) return;
                      try {
                        const seasonsColRef = collection(db, `clubs/${user.uid}/seasons`);
                        const seasonDocRef = doc(seasonsColRef, newSeason);
                        await setDoc(seasonDocRef, { name: newSeason }, { merge: true });

                        if (!seasonOptions.includes(newSeason)) {
                          const updated = [newSeason, ...seasonOptions].sort((a, b) =>
                            b.localeCompare(a)
                          );
                          setSeasonOptions(updated);
                        }

                        const current = form.getValues("seasons") || [];
                        if (!current.includes(newSeason)) {
                          form.setValue("seasons", [...current, newSeason]);
                        }

                        setNewSeason("");
                      } catch (e) {
                        console.error("Failed to add season from player form", e);
                      }
                    }}
                  >
                    追加
                  </Button>
                </div>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>選手名</FormLabel>
              <FormControl>
                <Input placeholder="選手名" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="nationality"
          render={({ field }) => (
            <FormItem>
              <FormLabel>国籍</FormLabel>
              <FormControl>
                <Input placeholder="例: 日本" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="number"
          render={({ field }) => (
            <FormItem>
              <FormLabel>背番号</FormLabel>
              <FormControl>
                <Input type="number" placeholder="10" {...field} onChange={e => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))}/>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="position"
          render={({ field }) => (
            <FormItem>
              <FormLabel>ポジション</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="ポジションを選択" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {POSITIONS.map((pos) => (
                    <SelectItem key={pos} value={pos}>
                      {pos}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="height"
            render={({ field }) => (
              <FormItem>
                <FormLabel>身長 (cm)</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="180" {...field} onChange={e => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))}/>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="age"
            render={({ field }) => (
              <FormItem>
                <FormLabel>年齢</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="25" {...field} onChange={e => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))}/>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="profile"
          render={({ field }) => (
            <FormItem>
              <FormLabel>プロフィール</FormLabel>
              <FormControl>
                <Textarea placeholder="選手の経歴や特徴など" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="isPublished"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <FormLabel>HPで表示する</FormLabel>
                <p className="text-xs text-muted-foreground">
                  OFF にすると、この選手はHPの選手一覧には表示されません。
                </p>
              </div>
              <FormControl>
                <Switch
                  checked={field.value ?? true}
                  onCheckedChange={(checked) => field.onChange(checked)}
                  className="data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-gray-300"
                />
              </FormControl>
            </FormItem>
          )}
        />
        <Button type="submit" disabled={loading} className="w-full">
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          保存する
        </Button>
      </form>
    </Form>
  );
}
