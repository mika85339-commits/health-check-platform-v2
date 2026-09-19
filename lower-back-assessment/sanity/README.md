# Sanity Evidence schema

このフォルダは、Health Check LabのSanity Studioへ移植する医学研究schemaです。現行サイトのビルドはこのフォルダを直接実行しないため、既存の`post`文書や公開記事には影響しません。

1. Studio側の`schemaTypes`へ`evidence`を追加する。
2. 既存`post` schemaの`fields`へ`...postEvidenceFields`を追加する。
3. Studioでschemaをdeployする。
4. 既存記事は移行せず、必要な記事から任意で`clinicalSummary`と`evidenceClaims`を入力する。

既存フィールドは削除しません。Evidence文書の`sourceUrl`、`reviewedAt`、`reviewer`は必須で、記事側では主張ごとにEvidence参照と限界を保持します。
