# Health Check Platform v2

Health Check Labは、体のセルフチェック、健康情報の確認、健康情報ライブラリを提供する静的Webアプリです。

## 主な機能

- 体のセルフチェック
- 健康情報を調べる
- 健康情報ライブラリ
- みんなの悩み共有
- ハリプラス鍼灸院のプロフィールページ

## 記事管理

- テーマ管理: `lower-back-assessment/content/truth-check/topics.json`
- 記事一覧: `lower-back-assessment/content/truth-check/articles/index.json`
- 記事データ: `lower-back-assessment/content/truth-check/articles/[slug].json`
- 記事形式: JSON

テーマの `status` は以下です。

- `unused`: 未生成
- `used`: 生成済み

記事の `status` は以下です。

- `draft`: 下書き
- `published`: 公開

本番サイトへ出るのは `published` の記事だけです。
`draft` の記事は記事一覧、検索、カテゴリ一覧、関連記事、RSS、サイトマップ、構造化データへ出しません。

## Step8: 記事自動生成・承認公開・名古屋地域SEO・AI検索対策

Step8では、健康情報ライブラリの記事運用を「自動生成、確認、承認、公開」に分けて管理します。

### GitHub Actions

- Workflow: `.github/workflows/generate-content.yml`
- 実行日: 毎月1日、4日、7日、10日、13日、16日、19日、22日、25日、28日
- 実行時刻: UTC 0:00、日本時間 9:00
- 手動実行: GitHub Actionsの `workflow_dispatch`
- 生成記事: 必ず `status: draft`
- 公開記事: 人が確認して `status: published` に変更した記事のみ
- 初期3記事: 自動公開しない

### コマンド

```bash
npm run content:generate
npm run content:validate
npm run content:preview -- --slug=article-slug
npm run content:publish -- --slug=article-slug
npm run seo:validate
npm run links:check
npm run build
npm run release
```

### コマンドの役割

- `content:generate`: 未使用テーマから1記事をdraft生成
- `content:validate`: 記事、参考文献、構造化データ、院情報を検査
- `content:preview`: draft記事の確認用HTMLを生成
- `content:publish`: 承認された記事だけ公開データへ反映
- `seo:validate`: SEO、構造化データ、公開ルールを検査
- `links:check`: 内部リンクと静的ファイルの存在確認
- `build`: Netlify用の `dist` を生成
- `release`: 検証、ビルド、commit、push可能性確認まで実行

## 院情報の管理

院情報は `lower-back-assessment/content/clinic/clinic-profile.json` で一元管理します。

所在地、電話番号、営業時間、料金、予約URLなど未確認の情報は推測で公開せず、`todoFields` に残します。
院情報を変更した場合は、ビルド時にプロフィールページと構造化データへ反映されます。

## 名古屋地域ページ

地域ページの管理データは `lower-back-assessment/content/region/nagoya-pages.json` です。

対応予定のページ構造:

- `/nagoya/`
- `/nagoya/lower-back-pain/`
- `/nagoya/shoulder-stiffness/`
- `/nagoya/sciatica/`
- `/nagoya/neck-pain/`
- `/nagoya/autonomic-nervous-system/`
- `/nagoya/headache/`

所在地や対応内容が未確認の間は `draft` のままにします。
`draft` の地域ページは公開ページ、サイトマップ、構造化データには出ません。

## 必要なGitHub Secrets

- `OPENAI_API_KEY`: AI記事下書き生成に使用
- `OPENAI_MODEL`: 任意。未設定時は `gpt-4.1-mini`
- `NOTIFICATION_WEBHOOK_URL`: 任意。記事生成、公開、エラー通知に使用

## 承認方法

まずは記事JSONの `status` を `draft` から `published` に変更する方式です。

承認前には次を実行します。

```bash
npm run content:preview -- --slug=article-slug
```

確認用HTMLで、記事タイトル、カテゴリ、要約、参考文献、警告、公開予定URL、地域ページとの関連、院への案内文、検証結果を確認します。

承認後は次を実行します。

```bash
npm run content:publish -- --slug=article-slug
npm run build
```

## 品質チェック

`content:validate` と `seo:validate` では以下を検査します。

- JSON構文
- 必須項目
- slug重複
- タイトル重複
- canonical重複
- 仮文章
- 参考文献不足
- 存在しない内部リンク
- 公開日不正
- 医療上の断定表現
- 院情報との矛盾
- 構造化データ構文
- draft記事の本番混入
- noindexページのサイトマップ混入

重大なエラーがある場合は、公開、commit、pushを停止します。

## Netlify

- Build command: `node scripts/netlify-build.js`
- Publish directory: `dist`

Netlify Deploysでは、`/clinic-profile`、`/sitemap.xml`、`/robots.txt`、`/rss.xml`、公開済み記事ページを確認してください。
