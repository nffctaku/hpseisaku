"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function Wc2026RecomputePage() {
  const searchParams = useSearchParams();
  const tokenFromQuery = searchParams.get("token") || "";

  const [token, setToken] = useState<string>(tokenFromQuery);
  const [running, setRunning] = useState(false);
  const [resultText, setResultText] = useState<string>("");

  const masked = useMemo(() => {
    if (!token) return "";
    if (token.length <= 6) return "******";
    return `${token.slice(0, 3)}******${token.slice(-3)}`;
  }, [token]);

  const run = async () => {
    if (!token.trim()) {
      toast.error("token を入力してください");
      return;
    }

    setRunning(true);
    setResultText("");
    try {
      const res = await fetch(`/api/wc2026/recompute-points?token=${encodeURIComponent(token.trim())}`, {
        method: "POST",
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error((data as any)?.message || "再集計に失敗しました");
      }

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
          <CardDescription>token を知っている人だけ実行できます（ログイン不要）</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <div className="text-sm font-semibold">token</div>
            <Input value={token} onChange={(e) => setToken(e.target.value)} placeholder="?token=... またはここに貼り付け" />
            <div className="text-xs text-muted-foreground">現在: {masked || "-"}</div>
          </div>

          <Button type="button" onClick={run} disabled={running}>
            {running ? "実行中..." : "再集計を実行"}
          </Button>

          {resultText ? (
            <pre className="whitespace-pre-wrap break-words rounded-lg bg-gray-50 border p-3 text-xs leading-relaxed">
              {resultText}
            </pre>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
