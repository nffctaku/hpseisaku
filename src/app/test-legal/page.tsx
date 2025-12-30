"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

export default function TestLegalPage() {
  const [checked, setChecked] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#e6f7ff] via-[#eaf6ff] to-white text-slate-900">
      <div className="container mx-auto px-4 py-8 space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl sm:text-3xl font-bold">法務ページ表示テスト</h1>
          <div className="flex gap-2">
            <Link href="/terms" target="_blank" rel="noreferrer" className="underline text-sm">
              /terms を開く
            </Link>
            <Link href="/privacy" target="_blank" rel="noreferrer" className="underline text-sm">
              /privacy を開く
            </Link>
            <Link href="/tokusho" target="_blank" rel="noreferrer" className="underline text-sm">
              /tokusho を開く
            </Link>
          </div>
        </div>

        <div className="rounded-lg border border-sky-200 bg-white/80 p-4 shadow-sm">
          <div className="text-sm font-semibold mb-3">同意UIプレビュー（見た目・挙動確認用）</div>
          <div className="space-y-3 text-sm text-slate-700">
            <div className="flex items-start gap-3">
              <Checkbox
                checked={checked}
                onCheckedChange={(v) => setChecked(Boolean(v))}
                className="border-sky-400 bg-white data-[state=checked]:bg-sky-600 data-[state=checked]:text-white"
              />
              <p className="leading-relaxed">
                <span> </span>
                <Link href="/terms" className="underline text-sky-700 hover:text-sky-800" target="_blank" rel="noreferrer">
                  利用規約
                </Link>
                <span>と</span>
                <Link href="/privacy" className="underline text-sky-700 hover:text-sky-800" target="_blank" rel="noreferrer">
                  プライバシーポリシー
                </Link>
                <span>に同意します。</span>
              </p>
            </div>

            <Button type="button" className="w-full sm:w-auto" disabled={!checked} onClick={() => {}}>
              HP作成を始める
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-lg overflow-hidden border border-sky-200 bg-white/80 shadow-sm">
            <div className="px-4 py-2 border-b border-sky-200 text-sm font-semibold">利用規約（/terms）</div>
            <iframe title="terms" src="/terms" className="w-full h-[80vh] bg-white" />
          </div>
          <div className="rounded-lg overflow-hidden border border-sky-200 bg-white/80 shadow-sm">
            <div className="px-4 py-2 border-b border-sky-200 text-sm font-semibold">プライバシーポリシー（/privacy）</div>
            <iframe title="privacy" src="/privacy" className="w-full h-[80vh] bg-white" />
          </div>
        </div>

        <div className="text-center">
          <Link href="/" className="text-sm text-slate-600 hover:text-slate-900 underline">
            トップページに戻る
          </Link>
        </div>
      </div>
    </div>
  );
}
