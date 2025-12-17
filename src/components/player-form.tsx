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
import { Textarea } from "@/components/ui/textarea";
import { PlayerPhotoUploader } from "@/components/player-photo-uploader";
import type { SubmitHandler } from "react-hook-form";

const POSITIONS = ["GK", "DF", "MF", "FW"] as const;

const snsLinkSchema = z
  .string()
  .url({ message: "無効なURLです。" })
  .optional()
  .or(z.literal(""));

const formSchema = z.object({
  name: z.string().min(2, { message: "選手名は2文字以上で入力してください。" }),
  number: z.coerce.number().int().min(1, { message: "背番号は1以上です。" }).max(99, { message: "背番号は99以下です。" }),
  position: z.enum(POSITIONS),
  photoUrl: z.string().url({ message: "無効なURLです。" }).optional().or(z.literal('')), 
  height: z.coerce.number().optional(),
  age: z.coerce.number().int().optional(),
  profile: z.string().max(200, { message: "プロフィールは200文字以内です。" }).optional(),
  nationality: z.string().optional(),
  snsLinks: z
    .object({
      x: snsLinkSchema,
      youtube: snsLinkSchema,
      tiktok: snsLinkSchema,
      instagram: snsLinkSchema,
    })
    .optional(),
  teamId: z.string().optional(),
  seasons: z.array(z.string()).optional(),
  isPublished: z.boolean().optional(),
});

export type PlayerFormValues = z.infer<typeof formSchema>;

interface PlayerFormProps {
  onSubmit: (values: PlayerFormValues) => Promise<void>;
  defaultValues?: Partial<PlayerFormValues>;
  defaultSeason?: string;
}

export function PlayerForm({ onSubmit, defaultValues, defaultSeason }: PlayerFormProps) {
  const [loading, setLoading] = useState(false);

  const baseDefaults: PlayerFormValues = {
    name: "",
    number: undefined,
    position: undefined,
    photoUrl: "",
    height: undefined,
    age: undefined,
    profile: "",
    nationality: "",
    snsLinks: {
      x: "",
      youtube: "",
      tiktok: "",
      instagram: "",
    },
    teamId: "",
    seasons: defaultSeason ? [defaultSeason] : [],
    isPublished: true,
  };

  const normalizedDefaults: PlayerFormValues = {
    ...baseDefaults,
    ...(defaultValues as any),
    snsLinks: {
      ...(baseDefaults.snsLinks as any),
      ...(((defaultValues as any)?.snsLinks || {}) as any),
    },
  };

  const form = useForm<PlayerFormValues>({
    resolver: zodResolver(formSchema) as any,
    defaultValues: normalizedDefaults,
  });

  useEffect(() => {
    if (!defaultValues) return;
    form.reset(normalizedDefaults);
  }, [defaultValues, form, normalizedDefaults]);

  const handleSubmit: SubmitHandler<PlayerFormValues> = async (values) => {
    setLoading(true);
    await onSubmit(values);
    setLoading(false);
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        className="space-y-4 pb-24 max-h-[80vh] overflow-y-auto"
      >
        {/* 所属シーズン（複数選択可） */}
        <FormField
          control={form.control}
          name="photoUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>選手写真</FormLabel>
              <FormControl>
                <PlayerPhotoUploader
                  value={field.value || ""}
                  onChange={field.onChange}
                />
              </FormControl>
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

        <div className="space-y-3 rounded-lg border p-3">
          <div className="space-y-0.5">
            <FormLabel>SNSリンク</FormLabel>
            <p className="text-xs text-muted-foreground">
              入力したSNSのみHPの選手詳細に表示されます。
            </p>
          </div>
          <FormField
            control={form.control}
            name="snsLinks.x"
            render={({ field }) => (
              <FormItem>
                <FormLabel>X</FormLabel>
                <FormControl>
                  <Input placeholder="https://x.com/..." {...field} value={(field.value as any) ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="snsLinks.youtube"
            render={({ field }) => (
              <FormItem>
                <FormLabel>YouTube</FormLabel>
                <FormControl>
                  <Input placeholder="https://www.youtube.com/..." {...field} value={(field.value as any) ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="snsLinks.tiktok"
            render={({ field }) => (
              <FormItem>
                <FormLabel>TikTok</FormLabel>
                <FormControl>
                  <Input placeholder="https://www.tiktok.com/@..." {...field} value={(field.value as any) ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="snsLinks.instagram"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Instagram</FormLabel>
                <FormControl>
                  <Input placeholder="https://www.instagram.com/..." {...field} value={(field.value as any) ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

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
