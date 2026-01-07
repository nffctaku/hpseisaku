"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Image from "next/image";
import { auth } from "@/lib/firebase";
import { PublicPlayerHexChart } from "@/components/public-player-hex-chart";

type BookletPlayer = {
  id: string;
  name: string;
  number: number | null;
  position: string;
  mainPosition?: string;
  subPositions?: string[];
  nationality?: string;
  age?: number | null;
  height?: number | null;
  weight?: number | null;
  tenureYears?: number;
  contractEndMonth?: number | null;
  contractEndDate?: string;
  preferredFoot?: string;
  lastSeasonSummary?: string;
  memo?: string;
  profile?: string;
  photoUrl?: string;
  params?: { overall: number; items: Array<{ label: string; value: number }> } | null;
  isNew?: boolean;
};

type BookletResponse = {
  seasonId: string;
  teamId: string;
  teamName: string;
  club: { clubName: string; logoUrl: string | null };
  players: BookletPlayer[];
};

function clampText(s: string, max: number): string {
  const t = (s || "").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function toIso2(nationality: string): string | null {
  const key = (nationality || "").trim().toLowerCase();
  if (!key) return null;
  const map: Record<string, string> = {
    "日本": "jp",
    "japan": "jp",
    "イングランド": "gb",
    "england": "gb",
    "スコットランド": "gb",
    "scotland": "gb",
    "ウェールズ": "gb",
    "wales": "gb",
    "北アイルランド": "gb",
    "northern ireland": "gb",
    "イギリス": "gb",
    "英国": "gb",
    "uk": "gb",
    "u.k.": "gb",
    "united kingdom": "gb",
    "大韓民国": "kr",
    "韓国": "kr",
    "korea": "kr",
    "republic of korea": "kr",
    "朝鮮民主主義人民共和国": "kp",
    "北朝鮮": "kp",
    "china": "cn",
    "中国": "cn",
    "taiwan": "tw",
    "台湾": "tw",
    "hong kong": "hk",
    "香港": "hk",
    "usa": "us",
    "u.s.a.": "us",
    "united states": "us",
    "アメリカ": "us",
    "米国": "us",
    "canada": "ca",
    "カナダ": "ca",
    "mexico": "mx",
    "メキシコ": "mx",
    "brazil": "br",
    "ブラジル": "br",
    "argentina": "ar",
    "アルゼンチン": "ar",
    "chile": "cl",
    "チリ": "cl",
    "colombia": "co",
    "コロンビア": "co",
    "uruguay": "uy",
    "ウルグアイ": "uy",
    "france": "fr",
    "フランス": "fr",
    "germany": "de",
    "ドイツ": "de",
    "spain": "es",
    "スペイン": "es",
    "italy": "it",
    "イタリア": "it",
    "portugal": "pt",
    "ポルトガル": "pt",
    "netherlands": "nl",
    "オランダ": "nl",
    "belgium": "be",
    "ベルギー": "be",
    "switzerland": "ch",
    "スイス": "ch",
    "austria": "at",
    "オーストリア": "at",
    "sweden": "se",
    "スウェーデン": "se",
    "norway": "no",
    "ノルウェー": "no",
    "denmark": "dk",
    "デンマーク": "dk",
    "poland": "pl",
    "ポーランド": "pl",
    "croatia": "hr",
    "クロアチア": "hr",
    "serbia": "rs",
    "セルビア": "rs",
    "turkey": "tr",
    "トルコ": "tr",
    "morocco": "ma",
    "モロッコ": "ma",
    "egypt": "eg",
    "エジプト": "eg",
    "nigeria": "ng",
    "ナイジェリア": "ng",
    "ghana": "gh",
    "ガーナ": "gh",
    "cameroon": "cm",
    "カメルーン": "cm",
    "senegal": "sn",
    "セネガル": "sn",
    "australia": "au",
    "オーストラリア": "au",
    "new zealand": "nz",
    "ニュージーランド": "nz",
  };

  if (map[key]) return map[key];
  return null;
}

function isoToEmojiFlag(iso: string): string {
  const cc = iso.toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return "";
  const A = 0x1f1e6;
  const chars = [...cc].map((c) => String.fromCodePoint(A + (c.charCodeAt(0) - 65)));
  return chars.join("");
}

function NationalityFlag({ nationality }: { nationality: string }) {
  return <span className="font-semibold">{nationality}</span>;
}

function preferredFootLabel(v?: string): string {
  const s = String(v || "").trim().toLowerCase();
  if (!s) return "-";
  if (s === "right" || s === "r" || s === "右" || s === "右利き") return "右利き";
  if (s === "left" || s === "l" || s === "左" || s === "左利き") return "左利き";
  if (s === "both" || s === "両" || s === "両利き") return "両利き";
  return "-";
}

function contractEndLabel(contractEndDate?: string): string {
  const s = String(contractEndDate || "").trim();
  if (!s) return "";
  const m = s.match(/^(\d{4})-(\d{1,2})$/);
  if (m) return `(${m[1]}年${String(parseInt(m[2], 10))}月)`;
  return "";
}

const PITCH_BOXES: Array<{ key: string; style: { left: string; top: string; width: string; height: string } }> = [
  { key: "ST", style: { left: "24%", top: "4%", width: "52%", height: "16%" } },
  { key: "LW", style: { left: "4%", top: "4%", width: "21%", height: "26%" } },
  { key: "RW", style: { left: "75%", top: "4%", width: "21%", height: "26%" } },
  { key: "AM", style: { left: "24%", top: "20%", width: "52%", height: "16%" } },
  { key: "LM", style: { left: "4%", top: "30%", width: "21%", height: "26%" } },
  { key: "RM", style: { left: "75%", top: "30%", width: "21%", height: "26%" } },
  { key: "CM", style: { left: "24%", top: "36%", width: "52%", height: "16%" } },
  { key: "DM", style: { left: "24%", top: "52%", width: "52%", height: "16%" } },
  { key: "LB", style: { left: "4%", top: "56%", width: "21%", height: "28%" } },
  { key: "RB", style: { left: "75%", top: "56%", width: "21%", height: "28%" } },
  { key: "CB", style: { left: "24%", top: "68%", width: "52%", height: "16%" } },
  { key: "GK", style: { left: "33%", top: "84%", width: "34%", height: "8%" } },
];

function PositionMap({ mainPosition, subPositions }: { mainPosition?: string; subPositions?: string[] }) {
  const main = (mainPosition || "").trim();
  const subs = Array.isArray(subPositions) ? subPositions : [];

  const VIEW_W = 100;
  const VIEW_H = 160;
  const INSET = 4;

  const pct = (v: string) => (Number.parseFloat(v) || 0) / 100;

  const toX = (v: string) => INSET + pct(v) * (VIEW_W - INSET * 2);
  const toY = (v: string) => INSET + pct(v) * (VIEW_H - INSET * 2);
  const toW = (v: string) => pct(v) * (VIEW_W - INSET * 2);
  const toH = (v: string) => pct(v) * (VIEW_H - INSET * 2);

  return (
    <svg viewBox="0 0 100 160" width="100%" className="rounded-md">
      {PITCH_BOXES.map((p) => {
        const isMain = main === p.key;
        const isSub = subs.includes(p.key);
        const fill = isMain ? "rgba(244,63,94,0.80)" : isSub ? "rgba(244,63,94,0.25)" : "rgba(0,0,0,0.04)";
        return (
          <rect
            key={p.key}
            x={toX(p.style.left)}
            y={toY(p.style.top)}
            width={toW(p.style.width)}
            height={toH(p.style.height)}
            rx={1}
            fill={fill}
          />
        );
      })}
    </svg>
  );
}

export default function TeamBookletPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const teamId = params.teamId as string;
  const season = (searchParams.get("season") || "").trim();

  const [data, setData] = useState<BookletResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [additionalPlayerIds, setAdditionalPlayerIds] = useState<string[]>([]);
  const [positionColors, setPositionColors] = useState({
    GK: 'bg-rose-300',
    DF: 'bg-blue-300', 
    MF: 'bg-green-300',
    FW: 'bg-orange-300'
  });

  const colorOptions = [
    { name: '赤', value: 'bg-rose-300' },
    { name: '青', value: 'bg-blue-300' },
    { name: '緑', value: 'bg-green-300' },
    { name: 'オレンジ', value: 'bg-orange-300' },
    { name: '紫', value: 'bg-purple-300' },
    { name: '黄色', value: 'bg-yellow-300' },
    { name: '灰色', value: 'bg-gray-300' },
    { name: 'ピンク', value: 'bg-pink-300' },
  ];

  useEffect(() => {
    const run = async () => {
      if (!teamId || !season) return;
      setLoading(true);
      setError(null);

      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) {
          setError("ログインが必要です。");
          setLoading(false);
          return;
        }

        const res = await fetch(`/api/admin/booklet?teamId=${encodeURIComponent(teamId)}&season=${encodeURIComponent(season)}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body?.message || "取得に失敗しました");
          setLoading(false);
          return;
        }

        const json = (await res.json()) as BookletResponse;
        setData(json);
        
        // localStorageから選択状態を復元
        const storageKey = `booklet_selection_${teamId}_${season}`;
        const savedSelection = localStorage.getItem(storageKey);
        
        if (savedSelection) {
          try {
            const parsed = JSON.parse(savedSelection);
            setSelectedPlayerIds(parsed.selectedPlayerIds || json.players.slice(0, 15).map(p => p.id));
            setAdditionalPlayerIds(parsed.additionalPlayerIds || []);
            setPositionColors(parsed.positionColors || {
              GK: 'bg-rose-300',
              DF: 'bg-blue-300', 
              MF: 'bg-green-300',
              FW: 'bg-orange-300'
            });
          } catch (e) {
            // パースエラーの場合はデフォルト値を使用
            setSelectedPlayerIds(json.players.slice(0, 15).map(p => p.id));
            setAdditionalPlayerIds([]);
          }
        } else {
          // 初期状態では最初の15人を選択
          setSelectedPlayerIds(json.players.slice(0, 15).map(p => p.id));
          setAdditionalPlayerIds([]);
        }
      } catch (e) {
        console.error(e);
        setError("取得に失敗しました");
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [teamId, season]);

  // 選択状態が変更されたらlocalStorageに保存
  useEffect(() => {
    if (!teamId || !season) return;
    
    const storageKey = `booklet_selection_${teamId}_${season}`;
    const selectionData = {
      selectedPlayerIds,
      additionalPlayerIds,
      positionColors
    };
    
    localStorage.setItem(storageKey, JSON.stringify(selectionData));
  }, [selectedPlayerIds, additionalPlayerIds, positionColors, teamId, season]);

  const players = useMemo(() => {
    const list = Array.isArray(data?.players) ? data!.players : [];
    
    const getPositionOrder = (position: string) => {
      const pos = (position || '').toUpperCase();
      
      // GKの判定
      if (pos.includes('GK') || pos.includes('ゴールキーパー') || pos.includes('キーパー')) {
        return 0;
      }
      
      // DFの判定
      if (pos.includes('DF') || pos.includes('ディフェンダー') || pos.includes('ディフェンス') || 
          pos.includes('CB') || pos.includes('LB') || pos.includes('RB') || pos.includes('SB') ||
          pos.includes('センターバック') || pos.includes('レフトバック') || pos.includes('ライトバック')) {
        return 1;
      }
      
      // MFの判定
      if (pos.includes('MF') || pos.includes('ミッドフィルダー') || pos.includes('ミッドフィールド') ||
          pos.includes('CM') || pos.includes('DM') || pos.includes('AM') || pos.includes('LM') || pos.includes('RM') ||
          pos.includes('センターミッドフィルダー') || pos.includes('ディフェンシブミッドフィルダー') || 
          pos.includes('アタッキングミッドフィルダー') || pos.includes('サイドミッドフィルダー')) {
        return 2;
      }
      
      // FWの判定
      if (pos.includes('FW') || pos.includes('フォワード') || pos.includes('ストライカー') ||
          pos.includes('ST') || pos.includes('CF') || pos.includes('LW') || pos.includes('RW') ||
          pos.includes('センターフォワード') || pos.includes('ウインガー')) {
        return 3;
      }
      
      return 99; // その他
    };
    
    const sortedList = [...list].sort((a, b) => {
      // まずメインポジションでソート
      const aOrder = getPositionOrder(a.mainPosition || a.position || '');
      const bOrder = getPositionOrder(b.mainPosition || b.position || '');
      
      if (aOrder !== bOrder) return aOrder - bOrder;
      
      // ポジションが同じ場合は背番号でソート
      const an = typeof a.number === "number" ? a.number : 9999;
      const bn = typeof b.number === "number" ? b.number : 9999;
      if (an !== bn) return an - bn;
      
      // 最後に名前でソート
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
    
    if (isEditMode) {
      return sortedList;
    }
    
    // 編集モードでない場合は選択された15人のみ表示
    return sortedList.filter(p => selectedPlayerIds.includes(p.id));
  }, [data, isEditMode, selectedPlayerIds]);

  const getPositionColor = (position: string) => {
    const pos = (position || '').toUpperCase();
    
    // GKの判定
    if (pos.includes('GK') || pos.includes('ゴールキーパー') || pos.includes('キーパー')) {
      return positionColors.GK;
    }
    
    // DFの判定
    if (pos.includes('DF') || pos.includes('ディフェンダー') || pos.includes('ディフェンス') || 
        pos.includes('CB') || pos.includes('LB') || pos.includes('RB') || pos.includes('SB') ||
        pos.includes('センターバック') || pos.includes('レフトバック') || pos.includes('ライトバック')) {
      return positionColors.DF;
    }
    
    // MFの判定
    if (pos.includes('MF') || pos.includes('ミッドフィルダー') || pos.includes('ミッドフィールド') ||
        pos.includes('CM') || pos.includes('DM') || pos.includes('AM') || pos.includes('LM') || pos.includes('RM') ||
        pos.includes('センターミッドフィルダー') || pos.includes('ディフェンシブミッドフィルダー') || 
        pos.includes('アタッキングミッドフィルダー') || pos.includes('サイドミッドフィルダー')) {
      return positionColors.MF;
    }
    
    // FWの判定
    if (pos.includes('FW') || pos.includes('フォワード') || pos.includes('ストライカー') ||
        pos.includes('ST') || pos.includes('CF') || pos.includes('LW') || pos.includes('RW') ||
        pos.includes('センターフォワード') || pos.includes('ウインガー')) {
      return positionColors.FW;
    }
    
    // デフォルト色
    return 'bg-gray-500';
  };

  const handlePlayerToggle = (playerId: string) => {
    setSelectedPlayerIds(prev => {
      if (prev.includes(playerId)) {
        return prev.filter(id => id !== playerId);
      } else {
        if (prev.length >= 15) {
          return prev; // 15人以上は選択できない
        }
        return [...prev, playerId];
      }
    });
  };

  const handleAdditionalPlayerToggle = (playerId: string) => {
    setAdditionalPlayerIds(prev => {
      if (prev.includes(playerId)) {
        return prev.filter(id => id !== playerId);
      } else {
        if (prev.length >= 8) {
          return prev; // 8人以上は選択できない
        }
        return [...prev, playerId];
      }
    });
  };

  return (
    <div className="text-gray-900">
      <style jsx global>{`
        @media print {
          html, body { background: #fff !important; }
          .no-print { display: none !important; }
          .print-page { break-after: page; }
        }

        .booklet-name-2l {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .booklet-vertical-name {
          writing-mode: vertical-rl;
          text-orientation: mixed;
          transform: rotate(180deg);
        }

        .font-source-han {
          font-family: "Source Han Sans JP", sans-serif;
        }
      `}</style>

      <div className="no-print mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold truncate">選手名鑑</h1>
          <p className="text-sm text-muted-foreground truncate">
            {data?.club?.clubName || ""} / {data?.teamName || ""} / {season}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* {!isEditMode && (
            <button
              type="button"
              onClick={() => setIsEditMode(true)}
              className="px-3 py-2 rounded-md bg-blue-600 text-white text-sm font-semibold"
              disabled={loading || !data}
            >
              選手を選択 ({selectedPlayerIds.length}/15)
            </button>
          )}
          {isEditMode && (
            <>
              <button
                type="button"
                onClick={() => setIsEditMode(false)}
                className="px-3 py-2 rounded-md bg-green-600 text-white text-sm font-semibold"
                disabled={selectedPlayerIds.length !== 15}
              >
                決定 ({selectedPlayerIds.length}/15)
              </button>
              <button
                type="button"
                onClick={() => setIsEditMode(false)}
                className="px-3 py-2 rounded-md bg-gray-600 text-white text-sm font-semibold"
              >
                キャンセル
              </button>
            </>
          )} */}
          <button
            type="button"
            onClick={() => window.print()}
            className="px-3 py-2 rounded-md bg-emerald-600 text-white text-sm font-semibold"
            disabled={loading || !data || isEditMode}
          >
            印刷
          </button>
        </div>
      </div>

      {isEditMode && (
        <div className="no-print mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="text-lg font-semibold mb-2">選手名鑑設定</h3>
          
          {/* ポジション色選択 */}
          <div className="mb-4">
            <h4 className="text-md font-medium mb-2">ポジションの帯の色</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(positionColors).map(([position, color]) => (
                <div key={position} className="flex items-center gap-2">
                  <span className="text-sm font-medium w-8">{position}:</span>
                  <select
                    value={color}
                    onChange={(e) => setPositionColors(prev => ({
                      ...prev,
                      [position]: e.target.value
                    }))}
                    className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                  >
                    {colorOptions.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                  <div className={`w-6 h-6 ${color} rounded`}></div>
                </div>
              ))}
            </div>
          </div>
          
          {/* 選手選択 */}
          <div className="mb-4">
            <h4 className="text-md font-medium mb-2">メイン選手選択（15名まで）</h4>
            <p className="text-sm text-gray-600 mb-4">
              ブックレットに表示するメイン選手を15名まで選択してください。現在 {selectedPlayerIds.length}/15 名選択中。
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {data?.players?.map((player) => (
                <div
                  key={player.id}
                  className={`p-2 border rounded cursor-pointer transition-colors ${
                    selectedPlayerIds.includes(player.id)
                      ? 'bg-blue-100 border-blue-500'
                      : 'bg-white border-gray-300 hover:bg-gray-50'
                  }`}
                  onClick={() => handlePlayerToggle(player.id)}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedPlayerIds.includes(player.id)}
                      onChange={() => handlePlayerToggle(player.id)}
                      className="rounded"
                      disabled={!selectedPlayerIds.includes(player.id) && selectedPlayerIds.length >= 15}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{player.name}</div>
                      <div className="text-xs text-gray-500">背番号 {player.number} | {player.position}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          {/* 追加選手選択 */}
          <div>
            <h4 className="text-md font-medium mb-2">追加選手選択（8名まで）</h4>
            <p className="text-sm text-gray-600 mb-4">
              下の余白に表示する追加選手を8名まで選択してください。現在 {additionalPlayerIds.length}/8 名選択中。
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {data?.players?.filter(p => !selectedPlayerIds.includes(p.id)).map((player) => (
                <div
                  key={player.id}
                  className={`p-2 border rounded cursor-pointer transition-colors ${
                    additionalPlayerIds.includes(player.id)
                      ? 'bg-green-100 border-green-500'
                      : 'bg-white border-gray-300 hover:bg-gray-50'
                  }`}
                  onClick={() => handleAdditionalPlayerToggle(player.id)}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={additionalPlayerIds.includes(player.id)}
                      onChange={() => handleAdditionalPlayerToggle(player.id)}
                      className="rounded"
                      disabled={!additionalPlayerIds.includes(player.id) && additionalPlayerIds.length >= 8}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{player.name}</div>
                      <div className="text-xs text-gray-500">背番号 {player.number} | {player.position}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {loading && <p className="text-sm text-muted-foreground">読み込み中...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {data && (
        <div className="mx-auto">
          <div className="print-page">
            <div className="w-[210mm] min-h-[297mm] mx-auto bg-white">
              <div className="px-[6mm] pt-[10mm]">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="text-2xl font-black leading-tight truncate">{data.club.clubName}</div>
                    <div className="text-sm text-gray-600 mt-1 truncate">
                      {data.teamName} / {season}
                    </div>
                  </div>
                  {data.club.logoUrl ? (
                    <div className="relative w-[40mm] h-[12mm]">
                      <Image src={data.club.logoUrl} alt={data.club.clubName} fill className="object-contain" sizes="160px" />
                    </div>
                  ) : null}
                </div>

                <div className="mt-[6mm] grid grid-cols-3 gap-[1.5mm]">
                  {players.map((p) => {
                    const labels = p.params?.items?.map((i) => i.label) ?? ["", "", "", "", "", ""];
                    const values = p.params?.items?.map((i) => i.value) ?? [0, 0, 0, 0, 0, 0];
                    const overall = typeof p.params?.overall === "number" ? p.params.overall : 0;
                    const desc = clampText((p.memo || "").trim() || (p.profile || ""), 80);

                    return (
                      <div key={p.id} className="relative border border-gray-200 bg-white h-[42mm]">
                        {p.isNew ? (
                          <div className="absolute top-0 right-0 z-[100] w-6 h-6 rounded-full bg-emerald-400 text-white flex items-center justify-center font-black shadow-sm translate-x-1/2 -translate-y-1/2 text-[8px]">
                            NEW
                          </div>
                        ) : null}
                        <div className="grid h-full" style={{ gridTemplateColumns: "6mm 1.1fr 1.2fr" }}>
                          {/* left strip */}
                          <div className={`${getPositionColor(p.mainPosition || p.position)} text-white flex flex-col items-center justify-start py-2 h-full rounded-l-md`}>
                            <div className="flex flex-col items-center leading-none">
                              <div className="text-base font-black leading-none font-source-han">{p.number ?? "-"}</div>
                              <div className="mt-0.5 text-xs font-black tracking-wide font-source-han">
                                {((p.position || "").toUpperCase().match(/^(FW|MF|DF|GK)$/)?.[1] as any) || ""}
                              </div>
                            </div>
                            <div className="booklet-vertical-name text-[10px] font-black tracking-wide leading-none mt-auto font-source-han">
                              {p.name}
                            </div>
                          </div>

                          {/* photo */}
                          <div className="relative bg-gray-200 h-full">
                            {p.photoUrl ? (
                              <Image src={p.photoUrl} alt={p.name} fill className="object-cover" sizes="360px" />
                            ) : null}
                          </div>

                          {/* info */}
                          <div className="relative bg-amber-50/60 pl-1 pr-0 py-1 h-full overflow-hidden flex flex-col">

                            <div className="relative">
                              <div className="text-[5px] font-semibold text-gray-800 leading-tight">
                                <div className="text-[7px] leading-tight">
                                  {p.height != null ? `${p.height}cm` : "-"}/{p.weight != null ? `${p.weight}kg` : "-"}
                                </div>
                                <div className="font-semibold text-[7px] leading-tight">{p.age != null ? `${p.age}歳` : "-"}</div>
                                <div className="font-semibold text-[7px] leading-tight">{preferredFootLabel(p.preferredFoot)}</div>
                                <div className="font-semibold text-[7px] leading-tight flex gap-2">
                                  {p.tenureYears != null ? `${p.tenureYears}年目` : "-"}
                                  {contractEndLabel(p.contractEndDate)}
                                </div>
                                <div className="font-semibold text-[7px] leading-tight">{p.nationality ? <NationalityFlag nationality={p.nationality} /> : "-"}</div>
                                <div className="font-semibold text-[7px] leading-tight">{p.lastSeasonSummary || "-"}</div>
                              </div>
                              <div className="absolute -top-1 right-0 p-1">
                                <div className="w-6 h-10">
                                  <PositionMap mainPosition={p.mainPosition} subPositions={p.subPositions} />
                                </div>
                              </div>
                            </div>

                            <div className="text-[6px] text-gray-800 leading-tight overflow-hidden flex-none mt-1">
                              {desc || ""}
                            </div>

                            <div className="mt-auto flex items-center justify-center">
                              <div className="w-full max-w-[60px] h-auto">
                                <PublicPlayerHexChart labels={labels} values={values} overall={overall} />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                {/* 追加選手セクション */}
                {additionalPlayerIds.length > 0 && (
                  <div className="mt-[8mm] px-[6mm]">
                    <div className="text-center text-lg font-bold mb-[4mm]">Other Members</div>
                    <div className="border border-gray-300">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-50">
                            <th className="border border-gray-300 px-2 py-1 text-left">背番号</th>
                            <th className="border border-gray-300 px-2 py-1 text-left">名前</th>
                            <th className="border border-gray-300 px-2 py-1 text-left">ポジション</th>
                            <th className="border border-gray-300 px-2 py-1 text-left">身長/体重</th>
                            <th className="border border-gray-300 px-2 py-1 text-left">年齢</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data?.players.filter(p => additionalPlayerIds.includes(p.id)).map((p) => (
                            <tr key={p.id}>
                              <td className="border border-gray-300 px-2 py-1">{p.number ?? "-"}</td>
                              <td className="border border-gray-300 px-2 py-1">{p.name}</td>
                              <td className="border border-gray-300 px-2 py-1">
                                {((p.position || "").toUpperCase().match(/^(FW|MF|DF|GK)$/)?.[1] as any) || ""}
                              </td>
                              <td className="border border-gray-300 px-2 py-1">
                                {p.height != null ? `${p.height}cm` : "-"}/{p.weight != null ? `${p.weight}kg` : "-"}
                              </td>
                              <td className="border border-gray-300 px-2 py-1">{p.age != null ? `${p.age}歳` : "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
