"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

function scrollToSlide(container: HTMLElement, slide: HTMLElement) {
  const cRect = container.getBoundingClientRect();
  const sRect = slide.getBoundingClientRect();
  const left = sRect.left - cRect.left + container.scrollLeft;
  container.scrollTo({ left, behavior: "smooth" });
}

export function DesignTestPagerTabs({ targetId }: { targetId: string }) {
  const [active, setActive] = useState<1 | 2 | 3>(1);

  const getSlideLefts = useCallback((container: HTMLElement) => {
    const slides = [1, 2, 3]
      .map((idx) => container.querySelector(`[data-design-slide='${idx}']`) as HTMLElement | null)
      .filter(Boolean) as HTMLElement[];
    return slides.map((el) => ({
      idx: Number(el.getAttribute("data-design-slide")) as 1 | 2 | 3,
      left: el.offsetLeft,
    }));
  }, []);

  const jump = useCallback(
    (slideIndex: number) => {
      const container = document.getElementById(targetId);
      if (!container) return;
      const slide = container.querySelector(`[data-design-slide='${slideIndex}']`) as HTMLElement | null;
      if (!slide) return;
      scrollToSlide(container, slide);
    },
    [targetId]
  );

  useEffect(() => {
    const container = document.getElementById(targetId);
    if (!container) return;

    let raf = 0;
    const update = () => {
      const lefts = getSlideLefts(container);
      if (lefts.length === 0) return;

      const pos = container.scrollLeft;
      let best = lefts[0];
      let bestDist = Math.abs(pos - best.left);
      for (const p of lefts) {
        const d = Math.abs(pos - p.left);
        if (d < bestDist) {
          best = p;
          bestDist = d;
        }
      }
      setActive(best.idx);
    };

    const onScroll = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };

    update();
    container.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      container.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", update);
    };
  }, [getSlideLefts, targetId]);

  const baseBtn = useMemo(
    () =>
      "flex-1 min-w-0 px-2 py-1.5 text-[10px] font-semibold whitespace-nowrap text-center transition-colors",
    []
  );

  const btnClass = useCallback(
    (idx: 1 | 2 | 3) => {
      if (active === idx) return `${baseBtn} bg-blue-600 text-white`;
      return `${baseBtn} text-white/90 hover:bg-white/10`;
    },
    [active, baseBtn]
  );

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-white/15 bg-white/5">
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={() => jump(1)}
          className={btnClass(1)}
        >
          基本情報
        </button>
        <div className="w-px bg-white/15" aria-hidden="true" />
        <button
          type="button"
          onClick={() => jump(2)}
          className={btnClass(2)}
        >
          試合スタッツ
        </button>
        <div className="w-px bg-white/15" aria-hidden="true" />
        <button
          type="button"
          onClick={() => jump(3)}
          className={btnClass(3)}
        >
          シーズンスタッツ
        </button>
      </div>
    </div>
  );
}
