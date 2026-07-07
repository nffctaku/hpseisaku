/**
 * 時間をフォーマットするユーティリティ関数
 * 整数の場合はそのまま表示、小数の場合はロスタイム形式（45+1）に変換
 */
export const formatMinute = (minute: any): string => {
  const n = typeof minute === 'number' ? minute : Number(minute);
  if (!Number.isFinite(n)) return '';
  if (Number.isInteger(n)) return `${n}`;

  const base = Math.floor(n);
  const extra = Math.round((n - base) * 100);
  
  if (base === 45 && extra >= 1) return `45+${extra}`;
  if (base === 90 && extra >= 1) return `90+${extra}`;
  if (base === 105 && extra >= 1) return `105+${extra}`;
  if (base === 120 && extra >= 1) return `120+${extra}`;
  
  return `${n}`;
};
