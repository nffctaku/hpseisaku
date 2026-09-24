"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { auth } from "@/lib/firebase";
import { ADMIN_UIDS } from "@/lib/admin-config";
import { UPDATE_CATEGORIES, categoryClassName, type UpdateItem, type UpdateStatus } from "@/lib/updates";
import { ImageUploader } from "@/components/image-uploader";
import { UpdateBody } from "@/components/update-body";
import { Loader2, Plus, Eye, EyeOff, Pencil, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

type FormState = {
  id: string | null;
  title: string;
  category: string;
  body: string;
  imageUrl: string;
  linkUrl: string;
  linkLabel: string;
  publishedAt: string;
  status: UpdateStatus;
};

function todayJst(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());
}

const emptyForm = (): FormState => ({
  id: null,
  title: "",
  category: "新機能",
  body: "",
  imageUrl: "",
  linkUrl: "",
  linkLabel: "",
  publishedAt: todayJst(),
  status: "draft",
});

async function apiFetch(path: string, init?: RequestInit) {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(path, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export default function InternalUpdatesPage() {
  const { user, loading } = useAuth();
  const isAdmin = !!user && ADMIN_UIDS.includes(user.uid);

  const [items, setItems] = useState<UpdateItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const loadItems = useCallback(async () => {
    setListLoading(true);
    try {
      const { ok, data } = await apiFetch("/api/admin/updates");
      if (ok && Array.isArray(data.items)) setItems(data.items);
      else if (!ok) toast.error(data?.message || "一覧の取得に失敗しました。");
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) loadItems();
  }, [isAdmin, loadItems]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const insertSyntax = (build: (selected: string) => string) => {
    const el = bodyRef.current;
    const start = el?.selectionStart ?? form.body.length;
    const end = el?.selectionEnd ?? start;
    const snippet = build(form.body.slice(start, end));
    const next = form.body.slice(0, start) + snippet + form.body.slice(end);
    set("body", next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + snippet.length, start + snippet.length);
    });
  };

  const insertAtLineStart = (prefix: string, placeholder: string) =>
    insertSyntax((selected) => {
      const text = selected || placeholder;
      return `\n${prefix}${text}\n`;
    });

  const save = async (status: UpdateStatus) => {
    if (saving) return;
    setSaving(true);
    try {
      const payload = { ...form, status, id: undefined };
      const result = form.id
        ? await apiFetch(`/api/admin/updates/${form.id}`, { method: "PATCH", body: JSON.stringify(payload) })
        : await apiFetch("/api/admin/updates", { method: "POST", body: JSON.stringify(payload) });
      if (result.ok) {
        toast.success(status === "published" ? "公開しました。" : "下書きを保存しました。");
        setForm(emptyForm());
        setShowPreview(false);
        await loadItems();
      } else {
        toast.error(result.data?.message || "保存に失敗しました。入力内容は保持されています。");
      }
    } catch {
      toast.error("保存に失敗しました。入力内容は保持されています。");
    } finally {
      setSaving(false);
    }
  };

  const unpublish = async (item: UpdateItem) => {
    if (saving) return;
    setSaving(true);
    try {
      const { ok, data } = await apiFetch(`/api/admin/updates/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: item.title,
          body: item.body,
          category: item.category,
          imageUrl: item.imageUrl ?? "",
          linkUrl: item.linkUrl ?? "",
          linkLabel: item.linkLabel ?? "",
          publishedAt: item.date.replace(/\./g, "-"),
          status: "draft",
        }),
      });
      if (ok) {
        toast.success("非公開にしました。");
        await loadItems();
      } else {
        toast.error(data?.message || "非公開化に失敗しました。");
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item: UpdateItem) => {
    if (!window.confirm(`「${item.title}」を削除しますか？この操作は取り消せません。`)) return;
    setDeleting(item.id);
    try {
      const { ok, data } = await apiFetch(`/api/admin/updates/${item.id}`, { method: "DELETE" });
      if (ok) {
        toast.success("削除しました。");
        if (form.id === item.id) setForm(emptyForm());
        await loadItems();
      } else {
        toast.error(data?.message || "削除に失敗しました。");
      }
    } finally {
      setDeleting(null);
    }
  };

  const startEdit = (item: UpdateItem) => {
    setForm({
      id: item.id,
      title: item.title,
      category: item.category,
      body: item.body,
      imageUrl: item.imageUrl ?? "",
      linkUrl: item.linkUrl ?? "",
      linkLabel: item.linkLabel ?? "",
      publishedAt: item.date.replace(/\./g, "-"),
      status: item.status,
    });
    setShowPreview(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>アクセス権限がありません</p>
      </div>
    );
  }

  const inputCls =
    "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none";
  const editingPublished = form.id && form.status === "published";

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-black text-gray-900">お知らせ管理</h1>
        <div className="flex items-center gap-3 text-xs font-bold">
          <Link href="/admin/internal-analytics" className="text-emerald-600 hover:text-emerald-700">内部 Analytics</Link>
          <Link href="/admin/internal-clubs" className="text-emerald-600 hover:text-emerald-700">ユーザーHP 一覧</Link>
        </div>
      </div>
      <p className="mt-1 text-xs text-gray-500">
        公開するとトップページ「運営からのお知らせ」と /updates に反映されます。
      </p>

      {/* ---------- 編集フォーム ---------- */}
      <section className="mt-6 rounded-xl border border-gray-200 bg-white p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black text-gray-800">
            {form.id ? "お知らせを編集" : "新規作成"}
          </h2>
          {form.id ? (
            <button
              type="button"
              onClick={() => { setForm(emptyForm()); setShowPreview(false); }}
              className="text-xs font-bold text-gray-500 underline"
            >
              新規作成に戻る
            </button>
          ) : null}
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-bold text-gray-600">タイトル（必須）</label>
            <input className={inputCls} value={form.title} onChange={(e) => set("title", e.target.value)} maxLength={200} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-bold text-gray-600">カテゴリ</label>
              <select className={inputCls} value={form.category} onChange={(e) => set("category", e.target.value)}>
                {UPDATE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-gray-600">公開日</label>
              <input type="date" className={inputCls} value={form.publishedAt} onChange={(e) => set("publishedAt", e.target.value)} />
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="block text-xs font-bold text-gray-600">本文（必須）</label>
              <div className="flex gap-1">
                <button type="button" onClick={() => insertAtLineStart("## ", "見出し")} className="rounded border border-gray-300 px-2 py-0.5 text-[10px] font-bold text-gray-600 hover:bg-gray-100">見出し</button>
                <button type="button" onClick={() => insertAtLineStart("- ", "項目")} className="rounded border border-gray-300 px-2 py-0.5 text-[10px] font-bold text-gray-600 hover:bg-gray-100">箇条書き</button>
                <button type="button" onClick={() => insertSyntax((sel) => `[${sel || "リンク表示名"}](https://)`)} className="rounded border border-gray-300 px-2 py-0.5 text-[10px] font-bold text-gray-600 hover:bg-gray-100">リンク</button>
              </div>
            </div>
            <textarea
              ref={bodyRef}
              className={`${inputCls} min-h-[180px] font-mono`}
              value={form.body}
              onChange={(e) => set("body", e.target.value)}
              placeholder={"本文を入力してください。\n\n## 見出し\n- 箇条書き\n[リンク名](https://example.com)"}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-gray-600">画像（任意）</label>
            <ImageUploader value={form.imageUrl} onChange={(url) => set("imageUrl", url)} cropWidth={1200} cropHeight={675} cropTitle="お知らせ画像をトリミング" />
            {form.imageUrl ? (
              <button type="button" onClick={() => set("imageUrl", "")} className="mt-1 text-xs font-bold text-rose-500 underline">
                画像を解除
              </button>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-bold text-gray-600">関連リンクURL（任意）</label>
              <input className={inputCls} value={form.linkUrl} onChange={(e) => set("linkUrl", e.target.value)} placeholder="https://" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-gray-600">リンク表示名（任意）</label>
              <input className={inputCls} value={form.linkLabel} onChange={(e) => set("linkLabel", e.target.value)} placeholder="詳細はこちら" maxLength={60} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4">
            <button
              type="button"
              disabled={saving}
              onClick={() => save("draft")}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-black text-gray-700 hover:bg-gray-100 disabled:opacity-50"
            >
              {saving ? <Loader2 className="inline h-4 w-4 animate-spin" /> : editingPublished ? "下書きに戻す" : "下書き保存"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => save("published")}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="inline h-4 w-4 animate-spin" /> : editingPublished ? "更新" : "公開する"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => setShowPreview((v) => !v)}
              className="ml-auto flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100"
            >
              {showPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              プレビュー
            </button>
          </div>

          {showPreview ? (
            <div className="rounded-xl bg-[#08111f] p-5 text-slate-100">
              <div className="flex flex-wrap items-center gap-3">
                <time className="font-mono text-xs text-sky-300/55">{form.publishedAt.replace(/-/g, ".")}</time>
                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${categoryClassName(form.category)}`}>
                  {form.category}
                </span>
              </div>
              <h3 className="mt-4 text-2xl font-black tracking-[-0.03em] text-white">{form.title || "（タイトル未入力）"}</h3>
              {form.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.imageUrl} alt="" className="mt-4 w-full rounded-lg border border-slate-700 object-contain" />
              ) : null}
              <div className="mt-5">
                <UpdateBody body={form.body || "（本文未入力）"} />
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {/* ---------- 一覧 ---------- */}
      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black text-gray-800">投稿一覧</h2>
          <button type="button" onClick={loadItems} disabled={listLoading} className="text-xs font-bold text-gray-500 underline disabled:opacity-50">
            再読み込み
          </button>
        </div>
        {listLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
        ) : items.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">投稿はまだありません。</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {items.map((item) => (
              <li key={item.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-black ${categoryClassName(item.category)}`}>
                    {item.category}
                  </span>
                  <time className="font-mono text-xs text-gray-500">{item.date}</time>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${item.status === "published" ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-600"}`}>
                    {item.status === "published" ? "公開中" : "下書き"}
                  </span>
                </div>
                <p className="mt-2 text-sm font-black text-gray-900">{item.title}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => startEdit(item)} className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-100">
                    <Pencil className="h-3 w-3" />編集
                  </button>
                  {item.status === "published" ? (
                    <>
                      <a href={`/updates/${item.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-100">
                        <ExternalLink className="h-3 w-3" />公開ページ
                      </a>
                      <button type="button" disabled={saving} onClick={() => unpublish(item)} className="flex items-center gap-1 rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-bold text-amber-700 hover:bg-amber-50 disabled:opacity-50">
                        <EyeOff className="h-3 w-3" />非公開にする
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    disabled={deleting === item.id}
                    onClick={() => remove(item)}
                    className="flex items-center gap-1 rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                  >
                    {deleting === item.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}削除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
