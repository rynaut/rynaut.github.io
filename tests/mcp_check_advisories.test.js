// Tests for the known-vulnerable-version check (written first, 15 Nov 2026).
// Advisory: GHSA-6hqx-gqrx-c5r2, mcp-server-git (PyPI), affected < 2026.11.11, patched 2026.11.11.
// Source page read 15 Nov 2026: https://github.com/modelcontextprotocol/servers/security/advisories/GHSA-6hqx-gqrx-c5r2
// Version detection only: nothing here reproduces or describes how to exploit the issue.
const test = require("node:test");
const assert = require("node:assert");
const { audit } = require("../mcp-check/audit.js");

const cfg = (command, args) => JSON.stringify({ mcpServers: { git: { command, args } } });
const vuln = (r) => r.findings.filter((f) => f.rule === "known-vulnerable-version");

test("uvx mcp-server-git==2025.7.1 is flagged and cites the advisory", () => {
  const r = audit(cfg("uvx", ["mcp-server-git==2025.7.1"]));
  assert.strictEqual(vuln(r).length, 1);
  assert.match(vuln(r)[0].detail, /GHSA-6hqx-gqrx-c5r2/);
  assert.match(vuln(r)[0].fix, /2026\.11\.11/);
  assert.strictEqual(vuln(r)[0].severity, "high");
});

test("the finding links the advisory URL", () => {
  const f = vuln(audit(cfg("uvx", ["mcp-server-git==2026.11.10"])))[0];
  assert.ok(f.advisory && f.advisory.indexOf("GHSA-6hqx-gqrx-c5r2") !== -1);
  assert.match(f.advisory, /^https:\/\/github\.com\/modelcontextprotocol\/servers\/security\/advisories\//);
});

test("exactly the patched version is not flagged", () => {
  assert.strictEqual(vuln(audit(cfg("uvx", ["mcp-server-git==2026.11.11"]))).length, 0);
});

test("newer versions are not flagged (month and day compare as numbers)", () => {
  assert.strictEqual(vuln(audit(cfg("uvx", ["mcp-server-git==2026.12.1"]))).length, 0);
  assert.strictEqual(vuln(audit(cfg("uvx", ["mcp-server-git==2027.1.1"]))).length, 0);
  assert.strictEqual(vuln(audit(cfg("uvx", ["mcp-server-git==2026.11.12"]))).length, 0);
});

test("2026.2.3 is older than 2026.11.11 (numeric, not string, comparison)", () => {
  assert.strictEqual(vuln(audit(cfg("uvx", ["mcp-server-git==2026.2.3"]))).length, 1);
});

test("2026.11.10 is flagged", () => {
  assert.strictEqual(vuln(audit(cfg("uvx", ["mcp-server-git==2026.11.10"]))).length, 1);
});

test("unpinned mcp-server-git is only 'unpinned': the version is unknown, so nothing is called vulnerable", () => {
  const r = audit(cfg("uvx", ["mcp-server-git"]));
  assert.strictEqual(vuln(r).length, 0);
  assert.ok(r.findings.some((f) => f.rule === "unpinned"));
});

test("underscore spelling mcp_server_git is recognised", () => {
  assert.strictEqual(vuln(audit(cfg("uvx", ["mcp_server_git==2025.1.1"]))).length, 1);
});

test("uvx --from form is recognised", () => {
  const r = audit(cfg("uvx", ["--from", "mcp-server-git==2025.9.9", "mcp-server-git"]));
  assert.strictEqual(vuln(r).length, 1);
});

test("pipx run form is recognised", () => {
  assert.strictEqual(vuln(audit(cfg("pipx", ["run", "mcp-server-git==2025.3.4"]))).length, 1);
});

test("a different package pinned to an old version is not flagged by this advisory", () => {
  assert.strictEqual(vuln(audit(cfg("uvx", ["mcp-server-time==2025.1.1"]))).length, 0);
});

test("an unparseable version is not flagged (no guessing)", () => {
  assert.strictEqual(vuln(audit(cfg("uvx", ["mcp-server-git==abc"]))).length, 0);
});

test("a post-release of the patched version is not flagged", () => {
  assert.strictEqual(vuln(audit(cfg("uvx", ["mcp-server-git==2026.11.11.post1"]))).length, 0);
});

test("the finding never contains exploit steps or the configuration key", () => {
  const f = vuln(audit(cfg("uvx", ["mcp-server-git==2025.7.1"])))[0];
  const text = (f.detail + " " + f.fix).toLowerCase();
  assert.ok(!/fsmonitor|payload|exploit|reproduce/.test(text), text);
});

test("an old pinned mcp-server-git is also pinned: no 'unpinned' finding for it", () => {
  const r = audit(cfg("uvx", ["mcp-server-git==2025.7.1"]));
  assert.ok(!r.findings.some((f) => f.rule === "unpinned"));
});
