import { getPlayerSeasonBreakdowns } from "../lib/playerStats";
import { SeasonBreakdownAccordion } from "./SeasonBreakdownAccordion";

export async function SeasonBreakdownSlide({
  ownerUid,
  playerId,
  playerData,
}: {
  ownerUid: string;
  playerId: string;
  playerData: any;
}) {
  const rows = await getPlayerSeasonBreakdowns(ownerUid, playerId, playerData);

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">シーズン別成績</div>
        <div className="text-xs text-white/50">{rows.length}シーズン</div>
      </div>

      <div className="mt-3">
        <SeasonBreakdownAccordion rows={rows as any} />
      </div>
    </>
  );
}
