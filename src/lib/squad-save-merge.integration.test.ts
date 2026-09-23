// commitSquadSave の統合テスト（Firestore + Auth エミュレータ必須）:
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx tsx --test src/lib/squad-save-merge.integration.test.ts
//
// 別タブ・OCR確定との同時編集で更新を失わないことを実Firestoreで確認する。
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously } from 'firebase/auth';
import {
  getFirestore, connectFirestoreEmulator,
  doc, getDoc, setDoc, collection, getDocs, type Firestore,
} from 'firebase/firestore';
import { commitSquadSave, type SquadSaveSnapshot } from './squad-save-merge';

let db: Firestore;
let clubId: string;
let matchPath: string;
let counter = 0;

const newMatch = async () => {
  counter += 1;
  const mp = `clubs/${clubId}/competitions/c1/rounds/r1/matches/m${counter}`;
  return mp;
};

const readMatch = async () => (await getDoc(doc(db, matchPath))).data()!;
const readMirrorIds = async () =>
  (await getDocs(collection(db, `${matchPath}/events`))).docs.map((d) => d.id).sort();

const snap = (over: Partial<SquadSaveSnapshot> = {}): SquadSaveSnapshot => ({
  events: [],
  playerStats: [],
  customStatHeaders: [],
  ...over,
});

const baseArgs = () => ({
  homeTeam: 'home',
  awayTeam: 'away',
  fallbackDuration: 90,
});

