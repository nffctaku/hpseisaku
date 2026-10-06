"use client";

import { useParams, useSearchParams } from "next/navigation";
import { A3Editor } from "./A3Editor";
import { toSlashSeason } from "@/lib/season";

export default function TeamBookletA3EditorPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const teamId = params.teamId as string;
  const season = toSlashSeason((searchParams.get("season") || "").trim());
  return <A3Editor teamId={teamId} season={season} />;
}
