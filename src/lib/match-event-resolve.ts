// イベント関連の共有ユーティリティ:
//  - イベント dedup key（OCR適用・削除tombstone・確認画面で同一規則）
//  - OCR削除済みイベントの tombstone キー生成（A対応）
//  - 名前のみイベント → playerId の一意解決リゾルバ（B対応）

// ---------------------------------------------------------------
// dedup key（applyOcrResults / commitSquadSave / ocr-review-panel と同一規則）
// タイムスタンプ由来のIDは使わない。選手は playerId 優先、なければ正規化名。
// ---------------------------------------------------------------
const normDedup = (s?: string) => (s || '').replace(/[\s　.．・=＝‐\-]/g, '').toLowerCase();

export interface DedupKeyLike {
  type?: string;
  minute?: unknown;
  teamId?: string | null;
  playerId?: string;
  playerName?: string;
  outPlayerId?: string;
  inPlayerId?: string;
  outPlayerName?: string;
  inPlayerName?: string;
}

export function eventDedupKey(ev: DedupKeyLike): string {
  const minuteStr = String(ev.minute ?? '');
  const player = ev.playerId || normDedup(ev.playerName);
  if (ev.type === 'substitution') {
    return `sub|${minuteStr}|${ev.teamId}|${ev.outPlayerId || normDedup(ev.outPlayerName)}|${ev.inPlayerId || normDedup(ev.inPlayerName)}`;
  }
  return `${ev.type}|${minuteStr}|${ev.teamId}|${player}`;
}

// 名前のみ（IDを無視した）形式の dedup key。
// 削除時にID付き・再解析時に名前のみ（またはその逆）でも同一イベントを
// 検出できるよう、tombstone にはID形式と名前形式の両方を記録する。
function eventDedupKeyByName(ev: DedupKeyLike): string | null {
  const minuteStr = String(ev.minute ?? '');
  if (ev.type === 'substitution') {
    const out = normDedup(ev.outPlayerName);
    const inn = normDedup(ev.inPlayerName);
    if (!out && !inn) return null;
    return `sub|${minuteStr}|${ev.teamId}|${out}|${inn}`;
  }
  const p = normDedup(ev.playerName);
  if (!p) return null;
  return `${ev.type}|${minuteStr}|${ev.teamId}|${p}`;
}

// tombstone に記録するキー集合（ID形式 + 名前形式の両方、重複除去）。
export function eventDeletedKeyVariants(ev: DedupKeyLike): string[] {
  const keys = new Set<string>([eventDedupKey(ev)]);
  const byName = eventDedupKeyByName(ev);
  if (byName) keys.add(byName);
  return [...keys];
}

// ---------------------------------------------------------------
// 名前のみイベント → playerId 一意解決（B対応）
// 方針:
//  - 同一 teamId の選手のみを対象（自クラブ/相手の混同を防ぐ）
//  - 正規化名が一意に1人だけ一致した場合のみ解決
//  - 0件・複数候補は undefined（強制紐付けしない）
//  - playerId が既にある場合はリゾルバを呼ばない（呼び出し側の責務）
// ---------------------------------------------------------------
export type PlayerNameResolver = (
  name: string | undefined | null,
  teamId?: string
) => string | undefined;

// 名字解決用の正規化: ダイアクリティクス除去 + 区切り文字除去 + 小文字化
export const normalizePlayerNameKey = (s?: string | null): string =>
  (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // 結合ダイアクリティカルマーク除去
    .replace(/[\s　.．・=＝‐\-_,'’()]/g, '')
    .toLowerCase();


// 「M. Zubimendi」形式（イニシャル+姓）の照合キーを生成するため、
// 選手側は「姓名フル正規化」に加え「名イニシャル+姓トークン正規化」も登録する。
const playerNameKeys = (fullName: string): string[] => {
  const keys = new Set<string>();
  const full = normalizePlayerNameKey(fullName);
  if (full) keys.add(full);
  const tokens = fullName.split(/[\s　.．・=＝‐\-_]+/).filter(Boolean);
  if (tokens.length >= 2) {
    const last = tokens[tokens.length - 1];
    const initials = tokens
      .slice(0, -1)
      .map((t) => normalizePlayerNameKey(t).charAt(0))
      .join('');
    const short = `${initials}${normalizePlayerNameKey(last)}`;
    if (short) keys.add(short);
  }
  return [...keys];
};

export function buildPlayerNameResolver(
  playerStats: Array<{ playerId?: unknown; playerName?: unknown; teamId?: unknown }> | unknown
): PlayerNameResolver {
  // teamId -> key -> Set<playerId>
  const byTeam = new Map<string, Map<string, Set<string>>>();
  const all = new Map<string, Set<string>>();
  for (const ps of (Array.isArray(playerStats) ? playerStats : [])) {
    const pid = typeof ps?.playerId === 'string' ? ps.playerId : '';
    const name = typeof ps?.playerName === 'string' ? ps.playerName : '';
    const tid = typeof ps?.teamId === 'string' ? ps.teamId : '';
    if (!pid || !name) continue;
    for (const key of playerNameKeys(name)) {
      const set = all.get(key) || new Set<string>();
      set.add(pid);
      all.set(key, set);
      if (tid) {
        const tm = byTeam.get(tid) || new Map<string, Set<string>>();
        const ts = tm.get(key) || new Set<string>();
        ts.add(pid);
        tm.set(key, ts);
        byTeam.set(tid, tm);
      }
    }
  }

  return (name, teamId) => {
    if (typeof name !== 'string' || !name.trim()) return undefined;
    // 問い合わせ側も同じ2形態で照合（フル名・イニシャル+姓のどちらの表記でも一致）
    const candidates = new Set<string>();
    for (const key of playerNameKeys(name)) {
      const map = teamId ? byTeam.get(teamId) : all;
      const hit = map?.get(key);
      if (hit) hit.forEach((id) => candidates.add(id));
    }
    // 一意一致のみ。0件/複数は未解決（曖昧名を強制紐付けしない）
    return candidates.size === 1 ? [...candidates][0] : undefined;
  };
}

// 交代イベントの欠落IDを一意解決できる場合のみ補完して返す。
// 解決不能・既にIDあり・曖昧一致は元の値を維持する。
export function withResolvedSubPlayerIds<T extends Record<string, unknown>>(
  ev: T,
  resolve: PlayerNameResolver
): T {
  if (ev?.type !== 'substitution') return ev;
  const teamId = typeof ev.teamId === 'string' ? ev.teamId : undefined;
  const out: Record<string, unknown> = { ...ev };
  if (!out.outPlayerId) {
    const id = resolve(out.outPlayerName as string | undefined, teamId);
    if (id) out.outPlayerId = id;
  }
  if (!out.inPlayerId) {
    const id = resolve(out.inPlayerName as string | undefined, teamId);
    if (id) out.inPlayerId = id;
  }
  return out as T;
}
