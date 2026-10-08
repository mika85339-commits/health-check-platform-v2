# 手首precision-v1: 最終医学lockとruntime GO判定

**判定: RUNTIME IMPLEMENTATION GO (設計段階)。** 人間が指定したG1構成、Q7の表示文、7筋のrelation、Policy D/G3を固定した。`node scripts/wrist-precision-v1-final-human-review.js`を**1回だけ**実行し、新Q7の1,280到達回答を全件計算した。これは筋候補の構造的検証であり、痛みの原因や病名を診断する臨床検証ではない。runtime/UI/保存コードは変更していない。

## 正本と差分

Phase A～Cの[現行監査](wrist-current-audit-2026-10-07.md)、[relation設計](wrist-precision-v1-relation-design-2026-10-07.md)、[policy比較](wrist-precision-v1-policy-review-2026-10-07.md)は再監査せず、前回[境界レビュー](wrist-precision-v1-final-human-review-2026-10-07.md)も履歴として残す。この文書と[機械可読JSON](wrist-precision-v1-final-lock-2026-10-08.json)が**今回確定した設計**。前回の屈筋groupの橈屈relation `B`を、FCRに基づく群レベルの`T`へ更新した。長掌筋(PL)単独のT/uniqueを意味しない。前回のranked数28を維持する条件は設けなかった。

## G1の7表示単位

