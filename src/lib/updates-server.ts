import { db } from "@/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { ADMIN_UIDS } from "@/lib/admin-config";
import type { UpdateItem, UpdateStatus } from "@/lib/updates";
import { UPDATE_CATEGORIES, formatUpdateDate, plainExcerpt } from "@/lib/updates";

const COLLECTION = "app_updates";

export async function getOperatorUid(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const decoded = await getAuth().verifyIdToken(authHeader.substring(7));
    return ADMIN_UIDS.includes(decoded.uid) ? decoded.uid : null;
  } catch {
    return null;
  }
}

function toMillis(value: any): number {
  if (value?.toMillis && typeof value.toMillis === "function") return value.toMillis();
  if (value?.toDate && typeof value.toDate === "function") return value.toDate().getTime();
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof value === "number") return value;
  return 0;
}

export function docToUpdateItem(doc: FirebaseFirestore.DocumentSnapshot): UpdateItem {
  const data = (doc.data() ?? {}) as Record<string, any>;
  const body = typeof data.body === "string" ? data.body : "";
  const publishedAtMillis = toMillis(data.publishedAt) || toMillis(data.createdAt);
  // 既存ドキュメントには status が無いため、未設定は公開済みとして扱う
  const status: UpdateStatus = data.status === "draft" ? "draft" : "published";
  return {
    id: doc.id,
    title: typeof data.title === "string" ? data.title : "",
    body,
    description: plainExcerpt(body),
    category: typeof data.category === "string" && data.category ? data.category : "その他",
    imageUrl: typeof data.imageUrl === "string" && data.imageUrl ? data.imageUrl : undefined,
    linkUrl: typeof data.linkUrl === "string" && data.linkUrl ? data.linkUrl : undefined,
    linkLabel: typeof data.linkLabel === "string" && data.linkLabel ? data.linkLabel : undefined,
    date: formatUpdateDate(publishedAtMillis),
    publishedAtMillis,
    status,
  };
}

export async function listUpdates(): Promise<UpdateItem[]> {
  const snap = await db.collection(COLLECTION).orderBy("publishedAt", "desc").limit(200).get();
  const items = snap.docs.map(docToUpdateItem);
  items.sort((a, b) => b.publishedAtMillis - a.publishedAtMillis);
  return items;
}

export async function listPublishedUpdates(): Promise<UpdateItem[]> {
  const items = await listUpdates();
  return items.filter((item) => item.status === "published");
}

export async function getPublishedUpdate(id: string): Promise<UpdateItem | null> {
  const doc = await db.collection(COLLECTION).doc(id).get();
  if (!doc.exists) return null;
  const item = docToUpdateItem(doc);
  return item.status === "published" ? item : null;
}

function safeUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" || url.protocol === "http:" ? trimmed : "";
  } catch {
    return "";
  }
}

export function parseUpdatePayload(body: any): { data: Record<string, any> } | { error: string } {
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (!title) return { error: "タイトルは必須です。" };
  if (!text) return { error: "本文は必須です。" };
  if (title.length > 200) return { error: "タイトルは200文字以内で入力してください。" };
  if (text.length > 20000) return { error: "本文は20000文字以内で入力してください。" };

  const category =
    typeof body?.category === "string" && (UPDATE_CATEGORIES as readonly string[]).includes(body.category)
      ? body.category
      : "その他";

  let publishedAt = Timestamp.now();
  if (typeof body?.publishedAt === "string" && body.publishedAt.trim()) {
    const parsed = Date.parse(`${body.publishedAt.trim()}T00:00:00+09:00`);
    if (Number.isNaN(parsed)) return { error: "公開日の形式が正しくありません。" };
    publishedAt = Timestamp.fromMillis(parsed);
  }

  return {
    data: {
      title,
      body: text,
      category,
      imageUrl: safeUrl(body?.imageUrl) || null,
      linkUrl: safeUrl(body?.linkUrl) || null,
      linkLabel: typeof body?.linkLabel === "string" ? body.linkLabel.trim().slice(0, 60) || null : null,
      publishedAt,
      status: body?.status === "published" ? "published" : "draft",
    },
  };
}
