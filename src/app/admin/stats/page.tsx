"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function StatsPage() {
  const router = useRouter();

  useEffect(() => {
    // 統合後は /admin/records に集約
    router.replace("/admin/records");
  }, [router]);

  return null;
}