describe('commitSquadSave 競合安全', () => {
  before(async () => {
    const app = initializeApp({ projectId: 'demo-footchron', apiKey: 'x', authDomain: 'x' }, `merge-${Date.now()}`);
    const auth = getAuth(app);
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    db = getFirestore(app);
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    const cred = await signInAnonymously(auth);
    clubId = cred.user.uid; // ルール: clubId == auth.uid で書き込み可
  });

  test('別タブのアシスト追加を古いフォーム保存が消さない', async () => {
    matchPath = await newMatch();
    const e1 = { id: 'e1', type: 'goal', minute: 10, teamId: 'home', playerId: 'p1', playerName: 'A' };
    await setDoc(doc(db, matchPath), {
      events: [e1],
      playerStats: [{ playerId: 'p1', playerName: 'A', teamId: 'home' }],
      matchDuration: 90,
    });
    const loaded = snap({ events: [e1], playerStats: [{ playerId: 'p1', playerName: 'A', teamId: 'home' }] });

    // 外部（別タブ）でアシスト追加
    await setDoc(doc(db, matchPath), {
      events: [{ ...e1, assistPlayerId: 'p2', assistPlayerName: 'B', assistStatus: 'set' }],
    }, { merge: true });

    // 古いフォームで評価だけ編集して保存
    const form = snap({
      events: [e1],
      playerStats: [{ playerId: 'p1', playerName: 'A', teamId: 'home', rating: 8.0 }],
    });
    const res = await commitSquadSave(db, matchPath, { ...baseArgs(), form, loaded });

    const doc1 = await readMatch();
    assert.equal(doc1.events[0].assistPlayerId, 'p2'); // アシスト保持
    assert.equal(doc1.playerStats[0].rating, 8.0);     // フォームの評価は反映
    assert.equal(res.adoptedExternal, true);
  });

  test('別タブで削除されたイベントを古いフォーム保存が復活させない', async () => {
    matchPath = await newMatch();
    const e1 = { id: 'e1', type: 'goal', minute: 10, teamId: 'home', playerId: 'p1' };
    const e2 = { id: 'e2', type: 'goal', minute: 20, teamId: 'home', playerId: 'p1' };
    await setDoc(doc(db, matchPath), { events: [e1, e2], matchDuration: 90 });
    const loaded = snap({ events: [e1, e2] });

    // 外部でe2削除
    await setDoc(doc(db, matchPath), { events: [e1] }, { merge: true });

    const form = snap({ events: [e1, e2] }); // 古いフォームはe2を持つ
    await commitSquadSave(db, matchPath, { ...baseArgs(), form, loaded });

    const doc1 = await readMatch();
    assert.equal(doc1.events.length, 1);
    assert.equal(doc1.events[0].id, 'e1');
  });

  test('同一イベントの双方変更はフォーム優先＋競合通知', async () => {
    matchPath = await newMatch();
    const e1 = { id: 'e1', type: 'goal', minute: 10, teamId: 'home', playerId: 'p1' };
    await setDoc(doc(db, matchPath), { events: [e1], matchDuration: 90 });
    const loaded = snap({ events: [e1] });

    await setDoc(doc(db, matchPath), { events: [{ ...e1, minute: 11 }] }, { merge: true });

    const form = snap({ events: [{ ...e1, minute: 12 }] });
    const res = await commitSquadSave(db, matchPath, { ...baseArgs(), form, loaded });

    const doc1 = await readMatch();
    assert.equal(doc1.events[0].minute, 12);
    assert.equal(res.conflicts.length, 1);
  });

  test('OCR確定で追加されたイベントとミラーdocが保存で消えない', async () => {
    matchPath = await newMatch();
    const e1 = { id: 'e1', type: 'goal', minute: 10, teamId: 'home', playerId: 'p1' };
    await setDoc(doc(db, matchPath), { events: [e1], matchDuration: 90 });
    const loaded = snap({ events: [e1] });

    // 外部（OCR確定相当）: イベント追加 + ミラーdoc作成（原子的）
    const ocrEv = { id: 'ocr_1', type: 'goal', minute: 71, teamId: 'home', playerId: 'p2', goalKind: 'penalty', source: 'ocr' };
    await setDoc(doc(db, matchPath), { events: [e1, ocrEv] }, { merge: true });
    await setDoc(doc(db, `${matchPath}/events/evt-ocr_1`), { type: 'goal', minute: 71, teamId: 'home' });

    const form = snap({ events: [e1] });
    await commitSquadSave(db, matchPath, { ...baseArgs(), form, loaded });

    const doc1 = await readMatch();
    assert.equal(doc1.events.length, 2);
    const mirrorIds = await readMirrorIds();
    assert.ok(mirrorIds.includes('evt-ocr_1')); // 外部ミラーが削除されない
    assert.ok(mirrorIds.includes('evt-e1'));
  });

  test('フォームで削除したイベントのミラーdocは削除される', async () => {
    matchPath = await newMatch();
    const e1 = { id: 'e1', type: 'goal', minute: 10, teamId: 'home', playerId: 'p1' };
    const e2 = { id: 'e2', type: 'card', minute: 20, teamId: 'home', playerId: 'p1', cardColor: 'yellow' };
    await setDoc(doc(db, matchPath), { events: [e1, e2], matchDuration: 90 });
    await setDoc(doc(db, `${matchPath}/events/evt-e1`), { type: 'goal' });
    await setDoc(doc(db, `${matchPath}/events/evt-e2`), { type: 'card' });
    const loaded = snap({ events: [e1, e2] });

    const form = snap({ events: [e1] }); // フォームでe2削除
    await commitSquadSave(db, matchPath, { ...baseArgs(), form, loaded });

    const doc1 = await readMatch();
    assert.equal(doc1.events.length, 1);
    const mirrorIds = await readMirrorIds();
    assert.deepEqual(mirrorIds, ['evt-e1']);
  });

  test('OCR由来イベントは試合時間を120へ変更しない（手動イベントは従来通り）', async () => {
    matchPath = await newMatch();
    await setDoc(doc(db, matchPath), { events: [], matchDuration: 90 });
    const loaded = snap({ events: [] });

    // OCR由来の 93分イベントのみ → 90のまま
    const ocrForm = snap({
      events: [{ id: 'o1', type: 'goal', minute: 93, teamId: 'home', playerId: 'p1', source: 'ocr' }],
    });
    await commitSquadSave(db, matchPath, { ...baseArgs(), form: ocrForm, loaded });
    assert.equal((await readMatch()).matchDuration, 90);

    // 手動イベントの 95分 → 従来通り120
    const manualForm = snap({
      events: [
        { id: 'o1', type: 'goal', minute: 93, teamId: 'home', playerId: 'p1', source: 'ocr' },
        { id: 'm1', type: 'goal', minute: 95, teamId: 'home', playerId: 'p1' },
      ],
    });
    const loaded2 = snap({ events: [{ id: 'o1', type: 'goal', minute: 93, teamId: 'home', playerId: 'p1', source: 'ocr' }] });
    await commitSquadSave(db, matchPath, { ...baseArgs(), form: manualForm, loaded: loaded2 });
    assert.equal((await readMatch()).matchDuration, 120);
  });

  test('外部変更の選手行・フォーメーションをフォーム未編集なら保持', async () => {
    matchPath = await newMatch();
    const p1 = { playerId: 'p1', playerName: 'A', teamId: 'home', rating: 6.0, role: 'starter', starterSlot: 3 };
    await setDoc(doc(db, matchPath), {
      events: [], playerStats: [p1], homeFormation: '4-3-3', matchDuration: 90,
    });
    const loaded = snap({ playerStats: [p1], homeFormation: '4-3-3' });

    // 外部: rating変更 + フォーメーション変更 + 選手行追加
    await setDoc(doc(db, matchPath), {
      playerStats: [ { ...p1, rating: 7.5 }, { playerId: 'p9', playerName: 'I', teamId: 'away' } ],
      homeFormation: '4-4-2',
    }, { merge: true });

    // 古いフォーム: 別選手の評価だけ編集
    const form = snap({
      playerStats: [{ ...p1, position: 'MF' }], // positionだけ変更
      homeFormation: '4-3-3',
    });
    const res = await commitSquadSave(db, matchPath, { ...baseArgs(), form, loaded });

    const doc1 = await readMatch();
    const row1 = doc1.playerStats.find((p: any) => p.playerId === 'p1');
    assert.equal(row1.rating, 7.5);        // 外部rating採用
    assert.equal(row1.position, 'MF');     // フォームのposition編集保持
    assert.ok(doc1.playerStats.some((p: any) => p.playerId === 'p9')); // 外部追加行保持
    assert.equal(doc1.homeFormation, '4-4-2'); // 外部フォーメーション採用
    assert.equal(res.conflicts.length, 0);
  });

  test('イベント由来の導出スタッツがマージ後イベントで再計算される', async () => {
    matchPath = await newMatch();
    const p1 = { playerId: 'p1', playerName: 'A', teamId: 'home' };
    await setDoc(doc(db, matchPath), {
      events: [], playerStats: [p1],
      teamStats: [{ id: 'yellowCards', name: 'イエロー', homeValue: 0, awayValue: 0 }],
      matchDuration: 90,
    });
    const loaded = snap({ playerStats: [p1], events: [] });

    const form = snap({
      events: [
        { id: 'g1', type: 'goal', minute: 10, teamId: 'home', playerId: 'p1' },
        { id: 'g2', type: 'goal', minute: 55, teamId: 'home', playerId: 'p1' },
        { id: 'c1', type: 'card', minute: 60, teamId: 'home', playerId: 'p1', cardColor: 'yellow' },
      ],
      playerStats: [p1],
    });
    await commitSquadSave(db, matchPath, { ...baseArgs(), form, loaded });

    const doc1 = await readMatch();
    assert.equal(doc1.playerStats[0].goals, 2);
    assert.equal(doc1.playerStats[0].yellowCards, 1);
    assert.equal(doc1.teamStats[0].homeValue, 1);
  });
});
