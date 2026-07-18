# Firebaseクラウド同期設定

このWebアプリは、Firebaseプロジェクト `care-taxi-meter` のCloud Firestoreを使用して、停留所・注意ピン・項目設定を全端末で共有します。

## 1. GitHubのリポジトリ変数

`chidori-route-trainer` → 設定 → 秘密と変数 → Actions → 変数 に、`care-taxi-meter` と同じ値を登録します。

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_APP_ID`
- `FIREBASE_EDITOR_EMAIL` = `info.chibafukushi@gmail.com`

## 2. Firebase Authentication

Firebase Console → Authentication → ログイン方法 → Google を有効化します。

Authentication → 設定 → 承認済みドメイン に以下を追加します。

```text
infochibafukushi-dotcom.github.io
```

## 3. Firestoreルール

`care-taxi-meter` リポジトリの `firestore.rules` で、最後の包括ルールより前に以下を追加します。

```text
function isChidoriRouteEditor() {
  return request.auth != null
    && request.auth.token.email_verified == true
    && request.auth.token.email == 'info.chibafukushi@gmail.com';
}

match /chidoriRouteTrainer/{documentId} {
  allow read: if true;
  allow create, update: if isChidoriRouteEditor();
  allow delete: if false;
}
```

その後、ルールをデプロイします。

```powershell
npx.cmd firebase-tools deploy --only firestore:rules --project care-taxi-meter
```

## 動作

- 閲覧：ログイン不要。全端末で同じクラウドデータを読み込みます。
- 編集：`info.chibafukushi@gmail.com` でGoogleログインした端末のみ可能です。
- 保存：停留所・ピン・項目の変更時にFirestoreへ自動保存します。
- 他端末：再読み込みすると最新データを表示します。
