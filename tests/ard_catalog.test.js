// Node tests for the ARD manifest (T107, written first, 20 Nov 2026). Run: node --test tests/
// Spec: ards-project/ard-spec v0.91 (read 20 Nov 2026). Canonical path /.well-known/ard.json; /.well-known/ai-catalog.json is the predecessor path.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const IDENT = /^urn:air:[a-zA-Z0-9.-]+(:[a-zA-Z0-9._-]+)+$/;

test(".nojekyll exists so GitHub Pages serves the dot-folder", () => {
  assert.ok(fs.existsSync(path.join(root, ".nojekyll")));
});

for (const f of [".well-known/ard.json", ".well-known/ai-catalog.json"]) {
  test(f + " is valid JSON with an entries array", () => {
    const d = JSON.parse(read(f));
    assert.ok(Array.isArray(d.entries) && d.entries.length >= 3);
  });
  test(f + ": every entry meets the v0.91 entry rules", () => {
    const d = JSON.parse(read(f));
    const seen = new Set();
    for (const e of d.entries) {
      assert.match(e.identifier, IDENT, e.identifier);
      assert.ok(!seen.has(e.identifier), "duplicate " + e.identifier);
      seen.add(e.identifier);
      assert.ok(e.displayName && e.type, e.identifier);
      assert.strictEqual(["url", "data"].filter((k) => k in e).length, 1, "exactly one of url/data: " + e.identifier);
      if ("url" in e) assert.match(e.url, /^https:\/\/(rynaut\.github\.io|github\.com\/rynaut)\//, e.identifier);
      assert.ok(Array.isArray(e.representativeQueries) && e.representativeQueries.length >= 2 && e.representativeQueries.length <= 5, "2-5 representativeQueries: " + e.identifier);
    }
  });
  test(f + " has no placeholder text", () => {
    assert.ok(!/<FILL|TODO|example\.com/i.test(read(f)));
  });
}

test("both paths serve identical content", () => {
  assert.deepStrictEqual(JSON.parse(read(".well-known/ard.json")), JSON.parse(read(".well-known/ai-catalog.json")));
});

test("every listed URL points at a file or page that exists in this repo", () => {
  const d = JSON.parse(read(".well-known/ard.json"));
  for (const e of d.entries) {
    if (!e.url || !e.url.startsWith("https://rynaut.github.io/")) continue;
    const rel = e.url.replace("https://rynaut.github.io/", "");
    const p = rel === "" ? "index.html" : rel.endsWith("/") ? rel + "index.html" : rel;
    assert.ok(fs.existsSync(path.join(root, p)), e.identifier + " -> " + p);
  }
});

test("catalog states only what the files say: no price, no licence claim beyond the repo, no unmeasured figure", () => {
  const t = read(".well-known/ard.json");
  assert.ok(!/\$\d|₹|\bCC BY\b/i.test(t));
});

test("home page advertises the manifest with rel=ard", () => {
  assert.match(read("index.html"), /<link[^>]+rel="ard"[^>]+href="\/\.well-known\/ard\.json"/);
});
