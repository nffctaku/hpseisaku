// getBookletSeasonStats / aggregateBookletStats のユニットテスト（Firestore不要）
// 実行: npx tsx --test --tsconfig tsconfig.json src/lib/booklet-stats-server.test.ts
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  aggregateBookletStats,
  getBookletSeasonStats,
  emptyBookletStats,
} from "./booklet-stats-server";

const players = [
  { id: "p1", data: { name: "Player One" } },
  { id: "p2", data: { name: "Player Two" } },
];

describe("aggregateBookletStats: 正常系", () => {
  test("match.playerStats が各選手に正しく分配される", () => {
    const map = aggregateBookletStats({
      players,
      targetSeason: "2027/28",
      matchesByCompetition: [
        {
          competitionId: "c1",
          matches: [
            {
              playerStats: [
                { playerId: "p1", minutesPlayed: 90, goals: 2, assists: 1, rating: 7.5 },
                { playerId: "p2", minutesPlayed: 45, yellowCards: 1 },
                { playerId: "other-team-player", goals: 9 }, // 対象外
              ],
            },
            { playerStats: [{ playerId: "p1", minutesPlayed: 90, goals: 1 }] },
          ],
        },
      ],
    });
    const p1 = map.get("p1")!;
    assert.equal(p1.appearances, 2);
    assert.equal(p1.goals, 3);
    assert.equal(p1.assists, 1);
    assert.equal(p1.ratingSum, 7.5);
    assert.equal(p1.ratingCount, 1);
    const p2 = map.get("p2")!;
    assert.equal(p2.appearances, 1);
    assert.equal(p2.yellowCards, 1);
    assert.equal(p2.goals, 0);
  });

  test("manualCompetitionStats がある大会は試合データを無視してmanual値を使う", () => {
    const map = aggregateBookletStats({
      players: [
        {
          id: "p1",
          data: {
            manualCompetitionStats: [
              { competitionId: "c1", season: "2027/28", matches: 5, goals: 4, assists: 3, avgRating: 8 },
            ],
          },
        },
      ],
      targetSeason: "2027/28",
      matchesByCompetition: [
        {
          competitionId: "c1",
          matches: [{ playerStats: [{ playerId: "p1", minutesPlayed: 90, goals: 99 }] }],
        },
      ],
    });
    const p1 = map.get("p1")!;
    assert.equal(p1.appearances, 5); // 試合データではなくmanual
    assert.equal(p1.goals, 4); // 99 ではない
    assert.equal(p1.minutes, 0); // manual.minutes 未指定 → 0
    assert.equal(p1.ratingSum, 40); // 8 * 5
    assert.equal(p1.ratingCount, 5);
  });

  test("同一試合内の重複 playerId は先頭エントリのみカウント（元 find() 準拠）", () => {
    const map = aggregateBookletStats({
      players,
      targetSeason: "2027/28",
      matchesByCompetition: [
        {
          competitionId: "c1",
          matches: [
            {
              playerStats: [
                { playerId: "p1", minutesPlayed: 90, goals: 1 },
                { playerId: "p1", minutesPlayed: 10, goals: 5 }, // 重複・無視されるべき
              ],
            },
          ],
        },
      ],
    });
    const p1 = map.get("p1")!;
    assert.equal(p1.goals, 1);
    assert.equal(p1.minutes, 90);
  });

  test("playerStats を持たない試合・対象外選手はスキップされる", () => {
    const map = aggregateBookletStats({
      players,
      targetSeason: "2027/28",
      matchesByCompetition: [
        { competitionId: "c1", matches: [{}, { playerStats: "broken" }, { playerStats: [] }] },
      ],
    });
    assert.deepEqual(map.get("p1"), emptyBookletStats());
    assert.deepEqual(map.get("p2"), emptyBookletStats());
  });

  test("seasonData 内の manualCompetitionStats は対象シーズン一致時のみ適用", () => {
    const playerData = {
      seasonData: {
        "2027/28": {
          manualCompetitionStats: [{ competitionId: "c1", matches: 3, goals: 2 }],
        },
        "2026/27": {
          manualCompetitionStats: [{ competitionId: "c1", matches: 9, goals: 9 }],
        },
      },
    };
    const map = aggregateBookletStats({
      players: [{ id: "p1", data: playerData }],
      targetSeason: "2027/28",
      matchesByCompetition: [{ competitionId: "c1", matches: [] }],
    });
    assert.equal(map.get("p1")!.appearances, 3); // 2026/27 の manual(9) は混入しない
  });
});

describe("getBookletSeasonStats: 異常系", () => {
  test("取得失敗時はthrowする（全選手0で誤魔化さない）", async () => {
    const throwing = async () => {
      throw new Error("simulated firestore failure");
    };
    await assert.rejects(
      () =>
        getBookletSeasonStats({
          ownerUid: "dummy",
          players,
          targetSeason: "2027/28",
          _fetchMatches: throwing,
        }),
      /simulated firestore failure/
    );
  });

  test("空の大会一覧では全選手0の正当な結果を返す（実データ0と区別可能な経路）", async () => {
    const map = await getBookletSeasonStats({
      ownerUid: "dummy",
      players,
      targetSeason: "2027/28",
      _fetchMatches: async () => [],
    });
    assert.deepEqual(map.get("p1"), emptyBookletStats());
  });
});
