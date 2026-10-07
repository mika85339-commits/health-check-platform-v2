# すね・ふくらはぎ precision-v1 最終人間方針のdesign simulation (2026-10-06)

**結論: RUNTIME IMPLEMENTATION GO（設計段階）。** 人間が確定した質問文・7表示候補・trusted relation・G3を、既存の840 reachableへサンプリングなしで反映した。これはruntimeの動作確認や医学的正解ラベルの確定ではない。Related名の保存には、後述の**保存専用candidate順**をruntime実装時の必須契約とする。通常の表示順をそのまま保存へ渡す実装はNO-GO。runtime/既存7部位/共通DTOは今回変更していない。

正本は[Phase A](lowerleg-current-audit-2026-10-06.md)、[Phase B](lowerleg-precision-v1-relation-design-2026-10-06.md)、[Phase C](lowerleg-precision-v1-policy-review-2026-10-06.md)、[最終境界レビュー](lowerleg-precision-v1-final-boundary-review-2026-10-06.md)。再現: `node scripts/lowerleg-precision-v1-final-human-review.js`。[JSON](lowerleg-precision-v1-final-human-review-2026-10-06.json)に全840入力・ranked全36件・guard全296件・27 benchmarkを収録。既存legacy全件監査は再実行していない。`calculate()`はまだruntimeに存在せず、本design evaluatorの実呼出しは**7,340回**（基準照合、別表示比較、並び替え・鏡像等を含む）。

## 確定する質問とstable ID

質問フローは**詳しい場所 → 左右 → 方向付き動作 → 結果**の3問4段階。位置5、左右4、6動作から1〜3選択または動作不明単独で5×4×42=840。左右単独では加点しない。動作IDはPhase Bのまま変更しない。

| ID | 一般ユーザー向け表示 | 補足 |
| --- | --- | --- |
| `ankle_up` | つま先を上げる | 足関節背屈。足指だけを反らす回答とは別 |
| `heel_raise` | つま先立ち | 足関節底屈。無理に試すことは求めない |
| `foot_in` | 足首から足裏を内側へ傾ける時 | つま先の向きを変える動きではありません |
| `foot_out` | 足首から足裏を外側へ傾ける時 | つま先の向きを変える動きではありません |
| `toes_up` | 足指を上へ反らす時 | 母趾と第2〜5趾を分けない |
| `toes_down` | 足指を下へ曲げる時 | 母趾と第2〜5趾を分けない |

内外返しは脚全体の回旋ではなく足首から足裏を傾ける動作という人間決定を記録した。文言の実ユーザー理解度を測定したという主張はしない。

| 表示名 / stable ID | 元のmaster identity | 位置 前/後/内/外 | trusted動作 | weak / Reference |
| --- | --- | --- | --- | --- |
| 前脛骨筋 / `lowerleg_tibialis_anterior` | 前脛骨筋 | P N H N | `ankle_up` | 内返しW、かかと上げS |
| 足趾伸筋群 / `lowerleg_toe_extensors` | 長趾伸筋+長母趾伸筋 | P N N H | `ankle_up`, `toes_up` | group内identityを設計上保持 |
| 腓腹筋 / `lowerleg_gastrocnemius` | 腓腹筋 | N P H H | `heel_raise` | 足首上げS |
| ヒラメ筋 / `lowerleg_soleus` | ヒラメ筋 | N P H H | `heel_raise` | 足首上げS |
| 後脛骨筋 / `lowerleg_tibialis_posterior` | 後脛骨筋 | N H P N | `foot_in` | かかと上げ/足指曲げW |
| 足趾屈筋群 / `lowerleg_toe_flexors` | 長趾屈筋・長母趾屈筋 | N H P N | `foot_in`, `toes_down` | かかと上げW |
| 腓骨筋群 / `lowerleg_fibularis_group` | 腓骨筋群 | H H N P | `foot_out` | かかと上げW |

`P`=Main資格、`H`=近傍、`N`=局所根拠なしであり、`N`はhard exclusionではない。位置PだけではMainにしない。Main=P+trusted active、Additional=非P+trusted active。weak/REVIEWのみではMain/Additional/ranked/guard各0。Referenceは伸張方向の参考で、原因筋として扱わない。7 stable IDは**part内表示候補ID**であり、足首・膝の同名筋IDを変更しない。伸筋群内の長趾伸筋/長母趾伸筋は個別identityを文書に残し、v1表示/rankingでは1候補。底屈の補助作用を持ち得る後脛骨筋・足趾屈筋群・腓骨筋群を底屈だけでTへ上げない。

