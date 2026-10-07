# 肘precision-v1 人間医学レビュー反映・最終relation simulation (2026-10-07)

**設計判定: RUNTIME IMPLEMENTATION GO。runtimeは未実装。** 人間が承認した境界は「旧二頭筋unique 8件を許可しない」「内側+回内による群レベルunique 16件を条件付きで許可する」。[前回HOLD資料](elbow-precision-v1-final-human-review-2026-10-07.md)を履歴として保持し、本書と[全300件JSON](elbow-precision-v1-final-human-review-v2-2026-10-07.json)、[再現script](../../scripts/elbow-precision-v1-final-human-review-v2.js)をruntime実装前の最終設計正本とする。Phase A〜Cの現行監査は再実行していない。ここでの順位は**回答と筋候補の関係整理**であり、症状の原因組織・病名・確率を示さない。

## 採用範囲と最終relation

質問は**詳しい場所 → 左右 → 動作 → 結果**の3問4段階案。動作は肘を曲げる、肘を伸ばす、手のひらを上へ向ける、手のひらを下へ向けるの4種類（最大3つ選択、または排他の不明）。手首屈曲/伸展の2選択肢は**v1不採用確定**。位置5択（前・内・外・後・不明）×左右4択×動作集合15 = **300 reachable**。左右単独では筋順位を作らない。旧Phase Cの7候補以外を追加しない。

| stable ID | 表示名 / 役割 | 位置 前・内・外・後 | 動作 曲げ・伸ばし・上向き・下向き |
| --- | --- | :---: | :---: |
| `elbow_biceps_brachii` | 上腕二頭筋 / KEEP | PHNN | BSTN |
| `elbow_brachialis` | 上腕筋 / KEEP | PHNN | BSNN |
| `elbow_brachioradialis` | 腕橈骨筋 / KEEP | HNPN | BSNN |
| `elbow_triceps_brachii` | 上腕三頭筋 / KEEP | NNHP | SBNN |
| `elbow_anconeus` | 肘筋 / KEEP | NNHP | SBNN |
| `elbow_forearm_flexor_pronator_group` | 前腕屈筋・回内筋群 / GROUP | HPNN | NNRT |
| `elbow_forearm_extensor_supinator_group` | 前腕伸筋・回外筋群 / GROUP | HNPN | NNTR |

`P`=Main位置資格、`H`=近接、`N`=その質問からの位置支持なし。`T`=trusted_discriminatory、`B`=trusted_broad、`S`=伸張Reference、`R`=REVIEWで順位証拠なし、`N`=この質問での動作証拠なし。候補活動と痛みの原因は別。単純な肘屈曲（実ID `elbow_flex`）は二頭筋・上腕筋・腕橈骨筋の**B**であり、屈曲単独では個別uniqueを作らない。前腕回旋は腕橈骨筋のtrusted証拠にしない。三頭筋と肘筋は後ろ+伸展で同じB・同じ位置証拠を持ち、別名称のnatural tieを維持する。群のTは**群内に回内筋/回外筋を含む表示単位**への証拠であり、全構成筋がその作用を持つという意味ではない。

