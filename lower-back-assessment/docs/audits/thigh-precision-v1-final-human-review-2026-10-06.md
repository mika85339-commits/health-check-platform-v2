# 太ももprecision-v1 最終人間レビュー反映 (2026-10-06)

**設計simulation判定: RUNTIME IMPLEMENTATION GO、人間確認待ち。runtime実装・既存の凍結部位変更なし。** 先行の[現行全件監査](thigh-current-audit-2026-10-06.md)、[6動作Phase C](thigh-precision-v1-policy-review-2026-10-06.md)、[最終境界レビュー](thigh-precision-v1-final-boundary-review-2026-10-06.md)は履歴正本として保存し、再実行していない。今回の変更点は、承認済みの股屈曲除外と縫工筋S1/G3に加え、**TFLの`thigh_outer`位置資格H→N**と、**大内転筋を含む内転筋群の股伸展を部分群に限定したtrusted evidence**の2点。全520到達入力、旧案との差分168件、31 benchmarkの完全表は[JSON](thigh-precision-v1-final-human-review-2026-10-06.json)に保存し、`node scripts/thigh-precision-v1-final-human-review.js`で再現できる。

## 正本と群の範囲

現行の`body-check-ui.js`のmasterは「内転筋」という**集合名だけ**で、構成筋を列挙していない。したがって「現行コードが大内転筋を含む」とは断言できない。一方、凍結済み[股関節precisionの医学設計](hip-precision-v1-final-medical-review-2026-10-02.md)は内転筋群に長内転筋・短内転筋・恥骨筋・大内転筋等を含める。太ももv1の`thigh_adductors`も同じ広い内側群として、**長内転筋・短内転筋・大内転筋（内転部と伸展に寄与する部分）・薄筋・恥骨筋**を含む、と今回の**設計上の定義**を明示する。個別筋を質問で識別できたとは扱わず、stable IDは群に1つだけ。公開時の表示名案は「内転筋群」で、既存masterや股関節runtimeの名称・IDは変更しない。

