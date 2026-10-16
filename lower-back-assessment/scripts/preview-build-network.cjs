// Build-time guard for previews and offline verification. Never print request data.
function deny() { throw new Error("External network is disabled for this build."); }
globalThis.fetch = deny;
for (const name of ["node:http", "node:https"]) {
  const api = require(name);
  api.request = deny;
  api.get = deny;
}
require("node:net").Socket.prototype.connect = deny;
require("node:tls").connect = deny;
