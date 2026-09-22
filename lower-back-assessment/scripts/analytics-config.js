const DEFAULT_GA_MEASUREMENT_ID = "G-CV0J8DWSVF";
const GA_MEASUREMENT_ID_TOKEN = "__GA_MEASUREMENT_ID__";

function normalizeGaMeasurementId(value) {
  const measurementId = String(value || "").trim().toUpperCase();
  if (!/^G-[A-Z0-9]+$/.test(measurementId)) {
    throw new Error(`GA_MEASUREMENT_ID must be a GA4 measurement ID: ${measurementId || "<empty>"}`);
  }
  return measurementId;
}

function resolveGaMeasurementId(env = process.env) {
  return normalizeGaMeasurementId(env.GA_MEASUREMENT_ID || DEFAULT_GA_MEASUREMENT_ID);
}

function injectGaMeasurementId(content, measurementId = resolveGaMeasurementId()) {
  return String(content).split(GA_MEASUREMENT_ID_TOKEN).join(normalizeGaMeasurementId(measurementId));
}

module.exports = {
  DEFAULT_GA_MEASUREMENT_ID,
  GA_MEASUREMENT_ID_TOKEN,
  injectGaMeasurementId,
  normalizeGaMeasurementId,
  resolveGaMeasurementId
};