## 全件結果とranked全件

| 指標 | 旧境界案 | 人間方針反映後 |
| --- | ---: | ---: |
| reachable | 840 | **840** |
| ranked | 28 | **36** |
| tied | 312 | **296** |
| insufficient | 500 | **508** |
| Referenceあり | 308 | **308** |
| Relatedあり | 660 | **588** |
| MainなしAdditionalあり | 476 | **476** |
| G3 `cross_group_guard` | 300 | **284** |
| G3 `additional_dominates_main` | 4 | **12** |

差分は足趾屈筋群の`foot_in` W→Tと表示名の確定によるもの。旧案からstatus変更24件、frontier変更140件、Main/Additional所属変更220件。旧28件に数を合わせる調整はしていない。`insufficient`508の排他的reasonはMainなし位置資格312、位置不明168、動作不明16、Additional優越12。MainなしAdditional476件はtrusted候補を保持し、**「動きから関連する候補」**として表示する設計で、Mainを捏造しない。

ranked全36件は下表の**9つの位置・動作署名 × 左右4**に完全分解できる。全件の回答・winner・P位置・trusted動作・guardペアはJSON `rankedCases`にある。全winnerはP+Tで、weak/REVIEW/定義順だけのranked 0。rankedにEQUAL/INCOMPARABLE/ADDITIONAL_DOMINATESのtrusted Additionalが残る例も0。

| 位置 | 動作署名 | winner | 根拠 | 件数 |
| --- | --- | --- | --- | ---: |
| 前 | 足指反らし | 足趾伸筋群 | 前P、足指反らしT | 4 |
| 前 | 足首上げ+足指反らし | 足趾伸筋群 | 前P、2軸T | 4 |
| 前 | 足首上げ+かかと上げ+足指反らし | 足趾伸筋群 | 前P、足首上げ/足指反らしT | 4 |
| 前 | 足首上げ+足指反らし+足指曲げ | 足趾伸筋群 | 前P、足首上げ/足指反らしT | 4 |
| 内 | 足指曲げ | 足趾屈筋群 | 内P、足指曲げT | 4 |
| 内 | 内返し+足指曲げ | 足趾屈筋群 | 内P、内返し/足指曲げT | 4 |
| 内 | 内返し+外返し+足指曲げ | 足趾屈筋群 | 内P、内返し/足指曲げT | 4 |
| 内 | 内返し+足指反らし+足指曲げ | 足趾屈筋群 | 内P、内返し/足指曲げT | 4 |
| 外 | 外返し | 腓骨筋群 | 外P、外返しT | 4 |

前脛骨筋・後脛骨筋・腓腹筋・ヒラメ筋のuniqueは0。**内返し単独**は内側Pで後脛骨筋と足趾屈筋群のnatural tieになり、後脛骨筋だけのfalse uniqueを排除した。**背屈単独**は前脛骨筋と足趾伸筋群のtie。**底屈単独**は腓腹筋とヒラメ筋のtie。腓腹筋だけのunique 0、ヒラメ筋だけのunique 0、両者同率152、両者のtrusted署名差0/840。膝角度の追加質問は採用しない。

| 候補 | Main | Additional | Related | Reference | unique | tie |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 前脛骨筋 | 64 | 256 | 172 | 132 | 0 | 104 |
| 足趾伸筋群 | 108 | 432 | 0 | 0 | 16 | 216 |
| 腓腹筋 | 64 | 256 | 0 | 176 | 0 | 152 |
| ヒラメ筋 | 64 | 256 | 0 | 176 | 0 | 152 |
| 後脛骨筋 | 64 | 256 | 360 | 0 | 0 | 104 |
| 足趾屈筋群 | 108 | 432 | 140 | 0 | 16 | 212 |
| 腓骨筋群 | 64 | 256 | 220 | 0 | 4 | 144 |

## E1統合とG3境界

