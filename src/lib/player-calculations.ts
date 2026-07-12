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
