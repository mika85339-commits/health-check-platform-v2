const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const clinicPath = path.join(root, "content", "clinic", "clinic-profile.json");

function readClinicProfile() {
  if (!fs.existsSync(clinicPath)) {
    return {
      name: "ハリプラス鍼灸院",
      treatmentPolicy: "筋肉評価と動作分析を重視して状態を整理します。",
      consultationFocus: ["慢性痛", "運動器", "筋肉評価", "動作分析", "鍼灸"],
      practitioners: [{ name: "ハリプラス鍼灸院 鍼灸師", role: "監修" }],
      updatedAt: "2026-07-14",
      todoFields: []
    };
  }
  return JSON.parse(fs.readFileSync(clinicPath, "utf8"));
}

const CLINIC_PROFILE = readClinicProfile();
const supervisorName = CLINIC_PROFILE.practitioners?.[0]?.name || `${CLINIC_PROFILE.name} 鍼灸師`;

const SITE_ENTITY = {
  siteName: "Health Check Lab",
  siteUrl: process.env.SITE_URL || process.env.URL || "https://health-check-lab.netlify.app",
  clinicName: CLINIC_PROFILE.name || "ハリプラス鍼灸院",
  clinicProfilePath: "/clinic-profile",
  clinicProfileTitle: `${CLINIC_PROFILE.name || "ハリプラス鍼灸院"}について`,
  supervisorName,
  relationship:
    "Health Check Labは、ハリプラス鍼灸院の鍼灸師が監修する、筋肉評価と健康情報の整理を目的とした情報サービスです。",
  specialties: CLINIC_PROFILE.consultationFocus || ["慢性痛", "運動器", "筋肉評価", "動作分析", "鍼灸"],
  updatedAt: CLINIC_PROFILE.updatedAt || new Date().toISOString().slice(0, 10)
};

module.exports = { CLINIC_PROFILE, SITE_ENTITY };
