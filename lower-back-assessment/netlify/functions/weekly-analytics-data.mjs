import { hasAdminSession, securityHeaders } from "./_weekly-analytics-auth.mjs";
import { collectDashboardReport } from "./_weekly-analytics-store.mjs";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: securityHeaders("application/json; charset=utf-8")
  });
}

export default async function handler(request) {
  if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
  if (!hasAdminSession(request)) return json({ error: "unauthorized" }, 401);
  try {
    return json(await collectDashboardReport());
  } catch (error) {
    console.error("Weekly analytics dashboard collection failed.", { reason: error?.message || "unknown" });
    return json({ error: "analytics_unavailable" }, 503);
  }
}

export const config = {
  path: "/api/admin/weekly-analytics"
};
