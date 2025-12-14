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
import { Switch } from "@/components/ui/switch";
import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import type { SubmitHandler } from "react-hook-form";

const formSchema = z.object({
  name: z.string().min(2, { message: "名前は2文字以上で入力してください。" }),
  age: z.coerce.number().int().optional(),
  nationality: z.string().optional(),
  position: z.string().optional(),
  profile: z.string().max(200, { message: "プロフィールは200文字以内です。" }).optional(),
  seasons: z.array(z.string()).optional(),
  isPublished: z.boolean().optional(),
});

export type StaffFormValues = z.infer<typeof formSchema>;

interface StaffFormProps {
  onSubmit: (values: StaffFormValues) => Promise<void>;
  defaultValues?: Partial<StaffFormValues>;
  defaultSeason?: string;
}

export function StaffForm({ onSubmit, defaultValues, defaultSeason }: StaffFormProps) {
  const [loading, setLoading] = useState(false);

  const form = useForm<StaffFormValues>({
    resolver: zodResolver(formSchema) as any,
    defaultValues: defaultValues || {
      name: "",
      age: undefined,
      nationality: "",
      position: "",
      profile: "",
      seasons: defaultSeason ? [defaultSeason] : [],
      isPublished: true,
    },
  });

  useEffect(() => {
    if (!defaultValues) return;
    form.reset({
      name: "",
      age: undefined,
      nationality: "",
      position: "",
      profile: "",
      seasons: [],
      isPublished: true,
      ...defaultValues,
    });
  }, [defaultValues, form]);

  const handleSubmit: SubmitHandler<StaffFormValues> = async (values) => {
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
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>名前</FormLabel>
              <FormControl>
                <Input placeholder="名前" {...field} />
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
          name="age"
          render={({ field }) => (
            <FormItem>
              <FormLabel>年齢</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder="30"
                  {...field}
                  onChange={(e) =>
                    field.onChange(e.target.value === "" ? undefined : Number(e.target.value))
                  }
                />
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
              <FormControl>
                <Input placeholder="例: 監督 / コーチ / トレーナー" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="profile"
          render={({ field }) => (
            <FormItem>
              <FormLabel>プロフィール</FormLabel>
              <FormControl>
                <Textarea placeholder="スタッフの経歴や担当など" {...field} />
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
                  OFF にすると、このスタッフはHPには表示されません。
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
