"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics";
import { auth } from "@/lib/firebase";

export function TrophyRoomViewTracker({ careerId, clubUid, clubProfileId }: { careerId?: string | null; clubUid?: string | null; clubProfileId?: string | null }) {
  useEffect(() => {
    void trackEvent("trophy_room_public_view", auth.currentUser?.uid ?? null, {
      careerId: careerId ?? undefined,
      clubUid: clubUid ?? undefined,
      clubProfileId: clubProfileId ?? undefined,
      source: "public_trophy_room",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
