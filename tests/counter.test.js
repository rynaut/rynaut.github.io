// Tests for assets/counter.js (T81, 15 Nov 2026). The GoatCounter site code is set by the owner in one line of that file.
// Contract: no code set -> nothing is added and no request is made; code set -> exactly one GoatCounter script; Do Not Track is respected;
// tool-run events are off unless EVENTS is turned on and only ever send an event NAME (never page input).
const test = require("node:test");
const assert = require("node:assert");
const { init } = require("../assets/counter.js");

function env(over) {
  const added = [];
  const listeners = {};
  const doc = { head: { appendChild: (el) => added.push(el) }, createElement: () => ({ attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } }),
    addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); }, _fire: (t, ev) => (listeners[t] || []).forEach((f) => f(ev)) };
  const win = {};
  return Object.assign({ code: "", events: false, document: doc, navigator: { doNotTrack: "0" }, window: win, _added: added }, over || {});
}

test("no site code: no script is added", () => {
  const e = env();
  init(e);
  assert.strictEqual(e._added.length, 0);
});

test("a site code adds one script with the right endpoint", () => {
  const e = env({ code: "rynaut" });
  init(e);
  assert.strictEqual(e._added.length, 1);
  assert.strictEqual(e._added[0].attrs["data-goatcounter"], "https://rynaut.goatcounter.com/count");
  assert.strictEqual(e._added[0].src, "https://gc.zgo.at/count.js");
});

test("Do Not Track is respected", () => {
  const e = env({ code: "rynaut", navigator: { doNotTrack: "1" } });
  init(e);
  assert.strictEqual(e._added.length, 0);
});

test("an unsafe site code is rejected (letters, digits and hyphens only)", () => {
  for (const bad of ["a.b", "x/y", "https://evil.example", "a b", "<script>"]) {
    const e = env({ code: bad });
    init(e);
    assert.strictEqual(e._added.length, 0, bad);
  }
});

test("events switched off: rynautCountEvent does nothing", () => {
  const calls = [];
  const e = env({ code: "rynaut" });
  e.window.goatcounter = { count: (o) => calls.push(o) };
  init(e);
  e.window.rynautCountEvent("run");
  assert.strictEqual(calls.length, 0);
});

test("events on: only the event name is sent", () => {
  const calls = [];
  const e = env({ code: "rynaut", events: true });
  e.window.goatcounter = { count: (o) => calls.push(o) };
  init(e);
  e.window.rynautCountEvent("mcp-check-run", "ignored page input");
  assert.strictEqual(calls.length, 1);
  assert.deepStrictEqual(Object.keys(calls[0]).sort(), ["event", "path", "title"]);
  assert.strictEqual(calls[0].path, "mcp-check-run");
  assert.strictEqual(calls[0].event, true);
});

test("events on but no code: still nothing", () => {
  const calls = [];
  const e = env({ events: true });
  e.window.goatcounter = { count: (o) => calls.push(o) };
  init(e);
  e.window.rynautCountEvent && e.window.rynautCountEvent("run");
  assert.strictEqual(calls.length, 0);
});

test("the shipped file has no site code until the owner sets one", () => {
  const src = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "assets", "counter.js"), "utf8");
  assert.match(src, /var GOATCOUNTER_CODE = "";/);
  assert.match(src, /var EVENTS = true;/);
});

test("watchUse fires one event on the first input and never again", () => {
  const calls = [];
  const e = env({ code: "rynaut", events: true });
  e.window.goatcounter = { count: (o) => calls.push(o) };
  init(e);
  e.window.rynautWatchUse("kv-run");
  assert.strictEqual(calls.length, 0);               // nothing on load
  e.document._fire("input", { target: {} });
  e.document._fire("input", { target: {} });
  e.document._fire("change", { target: {} });
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].path, "kv-run");
});

test("watchUse ignores clicks on non-buttons and counts a button press", () => {
  const calls = [];
  const e = env({ code: "rynaut", events: true });
  e.window.goatcounter = { count: (o) => calls.push(o) };
  init(e);
  e.window.rynautWatchUse("stale-run");
  e.document._fire("click", { target: { closest: () => null } });
  assert.strictEqual(calls.length, 0);
  e.document._fire("click", { target: { closest: () => ({}) } });
  assert.strictEqual(calls.length, 1);
});

test("the event carries the name only, never page input", () => {
  const calls = [];
  const e = env({ code: "rynaut", events: true });
  e.window.goatcounter = { count: (o) => calls.push(o) };
  init(e);
  e.window.rynautWatchUse("mcp-check-run");
  e.document._fire("input", { target: { value: "SECRET-CONFIG" } });
  assert.ok(!JSON.stringify(calls).includes("SECRET-CONFIG"));
  assert.deepStrictEqual(Object.keys(calls[0]).sort(), ["event", "path", "title"]);
});

test("watchUse without a site code does nothing", () => {
  const e = env({ events: true });
  init(e);
  e.window.rynautWatchUse("kv-run");
  e.document._fire("input", { target: {} });
  assert.strictEqual(e._added.length, 0);
});
