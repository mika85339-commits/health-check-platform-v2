# 足裏precision-v1 最終人間方針の設計反映 (2026-10-07)

**最終判定: RUNTIME IMPLEMENTATION NO-GO。** 人間が指定した3動作・G3・group基準を192到達ケースすべてへ反映した。判定仕様側は全件一致したが、**`candidate_muscles` 5名称上限のまま、表示されたRelated名称をすべて保存する条件は達成不能**。名称を恣意的に落としたり、広い共活動を順位証拠へ変えたりしてGOにはしない。本資料は設計simulationであって、実runtime・医学正解率の確認ではない。正本は[Phase A監査](sole-current-audit-2026-10-07.md)、[Phase B relation](sole-precision-v1-relation-design-2026-10-07.md)、[Phase C policy](sole-precision-v1-policy-review-2026-10-07.md)、[最終境界レビュー](sole-precision-v1-final-boundary-review-2026-10-07.md)。本結果の[全192ケース/28 benchmark JSON](sole-precision-v1-final-human-review-2026-10-07.json)と[再現スクリプト](../../scripts/sole-precision-v1-final-human-review.js)を併せて読む。

## 採用する質問・候補境界

質問は**詳しい場所 → 左右 → 方向付き動作 → 結果**。動作は設計済み`toe_curl`「足指を下へ曲げる」、`toes_extend`「足指を上へ反らす」、`heel_raise`「つま先立ちする」+動作不明。母趾だけの`hallux_curl`と他4趾の`other_toes_curl`はv1から外す。位置は`sole_heel`/`sole_inner`/`sole_center`/`sole_outer`/`sole_forefoot`/`location_unclear`、左右は右/左/両側/中央。6位置×4左右×8動作集合=**192 UI到達**。母趾側・小趾側に分かれた**前足部位置は現在の質問に存在しない**。位置・動作不明を特定筋へ加点しない。

