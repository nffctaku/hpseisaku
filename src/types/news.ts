import { Timestamp } from 'firebase/firestore';

export type NewsCreationMethod = "manual" | "external" | "ai_match";

export interface NewsArticle {
  id: string;
  title: string;
  content?: string;
  // note 記事への外部リンク（任意）
  noteUrl?: string;
  imageUrl?: string;
  likeCount?: number;
  category?: string;
  // トップのスライドに表示するかどうか
  featuredInHero?: boolean;
  // 公開状態（未設定は下書きとして扱う）
  status?: "draft" | "published";
  publishedAt: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  // 記事作成方法と元試合ID（AI生成時に利用）
  creationMethod?: NewsCreationMethod;
  sourceMatchId?: string;
}
