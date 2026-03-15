"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function AdminSandboxPage() {
  const { user, ownerUid } = useAuth();
  const [title, setTitle] = useState<string>("");
  const [payload, setPayload] = useState<string>("{");
  const [result, setResult] = useState<string>("");

  const contextJson = useMemo(() => {
    return {
      uid: user?.uid || null,
      ownerUid: ownerUid || null,
      plan: (user as any)?.plan || null,
      clubId: (user as any)?.clubId || null,
      clubName: (user as any)?.clubName || null,
      mainTeamId: (user as any)?.mainTeamId || null,
    };
  }, [user?.uid, ownerUid, (user as any)?.plan, (user as any)?.clubId, (user as any)?.clubName, (user as any)?.mainTeamId]);

  const handleRun = () => {
    try {
      const parsed = payload.trim() ? JSON.parse(payload) : null;
      setResult(JSON.stringify({ ok: true, title, payload: parsed, context: contextJson }, null, 2));
    } catch (e) {
      setResult(
        JSON.stringify(
          {
            ok: false,
            error: "Invalid JSON in payload",
            message: (e as any)?.message || String(e),
            context: contextJson,
          },
          null,
          2
        )
      );
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto space-y-4">
      <div className="rounded-xl border bg-white text-gray-900 p-4 sm:p-6">
        <div className="text-lg font-bold">Sandbox</div>
        <div className="mt-1 text-sm text-gray-600">
          管理画面内の簡易テスト用ページです（ログイン必須）。
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3">
          <div className="space-y-1">
            <div className="text-xs font-semibold text-gray-700">タイトル</div>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例: API疎通テスト" />
          </div>

          <div className="space-y-1">
            <div className="text-xs font-semibold text-gray-700">Payload（JSON）</div>
            <Textarea
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
              rows={10}
              className="font-mono text-xs"
              placeholder={'{\n  "foo": "bar"\n}'}
            />
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" onClick={handleRun}>
              実行
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setTitle("");
                setPayload("{");
                setResult("");
              }}
            >
              クリア
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white text-gray-900 p-4 sm:p-6">
        <div className="text-sm font-semibold">結果</div>
        <pre className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-gray-50 border p-3 text-xs leading-relaxed">
          {result || "(まだ実行していません)"}
        </pre>
      </div>

      <div className="rounded-xl border bg-white text-gray-900 p-4 sm:p-6">
        <div className="text-sm font-semibold">Auth context</div>
        <pre className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-gray-50 border p-3 text-xs leading-relaxed">
          {JSON.stringify(contextJson, null, 2)}
        </pre>
      </div>
    </div>
  );
}
