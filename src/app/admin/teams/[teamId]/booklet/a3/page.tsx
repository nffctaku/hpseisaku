"use client";

import { useParams, useSearchParams } from "next/navigation";
import { A3Editor } from "./A3Editor";

export default function TeamBookletA3EditorPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const teamId = params.teamId as string;
  const season = (searchParams.get("season") || "").trim();
  return <A3Editor teamId={teamId} season={season} />;
}
