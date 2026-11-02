// PrintCaddy iOS wrapper shim: WKWebView cannot save <a download> / blob URLs, so send them to the share sheet.
(function () {
  var C = window.Capacitor; if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;
  if ("serviceWorker" in navigator) { try { navigator.serviceWorker.register = function () { return Promise.reject(new Error("no service worker in app")); }; } catch (e) {} }
  function call(plugin, method, opts) { return C.nativePromise(plugin, method, opts); }
  function toBase64(blob) { return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(String(r.result).split(",")[1] || ""); }; r.onerror = rej; r.readAsDataURL(blob); }); }
  async function share(href, name) {
    try {
      var blob = await (await fetch(href)).blob();
      var safe = (name || "download").replace(/[\/\\:*?"<>|]/g, "_");
      var data = await toBase64(blob);
      var w = await call("Filesystem", "writeFile", { path: safe, data: data, directory: "CACHE", recursive: true });
      await call("Share", "share", { title: safe, files: [w.uri], url: w.uri });
    } catch (e) { if (!/cancel/i.test(String(e && e.message))) alert("Could not export: " + (e && e.message ? e.message : e)); }
  }
  function intercept(a) {
    if (!a || !a.hasAttribute || !a.hasAttribute("download")) return false;
    var href = a.href || ""; if (!/^(blob:|data:)/.test(href)) return false;
    share(href, a.getAttribute("download") || "download"); return true;
  }
  var orig = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { if (intercept(this)) return; return orig.apply(this, arguments); };
  document.addEventListener("click", function (e) { var a = e.target && e.target.closest && e.target.closest("a[download]"); if (a && intercept(a)) { e.preventDefault(); e.stopPropagation(); } }, true);
})();
