# Health Check Platform v2

Health Check Lab の静的サイトです。

## 主要機能

- 体のセルフチェック
- 健康情報を調べる
- 健康情報ライブラリ
- みんなの悩み

## 健康情報ライブラリの記事管理

記事管理構造を追加しています。

- テーマ管理: `lower-back-assessment/content/truth-check/topics.json`
- 記事一覧: `lower-back-assessment/content/truth-check/articles/index.json`
- 記事データ: `lower-back-assessment/content/truth-check/articles/[slug].json`
- 記事形式: JSON

テーマの `status` は以下で管理します。

- `unused`
- `used`

記事の `status` は以下で管理します。

- `draft`
- `published`

新規記事は必ず `draft` で作成されます。医療内容、参考文献、表現の妥当性を確認してから `published` に変更してください。

## 記事追加

```bash
npm run content:add -- --title="記事タイトル" --category="SNS健康情報"
```

このコマンドで以下を自動化します。

- 記事JSONテンプレート作成
- 記事一覧JSONへのslug登録
- テーマ管理への登録
- slug重複チェック

## 検証

```bash
npm run content:validate
```

以下を確認します。

- JSON構文
- 必須項目
- 重複slug
- 重複タイトル
- status
- placeholder文
- 参考文献欄

## ビルド

```bash
npm run build
```

Netlify設定:

- build command: `node scripts/netlify-build.js`
- publish directory: `dist`

ビルド時に以下を自動生成します。

- `dist/content/truth-check/articles/index.json`
- `dist/content/truth-check/categories.json`
- `dist/content/truth-check/related.json`
- `dist/sitemap.xml`
- `dist/robots.txt`
- 公開済み記事のSEO用HTML
- Article構造化データ
- パンくず構造化データ

本番一覧には `published` の記事だけが表示されます。

## リリース

```bash
npm run release
```

以下を順番に実行します。

1. 記事データ検証
2. ビルド
3. distファイル確認
4. git status / diff
5. commit
6. push

`git` が使えない環境では、GitHub Desktopで `Push origin` を押せるよう案内します。
