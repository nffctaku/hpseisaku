export const ANALYTICS_TRACKING_START_AT = new Date("2026-09-12T00:00:00+09:00");

// 選手登録操作計測（player_* イベント）の計測開始日時（タイムゾーン明記）。
// 実際に新バンドル（dpl_wZGFecyWSDH3rg3m9rzx4GEVpqu9）が本番配信されていることを
// 確認した時刻に設定。それ以前は計測可能と確認できないため「0件」として扱わない。
export const PLAYER_OPS_MEASUREMENT_START_AT = new Date("2026-09-28T17:45:00+09:00");
