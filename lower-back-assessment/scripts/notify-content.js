const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=") || true];
  })
);

function readNotification() {
  const file = path.join(root, "content-notification.json");
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

async function main() {
  const payload = {
    ...readNotification(),
    event: args.event || "content",
    workflowStatus: args.status || "unknown",
    runUrl: process.env.GITHUB_RUN_URL || "",
    timestamp: new Date().toISOString()
  };
  const message = [
    `Health Check Lab: ${payload.event}`,
    `状態: ${payload.workflowStatus}`,
    payload.title && `記事: ${payload.title}`,
    payload.category && `カテゴリ: ${payload.category}`,
    payload.status && `公開状態: ${payload.status}`,
    payload.url && `URL: ${payload.url}`,
    payload.warnings?.length ? `警告: ${payload.warnings.join(" / ")}` : "警告: なし",
    payload.previewCommand && `確認方法: ${payload.previewCommand}`,
    payload.approval && `承認方法: ${payload.approval}`,
    payload.runUrl && `Actions: ${payload.runUrl}`
  ].filter(Boolean).join("\n");

  if (!process.env.NOTIFICATION_WEBHOOK_URL) {
    console.log(message);
    console.log("NOTIFICATION_WEBHOOK_URL is not set. Notification was logged only.");
    return;
  }

  const response = await fetch(process.env.NOTIFICATION_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: message, payload })
  });
  if (!response.ok) {
    throw new Error(`Notification failed: ${response.status}`);
  }
  console.log("Notification sent.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
