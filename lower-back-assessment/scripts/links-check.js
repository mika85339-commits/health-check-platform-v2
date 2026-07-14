const { spawnSync } = require("child_process");

const result = spawnSync(process.execPath, ["scripts/quality-validate.js", "--links"], {
  stdio: "inherit",
  shell: false
});

process.exit(result.status || 0);
