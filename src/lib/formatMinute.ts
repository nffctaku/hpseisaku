/**
 * 時間をフォーマットするユーティリティ関数
 * 整数の場合はそのまま表示、小数の場合はロスタイム形式（45+1）に変換
 */
export const formatMinute = (minute: any): string => {
  // "45+2" 等の文字列表現はそのまま表示
  if (typeof minute === 'string' && /^\d{1,3}\+\d{1,2}$/.test(minute.trim())) {
    return minute.trim();
  }
  const n = typeof minute === 'number' ? minute : Number(minute);
  if (!Number.isFinite(n)) return '';
  if (Number.isInteger(n)) return `${n}`;

  const base = Math.floor(n);
  const extra = Math.round((n - base) * 1000);
  
  if (base === 45 && extra >= 1) return `45+${extra}`;
  if (base === 90 && extra >= 1) return `90+${extra}`;
  if (base === 105 && extra >= 1) return `105+${extra}`;
  if (base === 120 && extra >= 1) return `120+${extra}`;
  
  return `${n}`;
};
