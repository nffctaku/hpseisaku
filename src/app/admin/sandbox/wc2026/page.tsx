"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Target, Users, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { auth } from "@/lib/firebase";
import {
  STORAGE_KEYS,
  clampScoreInput,
  resolveTeamAbbrev,
  safeParseJson,
  type GroupPredictions,
  type Match,
  type PredictionsByMatchId,
  type Team,
} from "./_components/model";

const MatchesTab = dynamic(() => import("./_components/matches-tab").then((m) => m.MatchesTab), { ssr: false });
const GroupsTab = dynamic(() => import("./_components/groups-tab").then((m) => m.GroupsTab), { ssr: false });

export default function Wc2026SandboxPage() {
  const [activeTab, setActiveTab] = useState<string>("matches");
  const [matchPredictions, setMatchPredictions] = useState<PredictionsByMatchId>({});
  const [groupPredictions, setGroupPredictions] = useState<GroupPredictions>({});
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [groups, setGroups] = useState<Record<string, Team[]> | null>(null);
  const [saving, setSaving] = useState(false);
  const debug = typeof window !== "undefined" && window.location.search.includes("debug=1");
  const [hydrated, setHydrated] = useState(false);
  const [bootStage, setBootStage] = useState<string>("init");
  const [bootError, setBootError] = useState<string | null>(null);
  const [bootEvents, setBootEvents] = useState<string[]>([]);

  const pushBootEvent = (msg: string) => {
    if (!debug) return;
    setBootEvents((prev) => {
      const next = [...prev, msg];
      return next.length > 30 ? next.slice(next.length - 30) : next;
    });
  };

  useEffect(() => {
    setBootStage("load-localstorage");
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
    setBootStage("hydrated");
    pushBootEvent("hydrated");
  }, []);

  useEffect(() => {
    let disposed = false;
    setBootStage("import-data");
    pushBootEvent("import-data:start");

    const timeoutId = window.setTimeout(() => {
      if (disposed) return;
      setBootError("データ読み込みがタイムアウトしました（端末側のJSエラー/チャンク取得失敗の可能性）");
      pushBootEvent("import-data:timeout");
    }, 10000);

    const run = async () => {
      try {
        const mod = await import("./_components/data");
        if (disposed) return;
        setMatches(mod.WC2026_MATCHES);
        setGroups(mod.WC2026_GROUPS);
        setBootStage("ready");
        pushBootEvent(`import-data:ok matches=${mod.WC2026_MATCHES.length}`);
      } catch (e) {
        console.error("[wc2026 sandbox] failed to load data", e);
        if (!disposed) {
          setBootError(String((e as any)?.message || e));
          setBootStage("error");
          pushBootEvent("import-data:error");
        }
      } finally {
        window.clearTimeout(timeoutId);
      }
    };
    void run();
    return () => {
      disposed = true;
      window.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    if (!debug) return;

    const onError = (event: ErrorEvent) => {
      const msg = event?.message || "(unknown error)";
      pushBootEvent(`window.error: ${msg}`);
      if (!bootError) setBootError(msg);
      setBootStage("error");
    };

    const onUnhandled = (event: PromiseRejectionEvent) => {
      const msg = String((event as any)?.reason?.message || (event as any)?.reason || "(unhandled rejection)");
      pushBootEvent(`unhandledrejection: ${msg}`);
      if (!bootError) setBootError(msg);
      setBootStage("error");
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandled);
    pushBootEvent("debug-listeners:on");

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandled);
    };
  }, [debug, bootError]);

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
          {bootError ? (
            <div className="rounded-lg border bg-white text-gray-900 p-4 text-sm space-y-2">
              <div className="font-bold">読み込みに失敗しました</div>
              <div className="text-xs text-gray-700 break-words whitespace-pre-wrap">{bootError}</div>
              {debug ? (
                <pre className="rounded-md border bg-gray-50 p-3 text-xs whitespace-pre-wrap break-words">{JSON.stringify({ bootStage, bootEvents }, null, 2)}</pre>
              ) : null}
            </div>
          ) : matches ? (
            <MatchesTab
              matches={matches}
              matchPredictions={matchPredictions}
              setMatchPredictions={setMatchPredictions}
              clampScoreInput={clampScoreInput}
              resolveTeamAbbrev={resolveTeamAbbrev}
            />
          ) : (
            <div className="rounded-lg border bg-white text-gray-900 p-4 text-sm">読み込み中...</div>
          )}
        </TabsContent>

        <TabsContent value="groups" className="mt-3">
          {bootError ? (
            <div className="rounded-lg border bg-white text-gray-900 p-4 text-sm space-y-2">
              <div className="font-bold">読み込みに失敗しました</div>
              <div className="text-xs text-gray-700 break-words whitespace-pre-wrap">{bootError}</div>
              {debug ? (
                <pre className="rounded-md border bg-gray-50 p-3 text-xs whitespace-pre-wrap break-words">{JSON.stringify({ bootStage, bootEvents }, null, 2)}</pre>
              ) : null}
            </div>
          ) : groups ? (
            <GroupsTab
              groups={groups}
              groupPredictions={groupPredictions}
              setGroupPredictions={setGroupPredictions}
              resolveTeamAbbrev={resolveTeamAbbrev}
              matchPredictions={matchPredictions}
            />
          ) : (
            <div className="rounded-lg border bg-white text-gray-900 p-4 text-sm">読み込み中...</div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
