// Node tests for mcp-check/audit.js (written first, 14 Nov 2026). Run: node --test tests/
const test = require("node:test");
const assert = require("node:assert");
const { audit } = require("../mcp-check/audit.js");

const rules = (r) => r.findings.map((f) => f.rule);

test("invalid JSON gives an error, no findings", () => {
  const r = audit("{ not json");
  assert.ok(r.error);
  assert.deepStrictEqual(r.findings, []);
});

test("empty input gives an error", () => {
  assert.ok(audit("   ").error);
});

test("unknown shape is reported, not guessed", () => {
  const r = audit('{"hello":"world"}');
  assert.strictEqual(r.shape, "unknown");
  assert.deepStrictEqual(r.findings, []);
});

// ---- wildcard approvals
test("permissions.allow with mcp__* is a wildcard approval", () => {
  const r = audit(JSON.stringify({ permissions: { allow: ["mcp__*"] } }));
  assert.ok(rules(r).includes("wildcard-approval"));
});

test("server-scoped wildcard mcp__github__* is flagged", () => {
  const r = audit(JSON.stringify({ permissions: { allow: ["mcp__github__*"] } }));
  assert.ok(rules(r).includes("wildcard-approval"));
});

test("Bash(*) is flagged", () => {
  const r = audit(JSON.stringify({ permissions: { allow: ["Bash(*)"] } }));
  assert.ok(rules(r).includes("wildcard-approval"));
});

test("enableAllProjectMcpServers true is a wildcard approval", () => {
  const r = audit(JSON.stringify({ enableAllProjectMcpServers: true }));
  assert.ok(rules(r).includes("wildcard-approval"));
});

test("autoApprove star on a server is flagged", () => {
  const r = audit(JSON.stringify({ mcpServers: { a: { command: "node", args: ["s.js"], autoApprove: ["*"] } } }));
  assert.ok(rules(r).includes("wildcard-approval"));
});

test("exact tool approvals are not wildcards", () => {
  const r = audit(JSON.stringify({ permissions: { allow: ["mcp__github__get_issue", "Bash(git status)"] } }));
  assert.ok(!rules(r).includes("wildcard-approval"));
});

// ---- unpinned
test("npx package without version is unpinned", () => {
  const r = audit(JSON.stringify({ mcpServers: { fs: { command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem"] } } }));
  assert.ok(rules(r).includes("unpinned"));
});

test("npx @latest is unpinned", () => {
  const r = audit(JSON.stringify({ mcpServers: { fs: { command: "npx", args: ["-y", "some-mcp@latest"] } } }));
  assert.ok(rules(r).includes("unpinned"));
});

test("npx caret range is unpinned", () => {
  const r = audit(JSON.stringify({ mcpServers: { fs: { command: "npx", args: ["some-mcp@^1.2.0"] } } }));
  assert.ok(rules(r).includes("unpinned"));
});

test("npx exact version is pinned", () => {
  const r = audit(JSON.stringify({ mcpServers: { fs: { command: "npx", args: ["-y", "@scope/some-mcp@1.4.2"] } } }));
  assert.ok(!rules(r).includes("unpinned"));
});

test("uvx without version is unpinned; with == is pinned", () => {
  assert.ok(rules(audit(JSON.stringify({ mcpServers: { a: { command: "uvx", args: ["mcp-server-git"] } } }))).includes("unpinned"));
  assert.ok(!rules(audit(JSON.stringify({ mcpServers: { a: { command: "uvx", args: ["mcp-server-git==0.6.2"] } } }))).includes("unpinned"));
});

test("docker image :latest or no tag is unpinned; digest is pinned", () => {
  const bad = audit(JSON.stringify({ mcpServers: { a: { command: "docker", args: ["run", "-i", "--rm", "ghcr.io/x/y:latest"] } } }));
  assert.ok(rules(bad).includes("unpinned"));
  const good = audit(JSON.stringify({ mcpServers: { a: { command: "docker", args: ["run", "-i", "--rm", "ghcr.io/x/y@sha256:" + "a".repeat(64)] } } }));
  assert.ok(!rules(good).includes("unpinned"));
});

test("registry-style namespace name without version and hash is flagged as an unpinned registry namespace", () => {
  const r = audit(JSON.stringify({ mcpServers: { "com.example/notes": { type: "http", url: "https://mcp.example.com" } } }));
  assert.ok(rules(r).includes("unpinned-namespace"));
  const f = r.findings.find((x) => x.rule === "unpinned-namespace");
  assert.match(f.detail, /unpinned/i);
  assert.doesNotMatch(f.detail, /taken over|hijack/i);   // we cannot know that from a paste
});

test("namespace with exact version and sha256 is not flagged", () => {
  const r = audit(JSON.stringify({ mcpServers: { "com.example/notes": { type: "http", url: "https://mcp.example.com", version: "1.2.0", sha256: "b".repeat(64) } } }));
  assert.ok(!rules(r).includes("unpinned-namespace"));
});

// ---- tool triples
const tool = (name, description) => ({ name, description, inputSchema: { type: "object" } });

test("read + write + network tools in one server is a triple", () => {
  const r = audit(JSON.stringify({ tools: [
    tool("read_file", "Read a file from the workspace"),
    tool("write_file", "Write or overwrite a file"),
    tool("http_post", "Send an HTTP request to any URL"),
  ] }));
  assert.ok(rules(r).includes("tool-triple"));
  const f = r.findings.find((x) => x.rule === "tool-triple");
  assert.ok(f.tools.read.length && f.tools.write.length && f.tools.network.length);
});

test("tools/list wrapped in result is accepted", () => {
  const r = audit(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { tools: [
    tool("list_rows", "List rows"), tool("delete_row", "Delete a row"), tool("send_email", "Send an email over SMTP"),
  ] } }));
  assert.strictEqual(r.shape, "tools-list");
  assert.ok(rules(r).includes("tool-triple"));
});

test("read-only tools are not a triple", () => {
  const r = audit(JSON.stringify({ tools: [tool("get_issue", "Get an issue"), tool("search_issues", "Search issues")] }));
  assert.ok(!rules(r).includes("tool-triple"));
});

test("read + write without network is not a triple", () => {
  const r = audit(JSON.stringify({ tools: [tool("read_note", "Read a note"), tool("create_note", "Create a note")] }));
  assert.ok(!rules(r).includes("tool-triple"));
});

test("heuristic note is always present for tool lists", () => {
  const r = audit(JSON.stringify({ tools: [tool("get_x", "Get x")] }));
  assert.match(r.method, /keyword heuristic/i);
});

test("clean pinned config has zero findings", () => {
  const r = audit(JSON.stringify({ mcpServers: { git: { command: "uvx", args: ["mcp-server-git==0.6.2"] } }, permissions: { allow: ["mcp__git__git_status"] } }));
  assert.deepStrictEqual(r.findings, []);
});

test("nothing is fetched or executed: audit is a pure function of the text", () => {
  const before = JSON.stringify({ mcpServers: { a: { command: "npx", args: ["x"] } } });
  const a = audit(before), b = audit(before);
  assert.deepStrictEqual(a, b);
});
