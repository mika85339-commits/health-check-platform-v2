// Preload only in CI's build step. This fixture must never reach a Netlify build.
if (process.env.CI !== "true" || process.env.NETLIFY === "true") {
  throw new Error("CI article fixtures are not allowed outside offline CI verification.");
}
require("./preview-build-network.cjs");
require("./sanity-client").fetchSanityPosts = async () => ({
  config: { projectId: "ci-fixture", dataset: "offline", apiVersion: "2026-07-15" },
  skipped: false, missing: [], fixture: true,
  posts: [1, 2, 3].map((n) => ({
    _id: `ci-fixture-${n}`, _type: "post", title: `CI表示テスト ${n}`, slug: `ci-fixture-${n}`,
    excerpt: "画面・リンク検証専用のダミーです。医学情報・実績ではありません。",
    publishedAt: "2026-01-01T00:00:00Z",
    body: [{ _type: "block", children: [{ _type: "span", text: "CI専用ダミー本文。公開・医学的判断には使用しません。" }] }],
    categories: [{ _id: "ci-category", title: "CIテスト", slug: "ci-test" }],
    author: { name: "CI表示テスト" }
  }))
});
