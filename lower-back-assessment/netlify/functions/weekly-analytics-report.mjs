import { bearerIsAuthorized, securityHeaders } from "../lib/weekly-analytics-auth.mjs";
import { listSnapshots, publicSnapshot } from "../lib/weekly-analytics-store.mjs";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: securityHeaders("application/json; charset=utf-8")
  });
}

export default async function handler(request) {
  if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
  if (!bearerIsAuthorized(request)) return json({ error: "unauthorized" }, 401);
  const url = new URL(request.url);
  const weekStart = url.searchParams.get("week_start") || "";
  const requestedWeeks = Number(url.searchParams.get("weeks") || 1);
  if (weekStart && !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return json({ error: "invalid_week_start" }, 400);
  const limit = weekStart ? 1 : Math.max(1, Math.min(8, Number.isFinite(requestedWeeks) ? requestedWeeks : 1));
  try {
    const rows = await listSnapshots({ weekStart: weekStart || undefined, limit });
    return json({
      schema_version: 1,
      scope: "weekly:read",
      count: rows.length,
      snapshots: rows.map(publicSnapshot)
    });
  } catch (error) {
    console.error("Weekly snapshot read failed.", { reason: error?.message || "unknown" });
    return json({ error: "analytics_unavailable" }, 503);
  }
}

export const config = {
  path: "/api/weekly-report"
};
