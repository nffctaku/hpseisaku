import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { matchPlayerName, normalizePlayerName } from './player-name-matcher';

const players = [
  { id: 'p1', name: 'モーガン・ギブス＝ホワイト', subName: 'Morgan Gibbs-White' },
  { id: 'p2', name: '田中 太郎', aliases: ['T. Tanaka'] },
  { id: 'p3', name: '佐藤 一郎' },
  { id: 'p4', name: '鈴木 次郎' },
];

describe('normalizePlayerName', () => {
  it('全角英数・記号・空白を正規化する', () => {
    assert.equal(normalizePlayerName('Ｍ．　ギブス'), 'mギブス');
    assert.equal(normalizePlayerName('M. Gibbs-White'), 'mgibbswhite');
    assert.equal(normalizePlayerName('モーガン・ギブス＝ホワイト'), 'モーガンギブスホワイト');
  });

  it('ダイアクリティカルマークを除去する（OCRはアクセント付きで読む）', () => {
    assert.equal(normalizePlayerName('N. Domínguez'), 'ndominguez');
    assert.equal(normalizePlayerName('D. Muñoz'), 'dmunoz');
    assert.equal(normalizePlayerName('I. Sangaré'), 'isangare');
    assert.equal(normalizePlayerName('N. Milenković'), 'nmilenkovic');
  });
});

describe('matchPlayerName', () => {
  it('空・未読み取りは needs_input', () => {
    assert.equal(matchPlayerName(null, players).status, 'needs_input');
    assert.equal(matchPlayerName('', players).status, 'needs_input');
    assert.equal(matchPlayerName('   ', players).status, 'needs_input');
  });

  it('aliases一致で確定（ユーザー確認済み対応）', () => {
    const r = matchPlayerName('T. Tanaka', players);
    assert.equal(r.status, 'matched');
    assert.equal(r.playerId, 'p2');
    assert.equal(r.confidence, 'alias');
  });

  it('subName完全一致で確定', () => {
    const r = matchPlayerName('Morgan Gibbs-White', players);
    assert.equal(r.status, 'matched');
    assert.equal(r.playerId, 'p1');
    assert.equal(r.confidence, 'exact');
  });

  it('登録名完全一致で確定', () => {
    const r = matchPlayerName('田中 太郎', players);
    assert.equal(r.status, 'matched');
    assert.equal(r.playerId, 'p2');
  });

  it('イニシャル+姓が登録名と一意に一致すれば確定', () => {
    // "T. 田中" は 田中太郎（姓=田中, 名頭=T? 日本語名なのでイニシャル不一致→name_only想定）
    const r = matchPlayerName('T. Suzuki', [
      { id: 'p5', name: 'Taro Suzuki' },
    ]);
    // surname=Suzuki 一意一致 + イニシャルT=Taro → matched
    assert.equal(r.status, 'matched');
    assert.equal(r.playerId, 'p5');
  });

  it('イニシャルが一致しない場合はname_only', () => {
    const r = matchPlayerName('K. Suzuki', [
      { id: 'p5', name: 'Taro Suzuki' },
    ]);
    assert.equal(r.status, 'name_only');
    assert.equal(r.readName, 'K. Suzuki');
  });

  it('同姓の複数候補がある場合はname_only（誤確定しない）', () => {
    const r = matchPlayerName('T. Suzuki', [
      { id: 'p5', name: 'Taro Suzuki' },
      { id: 'p6', name: 'Tom Suzuki' },
    ]);
    assert.equal(r.status, 'name_only');
  });

  it('アクセント付きOCR名が無アクセント登録名に一致する', () => {
    const r = matchPlayerName('N. Domínguez', [
      { id: 'p7', name: 'Nicolas Dominguez' },
    ]);
    assert.equal(r.status, 'matched');
    assert.equal(r.playerId, 'p7');
  });

  it('候補なしはname_only', () => {
    const r = matchPlayerName('M. Gibbs-White', []);
    assert.equal(r.status, 'name_only');
    assert.equal(r.readName, 'M. Gibbs-White');
  });

  it('他ユーザーの選手は候補に含めない前提でname_onlyになる', () => {
    const r = matchPlayerName('Unknown Player', players);
    assert.equal(r.status, 'name_only');
  });

  it('ドット後に空白がないイニシャル形式（N.Williams）も照合する', () => {
    const r = matchPlayerName('N.Williams', [
      { id: 'p8', name: 'Neco Williams' },
    ]);
    assert.equal(r.status, 'matched');
    assert.equal(r.playerId, 'p8');
  });

  it('登録名が姓のみ（単名）ならイニシャル照合を免除して確定', () => {
    assert.equal(matchPlayerName('C. Wood', [{ id: 'p9', name: 'Wood' }]).playerId, 'p9');
    assert.equal(matchPlayerName('L. Delap', [{ id: 'p10', name: 'Delap' }]).playerId, 'p10');
    assert.equal(matchPlayerName('O. Aina', [{ id: 'p11', name: 'Aina' }]).playerId, 'p11');
  });

  it('登録名が M.Gibbs-White 型（スペースなし）でも照合する', () => {
    const r = matchPlayerName('M. Gibbs-White', [{ id: 'p12', name: 'M.Gibbs-White' }]);
    assert.equal(r.status, 'matched');
    assert.equal(r.playerId, 'p12');
  });

  it('通常名（Morato等）をイニシャル形式と誤認しない（回帰）', () => {
    // "Morato" が {initial:'m', surname:'orato'} と誤パースされると姓照合に到達しない
    const r = matchPlayerName('Morato', [{ id: 'p13', name: 'Fabio Morato' }]);
    assert.equal(r.status, 'matched');
    assert.equal(r.playerId, 'p13');
  });

  it('イニシャル不一致のガードは維持（X. Sangaré→I.Sangaréはname_only）', () => {
    const r = matchPlayerName('X. Sangaré', [{ id: 'p14', name: 'I.Sangaré' }]);
    assert.equal(r.status, 'name_only');
  });
});
