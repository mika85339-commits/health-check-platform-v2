const { spawnSync } = require("child_process");

function run(command, args, options = {}) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { stdio: "inherit", shell: true, ...options });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed`);
  }
}

function tryRun(command, args) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { stdio: "inherit", shell: true });
  return result.status === 0;
}

try {
  const node = process.execPath;
  run(node, ["scripts/content-validate.js"], { shell: false });
  run(node, ["scripts/topics-validate.js"], { shell: false });
  run(node, ["scripts/netlify-build.js"], { shell: false });
  run(node, ["scripts/quality-validate.js"], { shell: false });
  run(node, ["scripts/links-check.js"], { shell: false });
  run(node, ["scripts/check-pages.js"], { shell: false });

  const hasGit = tryRun("git", ["--version"]);
  if (!hasGit) {
    console.log("\nGit was not found. Open GitHub Desktop and push manually after reviewing changes.");
    process.exit(0);
  }

  tryRun("git", ["status", "--short"]);
  tryRun("git", ["diff", "--", "."]);
  run("git", ["add", "."]);
  const committed = tryRun("git", ["commit", "-m", "\"feat: add content operations system\""]);
  if (!committed) {
    console.log("No commit was created. There may be no staged changes.");
  }
  const pushed = tryRun("git", ["push", "origin", "main"]);
  if (!pushed) {
    console.log("\nPush failed or authentication is required. Open GitHub Desktop and press Push origin.");
  }
} catch (error) {
  console.error(`\nRelease failed: ${error.message}`);
  process.exit(1);
}