選択課題で筋が活動することと、回答からその筋の症状原因を識別できることは異なる。足指を握る/押し下げる課題では健康成人の筋活動比に違いが報告されたが、その研究は一般利用者の症状回答の再現性や原因筋同定を検証していない。[Ogawaほか 2024](https://pubmed.ncbi.nlm.nih.gov/38924935/)。母趾・他4趾や足指の握り方をv1で細分化しないのは**false precisionを避ける設計判断**であり、筋活動が存在しないという意味ではない。

Mainはrankableかつ位置`P`かつactive `T`が必須。短趾屈筋は足裏中央、短母趾屈筋は足指付け根に限り位置P。他位置のPはrankableにはない。外在筋は足裏位置だけでMainにせず、TがあればAdditional、WだけならRelated。かかと/内側土踏まずにMain資格を作らない。足底筋膜・腱・靱帯・脂肪体・骨・関節は筋候補masterに0件で、病名診断をしない。足首/すね・ふくらはぎと共通する7筋/群の作用class・ID対応は前回の最終境界JSONで一致済み。足裏の荷重`heel_raise`と足首の非荷重`ankle_down`は同一質問ではなく、Main位置を流用しない。

## 15 stable ID最終分類案

以下は指定方針をrelation signatureへ機械的に適用した**v1設計上の分類**。群名は既存IDの表示名から構成し、新筋は追加しない。`GROUP`はstable IDの統合ではない。各IDのP/H/N・T/W/R/S全表は[前回資料](sole-precision-v1-final-boundary-review-2026-10-07.md)と今回JSONの`master`にある。

| stable ID / 名称 | 最終分類案 | 理由 |
| --- | --- | --- |
| `sole_flexor_digitorum_brevis` 短趾屈筋 | KEEP | 中央P+全指屈曲T。短母趾屈筋と位置資格が異なるが、屈曲だけで原因を一意化しない |
| `sole_flexor_hallucis_brevis` 短母趾屈筋 | KEEP | 前足部P+全指屈曲T。下腿由来屈筋群の同TをG3で無視しない |
| `sole_extrinsic_toe_flexors` 足趾屈筋群（下腿由来） | GROUP | 長趾屈筋/長母趾屈筋の既設計表示群。TならAdditional、足裏位置だけではMainにしない |
| `sole_extrinsic_toe_extensors` 足趾伸筋群（下腿由来） | GROUP | 長趾伸筋/長母趾伸筋の既設計表示群。伸展TでAdditionalのみ |
| `sole_gastrocnemius` 腓腹筋 | GROUP | ヒラメ筋と役割・全位置・3動作classが完全一致。別順位にせず1表示群の構成ID |
| `sole_soleus` ヒラメ筋 | GROUP | 腓腹筋と同一signature。別stable IDを保持し表示のみ群化 |
| `sole_abductor_hallucis` 母趾外転筋 | RELATED_ONLY | 内側Pでも選択動作はWのみ。位置・共活動でMain化しない |
| `sole_abductor_digiti_minimi` 小趾外転筋 | RELATED_ONLY | 外側Pでも選択動作はWのみ。小趾固有の識別質問なし |
| `sole_quadratus_plantae` 足底方形筋 | RELATED_ONLY | 屈曲W。短趾屈筋/外在屈筋群との個別識別証拠なし |
| `sole_flexor_digiti_minimi_brevis` 短小趾屈筋 | RELATED_ONLY | 屈曲W。小趾だけの選択肢なし |
| `sole_adductor_hallucis` 母趾内転筋 | RELATED_ONLY | 屈曲Wは内転の識別証拠ではない |
| `sole_lumbricals_interossei` 虫様筋・骨間筋群 | INACTIVE_IN_V1 | 提案3動作へのT/W/Sはなく、屈伸はR保留。動作を捏造してRelated/Top1にしない |
| `sole_tibialis_posterior` 後脛骨筋 | RELATED_ONLY | つま先立ちWのみ。下腿由来で足裏Main資格なし |
| `sole_fibularis_group` 腓骨筋群 | RELATED_ONLY | つま先立ちWのみ。後脛骨筋との位置差を群化で消さない |
| `sole_tibialis_anterior` 前脛骨筋 | INACTIVE_IN_V1 | 足裏採用動作にactive Tなし。伸張Sだけで順位候補にしない |

役割数はKEEP 2、GROUP構成ID 4、RELATED_ONLY 7、INACTIVE_IN_V1 2。**完全なrelation signatureが一致する個別筋は腓腹筋×ヒラメ筋だけ**。その表示群は`sole_calf_display_group`「腓腹筋・ヒラメ筋」で、`memberIds`に両stable IDを残す。短趾屈筋/短母趾屈筋/下腿由来屈筋群は全指屈曲Tを共有しても**位置signatureが異なる**ため1群へ潰さずnatural tieを許す。Related 7筋も位置/W signatureが異なり、5名称上限を回避するためだけに1群へ統合しない。`R`・weak・Related・Referenceはguardへ入れない。

## G3と192件全件の設計出力

同じ足趾屈曲軸の回答は1証拠へcapし、Pareto frontierを使う。Main内uniqueでも、TのあるAdditionalがequal/incomparable/dominatesならG3で一意表示を抑える。広い共活動のWをTへ格上げしない。Phase CのD/G3と**status・reason・Main・Additional・Related・Reference・frontierを192件1件ずつ一致**させた。候補表示では腓腹筋・ヒラメ筋だけを1表示群にした。元の2 stable IDは順位・DTOから消していない。

| 指標 | 全192件 |
| --- | ---: |
| ranked | **0** |
| tied | 32 |
| insufficient | 160 |
| Referenceあり | 48 |
| Mainあり | 32 |
| Additionalあり | 168 |
| Relatedあり | 144 |
| frontier 0 / 3 / 4 / 5 / 6 ID | 160 / 8 / 8 / 8 / 8 |

**ranked全件一覧は空 (0件)**。したがってweak/REVIEW/definition order/source order/共活動だけから生じたrankedも0。Mainあり32件はすべてtrusted Additionalとの関係を残すtiedで、MainなしAdditionalはinsufficientのまま候補を保持する。数値は医学的正解率ではない。全ケースの入力・status/reason・候補ID・表示群・保存projectionはJSONの`cases`に記録した。

## 保存5名称の厳密な境界

実装済みの`Platform.normalizeRecord()`は`topMuscles`の名前を**先頭5**だけ`candidateMuscles`へ残す。`serializePrecisionResult()`はMain/Additional/frontier/Referenceのstable IDを保存するが、**Related所属ID欄はない**。この共通DTO v1・5名称上限を変更しない。現行表示順、Related→Main→Additional→Reference、Main→Related→Additional→Referenceの3順を、選定した腓腹筋・ヒラメ筋表示群を適用した全192件で、**実際の共通serializer/normalizer**へ通した。以下の欠落は「名称出現回数 / 1件以上欠けるケース数」。

| 保存専用順序 | Main欠落 | Additional欠落 | Related欠落 | Reference欠落 | 重複名称 | DTO対象ID欠落 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 現表示順 | 0/0 | 0/0 | 388/120 | 28/16 | 0 | 0 |
| Related先頭 | 32/32 | 368/120 | **60/36** | 28/16 | 0 | 0 |
| Main→Related | **0/0** | 368/120 | **92/52** | 28/16 | 0 | 0 |

**反例は不可避**: 36ケースで同時Relatedが6〜7名称（最大7）。全5枠をRelatedへ割いても、全件合計で最低60名称が欠ける。Main名称も0欠落に保つならRelated欠落の数学的下限は**92**で、Main→Related順がその下限と一致。現表示群の腓腹筋×ヒラメ筋はAdditional名枠を節約するが、Related 7名称の同時発生を消せない。別筋を一つの文字列へ詰め込む案は、個別候補名と既存名称照合の意味を変えるため採用しない。

よって人間指定の**「Related名称そのものを保存rowから消さない」かつ「Main名称欠落0」**は、現在許可されたgroup基準・候補所属・共通DTO v1・5名称上限の同時維持では**論理的に不可能**。下腿/足首と同じRelated優先保存projectionだけでは解決しない。`precision_data`のMain/Additional/Reference stable IDは0件欠落、scoreはnull、重複0だが、これはRelated名称欠落の代替ではない。Related所属stable IDを履歴から完全復元できない既存制約も残る。DTO v2・DB migration・表示順変更・候補の恣意的な削除は今回行わない。

## benchmark 28件の更新

元のSOL-001〜028を全件保持。非採用の母趾/他4趾回答を含む**10件だけ**、v1入力では`toe_curl`へ写像し、元回答と元目的もJSONに残した。28 IDの最終入力は22通りであり、**28件を28件の独立境界試験と誤認しない**。元の母趾固有の識別目的はv1で検証不能なので、新目的を「個別筋Top1へ強制しない」へ変更した。下表はG3の設計結果で、医学的正解ラベルではない。各ケースの全候補ID/表示群はJSONの`benchmarks`にある。

| ID | v1の位置・動作 | status | 確認点 |
| --- | --- | --- | --- |
| SOL-001 | かかと・足指屈曲 | insufficient | 非筋組織/個別筋を断定しない |
| SOL-002 | かかと・つま先立ち | insufficient | 腓腹筋・ヒラメ筋表示群はAdditional |
| SOL-003 | かかと・足趾伸展 | insufficient | 屈筋Referenceはactiveではない |
| SOL-004 | 内側土踏まず・足指屈曲 | insufficient | 内在/外在とRelatedの境界 |
| SOL-005 | 内側土踏まず・つま先立ち | insufficient | アーチ位置だけでMainなし |
| SOL-006 | 中央・足指屈曲 | tied | 短趾屈筋Mainと外在Additional |
| SOL-007 | 中央・足趾伸展 | insufficient | 伸張Referenceを順位化しない |
| SOL-008 | 外側・足指屈曲 | insufficient | 小趾側RelatedをMain化しない |
| SOL-009 | 足指付け根・足指屈曲 | tied | 短母趾屈筋と下腿由来屈筋の自然tie |
| SOL-010 | 足指付け根・足趾伸展 | insufficient | 外在伸筋はAdditional |
| SOL-011 | 位置不明・足指屈曲 | insufficient | 不明でMainを捏造しない |
| SOL-012 | 中央・動作不明 | insufficient | 動作証拠なし |
| SOL-013 | 中央・足指屈曲（左） | tied | SOL-006の左右反転 |
| SOL-014 | 中央・足指屈曲+つま先立ち | tied | 異軸cross-group |
| SOL-015 | 足指付け根・屈曲+伸展 | tied | 異軸frontier |
| SOL-016 | 外側・伸展+つま先立ち | insufficient | 弱い腓骨筋をguardに入れない |
| SOL-017 | かかと・動作不明 | insufficient | 情報不足 |
| SOL-018 | 足指付け根・足指屈曲 | tied | 元母趾質問は不採用。個別筋へ強制しない |
| SOL-019 | 内側土踏まず・足指屈曲 | insufficient | 元母趾質問は不採用。位置だけでuniqueなし |
| SOL-020 | かかと・足指屈曲 | insufficient | 元母趾質問は不採用。かかとの境界 |
| SOL-021 | 足指付け根・足指屈曲 | tied | 元の全指+母趾は同軸1回答へ統合 |
| SOL-022 | 足指付け根・屈曲+つま先立ち | tied | 異軸guard |
| SOL-023 | 中央・足指屈曲 | tied | 元他4趾質問は不採用。外在筋を保持 |
| SOL-024 | 足指付け根・足指屈曲 | tied | 元他4趾質問の結果は保存せず、v1の自然tieを採用 |
| SOL-025 | 足指付け根・足指屈曲 | tied | 母趾+他4趾を重複加算しない |
| SOL-026 | 中央・足指屈曲 | tied | 全指+母趾+他4趾を3倍加算しない |
| SOL-027 | かかと・屈曲+つま先立ち | insufficient | 足首の作用境界 |
| SOL-028 | 中央・足指屈曲 | tied | 元母趾質問は不採用。下腿筋の境界 |

母趾側/小趾側の**前足部を別位置で問うケース**は現UIで到達不能。前回のSOL-029/030は人間が位置ラベルの理解度を検討するメモであり、192到達や28件の計算結果に混ぜない。既存の内側/外側と前足部のケースで境界を確認し、存在しない質問への回答を捏造しない。

## 不変条件とGO判定

mirror mismatch 0、全動作順序mismatch 0、master定義順の循環・逆順mismatch 0、source-order-only Top1 0、同軸二重加算0、display candidate loss 0。group表示は内部2 IDを保持し、DTO対象stable ID欠落0。これは**設計simulationの内部整合**であり、runtimeテストや臨床的正解ラベルではない。ranked 0は指定どおり許容し、Top1数のためにG3/位置/relationを緩めない。

**唯一の確定したGO阻害条件はRelated名称保存0欠落を満たせないこと。** 必要な次の人間判断は、(a) 共通DTO/5名称上限を将来変更することを許可する、(b) 医学的に妥当な候補所属・群化の再レビューを別途行う、(c) Related名称の完全保存要件を緩める、のいずれか。ただし今回のDTO v2/migration禁止と「名称を消さない」条件下で、ここで勝手に選ばない。runtime変更0、Netlify/Supabase/Blob操作0、stage/commit/push/deploy0。
