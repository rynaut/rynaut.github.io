// T102 (20 Nov 2026), written first: every tool page carries the same privacy line; the ethics rule is stated in it.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const PAGES = ["index.html", "kv/index.html", "kv/measured-6gb/index.html", "kv-128k-context/index.html", "tokens/index.html",
  "quick-check/index.html", "stale/index.html", "mcp-check/index.html"];
const LINE = "Privacy: this page runs in your browser and your inputs are never sent anywhere. It counts visits and tool runs by name only: no cookies, no fingerprinting, no sensor or location reads, and nothing is counted if your browser sends Do Not Track.";

for (const p of PAGES) {
  test(p + " has the privacy line exactly once", () => {
    const t = fs.readFileSync(path.join(__dirname, "..", p), "utf8");
    assert.strictEqual(t.split(LINE).length - 1, 1);
    assert.match(t, /<p id="privacy-line"/);
  });
}

test("the claim is true of the counter: it honours Do Not Track and sends only an event name", () => {
  const c = fs.readFileSync(path.join(__dirname, "..", "assets", "counter.js"), "utf8");
  assert.match(c, /doNotTrack/);
  assert.ok(!/geolocation|getUserMedia|DeviceMotion|canvas\.toDataURL|AudioContext/.test(c));
});

test("no page reads sensors or fingerprints", () => {
  for (const p of PAGES) {
    const t = fs.readFileSync(path.join(__dirname, "..", p), "utf8");
    assert.ok(!/navigator\.geolocation|getUserMedia|DeviceMotionEvent|DeviceOrientationEvent|toDataURL\(|AudioContext|navigator\.plugins/.test(t), p);
  }
});
