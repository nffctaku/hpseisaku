export type KnockoutSlotRef =
  | { kind: "placement"; placement: string }
  | { kind: "third"; groups: string }
  | { kind: "winner"; matchId: string }
  | { kind: "loser"; matchId: string };

export type KnockoutMatchDef = {
  id: string;
  kickoffLabel: string;
  home: KnockoutSlotRef;
  away: KnockoutSlotRef;
};

export const WC2026_KNOCKOUT_MATCHES: KnockoutMatchDef[] = [
  { id: "M74", kickoffLabel: "2026/06/30 05:30", home: { kind: "placement", placement: "1E" }, away: { kind: "third", groups: "ABCDF" } },
  { id: "M77", kickoffLabel: "2026/07/01 00:00", home: { kind: "placement", placement: "1I" }, away: { kind: "third", groups: "CDEFGH" } },
  { id: "M73", kickoffLabel: "2026/06/29 04:00", home: { kind: "placement", placement: "2A" }, away: { kind: "placement", placement: "2B" } },
  { id: "M75", kickoffLabel: "2026/06/30 10:00", home: { kind: "placement", placement: "1F" }, away: { kind: "placement", placement: "2C" } },
  { id: "M83", kickoffLabel: "2026/07/03 08:00", home: { kind: "placement", placement: "2K" }, away: { kind: "placement", placement: "2L" } },
  { id: "M84", kickoffLabel: "2026/07/03 04:00", home: { kind: "placement", placement: "1H" }, away: { kind: "placement", placement: "2J" } },
  { id: "M81", kickoffLabel: "2026/07/02 09:00", home: { kind: "placement", placement: "1D" }, away: { kind: "third", groups: "BEFIJ" } },
  { id: "M82", kickoffLabel: "2026/07/02 05:00", home: { kind: "placement", placement: "1G" }, away: { kind: "third", groups: "AEHIJ" } },

  { id: "M76", kickoffLabel: "2026/06/30 02:00", home: { kind: "placement", placement: "1C" }, away: { kind: "placement", placement: "2F" } },
  { id: "M78", kickoffLabel: "2026/07/01 02:00", home: { kind: "placement", placement: "2E" }, away: { kind: "placement", placement: "2I" } },
  { id: "M79", kickoffLabel: "2026/07/01 10:00", home: { kind: "placement", placement: "1A" }, away: { kind: "third", groups: "CEFHI" } },
  { id: "M80", kickoffLabel: "2026/07/02 01:00", home: { kind: "placement", placement: "1L" }, away: { kind: "third", groups: "EHIJK" } },
  { id: "M86", kickoffLabel: "2026/07/04 07:00", home: { kind: "placement", placement: "1J" }, away: { kind: "placement", placement: "2H" } },
  { id: "M88", kickoffLabel: "2026/07/04 03:00", home: { kind: "placement", placement: "2D" }, away: { kind: "placement", placement: "2G" } },
  { id: "M85", kickoffLabel: "2026/07/03 12:00", home: { kind: "placement", placement: "1B" }, away: { kind: "third", groups: "EFGIJ" } },
  { id: "M87", kickoffLabel: "2026/07/04 10:30", home: { kind: "placement", placement: "1K" }, away: { kind: "third", groups: "DEIJL" } },

  { id: "M89", kickoffLabel: "2026/07/05 06:00", home: { kind: "winner", matchId: "M74" }, away: { kind: "winner", matchId: "M77" } },
  { id: "M90", kickoffLabel: "2026/07/05 02:00", home: { kind: "winner", matchId: "M73" }, away: { kind: "winner", matchId: "M75" } },
  { id: "M93", kickoffLabel: "2026/07/07 04:00", home: { kind: "winner", matchId: "M83" }, away: { kind: "winner", matchId: "M84" } },
  { id: "M94", kickoffLabel: "2026/07/11 04:00", home: { kind: "winner", matchId: "M81" }, away: { kind: "winner", matchId: "M82" } },

  { id: "M91", kickoffLabel: "2026/07/06 05:00", home: { kind: "winner", matchId: "M76" }, away: { kind: "winner", matchId: "M78" } },
  { id: "M92", kickoffLabel: "2026/07/06 09:00", home: { kind: "winner", matchId: "M79" }, away: { kind: "winner", matchId: "M80" } },
  { id: "M95", kickoffLabel: "2026/07/08 01:00", home: { kind: "winner", matchId: "M86" }, away: { kind: "winner", matchId: "M88" } },
  { id: "M96", kickoffLabel: "2026/07/08 05:00", home: { kind: "winner", matchId: "M85" }, away: { kind: "winner", matchId: "M87" } },

  { id: "M97", kickoffLabel: "2026/07/10 05:00", home: { kind: "winner", matchId: "M89" }, away: { kind: "winner", matchId: "M90" } },
  { id: "M98", kickoffLabel: "2026/07/11 04:00", home: { kind: "winner", matchId: "M93" }, away: { kind: "winner", matchId: "M94" } },

  { id: "M99", kickoffLabel: "2026/07/12 06:00", home: { kind: "winner", matchId: "M91" }, away: { kind: "winner", matchId: "M92" } },
  { id: "M100", kickoffLabel: "2026/07/12 10:00", home: { kind: "winner", matchId: "M95" }, away: { kind: "winner", matchId: "M96" } },

  { id: "M101", kickoffLabel: "2026/07/15 04:00", home: { kind: "winner", matchId: "M97" }, away: { kind: "winner", matchId: "M98" } },
  { id: "M102", kickoffLabel: "2026/07/16 04:00", home: { kind: "winner", matchId: "M99" }, away: { kind: "winner", matchId: "M100" } },

  { id: "M104", kickoffLabel: "2026/07/20 04:00", home: { kind: "winner", matchId: "M101" }, away: { kind: "winner", matchId: "M102" } },
  { id: "M103", kickoffLabel: "2026/07/19 06:00", home: { kind: "loser", matchId: "M101" }, away: { kind: "loser", matchId: "M102" } },
];
