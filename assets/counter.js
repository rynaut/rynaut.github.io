/* Visit and run counter (T81). GoatCounter: cookieless. Counts page views and tool runs.
   Only an event NAME (for example "kv-run") is ever sent for a run: never an input, a config or an answer.
   The owner sets the site code in the line below (the part before .goatcounter.com). Until then this file does nothing. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else if (typeof window !== "undefined") api.init({ code: api.GOATCOUNTER_CODE, events: api.EVENTS, document: document, navigator: navigator, window: window });
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var GOATCOUNTER_CODE = "";   // e.g. "rynaut"  -> https://rynaut.goatcounter.com ; letters, digits and hyphens only
  var EVENTS = true;           // owner decision 15 Nov: count tool runs by name only

  function init(env) {
    var code = env.code, win = env.window, doc = env.document;
    win.rynautCountEvent = function () {};          // safe to call from any page
    win.rynautWatchUse = function () {};
    if (!code || !/^[a-z0-9-]+$/i.test(code)) return;
    if (env.navigator && (env.navigator.doNotTrack === "1" || env.navigator.msDoNotTrack === "1")) return;
    var s = doc.createElement("script");
    s.async = true;
    s.src = "https://gc.zgo.at/count.js";
    s.setAttribute("data-goatcounter", "https://" + code + ".goatcounter.com/count");
    doc.head.appendChild(s);
    if (!env.events) return;
    win.rynautCountEvent = function (name) {
      if (win.goatcounter && typeof win.goatcounter.count === "function") win.goatcounter.count({ path: String(name), title: String(name), event: true });
    };
    // One run event per page view, on the first real use: a typed or changed field, or a press on a button.
    win.rynautWatchUse = function (name) {
      var done = false;
      function fire() { if (done) return; done = true; win.rynautCountEvent(name); }
      doc.addEventListener("input", fire, true);
      doc.addEventListener("change", fire, true);
      doc.addEventListener("click", function (e) {
        var t = e && e.target, b = t && typeof t.closest === "function" ? t.closest("button") : null;
        if (b) fire();
      }, true);
    };
  }

  return { init: init, GOATCOUNTER_CODE: GOATCOUNTER_CODE, EVENTS: EVENTS };
});