大内転筋に股伸展への寄与がある一方、群の全筋が同じ強さ・方向で股伸展に働くわけではない。[股関節角度別の長内転筋/大内転筋EMG研究](https://pubmed.ncbi.nlm.nih.gov/31030295/)と[大内転筋/ハムストリングスの股伸展moment arm研究](https://pubmed.ncbi.nlm.nih.gov/3988782/)は、この部分群境界を無視しない根拠になる。ただし筋活動・moment armは痛みの原因を示すものではない。太ももv1では`hip_extend`の`thigh_adductors`セルを**P (trusted_subgroup: 大内転筋に由来し得る群候補)**とし、回答理由には「群の一部に股伸展と関係する筋を含む」と書く。**「内転筋群の全筋が強い伸展筋」は禁止。** 凍結済み股関節の`hip_adductors.extend=N`は「群全体に共通の伸展根拠は置かない」意味なので、そのruntimeを直さず、太もも固有の部分群候補保持との粒度差として記録する。数合わせのP昇格ではなく、ハムストリングス単独の見かけ上の順位を避ける設計判断である。

## 最終relationと質問

詳細位置は前/後ろ/内側/外側/不明、左右は右/左/両側/中央、動作は1〜3個または排他的な「分からない」。**詳しい場所→左右→動作→結果**の3問4段階。股屈曲は質問にもrankingにも入れず、旧6動作840件と該当benchmarkは履歴として保持する。

| 動作ID | 表示案 | trusted active候補 | 補足 |
| --- | --- | --- | --- |
| `knee_extend` | 膝を伸ばす時 | 大腿四頭筋 | ハムストリングスの伸張はReference |
| `knee_bend` | 膝を曲げる時 | ハムストリングス | 四頭筋の伸張はReference、縫工筋は弱いRelated |
| `hip_extend` | 脚を後ろへ動かす時 | ハムストリングス、内転筋群の大内転筋部分 | 内転筋群は部分群由来。膝屈曲の追加証拠とは区別 |
| `hip_adduct` | 脚を内側へ寄せる時 | 内転筋群 | TFLの伸張はReference |
| `hip_abduct` | 脚を外側へ開く時 | TFL | 内転筋の伸張はReference、縫工筋は弱いRelated |

位置順は前/後/内/外。位置gradeは四頭筋`PNNH`、ハムストリングス`NPNN`、内転筋群`NNPN`、TFL`HNNN`、縫工筋`HNHN`。TFLは`thigh_outer`を`N`とし、単に「太ももの外側」を選んだだけでMainにしない。股外転のtrusted動作があれば位置Nでも**Additionalに保持**。TFLの近位前外側筋腹と外側大腿全域を同一視しない。[TFLの解剖研究](https://pmc.ncbi.nlm.nih.gov/articles/PMC2938631/)も筋腹を外側上部に位置づけるが、その場所の痛みの原因まで特定しない。

## 520件全件simulation

5位置×4左右×26動作集合 = **520到達、sampling 0**。先行6動作案の840件から股屈曲を含まない520件を比較母集団にし、relation変更による出力差を全件記録した。旧5動作部分集合はranked24/tied132/insufficient364、新案は**ranked28/tied132/insufficient360**。参考Referenceありは108件で、statusと排他的ではない。差分は**168/520件**、うちstatus変更40、Top集合変更68、Main所属変更28、Additional所属変更84、Reference変更40。旧44/188/608に合わせる調整はしていない。

| 筋 | Main | Additional | Related表示 | Reference | union frontier | unique ranked | tie所属 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 大腿四頭筋 | 44 | 132 | 0 | 56 | 160 | 4 | 80 |
| ハムストリングス | 72 | 216 | 0 | 16 | 240 | 12 | 100 |
| 内転筋群 | 72 | 216 | 0 | 16 | 240 | 12 | 104 |
| TFL | **0** | **176** | 0 | 28 | 160 | 0 | 60 |
| 縫工筋 | **0** | **0** | **144** | 0 | 0 | 0 | 0 |

TFLの外側104入力でMain **0**、Additional **44**。股外転単独の外側回答でもTFLはAdditionalであり、候補から消えない。縫工筋はRelatedの生証拠288件のうち、位置P/Hに一致する144件だけを別枠表示する。ranked/Main/Additional/G3に参加しない。

Mainなし+trusted Additionalは**212件**。位置を強めてMainを捏造せず、statusは`insufficient`、結果では「動きから関連する候補」としてAdditionalを**初期表示**する。Mainなしは候補なしと同義ではない。MainもAdditionalもない120件とは区別する。

G3はtrusted AdditionalのみをMainと比較し、equal/incomparable/Additional dominatesなら一意順位を抑止する。Main dominatesなら他条件を満たしてranked可。`cross_group_guard`は132件、`additional_dominates_main`は28件。weak/REVIEW/Related/Reference/inactiveをguardへ入れない。股伸展単独20件では、既知位置の後ろ4件・内側4件が**ハムストリングス×内転筋群の自然tie**、前4件・外側4件がAdditionalのみで順位保留、位置不明4件も順位保留。ハムストリングスが独立した膝屈曲証拠を併せ持ち内転筋群を支配する場合は、unique rankedを許す。**股伸展を共通証拠として持つ内転筋群が同等/非比較なのにハムストリングスだけを一意表示した件数は0。**

## benchmarkと不変条件

前案の到達可能28件を保持して新しいrelation出力に更新し、股伸展の後面/内面境界と別軸膝屈曲の3件を追加して**31/31 PASS**。代表: THI-015は外側+股外転でTFL Additional/非Main、THI-007/029は後ろ+股伸展でH×内転筋群tie、THI-030は内側+股伸展で同じtie、THI-031は膝屈曲という独立証拠でH ranked、THI-013は縫工筋Relatedのみ、THI-002はMainなしAdditionalあり。期待statusとTop集合を再現スクリプトに固定した。これは医学的正解ラベルの確定ではない。

全520件で**mirror mismatch 0、movement-order mismatch 0（全順列）、definition-order mismatch 0、source-order-only Top1 0、same-axis double count 0、display candidate loss 0、weak-only Main/Additional/ranked 0、weak/REVIEW guard混入 0、Relatedの順位混入 0**。Main/Additional/Related/Referenceの表示区分重複も0。全入力のstatus/reason/Main/Additional/Related/Reference/frontier/displayと、旧案から変化した168入力のbefore/afterをJSONで確認できる。

## 判定と停止位置

人間が指定したTFL位置境界、内転筋群の大内転筋包含、股伸展の部分群証拠、縫工筋S1、G3、Additional-only表示、5動作を反映した。設計上の必須検査はすべてPASSし、**この仕様を前提とするRUNTIME IMPLEMENTATION GO**。残る注意点は、部分群の運動学的証拠を病因・確率・群全筋の作用と取り違えない表示、および凍結済みhipの`extend=N`と太ももの`P_trusted_subgroup`の意味の違いを実装時に保つこと。新たな重大REVIEW_REQUIREDは0。今回runtime、既存master、UI、他部位、保存schema、外部サービスは変更していない。stage/commit/push/deployも行わない。
