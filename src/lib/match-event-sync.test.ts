import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mirrorDocsForEvent, arrayEventIdFromMirrorDoc } from './match-event-sync';

describe('mirrorDocsForEvent', () => {
  it('OCR拡張フィールドがミラードキュメントに保持される', () => {
    const docs = mirrorDocsForEvent({
      id: 'e1',
      type: 'goal',
      minute: 71,
      teamId: 'home',
      playerId: 'p1',
      playerName: 'モーガン・ギブス＝ホワイト',
      goalKind: 'penalty',
      playerLinkStatus: 'linked',
      source: 'ocr',
      assistStatus: 'unknown',
      needsConfirmation: false,
      minuteText: '71',
    });
    assert.equal(docs.length, 1);
    assert.equal(docs[0].id, 'evt-e1');
    assert.equal(docs[0].data.goalKind, 'penalty');
    assert.equal(docs[0].data.playerLinkStatus, 'linked');
    assert.equal(docs[0].data.source, 'ocr');
    assert.equal(docs[0].data.assistStatus, 'unknown');
    assert.equal(docs[0].data.minuteText, '71');
  });

  it('pk_missイベントもevt-としてミラーされる', () => {
    const docs = mirrorDocsForEvent({
      id: 'e2',
      type: 'pk_miss',
      minute: 24,
      teamId: 'home',
      playerName: 'M. Gibbs-White',
      playerLinkStatus: 'name_only',
      source: 'ocr',
    });
    assert.equal(docs[0].id, 'evt-e2');
    assert.equal(docs[0].data.type, 'pk_miss');
    assert.equal(docs[0].data.playerLinkStatus, 'name_only');
  });

  it('文字列minute（アディショナルタイム）が保持される', () => {
    const docs = mirrorDocsForEvent({
      id: 'e3',
      type: 'goal',
      minute: '45+2',
      teamId: 'away',
      playerName: 'A',
    });
    assert.equal(docs[0].data.minute, '45+2');
  });

  it('交代はsub-out/sub-inに分割ミラーされる', () => {
    const docs = mirrorDocsForEvent({
      id: 'e4',
      type: 'substitution',
      minute: 60,
      teamId: 'home',
      outPlayerId: 'p1',
      outPlayerName: 'OUT選手',
      inPlayerId: 'p2',
      inPlayerName: 'IN選手',
    });
    assert.equal(docs.length, 2);
    assert.equal(docs[0].id, 'sub-e4-out');
    assert.equal(docs[1].id, 'sub-e4-in');
  });

  it('undefinedフィールドはミラードキュメントから除去される', () => {
    const docs = mirrorDocsForEvent({
      id: 'e5',
      type: 'goal',
      minute: 10,
      teamId: 'home',
      playerName: 'A',
      goalKind: undefined,
      assistPlayerId: undefined,
    });
    assert.equal('goalKind' in docs[0].data, false);
    assert.equal('assistPlayerId' in docs[0].data, false);
  });
});

describe('arrayEventIdFromMirrorDoc', () => {
  it('ミラードキュメントIDからイベントIDを復元する', () => {
    assert.deepEqual(arrayEventIdFromMirrorDoc('sub-abc-out'), { eventId: 'abc', kind: 'sub_out' });
    assert.deepEqual(arrayEventIdFromMirrorDoc('sub-abc-in'), { eventId: 'abc', kind: 'sub_in' });
    assert.deepEqual(arrayEventIdFromMirrorDoc('evt-xyz'), { eventId: 'xyz', kind: 'evt' });
    assert.equal(arrayEventIdFromMirrorDoc('legacy-doc-id'), null);
  });
});
