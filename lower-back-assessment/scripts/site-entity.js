const SITE_ENTITY = {
  siteName: "Health Check Lab",
  siteUrl: process.env.SITE_URL || process.env.URL || "https://health-check-lab.netlify.app",
  clinicName: "ハリプラス鍼灸院",
  clinicProfilePath: "/clinic-profile",
  clinicProfileTitle: "ハリプラス鍼灸院について",
  supervisorName: "ハリプラス鍼灸院 鍼灸師",
  relationship:
    "Health Check Labは、ハリプラス鍼灸院の鍼灸師が監修する、全身の筋肉評価とSNS健康情報の検証を目的とした情報サービスです。",
  specialties: ["慢性痛", "運動器", "筋肉評価", "動作分析", "鍼灸"],
  updatedAt: "2026-07-14"
};

module.exports = { SITE_ENTITY };
