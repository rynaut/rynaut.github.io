/* Visit counter (T81). GoatCounter: cookieless, counts page views. Nothing from a tool's input is ever sent.
   The owner sets the site code in the line below (the part before .goatcounter.com). Until then this file does nothing. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else if (typeof window !== "undefined") api.init({ code: api.GOATCOUNTER_CODE, events: api.EVENTS, document: document, navigator: navigator, window: window });
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var GOATCOUNTER_CODE = "";   // e.g. "rynaut"  -> https://rynaut.goatcounter.com ; letters, digits and hyphens only
  var EVENTS = false;          // true: window.rynautCountEvent("name") records a tool run by NAME only; off until the owner decides

  function init(env) {
    var code = env.code, win = env.window;
    win.rynautCountEvent = function () {};          // safe to call from any page; replaced below only when events are on
    if (!code || !/^[a-z0-9-]+$/i.test(code)) return;
    if (env.navigator && (env.navigator.doNotTrack === "1" || env.navigator.msDoNotTrack === "1")) return;
    var s = env.document.createElement("script");
    s.async = true;
    s.src = "https://gc.zgo.at/count.js";
    s.setAttribute("data-goatcounter", "https://" + code + ".goatcounter.com/count");
    env.document.head.appendChild(s);
    if (env.events) {
      win.rynautCountEvent = function (name) {
        if (win.goatcounter && typeof win.goatcounter.count === "function") win.goatcounter.count({ path: String(name), title: String(name), event: true });
      };
    }
  }

  return { init: init, GOATCOUNTER_CODE: GOATCOUNTER_CODE, EVENTS: EVENTS };
});
