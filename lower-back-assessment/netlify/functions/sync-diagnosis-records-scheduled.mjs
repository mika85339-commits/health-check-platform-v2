import { createHandler } from "./sync-diagnosis-records.mjs";

function createScheduledHandler({ env = process.env, sync = createHandler({ env }) } = {}) {
  return async function handler() {
    const syncStartedAt = Date.now();
    if (!env.DIAGNOSIS_SYNC_SECRET) throw new Error("sync_not_configured");
    const result = await sync({
      httpMethod: "POST",
      syncStartedAt,
      headers: { authorization: `Bearer ${env.DIAGNOSIS_SYNC_SECRET}` }
    });
    if (result.statusCode === 207) {
      console.error("Scheduled diagnosis sync incomplete; retry at next schedule or after operator review.");
      return new Response(null, { status: 204 });
    }
    if (result.statusCode !== 200) throw new Error(`sync_unavailable_${result.statusCode}`);
    return new Response(null, { status: 204 });
  };
}

export default createScheduledHandler();
export { createScheduledHandler };

// 00:00 UTC is 09:00 JST. The authenticated manual sync remains available for incident recovery.
export const config = { schedule: "0 0 * * *" };
