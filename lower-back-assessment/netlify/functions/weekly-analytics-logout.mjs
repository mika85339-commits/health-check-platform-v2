import {
  clearSessionCookie,
  clearTrustedDeviceCookie,
  securityHeaders
} from "../lib/weekly-analytics-auth.mjs";

export default async function handler(request) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: securityHeaders("text/plain; charset=utf-8") });
  }
  const headers = new Headers({
    ...securityHeaders(),
    Location: "/admin/weekly-analytics/login/"
  });
  headers.append("Set-Cookie", clearSessionCookie());
  headers.append("Set-Cookie", clearTrustedDeviceCookie());
  return new Response(null, { status: 303, headers });
}

export const config = {
  path: ["/admin/weekly-analytics/logout", "/admin/weekly-analytics/logout/"]
};
