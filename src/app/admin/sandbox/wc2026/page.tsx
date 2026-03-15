"use client";

import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Target, Users, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { WC2026_GROUPS, WC2026_MATCHES } from "./_components/data";
import { GroupsTab } from "./_components/groups-tab";
import { MatchesTab } from "./_components/matches-tab";
import { auth } from "@/lib/firebase";
import {
  STORAGE_KEYS,
  clampScoreInput,
  resolveTeamAbbrev,
  safeParseJson,
  type GroupPredictions,
  type PredictionsByMatchId,
} from "./_components/model";

export default function Wc2026SandboxPage() {
  const [activeTab, setActiveTab] = useState<string>("matches");
  const [matchPredictions, setMatchPredictions] = useState<PredictionsByMatchId>({});
  const [groupPredictions, setGroupPredictions] = useState<GroupPredictions>({});
  const [saving, setSaving] = useState(false);
  const debug = typeof window !== "undefined" && window.location.search.includes("debug=1");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const rawMatch = localStorage.getItem(STORAGE_KEYS.match);
    const rawGroup = localStorage.getItem(STORAGE_KEYS.group);
    const fromStorageMatch = safeParseJson<PredictionsByMatchId>(rawMatch);
    const fromStorageGroup = safeParseJson<GroupPredictions>(rawGroup);

    if (debug) {
      console.log("[wc2026 sandbox] load", {
        matchKey: STORAGE_KEYS.match,
        matchLen: rawMatch?.length ?? 0,
        groupKey: STORAGE_KEYS.group,
        groupLen: rawGroup?.length ?? 0,
      });
    }

    if (fromStorageMatch && typeof fromStorageMatch === "object") {
      setMatchPredictions(fromStorageMatch);
    } else if (rawMatch) {
      console.error("[wc2026 sandbox] failed to parse match predictions", { key: STORAGE_KEYS.match, raw: rawMatch });
    }
    if (fromStorageGroup && typeof fromStorageGroup === "object") {
      setGroupPredictions(fromStorageGroup);
    } else if (rawGroup) {
      console.error("[wc2026 sandbox] failed to parse group predictions", { key: STORAGE_KEYS.group, raw: rawGroup });
    }

    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      const json = JSON.stringify(matchPredictions);
      localStorage.setItem(STORAGE_KEYS.match, json);
      if (debug) {
        const roundtrip = localStorage.getItem(STORAGE_KEYS.match);
        console.log("[wc2026 sandbox] saved match", {
          key: STORAGE_KEYS.match,
          len: json.length,
          ok: roundtrip === json,
        });
      }
    } catch (e) {
      console.error("[wc2026 sandbox] failed to save match predictions", e);
    }
  }, [matchPredictions]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      const json = JSON.stringify(groupPredictions);
      localStorage.setItem(STORAGE_KEYS.group, json);
      if (debug) {
        const roundtrip = localStorage.getItem(STORAGE_KEYS.group);
        console.log("[wc2026 sandbox] saved group", {
          key: STORAGE_KEYS.group,
          len: json.length,
          ok: roundtrip === json,
        });
      }
    } catch (e) {
      console.error("[wc2026 sandbox] failed to save group predictions", e);
    }
  }, [groupPredictions]);

  const handleReset = () => {
    try {
      localStorage.removeItem(STORAGE_KEYS.match);
      localStorage.removeItem(STORAGE_KEYS.group);
    } catch {
    }
    setMatchPredictions({});
    setGroupPredictions({});
  };

  const handleSaveToFirestore = async () => {
    if (!auth.currentUser) {
      toast.error("ログインしていません");
      return;
    }
    setSaving(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch("/api/wc2026/predictions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ matchPredictions, groupPredictions }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error((data as any)?.message || "保存に失敗しました");
      }
      toast.success("Firestoreに保存しました");
    } catch (e: any) {
      toast.error(e?.message || "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <div className="text-2xl font-bold tracking-tight">W杯2026 予想プラットフォーム</div>
          <div className="mt-1 text-sm text-gray-400">テストページ（/admin/sandbox/wc2026）</div>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={handleSaveToFirestore} disabled={saving}>
            Firestoreに保存
          </Button>
          <Button type="button" variant="outline" onClick={handleReset} className="gap-2">
            <RotateCcw className="h-4 w-4" />
            状態リセット
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="matches" className="gap-2">
            <Target className="h-4 w-4" />
            試合予想
          </TabsTrigger>
          <TabsTrigger value="groups" className="gap-2">
            <Users className="h-4 w-4" />
            GS突破予想
          </TabsTrigger>
        </TabsList>

        <TabsContent value="matches" className="mt-3">
          <MatchesTab
            matches={WC2026_MATCHES}
            matchPredictions={matchPredictions}
            setMatchPredictions={setMatchPredictions}
            clampScoreInput={clampScoreInput}
            resolveTeamAbbrev={resolveTeamAbbrev}
          />
        </TabsContent>

        <TabsContent value="groups" className="mt-3">
          <GroupsTab
            groups={WC2026_GROUPS}
            groupPredictions={groupPredictions}
            setGroupPredictions={setGroupPredictions}
            resolveTeamAbbrev={resolveTeamAbbrev}
            matchPredictions={matchPredictions}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
