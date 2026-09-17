const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MIN_LENGTH = 3;
const MAX_LENGTH = 40;

export const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "login",
  "logout",
  "register",
  "auth",
  "public",
  "clubs",
  "teams",
  "players",
  "matches",
  "competitions",
  "seasons",
  "design",
  "profile",
  "mypage",
  "settings",
  "create-club",
  "internal-clubs",
  "terms",
  "privacy",
  "tokusho",
  "test-legal",
  "updates",
  "wc2026",
  "_next",
  "static",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
]);

export function normalizeSlug(value: string): string {
  let normalized = value.trim().toLowerCase();

  // 完全な URL を貼り付けられた場合、末尾のスラグだけを抽出
  const wasUrl = /^https?:\/\//.test(normalized);
  normalized = normalized.replace(/^https?:\/\//, '');

  if (wasUrl) {
    // クエリ・フラグメント以降を除去
    normalized = normalized.split('?')[0].split('#')[0];
    const segments = normalized.split('/').filter(Boolean);
    normalized = segments[segments.length - 1] ?? '';
  }

  // 先頭・末尾のスラッシュを除去
  normalized = normalized.replace(/^\/+|\/+$/g, '');

  return normalized;
}

export interface SlugValidationResult {
  ok: boolean;
  message?: string;
  slug: string;
}

export function validateSlug(value: string, options?: { currentSlug?: string; forbiddenValues?: string[] }): SlugValidationResult {
  const slug = normalizeSlug(value);
  const raw = value.trim();

  if (slug === "" && raw === "") {
    return { ok: false, message: "URLを入力してください", slug };
  }

  // 1. 既存URLとの完全一致はそのまま許可（大文字・小文字混在の既存UID URLを維持）
  if (options?.currentSlug && raw === options.currentSlug) {
    return { ok: true, slug: raw };
  }

  // 2. 内部UIDの新規使用を拒否
  if (options?.forbiddenValues?.length) {
    const normalizedForbidden = options.forbiddenValues.map((v) => v.toLowerCase());
    if (normalizedForbidden.includes(slug) || normalizedForbidden.includes(raw.toLowerCase())) {
      return { ok: false, message: "内部IDは公開URLとして使用できません", slug };
    }
  }

  // 3. 同一URLの表記揺れ（大文字小文字）は正規化して許可
  if (options?.currentSlug && slug === options.currentSlug) {
    return { ok: true, slug };
  }

  if (slug.length < MIN_LENGTH) {
    return { ok: false, message: `URLは${MIN_LENGTH}文字以上で入力してください`, slug };
  }

  if (slug.length > MAX_LENGTH) {
    return { ok: false, message: `URLは${MAX_LENGTH}文字以下で入力してください`, slug };
  }

  if (!SLUG_PATTERN.test(slug)) {
    return { ok: false, message: "使用できるのは半角小文字英数字とハイフンです。先頭と末尾にハイフンを使うことはできません", slug };
  }

  if (RESERVED_SLUGS.has(slug)) {
    return { ok: false, message: "このURLは予約語のため使用できません", slug };
  }

  return { ok: true, slug };
}
