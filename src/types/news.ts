import { Timestamp } from 'firebase/firestore';

export interface NewsArticle {
  id: string;
  title: string;
  content?: string;
  // note 記事への外部リンク（任意）
  noteUrl?: string;
  imageUrl?: string;
  category?: string;
  publishedAt: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
