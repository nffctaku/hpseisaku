export interface TeamAchievement {
  id: string; // この実績レコードのユニークID
  teamId: string; // どのチームの実績か
  season: string; // 例: "2023-24"
  competitionName: string; // 大会名
  competitionLogo?: string; // 大会ロゴURL (任意)
  result: string; // 結果 (例: "優勝", "準優勝", "ベスト8")
}
