export const ANALYTICS_TRACKING_START_AT = new Date("2026-09-12T00:00:00+09:00");

// 選手登録操作計測（player_* イベント）の計測開始日時（タイムゾーン明記）。
// 本番デプロイ完了を見込んだ時刻に設定し、計測開始前の時間帯を
// 「イベント0件」として誤評価しないようにする。
// この日時より前の行動はイベントが存在しないため復元できない。
export const PLAYER_OPS_MEASUREMENT_START_AT = new Date("2026-09-28T17:00:00+09:00");
