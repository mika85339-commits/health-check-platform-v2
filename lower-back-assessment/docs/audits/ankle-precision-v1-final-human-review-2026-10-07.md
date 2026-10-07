# 足首precision-v1 最終人間レビュー反映 (2026-10-07)

**設計simulation判定: RUNTIME IMPLEMENTATION GO。runtime実装はまだ0。** 人間が確定したQ6、足趾屈筋群の内返しtrusted、7候補、位置資格、G3、保存専用projectionを[最終境界レビュー](ankle-precision-v1-final-boundary-review-2026-10-07.md)の設計関数へ反映した。[再現script](../../scripts/ankle-precision-v1-final-human-review.js)と[全840件JSON](ankle-precision-v1-final-human-review-2026-10-07.json)が正本。現行legacyのPhase A監査は再実行していない。件数は回答組合せ一様の**設計試算**で、実利用頻度・医学的正解率・原因筋の証明ではない。

## 確定仕様と境界

質問は**詳しい場所 → 左右 → 動作 → 結果**の3問4段階。動作は最大3つ、`movement_unclear`は他動作と排他。左右単独で加点しない。動作IDと一般向け文言は次のとおり。足先の上下と足指の上下は別の回答であり、説明時にも混同しない。

| ID | 質問選択肢 | 方向 |
| --- | --- | --- |
| `ankle_up` | つま先を上げる | 足関節背屈 |
| `ankle_down` | つま先を下げる | 足関節底屈 |
| `foot_in` | 足首から足裏を内側へ傾ける | 内返し |
| `foot_out` | 足首から足裏を外側へ傾ける | 外返し |
| `toes_up` | 足指を上へ反らす | 足趾伸展 |
| `toes_down` | 足指を下へ曲げる | 足趾屈曲 |

7 stable IDは`ankle_tibialis_anterior`(前脛骨筋)、`ankle_toe_extensors`(足趾伸筋群)、`ankle_gastrocnemius`(腓腹筋)、`ankle_soleus`(ヒラメ筋)、`ankle_tibialis_posterior`(後脛骨筋)、`ankle_toe_flexors`(足趾屈筋群)、`ankle_fibularis_group`(腓骨筋群)。足趾伸筋群・屈筋群・腓骨筋群はQ6で群内の個別筋を識別できないための**表示群**であり、同一筋という意味ではない。現行8 rule以外から候補を追加していない。足裏の内在筋を足首masterへ混入させない。

| 候補 | 前 | 内 | 外 | 後 | trusted動作 | その他の扱い |
| --- | :---: | :---: | :---: | :---: | --- | --- |
| 前脛骨筋 | P | H | N | N | `ankle_up` | 内返しW、底屈S、足指伸展だけではcandidateにしない |
| 足趾伸筋群 | P | N | H | N | `ankle_up`, `toes_up` | 背屈は前脛骨筋と共有 |
| 腓腹筋 | N | H | H | P | `ankle_down` | 背屈S、足指屈曲だけではcandidateにしない |
| ヒラメ筋 | N | H | H | P | `ankle_down` | 背屈S、腓腹筋と自然tie |
| 後脛骨筋 | N | P | N | H | `foot_in` | 底屈W、足指屈曲W |
| 足趾屈筋群 | N | P | N | H | **`foot_in`**, `toes_down` | 底屈W。内返しTは強さの同等性を意味しない |
| 腓骨筋群 | H | N | P | H | `foot_out` | 底屈W |

