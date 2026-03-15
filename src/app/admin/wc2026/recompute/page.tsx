"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function Wc2026RecomputePage() {
  const [running, setRunning] = useState(false);
  const [resultText, setResultText] = useState<string>("");
  const [summary, setSummary] = useState<{ ok?: boolean; processed?: number; updated?: number } | null>(null);

  const run = async () => {
    setRunning(true);
    setResultText("");
    setSummary(null);
    try {
      const res = await fetch(`/api/wc2026/recompute-points`, {
        method: "POST",
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error((data as any)?.message || "再集計に失敗しました");
      }

      setSummary({
        ok: Boolean((data as any)?.ok),
        processed: typeof (data as any)?.processed === "number" ? (data as any).processed : undefined,
        updated: typeof (data as any)?.updated === "number" ? (data as any).updated : undefined,
      });
      setResultText(JSON.stringify(data, null, 2));
      toast.success("再集計が完了しました");
    } catch (e: any) {
      toast.error(e?.message || "再集計に失敗しました");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-2xl font-bold tracking-tight">WC2026 ポイント一括再集計</div>
          <div className="mt-1 text-sm text-muted-foreground">/admin/wc2026/recompute（secret URL）</div>
        </div>
        <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground">
          管理画面トップへ
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>実行</CardTitle>
          <CardDescription>公式結果と全ユーザー予想からポイントを一括再集計します</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button type="button" onClick={run} disabled={running}>
            {running ? "実行中..." : "再集計を実行"}
          </Button>

          {summary ? (
            <div className="text-sm text-muted-foreground">
              ok: {String(summary.ok)} / processed: {summary.processed ?? "-"} / updated: {summary.updated ?? "-"}
            </div>
          ) : null}

          {resultText ? (
            <pre className="whitespace-pre-wrap break-words rounded-lg bg-gray-100 border p-3 text-xs leading-relaxed text-gray-900">
              {resultText}
            </pre>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
