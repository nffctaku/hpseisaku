import type { GroupPredictions, PredictionsByMatchId, Team } from "./model";
import type { Dispatch, SetStateAction } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

export function GroupsTab({
  groups,
  groupPredictions,
  setGroupPredictions,
  resolveTeamAbbrev,
  matchPredictions,
}: {
  groups: Record<string, Team[]>;
  groupPredictions: GroupPredictions;
  setGroupPredictions: Dispatch<SetStateAction<GroupPredictions>>;
  resolveTeamAbbrev: (team: Team) => string;
  matchPredictions: PredictionsByMatchId;
}) {
  return (
    <>
      <Card className="bg-white text-gray-900">
        <CardHeader>
          <CardTitle className="text-base">GS突破予想</CardTitle>
          <CardDescription>各グループから2チーム選択（1チーム的中につき20P）</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(groups).map(([groupKey, teams]) => {
              const selected = Array.isArray(groupPredictions[groupKey]) ? groupPredictions[groupKey] : [];

              return (
                <div key={groupKey} className="rounded-xl border bg-gray-50 p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-bold">グループ {groupKey}</div>
                    <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-bold text-white">
                      20P
                    </span>
                  </div>

                  <div className="mt-3 space-y-2">
                    {teams.map((t) => {
                      const checked = selected.includes(t.id);
                      const disabled = !checked && selected.length >= 2;
                      const abbrev = resolveTeamAbbrev(t);

                      return (
                        <label key={t.id} className={`flex items-center gap-2 rounded-lg border bg-white px-3 py-2 ${disabled ? "opacity-60" : ""}`}>
                          <Checkbox
                            checked={checked}
                            disabled={disabled}
                            onCheckedChange={(v) => {
                              const isChecked = Boolean(v);
                              setGroupPredictions((prev) => {
                                const prevSelected = Array.isArray(prev[groupKey]) ? prev[groupKey] : [];

                                if (isChecked) {
                                  if (prevSelected.includes(t.id)) return prev;
                                  if (prevSelected.length >= 2) return prev;
                                  return { ...prev, [groupKey]: [...prevSelected, t.id] };
                                }

                                return { ...prev, [groupKey]: prevSelected.filter((x) => x !== t.id) };
                              });
                            }}
                          />
                          <div className="min-w-0">
                            <div className="text-sm font-semibold truncate">{t.name}</div>
                            <div className="text-[11px] text-gray-500">{abbrev}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>

                  <div className="mt-3 text-[11px] text-gray-600">選択中: {selected.length}/2</div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white text-gray-900 mt-3">
        <CardHeader>
          <CardTitle className="text-base">Debug</CardTitle>
          <CardDescription>現在のstate（LocalStorageにも保存）</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="whitespace-pre-wrap break-words rounded-lg bg-gray-50 border p-3 text-xs leading-relaxed">
            {JSON.stringify({ matchPredictions, groupPredictions }, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </>
  );
}