前腕屈筋・回内筋群の一般向け説明は「**この表示群には、前腕を回内する動作に関与する筋を含みます**」。前腕伸筋・回外筋群も「この表示群には、前腕を回外する動作に関与する筋を含みます」。全屈筋/全伸筋が回旋すると説明しない。健康成人EMGでは複数の屈筋の共活動と回旋時の活動差が観察されるが、個人の痛みの原因を同定した研究ではない。[屈筋EMG](https://pubmed.ncbi.nlm.nih.gov/29409427/)、[前腕屈筋・回内筋群EMG](https://pubmed.ncbi.nlm.nih.gov/36793573/)。医学的classの**採用判断は今回の人間レビュー結論**であり、これらの研究だけで臨床的精度を証明したわけではない。

## 区分・G3の最終境界

- **Main:** 位置`P` + active `T/B`が必要。位置だけでMain不可。
- **Additional:** 非`P`位置 + active `T/B`。MainなしAdditionalありは候補表示しつつ`insufficient`を許容。
- **Related:** 位置のみなど限定的な関係は順位・G3対象外。現行設計の位置のみRelatedは88/300件だが、原因やMainと同格に見せない。表示文言はruntime UX確認で扱う。
- **Reference:** 伸張`S`だけではMain/Additional/ranked/guardにならない。
- **G3:** Main内のactive軸Paretoと、識別的`T`を持つAdditionalのcross-group guardを維持する。通常のB-only Additionalは強いguardに入れない。ただしMainがBのみの単独候補になっても、Tを持たない以上**ranked禁止**。同じ動作のB-only Additionalがいても候補所属は保つ。

前回HOLDの直接原因は、二頭筋Mainの屈曲`B`軸が回外`T`のAdditionalをactive軸Paretoで支配し、guardから外したこと。**最終G3では、Mainの追加軸がBだけなら、その軸を理由に相手の識別的Tを除外しない。** AdditionalのTを識別的軸で再比較し、equal/incomparableなら自然tie、TでAdditionalが優越する場合は既存の`additional_dominates_main`として順位を保留する。Main内の一般的なB共活動や、B-only Additionalを無条件で強いguardへ昇格させない。

比較した3案は次のとおり。`global T-only`は**G3全域**をT軸比較へ置換する反実仮想で、旧tieの36件もinsufficientへ変えるため、今回の人間結論に対して変更範囲が広すぎる。`broad tie`は外側+屈曲など8件をB-onlyの3候補tieへ変える反実仮想。Tが1つもないのに同順位の筋候補を示すより、既存の`no_discriminatory_evidence`による**insufficient**を採用した。Main/Additionalの表示は消さない。

| 設計 | ranked | tied | insufficient | Phase Cからのstatus変更 | 採否 |
| --- | ---: | ---: | ---: | ---: | --- |
| Phase C | 24 | 100 | 176 | - | 旧HOLD |
| **人間レビュー反映G3** | **16** | **108** | **176** | **8** | **採用** |
| broad-onlyを同順位にする案 | 16 | 116 | 168 | 16 | 不採用 |
| G3全域をT軸へ置換 | 16 | 72 | 212 | 44 | 不採用 |

最終案ではPhase C比**status 8件、reason 8件、frontier 12件**のみ変化。frontierの追加4件は、前+屈曲+回外+回内で既にtieだった結果に回外筋を含む群を残す変更。**Main / Additional / Related / Reference / display membership変更はいずれも0件**。`300/300`をsamplingなしで設計関数へ投入した。前回Phase Cを全300件再生して完全一致した後、最終案、2反実仮想、invariants等を合わせて実計算**1,532回**。JSONの`cases`は全件の回答・区分・frontier・guardの比較を保持する。

## 旧8件: broad-assisted uniqueを全件DROP

略号: `BB`=上腕二頭筋、`BL`=上腕筋、`BR`=腕橈骨筋、`TB`=上腕三頭筋、`AN`=肘筋、`FP`=前腕屈筋・回内筋群、`ES`=前腕伸筋・回外筋群。旧8件は前方MainのBB・BLに対し、ESが識別的**回外T**を持つAdditional。BBの屈曲BでESを消さず、すべて`ranked → tied`。`G3 frontier=BB+ES`、BB unique **0件**。

| 位置/左右 | 動作 | Main | Additional | 旧→新 / G3 |
| --- | --- | --- | --- | --- |
| 前/右 | 屈曲+伸展+回外 | BB・BL | AN・BR・ES・TB | ranked→tied / BB・ES |
| 前/右 | 屈曲+回外 | BB・BL | BR・ES | ranked→tied / BB・ES |
| 前/左 | 屈曲+伸展+回外 | BB・BL | AN・BR・ES・TB | ranked→tied / BB・ES |
| 前/左 | 屈曲+回外 | BB・BL | BR・ES | ranked→tied / BB・ES |
| 前/両側 | 屈曲+伸展+回外 | BB・BL | AN・BR・ES・TB | ranked→tied / BB・ES |
| 前/両側 | 屈曲+回外 | BB・BL | BR・ES | ranked→tied / BB・ES |
| 前/中央 | 屈曲+伸展+回外 | BB・BL | AN・BR・ES・TB | ranked→tied / BB・ES |
| 前/中央 | 屈曲+回外 | BB・BL | BR・ES | ranked→tied / BB・ES |

前+回外単独はBB MainとES Additionalでtie、外+回外単独はES MainとBB Additionalでtie。外+屈曲+回外は両者のG3競合を評価し、旧規則どおり`additional_dominates_main`でinsufficient。**位置だけ**を理由にどちらかをfalse uniqueにしない。

## 旧16件: 群レベルrankedを全件KEEP

下表が最終ranked**全16件**。全件`candidate=FP`、`location=elbow_inner`、`trusted_discriminatory=forearm_pronate`、`Main=FP`、G3の識別的Additional競合**0**。位置だけではMainなし、weak依存なし、definition/source順依存なしを1件ずつ検証済み。`ranked`は**群候補**への順位であり、群内個別筋や症状原因の断定ではない。

| 位置/左右 | 動作 | T証拠 | Main | Additional | G3結果 |
| --- | --- | --- | --- | --- | --- |
| 内/右 | 屈曲+伸展+回内 | 回内 | FP | AN・BB・BL・BR・TB | FP ranked |
| 内/右 | 屈曲+回内 | 回内 | FP | BB・BL・BR | FP ranked |
| 内/右 | 伸展+回内 | 回内 | FP | AN・TB | FP ranked |
| 内/右 | 回内 | 回内 | FP | なし | FP ranked |
| 内/左 | 屈曲+伸展+回内 | 回内 | FP | AN・BB・BL・BR・TB | FP ranked |
| 内/左 | 屈曲+回内 | 回内 | FP | BB・BL・BR | FP ranked |
| 内/左 | 伸展+回内 | 回内 | FP | AN・TB | FP ranked |
| 内/左 | 回内 | 回内 | FP | なし | FP ranked |
| 内/両側 | 屈曲+伸展+回内 | 回内 | FP | AN・BB・BL・BR・TB | FP ranked |
| 内/両側 | 屈曲+回内 | 回内 | FP | BB・BL・BR | FP ranked |
| 内/両側 | 伸展+回内 | 回内 | FP | AN・TB | FP ranked |
| 内/両側 | 回内 | 回内 | FP | なし | FP ranked |
| 内/中央 | 屈曲+伸展+回内 | 回内 | FP | AN・BB・BL・BR・TB | FP ranked |
| 内/中央 | 屈曲+回内 | 回内 | FP | BB・BL・BR | FP ranked |
| 内/中央 | 伸展+回内 | 回内 | FP | AN・TB | FP ranked |
| 内/中央 | 回内 | 回内 | FP | なし | FP ranked |

## 非筋組織とnatural tie

内側の共同屈筋腱・UCL・尺骨神経、外側の共同伸筋腱・靱帯・関節/神経などは**筋候補masterに入れない**。位置だけでMain/rankedを作らず、位置資格とactive動作が必要。病名・損傷・原因筋を推定しない。後ろ+伸展は右/左/両側/中央すべて**TBとANがnatural tie**。定義順でどちらかを1位にしない。伸展だけから個別筋を識別できないことと、「どちらも原因」という意味は異なる。

## benchmark 30・不変条件・保存

旧ELB-001〜030のうち、前回資料で手首専用だった23〜30は基本4動作の到達ケースへ差し替え済み。全30件の最終status、reason、Main/Additional/Related/Reference/frontierはJSONに保存。**30/30は設計出力の固定期待値との一致**であり医学的正解率ではない。重要な5境界は次のとおり。

| ケース | 入力 | 最終結果 / 目的 |
| --- | --- | --- |
| ELB-001 | 前+屈曲 | BB/BLのnatural tie、BRはAdditional。3屈筋をuniqueにしない |
| ELB-003 | 前+回外 | BB/ES tie。Main/Additionalの位置差だけで1筋にしない |
| ELB-005 | 前+屈曲+回外 | **旧BB ranked→BB/ES tie**。broad-assisted unique除去 |
| ELB-007 | 後+伸展 | TB/AN natural tie |
| ELB-010 | 内+回内 | FP group-level ranked。位置のみでは不可 |
| ELB-013 | 外+回外 | ES/BB tie。外側位置のみでfalse uniqueにしない |
| ELB-014 | 外+屈曲 | BR Main、BB/BL AdditionalだがBのみなのでinsufficient |
| ELB-022 | 前+屈曲+回外+回内 | tie継続、ESをfrontierへ復元 |
| ELB-023 | 内+伸展+回内 | FP group-level ranked、識別的Additional競合なし |

最終全件検査: mirror mismatch **0**、movement order mismatch **0**、definition-order mismatch **0**、source-order-only Top1 **0**、same-axis double count **0**、stable ID duplicate **0**、display candidate loss **0**、非T guard混入 **0**、broad-only unique **0**、weak-only unique **0**、旧8件ranked残存 **0**、旧16件誤DROP **0**、後方tie違反 **0**、回外競合からのunique **0**、位置のみMain **0**。4動作はそれぞれ別軸なので、same-axis 0は**現質問集合**での値。30 benchmarkの`status`期待値に加え、重要な6件のfrontierをassertした。

Related stable IDを保持する保存方針は既存`persistenceVersion:2`。`diagnosis_version=elbow_precision_v1`、`symptom_score=null`、未回答safetyは3値とも`null`。全300件を[既存serializer](../../precision-persistence.js)でDTO検証し300/300 PASS、最大657 bytes。`candidate_muscles`の最大5名称summaryではRelated名が16件で外れ得るが、`precision_data.result.relatedMuscleIds`を含む**全表示stable ID欠落0**。新schema、保存runtime変更、DB書き込みはない。

## GO判定と実装時の保持事項

人間が指定した4動作/7候補、屈曲B、二頭筋と回外筋群のT競合、群レベル回内T、三頭筋/肘筋tie、内外側の非筋組織境界、旧8件DROP・旧16件KEEP、全件再現・benchmark・invariantsを満たした。**本設計境界の重大REVIEW_REQUIREDは0**として、**RUNTIME IMPLEMENTATION GO**。これは実runtimeや臨床的な原因特定精度のPASSではない。実装時も候補所属、Related/Reference、v2 stable ID、原因を断定しない文言を維持し、設計JSONとの300件1対1照合を行うこと。Netlify/Supabase/Blob/migration、stage/commit/push/deploy、runtime変更はいずれも0。
