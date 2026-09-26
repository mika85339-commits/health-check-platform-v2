import { generateCompletedWeekSnapshot } from "./_weekly-analytics-store.mjs";

export default async function handler() {
  try {
    const result = await generateCompletedWeekSnapshot();
    console.log("Weekly analytics snapshot stored.", {
      week_start: result.snapshot.week_start,
      week_end: result.snapshot.week_end,
      data_state: result.snapshot.data_state,
      schema_version: result.snapshot.schema_version
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Weekly analytics scheduled collection failed.", { reason: error?.message || "unknown" });
    throw error;
  }
}

export const config = {
  schedule: "0 0 * * 1"
};
