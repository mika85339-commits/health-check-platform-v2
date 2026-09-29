import {
  createSetupToken,
  hashSetupToken
} from "../netlify/lib/weekly-analytics-auth.mjs";
import {
  createSetupTicket,
  readAdminAuth
} from "../netlify/lib/weekly-analytics-admin-store.mjs";

const env = process.env;
const sessionSecret = env.WEEKLY_ANALYTICS_SESSION_SECRET;
if (!sessionSecret) throw new Error("WEEKLY_ANALYTICS_SESSION_SECRET is required.");
if (await readAdminAuth({ env })) throw new Error("Administrator authentication is already configured.");

const token = createSetupToken();
const expiresAt = new Date(Date.now() + 20 * 60 * 1000).toISOString();
await createSetupTicket({
  token_hash: hashSetupToken(token, sessionSecret),
  expires_at: expiresAt
}, { env });

const siteUrl = String(env.SITE_URL || "https://health-check-platform-v2.netlify.app").replace(/\/$/, "");
console.log(JSON.stringify({
  expires_at: expiresAt,
  setup_url: `${siteUrl}/admin/weekly-analytics/setup/#ticket=${encodeURIComponent(token)}`
}));
