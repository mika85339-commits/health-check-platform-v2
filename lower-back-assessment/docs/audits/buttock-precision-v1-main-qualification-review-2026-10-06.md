# お尻 precision-v1 Main資格の最終人間判断 (2026-10-06)

## 決定と履歴

旧案はMain資格のある位置とweak active movementだけでMain所属を認め、ハムストリングスに8件のweak-only Mainを生んだ。最終案では**Main資格のある位置とtrusted active movementの両方**を必要とする。weakだけの候補はMainにもAdditionalにも入れず、Relatedに残す。relation、筋肉master、質問、Policy D、axis cap、Pareto、trusted Additionalだけのcross-group guardは変更しない。

この共通定義はハムストリングス以外にも適用する。旧設計には大臀筋8件、中臀筋16件、小臀筋16件のweak-only Main membershipもあった。新しい判定による変化は全240件中32入力、探索672件中112入力。片側だけの中/小臀筋変更は0件。旧案と新案の全入力・全フィールド差分は[再現JSON](buttock-precision-v1-final-human-review-2026-10-03.json)の`qualificationReview.changedFinalCases`と`changedBoundaryCases`に記録した。再現コマンドは `node scripts/buttock-precision-v1-final-boundary-review.js`。

## 240件の差分

| 位置 | 動作 | 左右 | 旧MainからRelatedへ |
| --- | --- | --- | --- |
| `buttock_upper_outer` | `stand_up` / `stand_up+leg_back` / `stand_up+leg_back+knee_bend` / `stand_up+knee_bend` | 各4通り | 中臀筋・小臀筋。16入力 |
| `buttock_center` | `leg_side` / `leg_side+knee_bend` | 各4通り | 大臀筋。8入力 |
| `buttock_lower` | `stand_up` / `stand_up+leg_side` | 各4通り | ハムストリングス。8入力 |

下部の対象8件はいずれもハムストリングスの位置relation `P`、動作relationは`stand_up=H`のみ、trusted Main証拠なし。`leg_side`はハムストリングスに`N`。別筋にtrusted Additionalがあるが、ハムストリングスのMain証拠にはならない。8件とも`insufficient`のまま、reasonは`weak_main_only`から既存の`additional_without_main`へ変わる。

全32入力で変化したフィールドは`main`、`related`、`reason`のみ。status、Top、Additional、frontier、display candidatesは不変。候補identity消失0件。`ranked/tied/insufficient`は16/84/140で不変。benchmarks 24件中、BUT-003/005/009/010/015/016のMainとreasonを新期待値へ更新し、24/24件PASS。

| 筋 | 新Main | 新Additional | 新Related | unique ranked | tied Top |
| --- | ---: | ---: | ---: | ---: | ---: |
| 大臀筋 | 44 | 88 | 24 | 4 | 72 |
| 中臀筋 | 28 | 56 | 48 | 0 | 60 |
| 小臀筋 | 28 | 56 | 48 | 0 | 60 |
| ハムストリングス | 44 | 88 | 24 | 12 | 64 |
| 梨状筋 | 0 | 0 | 0 | 0 | 0 |

weak-only Main 0、weak-only Additional 0、weak-only unique ranked 0、weak/REVIEW guard混入0。中臀筋／小臀筋のnatural tie 60、片方だけMain 0、片方だけAdditional 0、definition-order unique 0。梨状筋はstable IDを保持するがv1ではinactive。探索672件のmirror、movement order、definition order、source-order-only Top1、same-axis double count、display candidate lossはすべて0。

これは候補の医学的な正解を証明する資料ではない。本番昇格にはproduction default、共通保存、375px UI、他部位回帰、cache/buildの別監査が必要。
