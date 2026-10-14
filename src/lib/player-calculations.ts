/**
 * シーズン形式（例: 2025/26）から基準日（8月1日）を取得
 * @param season シーズン形式（例: 2025/26）
 * @returns 基準日（Dateオブジェクト）
 */
export function getSeasonBaseDate(season: string): Date {
  // シーズン形式から開始年を抽出（例: 2025/26 → 2025）
  const match = season.match(/^(\d{4})/);
  if (!match) {
    throw new Error(`Invalid season format: ${season}`);
  }
  const startYear = parseInt(match[1], 10);
  // シーズン基準日は開始年の8月1日
  return new Date(startYear, 7, 1); // 月は0-indexed（7 = 8月）
}

/**
 * 生年月日からシーズン基準日時点での年齢を計算
 * @param dateOfBirth 生年月日（DateオブジェクトまたはISO文字列）
 * @param season シーズン形式（例: 2025/26）
 * @returns 年齢
 */
export function calculateAge(dateOfBirth: Date | string, season: string): number {
  const birthDate = typeof dateOfBirth === 'string' ? new Date(dateOfBirth) : dateOfBirth;
  const baseDate = getSeasonBaseDate(season);

  let age = baseDate.getFullYear() - birthDate.getFullYear();
  const monthDiff = baseDate.getMonth() - birthDate.getMonth();
  const dayDiff = baseDate.getDate() - birthDate.getDate();

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age--;
  }

  return age;
}

/**
 * dateOfBirth から年齢を安全に計算（不正値は null）
 * @param dateOfBirth 生年月日（文字列想定）
 * @param season シーズン形式（例: 2025/26）
 * @returns 年齢または null
 */
export function tryCalculateAge(dateOfBirth: unknown, season: string): number | null {
  if (typeof dateOfBirth !== 'string' || !dateOfBirth.trim()) return null;
  try {
    const age = calculateAge(dateOfBirth, season);
    return Number.isFinite(age) && age > 0 && age < 100 ? age : null;
  } catch {
    return null;
  }
}

/**
 * 生年月日文字列の厳密検証（YYYY-MM-DD / YYYY/M/D のみ、実在する日付に限定）
 * new Date() は "2000-02-30" のような不存在日付を繰り上げて受理するため、
 * 名鑑年齢計算では事前にこの検証を通す
 */
export function isValidBirthDateString(dateStr: unknown): boolean {
  if (typeof dateStr !== "string") return false;
  const m = dateStr.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}

/**
 * 加入シーズンから表示シーズン時点での在籍年数を計算
 * @param joinedSeason 加入シーズン（例: 2023/24）
 * @param displaySeason 表示シーズン（例: 2025/26）
 * @returns 在籍年数（1から始まる）
 */
export function calculateTenureYears(joinedSeason: string, displaySeason: string): number {
  const joinedStartYear = parseInt(joinedSeason.split('/')[0], 10);
  const displayStartYear = parseInt(displaySeason.split('/')[0], 10);

  const tenure = displayStartYear - joinedStartYear + 1;
  return Math.max(1, tenure); // 最低1年
}

/**
 * シーズン文字列から開始年を取得
 * @param season シーズン形式（例: 2025/26）
 * @returns 開始年（例: 2025）
 */
export function getSeasonStartYear(season: string): number {
  const match = season.match(/^(\d{4})/);
  if (!match) {
    throw new Error(`Invalid season format: ${season}`);
  }
  return parseInt(match[1], 10);
}
