const ADMIN_AUTH_TABLE = "weekly_analytics_admin_auth";
const ADMIN_SETUP_TABLE = "weekly_analytics_admin_setup_tokens";
const PRIMARY_ADMIN_ID = "primary";

function databaseConfig(env = process.env) {
  const supabaseUrl = String(env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || "");
  if (!supabaseUrl || !serviceRoleKey) {
    const error = new Error("Administrator authentication database configuration is incomplete.");
    error.missingConfiguration = true;
    throw error;
  }
  return { supabaseUrl, serviceRoleKey };
}

function isMissingSchema(status, text) {
  return status === 404 || /42P01|PGRST205|does not exist|schema cache/i.test(String(text || ""));
}

async function adminDatabaseRequest(path, options = {}, deps = {}) {
  const env = deps.env || process.env;
  const fetchImpl = deps.fetchImpl || fetch;
  const { supabaseUrl, serviceRoleKey } = databaseConfig(env);
  const response = await fetchImpl(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(`Administrator authentication database request failed (${response.status}).`);
    error.status = response.status;
    error.responseText = text;
    error.missingSchema = isMissingSchema(response.status, text);
    throw error;
  }
  return text ? JSON.parse(text) : null;
}

async function readAdminAuth(deps = {}) {
  const params = new URLSearchParams({
    select: "*",
    admin_id: `eq.${PRIMARY_ADMIN_ID}`,
    limit: "1"
  });
  try {
    const rows = await adminDatabaseRequest(`${ADMIN_AUTH_TABLE}?${params}`, { method: "GET" }, deps);
    return Array.isArray(rows) ? rows[0] || null : null;
  } catch (error) {
    if (error.missingSchema || error.missingConfiguration) return null;
    throw error;
  }
}

async function createAdminAuth(record, deps = {}) {
  const rows = await adminDatabaseRequest(ADMIN_AUTH_TABLE, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([{ admin_id: PRIMARY_ADMIN_ID, ...record }])
  }, deps);
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error("Administrator authentication record was not created.");
  return rows[0];
}

async function updateAdminAuth(record, deps = {}) {
  const params = new URLSearchParams({ admin_id: `eq.${PRIMARY_ADMIN_ID}` });
  const rows = await adminDatabaseRequest(`${ADMIN_AUTH_TABLE}?${params}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...record, updated_at: new Date().toISOString() })
  }, deps);
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error("Administrator authentication record was not updated.");
  return rows[0];
}

async function createSetupTicket(record, deps = {}) {
  const rows = await adminDatabaseRequest(ADMIN_SETUP_TABLE, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([record])
  }, deps);
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error("Administrator setup ticket was not created.");
  return rows[0];
}

async function readSetupTicket(tokenHash, deps = {}) {
  const params = new URLSearchParams({
    select: "*",
    token_hash: `eq.${tokenHash}`,
    consumed_at: "is.null",
    limit: "1"
  });
  const rows = await adminDatabaseRequest(`${ADMIN_SETUP_TABLE}?${params}`, { method: "GET" }, deps);
  const row = Array.isArray(rows) ? rows[0] || null : null;
  if (!row || new Date(row.expires_at).getTime() <= Date.now()) return null;
  return row;
}

async function updateSetupTicket(tokenHash, record, deps = {}) {
  const params = new URLSearchParams({
    token_hash: `eq.${tokenHash}`,
    consumed_at: "is.null"
  });
  const rows = await adminDatabaseRequest(`${ADMIN_SETUP_TABLE}?${params}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(record)
  }, deps);
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error("Administrator setup ticket was not updated.");
  return rows[0];
}

async function consumeSetupTicket(tokenHash, deps = {}) {
  return updateSetupTicket(tokenHash, {
    consumed_at: new Date().toISOString(),
    pending_password_hash: null,
    pending_totp_ciphertext: null,
    pending_totp_iv: null,
    pending_totp_tag: null,
    pending_recovery_ciphertext: null,
    pending_recovery_iv: null,
    pending_recovery_tag: null,
    pending_recovery_hashes: null
  }, deps);
}

export {
  ADMIN_AUTH_TABLE,
  ADMIN_SETUP_TABLE,
  PRIMARY_ADMIN_ID,
  adminDatabaseRequest,
  consumeSetupTicket,
  createAdminAuth,
  createSetupTicket,
  databaseConfig,
  readAdminAuth,
  readSetupTicket,
  updateAdminAuth,
  updateSetupTicket
};
