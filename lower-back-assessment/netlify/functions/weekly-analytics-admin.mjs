import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hasAdminSession, securityHeaders } from "./_weekly-analytics-auth.mjs";

function sourcePath() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, "../../admin/weekly-analytics/index.html"),
    path.resolve(here, "admin/weekly-analytics/index.html"),
    path.resolve(process.cwd(), "admin/weekly-analytics/index.html")
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error("Weekly analytics dashboard source is unavailable.");
  return found;
}

function dashboardHtml() {
  return fs.readFileSync(sourcePath(), "utf8")
    .replace('href="./dashboard.css"', 'href="/admin/weekly-analytics-assets/dashboard.css"')
    .replace('src="./dashboard-model.js"', 'src="/admin/weekly-analytics-assets/dashboard-model.js"')
    .replace('src="./dashboard.js"', 'src="/admin/weekly-analytics-assets/dashboard.js"');
}

export default async function handler(request) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405, headers: securityHeaders("text/plain; charset=utf-8") });
  }
  if (!hasAdminSession(request)) {
    return new Response(null, {
      status: 302,
      headers: { ...securityHeaders(), Location: "/admin/weekly-analytics/login/" }
    });
  }
  return new Response(request.method === "HEAD" ? null : dashboardHtml(), {
    status: 200,
    headers: securityHeaders()
  });
}

export const config = {
  path: ["/admin/weekly-analytics", "/admin/weekly-analytics/"]
};
