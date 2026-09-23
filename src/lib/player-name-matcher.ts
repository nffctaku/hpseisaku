// OCRで読み取った選手名を登録選手へ照合する。
// 自動確定は「高確度一致」のみ。それ以外は name_only（名前のみ保持）にする。
// aliases はユーザーが確認した対応のみが登録される前提で、最優先で参照する。

export interface PlayerCandidate {
  id: string;
  name: string;
  subName?: string;
  aliases?: string[];
}

export type PlayerMatchStatus = 'matched' | 'name_only' | 'needs_input';

export interface PlayerMatchResult {
  status: PlayerMatchStatus;
  playerId?: string;
  playerName?: string; // 登録選手の正式名（matched時）
  readName?: string;   // OCR読み取り名（そのまま）
  confidence: 'exact' | 'alias' | 'surname' | 'none';
}

// 全角/半角・記号・大小・ダイアクリティカルマークを正規化する。
// OCRは "Domínguez" のようにアクセント付きで読むことがあるが、
// 登録名が "Dominguez" でも一致するようにする。
export function normalizePlayerName(name: string): string {
  return name
    .normalize('NFD')
    // ラテン文字に続く結合マークのみ除去（日本語の濁点・半濁点は保持）
    .replace(/([A-Za-z])\p{M}+/gu, '$1')
    .normalize('NFC')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .toLowerCase()
    .replace(/[\s　.．・=＝‐\-]/g, '')
    .trim();
}

// "M. Gibbs-White" / "M.Gibbs-White" / "M Gibbs-White" → { initial: 'm', surname: 'gibbswhite' }
// ドット後の空白なし（N.Williams型）も許容するが、"Morato" のような通常名は
// イニシャル形式と誤認しないよう、ドットまたは空白を必須にする。
function parseShortName(name: string): { initial: string; surname: string } | null {
  const m = name.trim().match(/^([A-Za-zÀ-Þ])(?:\.(?:\s*|(?=[^\W\d_]))|\s+)(.+)$/);
  if (!m) return null;
  return { initial: m[1].toLowerCase(), surname: normalizePlayerName(m[2]) };
}

// 候補選手名から「姓っぽい部分」を推定（スペース区切りの最後のトークン）
// "M.Gibbs-White" のように登録名自体がイニシャル+ドット形式の場合は先頭を除く。
function surnameOf(name: string): string {
  const parts = name.trim().split(/[\s　]+/);
  const last = parts[parts.length - 1] || name;
  const m = last.match(/^[A-Za-zÀ-Þ]\.(.+)$/);
  return normalizePlayerName(m ? m[1] : last);
}

export function matchPlayerName(
  readName: string | null | undefined,
  candidates: PlayerCandidate[]
): PlayerMatchResult {
  const raw = (readName ?? '').trim();
  if (!raw) {
    return { status: 'needs_input', confidence: 'none' };
  }

  const norm = normalizePlayerName(raw);

  // 1. aliases（ユーザー確認済み対応）
  for (const p of candidates) {
    if ((p.aliases || []).some((a) => normalizePlayerName(a) === norm)) {
      return { status: 'matched', playerId: p.id, playerName: p.name, readName: raw, confidence: 'alias' };
    }
  }

  // 2. 完全一致（登録名 or subName）
  for (const p of candidates) {
    if (normalizePlayerName(p.name) === norm || (p.subName && normalizePlayerName(p.subName) === norm)) {
      return { status: 'matched', playerId: p.id, playerName: p.name, readName: raw, confidence: 'exact' };
    }
  }

  // 3. イニシャル+姓パターン（"M. Gibbs-White"型）
  const short = parseShortName(raw);
  if (short) {
    const surnameHits = candidates.filter(
      (p) => surnameOf(p.name) === short.surname || (p.subName && surnameOf(p.subName) === short.surname)
    );
    if (surnameHits.length === 1) {
      const p = surnameHits[0];
      // 登録名が姓のみ（"Wood" "Delap" 等）ならイニシャル照合は免除。
      // フルネーム登録時は先頭文字がイニシャルと一致する場合のみ確定。
      const mononym = normalizePlayerName(p.name) === short.surname ||
        (p.subName !== undefined && normalizePlayerName(p.subName) === short.surname);
      const firstChar = normalizePlayerName(p.name).charAt(0);
      if (mononym || firstChar === short.initial) {
        return { status: 'matched', playerId: p.id, playerName: p.name, readName: raw, confidence: 'surname' };
      }
    }
    // 複数候補またはイニシャル不一致 → 名前のみ
    return { status: 'name_only', readName: raw, confidence: 'none' };
  }

  // 4. 姓のみの一致（単一候補のみ・部分一致はしない）
  const surnameHits = candidates.filter((p) => surnameOf(p.name) === norm);
  if (surnameHits.length === 1) {
    return { status: 'matched', playerId: surnameHits[0].id, playerName: surnameHits[0].name, readName: raw, confidence: 'surname' };
  }

  return { status: 'name_only', readName: raw, confidence: 'none' };
}
