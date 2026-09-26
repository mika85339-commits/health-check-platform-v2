import assert from "node:assert/strict";
import {
  createHandler,
  normalizeBodyPart,
  normalizeRegionCode,
  sanitizeSponsorEvent,
  serverGeo
} from "../netlify/functions/track-sponsor-event.mjs";

assert.equal(normalizeBodyPart("lower-back"), "lowback");
assert.equal(normalizeBodyPart("foot"), "sole");
assert.equal(normalizeRegionCode("JP", "23"), "JP-23");
assert.equal(normalizeRegionCode("JP", "JP-27"), "JP-27");

const context = {
  geo: {
    country: { code: "JP", name: "Japan" },
    subdivision: { code: "23", name: "Aichi" },
    city: "Nagoya",
    postalCode: "000-0000",
    latitude: 35.1,
    longitude: 136.9
  },
  ip: "192.0.2.1"
};
assert.deepEqual(serverGeo(context), {
  country_code: "JP",
  region_code: "JP-23",
  region_name: "Aichi"
});

const sanitized = sanitizeSponsorEvent({
  event_type: "sponsor_banner_impression",
  event_id: "view-1:sponsor_banner_impression:result_top:hariplus_result_top_v1",
  sponsor_id: "hariplus",
  creative_id: "hariplus_result_top_v1",
  placement_id: "result_top",
  body_part: "calf",
  occurred_at: "2026-09-26T00:00:00.000Z",
  symptoms: ["sharp"],
  answers: { side: "right" },
  candidate_muscles: ["example"],
  score: 90,
  diagnosis_id: "must-not-survive",
  age: "40s",
  sex: "female",
  address: "must-not-survive",
  city: "must-not-survive"
}, context);
assert.equal(sanitized.body_part, "lowerleg");
assert.equal(sanitized.region_code, "JP-23");
[
  "symptoms", "answers", "candidate_muscles", "score", "diagnosis_id",
  "age", "sex", "address", "city", "postal_code", "latitude", "longitude", "ip"
].forEach((field) => assert(!(field in sanitized), `Server event leaked ${field}.`));

const requests = [];
const fetchImpl = async (url, options) => {
  requests.push({ url, options });
  if (options.method === "GET") return new Response(JSON.stringify([{ sponsor_id: "11111111-1111-4111-8111-111111111111" }]), { status: 200 });
  return new Response("", { status: 201 });
};
const handler = createHandler({
  env: { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-only" },
  fetchImpl
});
const response = await handler(new Request("https://example.com/.netlify/functions/track-sponsor-event", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    event_type: "sponsor_banner_click",
    event_id: "view-2:sponsor_banner_click:result_top:hariplus_result_top_v1",
    sponsor_id: "hariplus",
    creative_id: "hariplus_result_top_v1",
    placement_id: "result_top",
    body_part: "hip",
    occurred_at: "2026-09-26T00:00:00.000Z",
    pain_level: 10
  })
}), {
  geo: { country: { code: "JP" }, subdivision: { code: "27", name: "Osaka" }, city: "Osaka" },
  ip: "192.0.2.2"
});
assert.equal(response.status, 202);
assert.equal(requests.length, 2);
const stored = JSON.parse(requests[1].options.body);
assert.equal(stored.placement_id, "result_top");
assert.equal(stored.creative_id, "hariplus_result_top_v1");
assert.equal(stored.body_part, "hip");
assert.equal(stored.region_code, "JP-27");
assert(!("pain_level" in stored));
assert(!("city" in stored));

console.log("Sponsor event server Geo and persistence contract checks passed.");
