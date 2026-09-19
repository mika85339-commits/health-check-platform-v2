# 医学情報・検索基盤の運用方針

## 目的

Health Check Labで、慢性痛・慢性腰痛・慢性的な首肩痛・慢性痛に対する鍼治療について、出典と限界を追跡できる情報基盤を運用する。検索順位やAI回答を操作するための大量ページ生成は行わない。

## 公開ゲート

- `content/medical-topics/topics.json` の新規トピックは初期状態を `draft` にする。
- `status: published`、`reviewer`、`reviewedAt` の3条件が揃うまでbuildは公開HTMLを生成しない。
- 医学的主張の追加・変更は自動公開しない。確認者が一次資料、対象集団、比較対照、効果、限界を確認する。
- 既存Sanity本文はEvidence schema導入だけでは変更しない。
- URL、canonical、本文、Schemaの内容を一致させる。

## Sanity連携

このリポジトリにはStudio本体がないため、`sanity/schemaTypes/` は外部Sanity Studioへ統合するためのschema定義である。

1. `evidence.js` をStudioのschemaTypesへ追加する。
2. 既存`post` schemaへ `postEvidenceFields` を展開する。
3. reviewer/author/tagのtype名がStudioと異なる場合だけ参照先を調整する。
4. Studio deploy前にschema validationを実行する。
5. 公開済み記事へのEvidence紐付けは編集画面で確認しながら段階的に行う。

## 記事構造

医学記事では、データが存在する場合に次を表示する。

- 結論
- 現在分かっていること
- 研究結果
- 研究の限界
- 参考文献
- 最終更新日
- 執筆者・確認者

Evidence claimは「サイト上の主張」「研究からの解釈」「限界」「参照研究」を一組として管理する。

## CrawlerとIndexNow

- build時にGooglebot、Bingbot、OAI-SearchBotを許可する`robots.txt`を生成する。
- sitemapは公開ページのみを含め、更新日があるページは`lastmod`を出力する。
- IndexNowは`INDEXNOW_KEY`設定時だけ所有確認ファイルを生成する。
- `node scripts/indexnow.js`はdry-run、`node scripts/indexnow.js --submit`だけが送信する。公開後に人が実行する。

## 計測

既存の匿名診断イベントを維持し、GA4またはdataLayerが存在する場合だけ次を追加送信する。

- `organic_landing_page`
- `line_click`
- `reservation_click`
- `muscle_check_start`
- `muscle_check_complete`
- `article_to_hariplus`
- `article_to_diagnosis`

referrer hostとUTM値を付加し、Google Search Console、Bing Webmaster Tools、AI referralの後日集計に備える。GA4 Measurement IDはこのリポジトリへハードコードしない。

## 定期監査

推奨順序:

```bash
npm run lint
npm run build
npm test
npm run content:validate
npm run seo:validate
npm run links:check
npm run audit:site
```

`audit:site`は`reports/site-audit-report.md`へ候補ページ、原因、根拠、変更案、期待する指標を出力する。修正・commit・公開は行わない。SEO変更と医学的主張の変更は、レポート確認後に別作業として扱う。

通常実行は問題候補があってもレポートを残して終了する。CIを失敗させたい明示的な監査では`node scripts/site-audit.js --strict`を使用する。

## 外部確認

- Google Rich Results TestでArticle、BreadcrumbList、Organization、LocalBusiness、ProfilePageを確認する。
- Google Search ConsoleとBing Webmaster Toolsでsitemap受信、クロール、インデックス状況を確認する。
- IndexNowはBing Webmaster Toolsでキーと送信状況を確認してから有効化する。

## Sanity公開時のNetlify再build

Git連携だけではSanityの公開・更新イベントでNetlify buildは始まらない。`netlify/functions/sanity-build-hook.js`がSanity webhook署名を検証し、検証成功時だけNetlify Build HookへPOSTする。

Netlify側の手動設定:

1. `main`用のNetlify Build Hookを作成する。
2. Netlify環境変数へ`NETLIFY_BUILD_HOOK_URL`を保存する。
3. 32文字以上のランダム値を`SANITY_WEBHOOK_SECRET`としてNetlify環境変数へ保存する。
4. Sanity Manageでdocument webhookを作成する。
5. URLを`${SITE_URL}/.netlify/functions/sanity-build-hook`にする（`SITE_URL`はNetlifyの環境変数と同じ公開origin）。
6. Datasetを`production`、HTTP methodを`POST`、filterを`_type == "post" && !(_id in path("drafts.**"))`にする。
7. Projectionを`{_id, _type, "slug": slug.current}`にし、SecretへNetlifyと同じ`SANITY_WEBHOOK_SECRET`を設定する。
8. DraftとContent Release versionの通知は有効にしない。

署名がない・古い・不正なrequest、秘密値未設定、`post`以外のdocumentではbuildを起動しない。Build Hook URLとSecretはGitへcommitしない。

## 公開後チェック

```bash
npm run check:production
```

トップ、健康コラム、body-check、Sanity記事3件、canonical、Article JSON-LD、sitemap、robots、医学ハブのreview gateを確認する。NetlifyのSPA fallbackは存在しないURLにもHTTP 200を返すため、404画面と375px/1440pxの横スクロールは実ブラウザでも確認する。
