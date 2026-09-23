// mergeSquadSave（3方向マージ）の単体テスト。Firestore不要。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mergeSquadSave, subEventsSignature } from './squad-save-merge';

const snap = (over: Partial<Parameters<typeof mergeSquadSave>[0]> = {}) => ({
  events: [],
  playerStats: [],
  customStatHeaders: [],
  ...over,
});

const goal = (id: string, over: Record<string, unknown> = {}) => ({
  id, type: 'goal', minute: 10, teamId: 'home', playerId: 'p1', playerName: 'A', ...over,
});

describe('mergeSquadSave / events', () => {
  it('外部でアシスト追加されたイベントを、フォーム未編集なら保持する', () => {
    const e1 = goal('e1');
    const loaded = snap({ events: [e1] });
    const latest = snap({ events: [{ ...e1, assistPlayerId: 'p2', assistPlayerName: 'B', assistStatus: 'set' }] });
    const form = snap({ events: [e1] });
    const r = mergeSquadSave(form, loaded, latest);
    assert.equal(r.events[0].assistPlayerId, 'p2');
    assert.equal(r.adoptedExternal, true);
    assert.equal(r.conflicts.length, 0);
  });

  it('外部で削除されたイベントは、フォーム未編集なら復活させない', () => {
    const e1 = goal('e1');
    const e2 = goal('e2', { minute: 20 });
    const loaded = snap({ events: [e1, e2] });
    const latest = snap({ events: [e1] }); // e2外部削除
    const form = snap({ events: [e1, e2] }); // 古いフォーム
    const r = mergeSquadSave(form, loaded, latest);
    assert.equal(r.events.length, 1);
    assert.equal(r.events[0].id, 'e1');
  });

  it('外部削除＋フォーム編集済みのイベントは保持し競合通知する', () => {
    const e2 = goal('e2', { minute: 20 });
    const loaded = snap({ events: [e2] });
    const latest = snap({ events: [] }); // 外部削除
    const form = snap({ events: [{ ...e2, minute: 25 }] }); // フォームで編集
    const r = mergeSquadSave(form, loaded, latest);
    assert.equal(r.events.length, 1);
    assert.equal(r.events[0].minute, 25);
    assert.equal(r.conflicts.length, 1);
  });

  it('同じイベントを双方が変更した場合はフォーム優先＋競合通知', () => {
    const e1 = goal('e1');
    const loaded = snap({ events: [e1] });
    const latest = snap({ events: [{ ...e1, minute: 11 }] }); // 外部変更
    const form = snap({ events: [{ ...e1, minute: 12 }] });   // フォーム変更
    const r = mergeSquadSave(form, loaded, latest);
    assert.equal(r.events[0].minute, 12);
    assert.equal(r.conflicts.length, 1);
  });

  it('外部追加イベント（OCR確定等）は保持される', () => {
    const e1 = goal('e1');
    const ocr = goal('ocr_1', { minute: 30, source: 'ocr' });
    const loaded = snap({ events: [e1] });
    const latest = snap({ events: [e1, ocr] });
    const form = snap({ events: [e1] });
    const r = mergeSquadSave(form, loaded, latest);
    assert.equal(r.events.length, 2);
    assert.ok(r.events.some((e: any) => e.id === 'ocr_1'));
  });

  it('フォームでの削除は反映される（ロード時にありフォームに無い）', () => {
    const e1 = goal('e1');
    const e2 = goal('e2', { minute: 20 });
    const loaded = snap({ events: [e1, e2] });
    const latest = snap({ events: [e1, e2] });
    const form = snap({ events: [e1] }); // フォームでe2削除
    const r = mergeSquadSave(form, loaded, latest);
    assert.equal(r.events.length, 1);
  });
});

describe('mergeSquadSave / playerStats', () => {
  const ps = (id: string, over: Record<string, unknown> = {}) => ({
    playerId: id, playerName: id.toUpperCase(), position: 'MF', rating: 6.0, ...over,
  });

  it('フォーム未編集の評価値は外部適用を採用する', () => {
    const loaded = snap({ playerStats: [ps('p1')] });
    const latest = snap({ playerStats: [ps('p1', { rating: 7.5 })] }); // OCR適用
    const form = snap({ playerStats: [ps('p1')] });
    const r = mergeSquadSave(form, loaded, latest);
    assert.equal(r.playerStats[0].rating, 7.5);
  });

  it('フォームで編集した評価値は外部変更に優先する＋競合通知', () => {
    const loaded = snap({ playerStats: [ps('p1')] });
    const latest = snap({ playerStats: [ps('p1', { rating: 7.5 })] });
    const form = snap({ playerStats: [ps('p1', { rating: 8.0 })] });
    const r = mergeSquadSave(form, loaded, latest);
    assert.equal(r.playerStats[0].rating, 8.0);
    assert.equal(r.conflicts.length, 1);
  });

  it('外部追加の選手行を保持し、外部削除の未編集行は落とす', () => {
    const loaded = snap({ playerStats: [ps('p1'), ps('p2')] });
    const latest = snap({ playerStats: [ps('p1'), ps('p3', { position: 'GK' })] }); // p2削除+p3追加
    const form = snap({ playerStats: [ps('p1'), ps('p2')] });
    const r = mergeSquadSave(form, loaded, latest);
    const ids = r.playerStats.map((p: any) => p.playerId);
    assert.deepEqual(ids.sort(), ['p1', 'p3']);
  });

  it('配置関連フィールド（role/starterSlot）も3方向マージされる', () => {
    const loaded = snap({ playerStats: [ps('p1', { role: 'starter', starterSlot: 5 })] });
    const latest = snap({ playerStats: [ps('p1', { role: 'sub', starterSlot: undefined })] }); // 外部で先発→ベンチ
    const form = snap({ playerStats: [ps('p1', { role: 'starter', starterSlot: 5 })] });
    const r = mergeSquadSave(form, loaded, latest);
    assert.equal(r.playerStats[0].role, 'sub');
  });
});

describe('mergeSquadSave / formations・customStatHeaders', () => {
  it('フォーム未編集のフォーメーションは外部変更を採用する', () => {
    const loaded = snap({ homeFormation: '4-3-3' });
    const latest = snap({ homeFormation: '4-4-2' });
    const form = snap({ homeFormation: '4-3-3' });
    const r = mergeSquadSave(form, loaded, latest);
    assert.equal(r.homeFormation, '4-4-2');
  });

  it('フォーム編集済みフォーメーションは外部変更に優先し競合通知', () => {
    const loaded = snap({ homeFormation: '4-3-3' });
    const latest = snap({ homeFormation: '4-4-2' });
    const form = snap({ homeFormation: '3-5-2' });
    const r = mergeSquadSave(form, loaded, latest);
    assert.equal(r.homeFormation, '3-5-2');
    assert.equal(r.conflicts.length, 1);
  });
});

describe('subEventsSignature', () => {
  it('交代イベントのみの署名を生成し、他イベントは無視する', () => {
    const evs = [
      goal('g1'),
      { id: 's1', type: 'substitution', minute: 60, teamId: 'h', outPlayerId: 'a', inPlayerId: 'b' },
    ];
    const sig = subEventsSignature(evs);
    assert.ok(sig.includes('s1'));
    assert.ok(!sig.includes('g1'));
  });
});
