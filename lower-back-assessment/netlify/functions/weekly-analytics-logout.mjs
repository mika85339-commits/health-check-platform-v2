import { clearSessionCookie, securityHeaders } from "../lib/weekly-analytics-auth.mjs";

export default async function handler(request) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: securityHeaders("text/plain; charset=utf-8") });
  }
  return new Response(null, {
    status: 303,
    headers: {
      ...securityHeaders(),
      Location: "/admin/weekly-analytics/login/",
      "Set-Cookie": clearSessionCookie()
    }
  });
}

export const config = {
  path: ["/admin/weekly-analytics/logout", "/admin/weekly-analytics/logout/"]
};
