# Health Check Lab Refactor Report

## 目的

サイトを軽くし、保守しやすくし、OpenAI APIやSupabaseを追加しても重くなりにくい構造へ整理した。

## 実施内容

- 未使用CSSを削除
  - 古いレイアウト用クラス
  - 未使用カード/FAQ/バー/フロー系クラス
  - 旧サンプル用の装飾クラス
- 空の `assets` フォルダを削除
- ルートを整理
  - `/health-check` を健康動画・SNS投稿チェックの正式ルートに変更
  - 旧 `/sns-trust-check` 互換ルートとフォルダを削除
- ローカル確認用ルートを維持
  - `/body-check`
  - `/health-check`
  - `/community`
  - `/about`
  - `/faq`
- Supabase通信を最適化
  - 60秒メモリキャッシュを追加
  - 同時取得時は同じfetchを共有
  - トップ/結果/community間の重複取得を削減
- OpenAI対応準備
  - API呼び出しは `analyzeWithOpenAI()` に集約
  - BodyCheckと健康投稿チェックで呼び出し先を分離
  - API失敗時も通常結果を維持

## 対象外

現在のサイトはReactではなくVanilla JSのため、以下は該当なし。

- hooks整理
- `useState`
- `useEffect`
- `useMemo`
- `useCallback`
- import tree shaking

## 計測

| 項目 | 改善前 | 改善後 |
| --- | ---: | ---: |
| `app.js` | 54,802 bytes | 55,215 bytes |
| `styles.css` | 17,551 bytes | 16,229 bytes |
| `index.html` | 2,658 bytes | 2,655 bytes |
| ローカル初回応答 | 101.15 ms | 83.74 ms |

`app.js` はBodyCheck新仕様とローカル直打ちルート対応が入っているため微増。CSSと不要資産は削減済み。

## Lighthouse

この環境では `lighthouse` CLI が見つからなかったため未計測。Netlify公開後にChrome DevToolsまたはLighthouse CLIで計測推奨。

## 次の改善候補

- `app.js` をページ単位に分割
- `/body-check` と `/health-check` を必要時ロードにする
- OpenAI Functionsを正式運用前にエラーログ設計する
- CSSをページ別に分割する
