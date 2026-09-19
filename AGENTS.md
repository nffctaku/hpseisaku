# 引き継ぎメモ

## 認証コード変更禁止（厳守）

ログイン・認証関連のコードは原則変更禁止。以下は変更禁止対象:

- `src/contexts/AuthContext.tsx`
- `src/components/auth-button.tsx`
- `src/lib/firebase.ts`
- Firebase Authentication 設定
- authDomain
- Google OAuth 設定
- `/__/auth/*` の rewrite（next.config.mjs）
- ログイン後のリダイレクト処理

別機能の実装中に関連コードを見つけても、整理・共通化・最適化・リファクタリングを行わないこと。

認証関連の変更がどうしても必要な場合は、実装前に必ず以下を報告し、ユーザーの明示的な許可を待つこと:

1. 変更が必要な理由
2. 変更対象ファイル
3. 本番ログインへの影響
4. ロールバック方法
5. PC・iPhoneでの検証方法

許可なく認証コードを変更しないこと。

## Java / Firebase Emulator

- Java は `C:\Users\footb\jre\jdk-17.0.20.1+1-jre\bin\java.exe` に配置済み（新規インストール不要）
- システムPATHには含まれないため、エミュレータ起動プロセス内だけでPATHに追加する:

```bash
export PATH="/c/Users/footb/jre/jdk-17.0.20.1+1-jre/bin:$PATH"
java -version  # openjdk 17.0.20.1 が確認できればOK
firebase emulators:start --only auth,firestore --project demo-footchron
```

- エミュレータポート: Auth `9099` / Firestore `8080` / UI `4000`
- エミュレータは実行間でデータを保持する（テストの clubId 等は実行ごとに一意にすること）
- 既に稼働中の場合は重複起動しない（`netstat -ano | grep -E ":8080|:9099"` で確認）

## テスト実行（エミュレータ接続）

```bash
export FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"
export FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099"
export GCLOUD_PROJECT="demo-footchron"
npx tsx --test src/lib/career-copy.integration.test.ts src/lib/career-copy-advanced.test.ts
```

実UIフロー検証（Playwright、要 dev:emulator 起動中）:
```bash
export FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"
export FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099"
export FIREBASE_EMULATOR_PROJECT_ID="demo-footchron"
export BASE_URL="http://localhost:3002"
npx tsx --tsconfig tsconfig.json .tmp/verify-ui-copy-flow.mts
```
- `/admin/test-login?email=...&plan=pro&password=...` でエミュレータ専用テストユーザーを作成/ログイン可能（通常devでは無効化される）
- 本番Firestoreの読み取り専用調査スクリプト: `.tmp/inspect-*.mts`（`FIREBASE_SERVICE_ACCOUNT_BASE64` を .env.local から読む）

## dev サーバー

- 通常起動: `npm run dev` → port **3000**（本番Firebase `hpsakusei-app` に接続）
- テスト接続: `npm run dev:emulator` → port **3002**（`scripts/start-dev.cjs --emulator` が `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=1` を付与するだけ。Java設定やEmulator本体の起動は行わない）
- クライアント側のエミュレータ接続条件は `src/lib/firebase.ts` を参照

## Career コピー（選手引き継ぎ）

- 実装: `src/lib/career-copy.ts`（`copyCareerData`）
- `copyPlayers` は Pro のみ（`isProPlan`）。Free は `Freeでは選手を引き継げません` で拒否
- `playerSourceSeasonId` と `targetStartSeasonId` は `copyPlayers` 時に必須（API側 `src/app/api/careers/route.ts` が `targetStartSeasonId` を注入）
- コピー先構造:
  - `clubs/{targetClubUid}/teams/{targetClubUid}/players/{newId}`（新IDで発行）
  - `clubs/{targetClubUid}/seasons/{targetStartSeasonId}/roster/{newId}`
- `seasonData` / `seasons` / `joinedSeason` はコピー先選手・roster双方に付与（管理画面・次シーズン引き継ぎが `seasonData[dashSeason]` 前提のため）
- `seasonData` には `PLAYER_PROFILE_FIELDS` のみ（`pickFields` で抽出。`stats`/`history`/`contract` は混入しない）
- 除外は `copied.skippedPlayerDetails`（playerId + reason）に記録。`players + skippedPlayers` が元roster対象数と一致するか照合可能
- バッチ上限: `clubs/{club}/seasons/{season}` ドキュメント分の +1 も計上済み（`assertWithinBatchLimit` 第6引数）
- 管理画面の `clubUid` は `activeCareer.clubUid` 優先で解決（`src/components/player-management.tsx`）。`user.uid` フォールバックはレガシーのみ