現行legacyの「手首の屈筋群」「手首の伸筋群」はコード内で構成筋を列挙していない。下表を**precision-v1における運用上の正式composition**としてlockする。FCR/PL/FCU、ECRL/ECRB/ECUという手首屈伸筋の整理は[手首の機能解剖](https://pmc.ncbi.nlm.nih.gov/articles/PMC8880601/)と[手・前腕筋の解剖](https://www.ncbi.nlm.nih.gov/books/NBK537229/)を参照。PLの有無と寄与には個体差があり、PLだけで独自候補を作らない。親指群の構成筋は同じ作用を完全に共有するわけではない。[親指筋の解剖](https://www.ncbi.nlm.nih.gov/books/NBK544294/)

| stable ID | 表示名案 | 構成筋 | 明示的な除外 |
| --- | --- | --- | --- |
| `wrist_flexors_except_fcu` | 手首を曲げる筋肉（小指側を除く） | 橈側手根屈筋 FCR、長掌筋 PL | FCU、FDS、FDP、FPL |
| `wrist_extensors_except_ecu` | 手首を反らす筋肉（小指側を除く） | 長橈側手根伸筋 ECRL、短橈側手根伸筋 ECRB | ECU、ED/EDM/EI、APL/EPB/EPL |
| `wrist_finger_flexors` | 指の屈筋群 | 浅指屈筋 FDS、深指屈筋 FDP | FPL |
| `wrist_finger_extensors` | 指の伸筋群 | 総指伸筋 ED、小指伸筋 EDM、示指伸筋 EI | 親指伸筋群 |
| `wrist_thumb_abductor_extensors` | 親指を開く・伸ばす筋群 | 長母指外転筋 APL、短母指伸筋 EPB、長母指伸筋 EPL | FPL等の親指屈筋 |
| `wrist_fcu` | 尺側手根屈筋 | FCU | 非FCU屈筋groupへ含めない |
| `wrist_ecu` | 尺側手根伸筋 | ECU | 非ECU伸筋groupへ含めない |

7 stable IDと構成筋14名が相互排他的であることをJSON読み取りで照合した。表示名は候補単位の一般向け名称であり、正確な内部構成はstable IDとcompositionで固定する。groupと個別の**同じphysical muscle二重表示は0/1,280**。

## Q7文言と位置

**詳しい場所 → 左右 → 方向付き動作(1～3選択) → 結果**の3問4段階を将来runtimeの設計とする。動作不明は単独選択。側は右・左・両側・中央で、側単独加点0。表示文を以下の**正確な7件**にlockした。

| ID | 表示文 |
| --- | --- |
| `wrist_bend_palm` | 手首を手のひら側へ曲げる時 |
| `wrist_bend_back` | 手首を手の甲側へ反らす時 |
| `wrist_thumb_side` | 手首を親指側へ傾ける時 |
| `wrist_little_side` | 手首を小指側へ傾ける時 |
| `finger_flex` | 人差し指〜小指を曲げる時 |
| `finger_extend` | 人差し指〜小指を伸ばす時 |
| `thumb_open_extend` | 親指を外側へ開く・反らす時 |

橈屈は手首の移動であり、親指の開閉・伸展ではない。指屈曲はFDS/FDPの対象4指を聞くので、親指屈筋FPLを含めない。親指の統合選択肢は**APL/EPB/EPLを含む表示群へのgroup-level証拠**で、各筋が同じ作用・原因を持つ主張ではない。質問stepは増やさない。

位置は筋腹だけではなく**筋・筋腱ユニットの走行との位置的手がかり**。`P`=Main資格、`H`=近傍、`N`=通常位置支持なしで、Nもhard exclusionではない。`P`だけでMainにはしない。手首の掌側・背側・橈側・尺側には腱や非筋組織も存在し、位置から筋を断定しない。[手首解剖](https://pmc.ncbi.nlm.nih.gov/articles/PMC8880601/)、[TFCCの解剖レビュー](https://pmc.ncbi.nlm.nih.gov/articles/PMC9322592/)

| 表示単位 | 掌側 | 背側 | 親指側 | 小指側 |
| --- | :---: | :---: | :---: | :---: |
| 非FCU屈筋group | P | H | H | N |
| 非ECU伸筋group | N | P | H | N |
| 指屈筋群 | P | N | N | N |
| 指伸筋群 | N | P | N | N |
| 親指group | N | N | P | N |
| FCU | H | N | N | P |
| ECU | N | H | N | P |

## 最終Q7 relation

`T`=trusted_discriminatory、`B`=trusted_broad、`W`=weak/Related、`S`=伸張Reference、`-`=none。Q7到達回答に未決の`REVIEW`は0。`T`は表示単位を区別する設計証拠であり、症状の原因を特定した意味ではない。

| 表示単位 | 掌屈 | 背屈 | 橈屈 | 尺屈 | 4指屈曲 | 4指伸展 | 親指開き・反らし |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| 非FCU屈筋group | T | S | **T (FCR由来)** | - | W | - | - |
| 非ECU伸筋group | S | T | T | - | B | W | W |
| 指屈筋群 | W | - | - | - | T | - | - |
| 指伸筋群 | - | W | - | - | - | T | - |
| 親指group | - | - | W | - | - | - | T |
| FCU | T | S | S | T | W | - | - |
| ECU | S | T | S | T | B | W | - |

FCRを含む群とECRL/ECRB群は橈屈の主要な手首候補としてT。親指groupの橈屈relationは一部構成筋の寄与を全群の識別証拠へ拡張しないためW。橈屈だけで親指groupのuniqueは0。尺屈はFCUとECUが同じTで自然tie。掌屈は非FCU屈筋groupとFCU、背屈は非ECU伸筋groupとECUが同じTで、それぞれ単独のFCU/ECU uniqueは0。指・親指の専用動作は対応群だけT、安定化などの共活動はB/WでG3から除外。[FCR等の手首動作](https://www.ncbi.nlm.nih.gov/books/NBK537229/)、[FCU/ECUの尺屈](https://www.ncbi.nlm.nih.gov/books/NBK539760/)

旧「物を握る」「ふたやドアノブを回す」「スマートフォンやキーボード」「手をついて身体を支える」はQ7 UIから除外。旧benchmarkではcontext/Relatedとして保持し、unique ranked証拠には使わない。回す動作を[肘precision-v1](../../elbow-candidate-precision-v1.js)の前腕回内/回外と取り違えない。

## Policy D/G3

Main = `P位置 + T動作`。Additional = `非P位置 + T動作`。`B/W/位置のみ`はRelated、`S`だけはReference。Related/Reference/REVIEWは順位・G3 guardから除外する。Main内でT動作軸の集合包含によるPareto frontierを作り、Mainが支配しないAdditionalの**T候補だけ**をG3 guardに残す。equal/incomparable/Additional優位のとき、定義順や候補点数で一意Top1を作らない。MainなしAdditionalあり・位置不明・動作不明はinsufficient。Reference-onlyからMain/Additional/rankedは作らない。PL単独T/uniqueも作らない。

非筋組織である屈筋腱、伸筋腱、腱鞘、TFCC、靱帯、関節包、手根骨、神経、滑膜は筋候補masterへ入れない。診断や損傷断定をしない。位置と動作は候補の整理材料に限る。

## 1,280全件の結果

5位置(不明を含む)×4側×「7動作の1～3選択、または動作不明単独」= **1,280 UI reachable**。不明動作と具体動作の同時選択まで含めた理論組合せは1,840。抽出samplingなしで主計算1,280/1,280。前回の28/552/700へ合わせる制約を除いて計算し、**28 ranked / 548 tied / 704 insufficient**となった。前回との差はranked 0、tied -4、insufficient +4だが、**rankedの内訳は変化**している。Referenceあり284、Relatedあり1,188、MainなしAdditionalあり584。REVIEW relation到達0。

| 表示単位 | unique ranked | tied frontier | Main | Additional | Related | Reference |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 非FCU屈筋group | 4 | 288 | 152 | 608 | 248 | 112 |
| 非ECU伸筋group | 4 | 288 | 152 | 608 | 444 | 24 |
| 指屈筋群 | 4 | 212 | 88 | 352 | 420 | 0 |
| 指伸筋群 | 4 | 212 | 88 | 352 | 420 | 0 |
| 親指group | 4 | 240 | 88 | 352 | 420 | 0 |
| FCU | 4 | 284 | 152 | 608 | 232 | 132 |
| ECU | 4 | 284 | 152 | 608 | 364 | 72 |

橈屈だけの背側は、FCR側TのAdditionalがECR側Main Tと並び**自然tie**へ変わった。掌側の掌屈+橈屈は非FCU屈筋groupがFCR由来の2軸Tで、一軸ずつのFCU/ECR側を包含してranked。合計28が偶然同じでも、従来のuniqueを維持するための調整ではない。親指側+橈屈のみはMainなしでinsufficient、親指groupはRelated。親指側+専用動作では親指groupをMain候補にできる。

## ranked全28件

[JSONの`rankedCases`](wrist-precision-v1-final-lock-2026-10-08.json)に**28件それぞれ**のlocation、side、movements、勝者、T軸、全T競合、Main/Additional、guardとG3結果を保存した。左右4値で順位が変わらないため、以下7形×4側が全件である。

| 位置 | 動作 | ranked表示単位 | T軸・競合とG3の説明 |
| --- | --- | --- | --- |
| 掌側 | 掌屈+橈屈 | 非FCU屈筋group | FCR由来の2軸T。ECR群は橈屈T、FCUは掌屈Tのみ。Additional双方を包含しguardに残さない |
| 掌側 | 4指屈曲 | 指屈筋群 | 指屈曲T。他の安定化/弱い関係はB/Wでguard外 |
| 背側 | 背屈+橈屈 | 非ECU伸筋group | 2軸T。ECUは背屈T、非FCU群は橈屈Tのみ。Additional双方を包含 |
| 背側 | 4指伸展 | 指伸筋群 | 指伸展T。手首伸筋のWはguard外 |
| 親指側 | 親指を開く・反らす | 親指group | 専用動作T。位置だけ/橈屈だけではuniqueにしない |
| 小指側 | 掌屈+尺屈 | FCU | 2軸Tが非FCU群の掌屈TとECUの尺屈Tを包含 |
| 小指側 | 背屈+尺屈 | ECU | 2軸Tが非ECU群の背屈TとFCUの尺屈Tを包含 |

掌屈+尺屈/背屈+尺屈は**別々に選んだ症状誘発動作**として2軸を扱い、同時複合運動を実測したと主張しない。ranked全件でT根拠と競合軸の包含が説明可能。PL単独、B/Wのみ、group重複、定義順・source順だけのuniqueは0。

## benchmark / invariants

旧30件を削らず、新12件を加えた**42件**を今回のlockで更新。34件はQ7 UI到達、8件は旧grip/twist/type/supportを含む履歴ケース。42/42でstatus/reason/Main/Additional/Related/Reference/frontier/displayを機械的に再現。15件の独立した境界assertionで掌屈/背屈のtie、FCU/ECUのtieと分離、親指/指の専用動作、不明/Referenceを検証した。これは人間が確定したrelationとの整合テストであり、42件が臨床的正解と証明された意味ではない。

| benchmark | 最終境界 |
| --- | --- |
| WRS-001/002 | 掌屈: 非FCU群+FCU、背屈: 非ECU群+ECUのnatural tie |
| WRS-004/034 | 尺屈のみ: FCU+ECUのnatural tie |
| WRS-005/035 | 掌屈+尺屈: FCUが2軸Tでranked |
| WRS-006/036 | 背屈+尺屈: ECUが2軸Tでranked |
| WRS-003/037 | 親指側+橈屈のみ: 親指group unique 0、insufficient |
| WRS-007/008 | 掌側/背側+橈屈のみ: FCR群とECR群のTがG3でtie |
| WRS-021/023/031/033 | 親指・指伸展・指屈曲の専用動作で対応群を評価 |
| WRS-038/039 | 掌屈+橈屈 / 背屈+橈屈で2軸Tの群を評価 |
| WRS-017..020, 027..030 | 旧context入力は履歴保持し、Q7 UIからは到達しない |

mirror mismatch、movement order mismatch、definition-order mismatch、source-order-only Top1、same-axis double count、stable ID duplicate、broad-only unique、同じphysical muscle重複表示、Related/Reference guard混入、Reference ranked混入、位置だけMain、親指群の橈屈false unique、PL単独unique、表示候補欠落は**すべて0**。全Q7到達関係の重大REVIEW_REQUIREDは0。これらは設計simulation内の結果であり、未実装runtimeのPASSではない。

## GOと実装境界

[JSONの`goCriteria`](wrist-precision-v1-final-lock-2026-10-08.json)は、G1 composition、Q7、1,280全件、FCU/ECU、親指/4指、非筋組織除外、ranked全件説明、42 benchmark、全invariants、重大REVIEW_REQUIRED 0を全て`true`と判定。**RUNTIME IMPLEMENTATION GO**。次工程ではこの設計をfreezeし、runtimeが同じ1,280出力へ一致することを別途検証する。

保存は既存precision共通基盤を使用し、`diagnosis_version=wrist_precision_v1`、`symptom_score=null`、Related stable IDを保持できる`precision_data.persistenceVersion=2`を予定。新schemaは不要。今回は保存経路、AI、UI、首・肩・腰等の完成部位には触れていない。Netlify/Supabase/Blob/migration、stage/commit/push/deployは0。
