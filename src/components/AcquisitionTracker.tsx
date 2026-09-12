"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  captureAcquisitionFromUrl,
  markSampleViewedInStorage,
  SAMPLE_CLUB_ID,
  trackEvent,
} from "@/lib/analytics";

export function AcquisitionTracker() {
  const pathname = usePathname();
  const trackedRef = useRef<string | null>(null);

  useEffect(() => {
    captureAcquisitionFromUrl();
  }, []);

  useEffect(() => {
    if (!pathname) return;
    const normalized = pathname.replace(/^\//, "");
    if (normalized === SAMPLE_CLUB_ID && trackedRef.current !== normalized) {
      trackedRef.current = normalized;
      markSampleViewedInStorage();
      void trackEvent("sample_view", null, { path: pathname });
    }
  }, [pathname]);

  return null;
}