`P`はMain資格で、**Pとtrusted動作の両方**が必要。`H`/`N`でもtrusted動作があればAdditionalに残り、位置だけでhard exclusionしない。MainなしAdditionalは「動きから関連する候補」として表示し、順位を無理に確定しない。weak/REVIEWだけでMain/Additional/ranked/guardを作らず、伸ばされる方向はReferenceとして別に扱う。後ろのPは腓腹筋/ヒラメ筋の**アキレス腱を介する筋腱経路**という位置的手がかりであり、筋腹が足首後方にあるという説明やアキレス腱障害の診断にはしない。[アキレス腱の解剖研究](https://pubmed.ncbi.nlm.nih.gov/19734029/)、[足部内返しの腱moment arm原著](https://pubmed.ncbi.nlm.nih.gov/7951975/)を参照した。ただし筋作用・腱走行は痛みの原因を証明しない。

## 840件の最終結果

5位置×4左右×(6動作から1〜3個の41集合+動作不明1)=**840到達**。新runtimeの`calculate()`を呼んだという意味ではなく、確定した設計関数を全件評価した。結果と各回答のMain/Additional/Related/Reference/frontierはJSON `cases`。旧内返しW案から変わった**256回答すべて**はJSON `changedFromWeak`に旧/新を対で保存した。status遷移は旧ranked→tied 4、旧tied→ranked 12、旧tied→insufficient 8、同statusでも候補所属等が変わったもの232。件数が増減したこと自体を精度判定に使わない。

| 指標 | 最終Q6 |
| --- | ---: |
| ranked / tied / insufficient | **36 / 292 / 512** |
| Referenceあり | **308** |
| MainなしAdditionalあり | **476** |
| `main_evidence` / `cross_group_guard` / `additional_dominates_main` | 48 / 280 / 16 |
| `no_main_location_support` / `location_unclear` / `movement_unclear` | 312 / 168 / 16 |
| 前脛骨筋×足趾伸筋群を含むtop tie | 104 |
| 腓腹筋×ヒラメ筋を含むtop tie | 148 |
| 後脛骨筋×足趾屈筋群を含むtop tie | 104 |

旧W案で後脛骨筋だけがTopになった4回答は、**`ankle_inner` × `foot_in` × right/left/both/center**の全4件。最終T案ではすべて後脛骨筋×足趾屈筋群の自然tieで、後脛骨筋単独Topは**0**。同じtrusted軸なら定義順で分けず、前+背屈、後+底屈、内+内返しの各単独動作は各4側すべて自然tie。腓腹筋のみunique=0、ヒラメ筋のみunique=0。足趾屈筋群をtrustedにしたのは候補membershipのordinal分類で、後脛骨筋と筋力・確率・原因性が同じという主張ではない。

## ranked 36回答の全件

すべてMain資格位置(`P`)と記載のtrusted動作を持ち、G3のequal/incomparable/Additional優位challengeを受けずに残った。`N`=trusted Additionalなし、`D`=Mainがtrusted Additionalを軸集合で支配。Nが20件、Dが16件。G3通過は医学的原因の断定ではない。sideの`both`/`center`も独立した到達回答として数える。`toes_up`と`toes_down`を同時選択した場合も、G3が追加候補をどう扱ったかを隠さない。

| # | 位置(P) | 側 | 動作 | ranked候補 | 候補自身のtrusted動作 | G3 |
| ---: | --- | --- | --- | --- | --- | :---: |
| 01 | front | right | toes_up | 足趾伸筋群 | toes_up | N |
| 02 | front | right | ankle_up+toes_up | 足趾伸筋群 | ankle_up+toes_up | N |
| 03 | front | right | ankle_down+ankle_up+toes_up | 足趾伸筋群 | ankle_up+toes_up | D |
| 04 | front | right | ankle_up+toes_down+toes_up | 足趾伸筋群 | ankle_up+toes_up | D |
| 05 | front | left | toes_up | 足趾伸筋群 | toes_up | N |
| 06 | front | left | ankle_up+toes_up | 足趾伸筋群 | ankle_up+toes_up | N |
| 07 | front | left | ankle_down+ankle_up+toes_up | 足趾伸筋群 | ankle_up+toes_up | D |
| 08 | front | left | ankle_up+toes_down+toes_up | 足趾伸筋群 | ankle_up+toes_up | D |
| 09 | front | both | toes_up | 足趾伸筋群 | toes_up | N |
| 10 | front | both | ankle_up+toes_up | 足趾伸筋群 | ankle_up+toes_up | N |
| 11 | front | both | ankle_down+ankle_up+toes_up | 足趾伸筋群 | ankle_up+toes_up | D |
| 12 | front | both | ankle_up+toes_down+toes_up | 足趾伸筋群 | ankle_up+toes_up | D |
| 13 | front | center | toes_up | 足趾伸筋群 | toes_up | N |
| 14 | front | center | ankle_up+toes_up | 足趾伸筋群 | ankle_up+toes_up | N |
| 15 | front | center | ankle_down+ankle_up+toes_up | 足趾伸筋群 | ankle_up+toes_up | D |
| 16 | front | center | ankle_up+toes_down+toes_up | 足趾伸筋群 | ankle_up+toes_up | D |
| 17 | inner | right | toes_down | 足趾屈筋群 | toes_down | N |
| 18 | inner | right | foot_in+toes_down | 足趾屈筋群 | foot_in+toes_down | N |
| 19 | inner | right | foot_in+foot_out+toes_down | 足趾屈筋群 | foot_in+toes_down | D |
| 20 | inner | right | foot_in+toes_down+toes_up | 足趾屈筋群 | foot_in+toes_down | D |
| 21 | inner | left | toes_down | 足趾屈筋群 | toes_down | N |
| 22 | inner | left | foot_in+toes_down | 足趾屈筋群 | foot_in+toes_down | N |
| 23 | inner | left | foot_in+foot_out+toes_down | 足趾屈筋群 | foot_in+toes_down | D |
| 24 | inner | left | foot_in+toes_down+toes_up | 足趾屈筋群 | foot_in+toes_down | D |
| 25 | inner | both | toes_down | 足趾屈筋群 | toes_down | N |
| 26 | inner | both | foot_in+toes_down | 足趾屈筋群 | foot_in+toes_down | N |
| 27 | inner | both | foot_in+foot_out+toes_down | 足趾屈筋群 | foot_in+toes_down | D |
| 28 | inner | both | foot_in+toes_down+toes_up | 足趾屈筋群 | foot_in+toes_down | D |
| 29 | inner | center | toes_down | 足趾屈筋群 | toes_down | N |
| 30 | inner | center | foot_in+toes_down | 足趾屈筋群 | foot_in+toes_down | N |
| 31 | inner | center | foot_in+foot_out+toes_down | 足趾屈筋群 | foot_in+toes_down | D |
| 32 | inner | center | foot_in+toes_down+toes_up | 足趾屈筋群 | foot_in+toes_down | D |
| 33 | outer | right | foot_out | 腓骨筋群 | foot_out | N |
| 34 | outer | left | foot_out | 腓骨筋群 | foot_out | N |
| 35 | outer | both | foot_out | 腓骨筋群 | foot_out | N |
| 36 | outer | center | foot_out | 腓骨筋群 | foot_out | N |

`front/inner/outer`はそれぞれ`ankle_front/ankle_inner/ankle_outer`。筋名だけが優先順位の根拠ではなく、JSON `ranked`には各回答のID、位置資格、trusted動作・軸、G3ペア、完全な候補所属を保存した。足趾動作単独による一意候補も人間がQ6採用時に認めた**設計上の順位**であり、痛みの原因確定ではない。

## 保存専用projection

現行`precision-persistence.js` DTO v1を維持し、`diagnosis_version=ankle_precision_v1`、`symptom_score=null`、未回答`safety`3項目=nullで全件serializerに通した。保存専用の候補名称順は`Related → Main → Additional → Reference`。`body-platform.js normalizeRecord()`と実`save-diagnosis-record.mjs sanitizeRecord()`を**ローカル呼び出し**し、`candidate_muscles`5名称上限後の結果を確認した。`rank()`・画面候補順・status/各候補区分・AI内容は変更していない。

| 全件保存試算 | Q4共通300入力 | 最終Q6 840入力 |
| --- | ---: | ---: |
| Related名称欠落 | **0件/0名称** | **0件/0名称** |
| Main名称欠落 | **0/0** | **0/0** |
| duplicate名称 | **0** | **0** |
| Main/Additional/Reference/frontier stable ID欠落 | **0** | **0** |
| 上限から外れたAdditional名称 | 76件/136名称 | 204件/312名称 |
| 上限から外れたReference名称 | 80件/96名称 | 244件/276名称 |
| DTOへRelated IDを直接保存できない既存制約 | 168件/296 ID出現 | 588件/892 ID出現 |

Additional/Referenceの一部名称が5件上限から外れてもstable IDは`precision_data`に保持される。**Relatedは名称のみ**`candidate_muscles`に残り、現行DTOにはRelated所属ID欄がない。`hydratePrecisionHistory()`がRelated所属を完全復元しない制約を、人間判断どおり今回はruntime blockerにしない。「stable ID loss 0」は**DTOが保存対象として定義するMain/Additional/Reference/frontier**の意味であり、Related stable IDまで保存したという意味ではない。名前配列から筋の原因性や確率は推論しない。新field、DTO v2、migrationは追加していない。

## Benchmark・invariants・GO条件

既存ANK-001〜028は前回の内返しT反事実と最終Q6共有入力で**28/28一致**。追加ANK-029(前+足指伸展→足趾伸筋群)、ANK-030(内+足指屈曲→足趾屈筋群)、ANK-031(内+背屈+足指上下→trusted Additional優位でinsufficient)を加え、**31/31設計期待値PASS**。前/内/外/後、4足関節方向、足趾2動作、3組の自然tie、MainなしAdditional、Related、Reference、insufficient、lowerleg境界(ANK-027)、sole境界(ANK-028)を含む。JSON `benchmark`に全回答、結果、evidence、保存結果を保持。これらは臨床的な正解ラベルではない。

| invariant (Q6全840) | 件数 |
| --- | ---: |
| mirror mismatch | 0 |
| movement order mismatch (全順列) | 0 |
| definition-order mismatch | 0 |
| source-order-only Top1 | 0 |
| same-axis double count | 0 |
| display candidate loss (設計集合) | 0 |
| invalid Main / invalid Additional | 0 / 0 |
| weak-only ranked / non-trusted guard | 0 / 0 |

**RUNTIME IMPLEMENTATION GO**は「人間確定の設計をローカルruntimeへ実装してよい」の意味であり、production GOではない。Q6/7筋/位置P/足趾屈筋群内返しT/G3/後脛骨筋単独Top0/保存名称欠落0/DTO対象stable ID欠落0/全840・31 benchmark・invariants全0が揃い、Related履歴制約は明示的に受容済み。重大REVIEW_REQUIREDはこの設計判断に関して0。ただしruntime実装後は実UI・保存・AI・既存部位回帰を別途確認する必要がある。今回はruntime、完成済み部位、DB、Netlify、Supabase、Blobを変更しておらず、stage/commit/push/deployも0。
