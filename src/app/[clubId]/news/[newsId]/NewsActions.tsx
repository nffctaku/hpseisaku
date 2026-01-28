'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Heart, Share2 } from 'lucide-react';

function getOrCreateVisitorId(): string {
  if (typeof window === 'undefined') return '';
  const key = 'fc_visitor_id';
  const existing = window.localStorage.getItem(key);
  if (existing && existing.trim().length > 0) return existing;
  const created = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  window.localStorage.setItem(key, created);
  return created;
}

export default function NewsActions({
  clubId,
  newsId,
  title,
  initialLikeCount,
}: {
  clubId: string;
  newsId: string;
  title: string;
  initialLikeCount: number;
}) {
  const storageKey = useMemo(() => `news_like_${clubId}_${newsId}`, [clubId, newsId]);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [shareUrl, setShareUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setShareUrl(window.location.href);
    setLiked(window.localStorage.getItem(storageKey) === '1');
  }, [storageKey]);

  const tweetHref = useMemo(() => {
    if (!shareUrl) return 'https://twitter.com/intent/tweet';
    const qs = new URLSearchParams();
    qs.set('url', shareUrl);
    qs.set('text', title);
    return `https://twitter.com/intent/tweet?${qs.toString()}`;
  }, [shareUrl, title]);

  async function toggleLike() {
    if (isSubmitting) return;
    setIsSubmitting(true);

    const prevLiked = liked;
    const nextLiked = !prevLiked;
    setLiked(nextLiked);
    setLikeCount((c) => Math.max(0, c + (nextLiked ? 1 : -1)));

    try {
      const visitorId = getOrCreateVisitorId();
      const res = await fetch('/api/news/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clubId, newsId, visitorId }),
      });

      if (!res.ok) {
        throw new Error(`Request failed: ${res.status}`);
      }

      const data = (await res.json()) as { likeCount: number; liked: boolean };
      setLiked(Boolean(data.liked));
      setLikeCount(typeof data.likeCount === 'number' ? data.likeCount : likeCount);

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(storageKey, data.liked ? '1' : '0');
      }
    } catch {
      setLiked(prevLiked);
      setLikeCount((c) => Math.max(0, c + (prevLiked ? 1 : -1)));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button asChild variant="outline" size="sm">
        <a href={tweetHref} target="_blank" rel="noopener noreferrer" aria-label="Xでシェア">
          <Share2 />
          Xでシェア
        </a>
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={toggleLike}
        disabled={isSubmitting}
        aria-label="いいね"
        className={liked ? 'border-red-500 text-red-500 hover:bg-red-500/10' : undefined}
      >
        <Heart className={liked ? 'fill-red-500 text-red-500' : undefined} />
        {likeCount}
      </Button>
    </div>
  );
}
