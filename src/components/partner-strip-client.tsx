"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

type PartnerStripItem = {
  id: string;
  name: string;
  logoUrl?: string;
  linkUrl?: string;
};

export function PartnerStripClient(props: { clubId: string; className?: string }) {
  const { clubId, className } = props;
  const [items, setItems] = useState<PartnerStripItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch(`/api/public/club/${encodeURIComponent(clubId)}/partners-strip`, {
          method: "GET",
        });
        if (!res.ok) return;
        const json = (await res.json()) as any;
        const list = Array.isArray(json?.partners) ? (json.partners as any[]) : [];
        const normalized = list
          .map((p) => ({
            id: String(p?.id || ""),
            name: String(p?.name || ""),
            logoUrl: typeof p?.logoUrl === "string" ? p.logoUrl : "",
            linkUrl: typeof p?.linkUrl === "string" ? p.linkUrl : "",
          }))
          .filter((p) => p.id && p.name);

        if (cancelled) return;
        setItems(normalized);
      } catch {
        // ignore
      }
    };

    if (clubId) void run();

    return () => {
      cancelled = true;
    };
  }, [clubId]);

  if (!items || items.length === 0) return null;

  return (
    <div className={className}>
      <div className="w-full bg-white">
        <div className="container mx-auto px-4 py-8">
          <div className="relative flex items-center justify-end gap-3">
            <div className="absolute left-1/2 -translate-x-1/2 text-gray-900 font-black tracking-wide">PARTNER</div>
            <div />
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            {items.map((p) => {
              const card = (
                <div className="w-32 rounded-md bg-white p-2 h-16 flex items-center justify-center">
                  {p.logoUrl ? (
                    <div className="relative w-full h-full">
                      <Image src={p.logoUrl} alt={p.name} fill className="object-contain" />
                    </div>
                  ) : (
                    <div className="text-[11px] font-semibold text-gray-900 text-center line-clamp-2">
                      {p.name}
                    </div>
                  )}
                </div>
              );

              if (p.linkUrl) {
                return (
                  <Link
                    key={p.id}
                    href={p.linkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    {card}
                  </Link>
                );
              }

              return <div key={p.id}>{card}</div>;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
