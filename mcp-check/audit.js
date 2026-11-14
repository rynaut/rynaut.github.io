/* MCP paste auditor (14 Nov 2026). Pure function of the pasted text: nothing is fetched, executed or uploaded.
   Checks: wildcard approvals, unpinned packages / registry namespaces, and read+write+network tool triples.
   Tool classification is a KEYWORD HEURISTIC on tool names and descriptions, not an analysis of what a tool does.
   "Unpinned" means no exact version or hash is written in the pasted config; it does not mean anything was taken over. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.McpAudit = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var METHOD = "keyword heuristic on tool names and descriptions (not a code analysis); config checks are literal string matches";

  function isObj(x) { return x && typeof x === "object" && !Array.isArray(x); }
  function add(list, rule, severity, where, detail, fix, extra) {
    var f = { rule: rule, severity: severity, where: where, detail: detail, fix: fix };
    if (extra) for (var k in extra) f[k] = extra[k];
    list.push(f);
  }

  // ---- wildcard approvals -------------------------------------------------------------------
  var APPROVAL_KEYS = ["allow", "allowedTools", "autoApprove", "alwaysAllow", "approvedTools", "trustedTools"];
  function isWildcard(s) { return typeof s === "string" && s.indexOf("*") !== -1; }

  function walkApprovals(node, path, findings) {
    if (Array.isArray(node)) { node.forEach(function (v, i) { walkApprovals(v, path + "[" + i + "]", findings); }); return; }
    if (!isObj(node)) return;
    Object.keys(node).forEach(function (k) {
      var v = node[k], p = path ? path + "." + k : k;
      if (k === "enableAllProjectMcpServers" && v === true) {
        add(findings, "wildcard-approval", "high", p, "Every MCP server a project file declares is approved without a per-server prompt.",
          "Remove it and approve named servers one by one.");
      } else if (APPROVAL_KEYS.indexOf(k) !== -1) {
        if (v === true) {
          add(findings, "wildcard-approval", "high", p, "Approval is set to true: every tool call is approved.", "List the exact tool names instead.");
        } else if (Array.isArray(v)) {
          v.forEach(function (s) {
            if (isWildcard(s)) add(findings, "wildcard-approval", "high", p, "Approval pattern \"" + s + "\" covers tools you have not reviewed.",
              "Approve exact tool names, for example mcp__server__tool_name.");
          });
        }
      }
      if (v && typeof v === "object") walkApprovals(v, p, findings);
    });
  }

  // ---- pinning ------------------------------------------------------------------------------
  var RUNNERS = { npx: "npm", bunx: "npm", pnpx: "npm", uvx: "pypi", pipx: "pypi" };

  function npmPinned(spec) {            // name@1.2.3 exactly; @scope/name@1.2.3
    var at = spec.lastIndexOf("@");
    if (at <= 0) return false;
    return /^\d+\.\d+\.\d+([-+][0-9A-Za-z.-]+)?$/.test(spec.slice(at + 1));
  }
  function pypiPinned(spec) { return /==\s*\d+(\.\d+)*/.test(spec) || /@[\da-f]{7,40}$/i.test(spec); }
  function dockerPinned(img) { return /@sha256:[0-9a-f]{64}$/i.test(img); }

  function firstPackageArg(args) {
    for (var i = 0; i < args.length; i++) {
      var a = String(args[i]);
      if (a.charAt(0) === "-") continue;
      if (a === "run" || a === "exec" || a === "x" || a === "dlx") continue;
      return a;
    }
    return null;
  }

  function checkPinning(name, srv, findings) {
    var cmd = String(srv.command || "").split(/[\\/]/).pop().replace(/\.(cmd|exe)$/i, "");
    var args = Array.isArray(srv.args) ? srv.args : [];
    var where = "mcpServers." + name;
    if (RUNNERS[cmd]) {
      var pkg = firstPackageArg(args);
      if (!pkg) return;
      var pinned = RUNNERS[cmd] === "npm" ? npmPinned(pkg) : pypiPinned(pkg);
      if (!pinned) add(findings, "unpinned", "medium", where,
        "\"" + pkg + "\" is fetched at run time with no exact version in this config (" + cmd + "), so a new release runs the next time it starts.",
        RUNNERS[cmd] === "npm" ? "Pin an exact version, for example " + pkg.replace(/@.*$/, "") + "@1.2.3." : "Pin an exact version, for example " + pkg.replace(/[=<>~!@].*$/, "") + "==1.2.3.");
    } else if (cmd === "docker" || cmd === "podman") {
      var img = null;
      for (var i = 0; i < args.length; i++) { var a = String(args[i]); if (a.charAt(0) !== "-" && a !== "run" && a !== "exec") { img = a; break; } }
      if (img && !dockerPinned(img)) add(findings, "unpinned", "medium", where,
        "Image \"" + img + "\" is not pinned by digest" + (/:latest$|^[^:@]+$/.test(img) ? " (latest or no tag)." : " (a tag can move)."),
        "Pin the image by @sha256: digest.");
    }
  }

  var NAMESPACE_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+\/[a-z0-9._-]+$/i;   // reverse-DNS registry name, e.g. com.example/notes

  function checkNamespace(name, srv, findings) {
    if (!NAMESPACE_RE.test(name)) return;
    var v = String(srv.version || "");
    var hashed = typeof (srv.sha256 || srv.digest || srv.integrity || srv.schemaHash) === "string";
    var exact = /^\d+\.\d+\.\d+/.test(v);
    if (!(exact && hashed)) add(findings, "unpinned-namespace", "medium", "mcpServers." + name,
      "Unpinned registry namespace: \"" + name + "\" looks like a registry name, and this config pins " + (exact ? "a version but no hash" : (hashed ? "a hash but no exact version" : "neither an exact version nor a hash")) +
      ". Whoever controls the namespace's domain can publish under it later; this paste cannot show whether that has happened.",
      "Pin the exact version and the tool-schema hash you reviewed, and re-check both when the domain or owner changes.");
  }

  // ---- tool classification (keyword heuristic) -----------------------------------------------
  var KW = {
    read: /\b(read|get|list|search|query|view|find|fetch|select|retrieve|show|open|cat|download)\b/i,
    write: /\b(write|create|update|delete|remove|edit|modify|patch|put|insert|drop|exec|execute|run|shell|bash|commit|push|deploy|install|overwrite|set|send)\b/i,
    network: /\b(http|https|url|request|webhook|browse|browser|upload|email|smtp|slack|post|curl|wget|socket|api call|external|send)\b/i
  };
  function classify(t) {
    var blob = String(t.name || "").replace(/[_\-.]/g, " ") + " " + String(t.description || "");
    var out = [];
    ["read", "write", "network"].forEach(function (k) { if (KW[k].test(blob)) out.push(k); });
    return out;
  }

  function checkTools(tools, findings) {
    var by = { read: [], write: [], network: [] };
    tools.forEach(function (t) {
      if (!isObj(t) || !t.name) return;
      classify(t).forEach(function (k) { by[k].push(t.name); });
    });
    if (by.read.length && by.write.length && by.network.length) {
      add(findings, "tool-triple", "high", "tools",
        "This tool set can read data (" + by.read.slice(0, 3).join(", ") + "), change things (" + by.write.slice(0, 3).join(", ") + ") and reach the network (" +
        by.network.slice(0, 3).join(", ") + "): content one tool reads can be sent out by another. Keyword heuristic: check the tools by hand.",
        "Split the server so no single tool set has all three, or require approval on the write and network tools.",
        { tools: by });
    }
  }

  // ---- entry --------------------------------------------------------------------------------
  function audit(text) {
    var res = { shape: "unknown", findings: [], method: METHOD };
    if (typeof text !== "string" || !text.trim()) { res.error = "Paste some JSON first."; return res; }
    var doc;
    try { doc = JSON.parse(text); } catch (e) { res.error = "That is not valid JSON: " + e.message; return res; }

    var toolsArr = null;
    if (Array.isArray(doc) && doc.every(function (x) { return isObj(x) && x.name; })) toolsArr = doc;
    else if (isObj(doc) && Array.isArray(doc.tools)) toolsArr = doc.tools;
    else if (isObj(doc) && isObj(doc.result) && Array.isArray(doc.result.tools)) toolsArr = doc.result.tools;

    var servers = isObj(doc) ? (isObj(doc.mcpServers) ? doc.mcpServers : (isObj(doc.servers) ? doc.servers : null)) : null;
    var hasApprovals = isObj(doc) && (isObj(doc.permissions) || doc.enableAllProjectMcpServers !== undefined);

    var shapes = [];
    if (toolsArr) { shapes.push("tools-list"); checkTools(toolsArr, res.findings); }
    if (servers) {
      shapes.push("mcp-config");
      Object.keys(servers).forEach(function (n) {
        var s = servers[n]; if (!isObj(s)) return;
        checkPinning(n, s, res.findings);
        checkNamespace(n, s, res.findings);
      });
    }
    if (servers || hasApprovals) { if (shapes.indexOf("mcp-config") === -1) shapes.push("settings"); walkApprovals(doc, "", res.findings); }
    if (shapes.length) res.shape = shapes.join("+");
    return res;
  }

  return { audit: audit, METHOD: METHOD };
});
