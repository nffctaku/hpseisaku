'use client';

import React, { useEffect, useMemo, useRef } from 'react';

type Props = {
  id?: string;
  className?: string;
  children: React.ReactNode;
  settleMs?: number;
};

export function SnapPager({ id, className, children, settleMs = 120 }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  const settleMsStable = useMemo(() => {
    const n = Number(settleMs);
    if (!Number.isFinite(n) || n < 0) return 120;
    return n;
  }, [settleMs]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let settleTimer: number | null = null;
    let rafId: number | null = null;

    const getSnapLefts = (): number[] => {
      const children = Array.from(el.children) as HTMLElement[];
      return children
        .map((c) => c.offsetLeft)
        .filter((x) => Number.isFinite(x))
        .sort((a, b) => a - b);
    };

    const snapToNearest = (behavior: ScrollBehavior) => {
      const lefts = getSnapLefts();
      if (lefts.length <= 1) return;

      const current = el.scrollLeft;
      let nearest = lefts[0];
      let best = Math.abs(current - nearest);
      for (let i = 1; i < lefts.length; i += 1) {
        const d = Math.abs(current - lefts[i]);
        if (d < best) {
          best = d;
          nearest = lefts[i];
        }
      }

      if (best < 1) return;
      if (rafId != null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        el.scrollTo({ left: nearest, behavior });
      });
    };

    const scheduleSettleSnap = () => {
      if (settleTimer != null) window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        snapToNearest('smooth');
      }, settleMsStable);
    };

    const onScroll = () => {
      scheduleSettleSnap();
    };

    const onPointerUp = () => {
      snapToNearest('smooth');
    };

    const onTouchEnd = () => {
      snapToNearest('smooth');
    };

    const onResize = () => {
      snapToNearest('auto');
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('pointerup', onPointerUp, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('resize', onResize);

    return () => {
      el.removeEventListener('scroll', onScroll as any);
      el.removeEventListener('pointerup', onPointerUp as any);
      el.removeEventListener('touchend', onTouchEnd as any);
      window.removeEventListener('resize', onResize);
      if (settleTimer != null) window.clearTimeout(settleTimer);
      if (rafId != null) cancelAnimationFrame(rafId);
    };
  }, [settleMsStable]);

  return (
    <div id={id} ref={ref} className={className}>
      {children}
    </div>
  );
}
