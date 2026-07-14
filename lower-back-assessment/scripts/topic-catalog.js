const TOPIC_OVERRIDES = {
  "stretch-fascia-adhesion": { title: "ストレッチで筋膜の癒着は剥がれる？", category: "ストレッチ" },
  "stretch-muscle-flexibility": { title: "ストレッチで筋肉は柔らかくなる？", category: "ストレッチ" },
  "stretch-blood-flow": { title: "ストレッチで血流は良くなる？", category: "ストレッチ" },
  "stretch-only-low-back-pain": { title: "ストレッチだけで腰痛は改善する？", category: "ストレッチ" },
  "stretch-only-shoulder-stiffness": { title: "ストレッチだけで肩こりは改善する？", category: "ストレッチ" },
  "morning-stretch-health": { title: "朝ストレッチは健康に良い？", category: "ストレッチ" },
  "bedtime-stretch-sleep": { title: "寝る前のストレッチは睡眠に良い？", category: "ストレッチ" },
  "static-stretch-before-exercise": { title: "静的ストレッチは運動前に行うべき？", category: "ストレッチ" },
  "dynamic-stretch-injury-prevention": { title: "動的ストレッチは怪我予防になる？", category: "ストレッチ" },
  "stretch-autonomic-nerves": { title: "ストレッチで自律神経は整う？", category: "ストレッチ" },
  "straight-neck-risk": { title: "ストレートネックは危険？", category: "姿勢・骨盤矯正" },
  "desk-work-low-back-pain": { title: "デスクワークは腰痛の原因になる？", category: "姿勢・骨盤矯正" },
  "bad-posture-shoulder-stiffness": { title: "姿勢が悪いと肩こりになる？", category: "姿勢・骨盤矯正" },
  "bad-posture-low-back-pain": { title: "姿勢が悪いと腰痛になる？", category: "姿勢・骨盤矯正" },
  "fascia-release-adhesion": { title: "筋膜リリースで癒着は取れる？", category: "筋膜・トリガーポイント" },
  "trigger-points-exist": { title: "トリガーポイントは存在する？", category: "筋膜・トリガーポイント" },
  "massage-softens-muscle": { title: "筋肉は揉めば柔らかくなる？", category: "筋膜・トリガーポイント" },
  "strong-massage-effect": { title: "強くほぐした方が効果がある？", category: "筋膜・トリガーポイント" },
  "inner-muscle-training": { title: "インナーマッスルは鍛えるべき？", category: "筋トレ・運動" },
  "abs-training-low-back-pain": { title: "腹筋を鍛えれば腰痛は改善する？", category: "筋トレ・運動" },
  "squat-knee-risk": { title: "スクワットで膝は悪くなる？", category: "筋トレ・運動" },
  "walking-low-back-pain": { title: "歩けば腰痛は改善する？", category: "筋トレ・運動" },
  "chronic-pain-brain": { title: "慢性痛は脳が作っている？", category: "痛み・神経" },
  "chronic-pain-imaginary": { title: "慢性痛は気のせい？", category: "痛み・神経" },
  "pain-location-cause": { title: "痛い場所に原因がある？", category: "痛み・神経" },
  "hernia-low-back-pain": { title: "ヘルニアがあると腰痛になる？", category: "痛み・神経" },
  "acupuncture-evidence": { title: "鍼灸は科学的根拠がある？", category: "鍼灸・治療" },
  "acupuncture-blood-flow": { title: "鍼で血流は良くなる？", category: "鍼灸・治療" },
  "acupuncture-autonomic-nerves": { title: "鍼で自律神経は整う？", category: "鍼灸・治療" },
  "acupuncture-chronic-pain": { title: "鍼で慢性痛は改善する？", category: "鍼灸・治療" },
  "two-liters-water-daily": { title: "水を1日2L飲むべき？", category: "SNS健康情報" },
  "morning-warm-water-health": { title: "朝一番の白湯は健康に良い？", category: "SNS健康情報" },
  "detox-exists": { title: "デトックスは本当に存在する？", category: "SNS健康情報" },
  "deep-breathing-autonomic-nerves": { title: "深呼吸で自律神経は整う？", category: "SNS健康情報" },
  "sns-health-claims": { title: "SNS健康情報の見分け方", category: "SNS健康情報" }
};

function normalizeTopic(topic) {
  const override = TOPIC_OVERRIDES[topic.slug] || {};
  return {
    ...topic,
    title: override.title || topic.title,
    category: override.category || topic.category
  };
}

module.exports = { TOPIC_OVERRIDES, normalizeTopic };
