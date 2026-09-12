"use client";

import { useState } from "react";
import { auth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

interface Coverage {
  total: number;
  covered: number;
  uncovered: number;
  rate: number;
}

interface DiagnosticsResponse {
  auth: {
    totalUsers: number;
    duplicatedEmailCount: number;
    sameEmailDifferentUid: number;
    sameUidMultipleProfiles: number;
    sameUidMultipleProfilesNote: string;
    duplicatedEmails: Record<string, string[]>;
  };
  profiles: {
    total: number;
    uniqueOwnerUids: number;
    singleProfileOwners: number;
    duplicateProfileOwners: number;
    extraProfilesCount: number;
    authWithProfile: number;
    authWithoutProfile: number;
    profileOwnershipRate: number;
  };
  duplicatePatterns: {
    A: number;
    B: number;
    C: number;
    D: number;
    E: number;
    labels: Record<string, string>;
  };
  unavailableReasonByUser: Record<string, number>;
  unavailableReasonByProfile: Record<string, number>;
  representativeCandidates: number;
  clubProfileIdCoverage: Record<string, Coverage>;
  dataIntegrity: {
    totalProfiles: number;
    validOwnedProfiles: number;
    normalProfiles: number;
    extraProfilesCount: number;
    ownerNotInAuth: { distinctUids: number; profileCount: number };
    missing: number;
    empty: number;
    nullUids: number;
    nonString: number;
    check: number;
    authBasedReconciliation: {
      authTotal: number;
      authWithProfile: number;
      authWithoutProfile: number;
      unaccounted: number;
    };
  };
  users: Record<string, unknown>[] | null;
}

export default function ClubProfileDiagnosticsPage() {
  const [result, setResult] = useState<DiagnosticsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDiagnostics = async () => {
    setLoading(true);
    setError(null);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        setError("ログインしていません。");
        return;
      }
      const token = await currentUser.getIdToken();
      const res = await fetch("/api/admin/club-profile-diagnostics", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        setError(String(body.message) || `HTTP ${res.status}`);
        return;
      }
      const data = (await res.json()) as DiagnosticsResponse;
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "診断APIの呼び出しに失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  const renderCoverage = (label: string, c: Coverage) => (
    <div key={label} className="grid grid-cols-4 gap-2 text-sm py-1 border-b border-slate-700">
      <span className="text-slate-200">{label}</span>
      <span className="text-right text-emerald-400">{c.covered}</span>
      <span className="text-right text-rose-400">{c.uncovered}</span>
      <span className="text-right text-slate-200">{c.rate}%</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0b1220] p-4 md:p-6 text-slate-100">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">clubProfileId & 重複profile 診断</h1>
          <Button onClick={fetchDiagnostics} disabled={loading} className="bg-indigo-600 hover:bg-indigo-700">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "診断実行"}
          </Button>
        </div>

        {error && (
          <div className="rounded-lg bg-rose-900/40 p-4 text-rose-200 border border-rose-700">
            {error}
          </div>
        )}

        {result && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-[#141d2e] border-slate-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-slate-400">Firebase Auth 総ユーザー数</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-slate-100">{result.auth.totalUsers}</p>
                </CardContent>
              </Card>
              <Card className="bg-[#141d2e] border-slate-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-slate-400">club_profiles 総件数</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-slate-100">{result.profiles.total}</p>
                </CardContent>
              </Card>
              <Card className="bg-[#141d2e] border-slate-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-slate-400">profile保有ユニークUID数 / 率</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-slate-100">{result.profiles.authWithProfile} / {result.profiles.profileOwnershipRate}%</p>
                </CardContent>
              </Card>
              <Card className="bg-[#141d2e] border-slate-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-slate-400">profile未保有ユーザー数</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-slate-100">{result.profiles.authWithoutProfile}</p>
                </CardContent>
              </Card>
              <Card className="bg-[#141d2e] border-slate-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-slate-400">重複profileユーザー数</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-slate-100">{result.profiles.duplicateProfileOwners}</p>
                </CardContent>
              </Card>
              <Card className="bg-[#141d2e] border-slate-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-slate-400">余分なprofile総数</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-slate-100">{result.profiles.extraProfilesCount}</p>
                </CardContent>
              </Card>
            </div>

            <Card className="bg-[#141d2e] border-slate-700">
              <CardHeader>
                <CardTitle className="text-slate-200">重複profileパターン</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(result.duplicatePatterns.labels).map(([key, label]) => (
                  <div key={key} className="flex justify-between text-sm">
                    <span className="text-slate-300">{label}</span>
                    <span className="font-mono text-slate-100">
                      {Number((result.duplicatePatterns as unknown as Record<string, unknown>)[key])}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="bg-[#141d2e] border-slate-700">
              <CardHeader>
                <CardTitle className="text-slate-200">集計不可理由別件数（ユーザー単位）</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {Object.entries(result.unavailableReasonByUser).map(([reason, count]) => (
                  <div key={reason} className="flex justify-between text-sm">
                    <span className="text-slate-300">{reason}</span>
                    <span className="font-mono text-slate-100">{count}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="bg-[#141d2e] border-slate-700">
              <CardHeader>
                <CardTitle className="text-slate-200">データ整合性</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-slate-400">club_profiles総件数</span><span className="text-slate-100">{result.dataIntegrity.totalProfiles}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">有効ownerUid所持件数</span><span className="text-slate-100">{result.dataIntegrity.validOwnedProfiles}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">正常profile（Auth持ち1件）</span><span className="text-slate-100">{result.dataIntegrity.normalProfiles}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">余分profile</span><span className="text-slate-100">{result.dataIntegrity.extraProfilesCount}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Authに存在しないownerUid数/件数</span><span className="text-slate-100">{result.dataIntegrity.ownerNotInAuth.distinctUids} / {result.dataIntegrity.ownerNotInAuth.profileCount}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">ownerUid欠損</span><span className="text-slate-100">{result.dataIntegrity.missing}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">ownerUid空文字</span><span className="text-slate-100">{result.dataIntegrity.empty}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">ownerUid null</span><span className="text-slate-100">{result.dataIntegrity.nullUids}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">ownerUid非文字列</span><span className="text-slate-100">{result.dataIntegrity.nonString}</span></div>
                <div className="flex justify-between border-t border-slate-700 pt-1"><span className="text-slate-400">内訳合計</span><span className="text-slate-100">{result.dataIntegrity.check}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">検算差分</span><span className="text-slate-100">{result.dataIntegrity.totalProfiles - result.dataIntegrity.check}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Auth総ユーザー</span><span className="text-slate-100">{result.dataIntegrity.authBasedReconciliation.authTotal}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Auth内profile保有UID</span><span className="text-slate-100">{result.dataIntegrity.authBasedReconciliation.authWithProfile}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Auth内profile未保有UID</span><span className="text-slate-100">{result.dataIntegrity.authBasedReconciliation.authWithoutProfile}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">未分類残件</span><span className="text-slate-100">{result.dataIntegrity.authBasedReconciliation.unaccounted}</span></div>
              </CardContent>
            </Card>

            <Card className="bg-[#141d2e] border-slate-700">
              <CardHeader>
                <CardTitle className="text-slate-200">clubProfileId 対応率</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-2 text-xs text-slate-400 pb-2">
                  <span>コレクション</span>
                  <span className="text-right">対応済</span>
                  <span className="text-right">未対応</span>
                  <span className="text-right">率</span>
                </div>
                {Object.entries(result.clubProfileIdCoverage).map(([k, c]) => renderCoverage(k, c))}
              </CardContent>
            </Card>

            <Card className="bg-[#141d2e] border-slate-700">
              <CardHeader>
                <CardTitle className="text-slate-200">同一メールアドレス重複</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-slate-400">重複email種別数</span>
                  <span className="text-slate-100">{result.auth.duplicatedEmailCount}</span>
                  <span className="text-slate-400">別UID同一email余分件数</span>
                  <span className="text-slate-100">{result.auth.sameEmailDifferentUid}</span>
                  <span className="text-slate-400">同一UID内重複profileユーザー数</span>
                  <span className="text-slate-100">{result.auth.sameUidMultipleProfiles}</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">{result.auth.sameUidMultipleProfilesNote}</p>
                {Object.keys(result.auth.duplicatedEmails).length > 0 && (
                  <details className="text-sm text-slate-300">
                    <summary className="cursor-pointer">重複email詳細</summary>
                    <pre className="mt-2 p-2 bg-slate-900 rounded text-xs overflow-auto max-h-60">
                      {JSON.stringify(result.auth.duplicatedEmails, null, 2)}
                    </pre>
                  </details>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
