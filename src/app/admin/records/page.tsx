"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function TeamRecordsPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/admin/analysis");
  }, [router]);

  return (
    null
  );
}
