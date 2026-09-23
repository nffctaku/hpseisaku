"use client";

// ニュース画像のフォールバック表示。
// 表示順: imageUrl → クラブロゴ → /favicon.png
// src未設定・読み込み失敗時は次の候補へ自動で切り替える。

import Image from "next/image";
import { useMemo, useState } from "react";

interface NewsImageProps {
  /** 記事画像URL（空の場合は最初からフォールバック） */
  src?: string | null;
  /** クラブロゴURL（フォールバック第1候補） */
  logoUrl?: string | null;
  alt: string;
  /** 通常時のclassName（例: object-cover ...） */
  className?: string;
  /** フォールバック時のclassName（例: object-contain p-8） */
  fallbackClassName?: string;
  sizes?: string;
  quality?: number;
  priority?: boolean;
}

export function NewsImage({
  src,
  logoUrl,
  alt,
  className,
  fallbackClassName,
  sizes,
  quality,
  priority,
}: NewsImageProps) {
  const candidates = useMemo(() => {
    const list: string[] = [];
    if (src) list.push(src);
    if (logoUrl) list.push(logoUrl);
    list.push("/favicon.png");
    return list;
  }, [src, logoUrl]);

  const [idx, setIdx] = useState(0);
  const safeIdx = Math.min(idx, candidates.length - 1);
  const isFallback = safeIdx > 0 || !src;

  return (
    <Image
      src={candidates[safeIdx]}
      alt={isFallback ? "No image available" : alt}
      fill
      className={isFallback && fallbackClassName ? fallbackClassName : className}
      sizes={sizes}
      quality={quality}
      priority={priority}
      onError={() => setIdx((v) => v + 1)}
    />
  );
}
