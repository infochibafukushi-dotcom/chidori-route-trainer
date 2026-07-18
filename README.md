# chidori-route-trainer

千鳥営業所の新人向け路線学習Webアプリです。

## 初版機能
- TOP：路線図／問題／設定
- 路線番号＋路線名の選択
- 往路・復路表示
- Googleマップ＋画面下半分Street View
- 停留所ピンの確認
- 次の停留所／この路線問題
- 注意ピンを地図または住所で登録
- ヒヤリハット、アクシデント、バス停注意点、注意地点

## 公開設定
GitHubの Repository variable に `GOOGLE_MAPS_API_KEY` を登録します。
Google Cloud側は `https://infochibafukushi-dotcom.github.io/*` が登録済みのため、このアプリも対象です。

公開URL：
`https://infochibafukushi-dotcom.github.io/chidori-route-trainer/`

現在のデータ保存先はブラウザ内です。複数端末での共有は次段階でFirebaseまたはCloudflare D1へ移行します。