長趾伸筋と長母趾伸筋を別候補とした反実仮想では、両者のlocation/trusted evidence差は**0/840**。統合と別表示のstatus差は20件。16件は別表示で同率になるだけの偽の識別で、統合すると1表示候補のrankedになる。残る**4件**は前側・`foot_in+toes_down+toes_up`の左右4回答。統合案では足趾屈筋群Additionalが単一の伸筋group Mainを優越し`insufficient`、別表示案では同じ証拠を持つ伸筋2件をG3がMain 2件と数えて`cross_group_guard`のtied。**解剖学的情報の喪失ではなく、重複候補によるguard件数依存**である。隠さず[追加benchmark LLG-027](lowerleg-precision-v1-final-human-review-2026-10-06.json)に固定した。現行G3ロジックを勝手に変更せず、v1では承認済みE1を正本とする。

新G3のguard理由は`cross_group_guard`284件、`additional_dominates_main`12件。全296件の位置/動作/筋ペア/classはJSON `guard.cases`。主分類はEQUAL 24、INCOMPARABLE 256、ADDITIONAL_DOMINATES 16。MAIN_DOMINATESだけなら他条件を満たすuniqueを許す。weak/REVIEW/Related/Referenceのguard混入は0。件数の少なさを採否理由にせず、MainとAdditionalのtrusted軸の関係で判定した。

## Related名と既存保存経路

共通`precision-persistence.js`のDTO v1は`mainMuscleIds`、`additionalMuscleIds`、`frontierMuscleIds`、`referenceMuscleIds`を保持するが、Related専用欄を持たない。`body-platform.normalizeRecord()`は`topMuscles`の名前を先頭5件だけ`candidateMuscles`へ移し、serverも最大5件を保存する。**通常の画面順（Main→Additional→Related→Reference）をそのまま保存した場合、Relatedのある588回答中204回答でRelated名が5件上限から欠落する。** したがって、そのままの配線はNO-GO。`visible`が5超の回答は400、Related最多は3筋。

設計上の解決は**保存用に限るprojection**: UI表示順は維持し、`normalizeRecord()`へ渡す複製resultの`topMuscles`だけ`Related→Main→Additional→Reference`の順にする。`normalizeRecord()`の戻り値をローカル履歴へ使う場合は、その`topMuscles`を元の表示順に戻し、`candidateMuscles`だけを保存用順序のままにする。全840回答を実`serializePrecisionResult()`→`normalizeRecord()`へ通したローカルテストでRelated名の欠落0、元の表示順の破壊0、`symptomScore=null`維持、DTOサイズ最大641 bytes、score 0補完0。Main/Additional/Referenceはprecision_dataのstable IDから復元可能。表示用result自体は並べ替えない。**runtime実装時にこの保存専用projectionを必ずテストし、未実装ならrelease不可**。Related区分の履歴完全復元はDTO v1では不可で、今回だけDTOやschemaを拡張しない。この既存制約は承認済みの非blockerとして記録する。

## benchmark・invariant・判定

既存LLG-001〜026の**入力を維持**し、人間方針に沿うstatus/reason/frontier期待値と26/26照合。主な変更はLLG-009（内返し単独: 後脛骨筋unique→足趾屈筋群とtie）、LLG-012（内返し+足指曲げ: 足趾屈筋群ranked）、LLG-021/024（足趾屈筋群がtrusted poolへ追加）。E1×G3の4件境界をLLG-027として追加し、**27/27 PASS**。これは*設計期待値*であり臨床gold truthではない。

全840件に対し mirror mismatch 0、movement order mismatch 0、definition-order mismatch 0、source-order-only Top1 0、same-axis double count 0、display candidate loss 0。weak-only Main/Additional/ranked 0、weak guard参加0、rankedに未処理のtrusted challenger 0。位置hard exclusionなし。完成済み膝・太ももruntimeや将来足首のrelationは変更していない。

**最終判定: RUNTIME IMPLEMENTATION GO（この人間設計に対して）。** 重大な未決`REVIEW_REQUIRED` relationは0として扱う。次工程では保存専用Related projectionを含む実runtimeを実装し、同じ840/27/invariantを実runtimeに対して再照合すること。現段階の結果を本番PASSと表現しない。今回runtime変更0、Netlify/Supabase/Blob 0、stage/commit/push/deploy 0。
