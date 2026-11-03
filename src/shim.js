// PrintCaddy iOS wrapper shim (bundled to resources/ios-shim.js with esbuild; injected into every page).
// 1) WKWebView cannot save <a download> / blob URLs -> share sheet.
// 2) Google blocks sign-in inside web views -> sign in on rrkennedy69.github.io/app-auth in Safari, token comes back via printcaddy://auth.
// 3) In-app updates of the web bundle (Capgo updater, self-hosted on GitHub releases, no paid service).
import { Capacitor, CapacitorHttp, registerPlugin } from "@capacitor/core";

const App = registerPlugin("App");
const Browser = registerPlugin("Browser");
const Updater = registerPlugin("CapacitorUpdater");
const Filesystem = registerPlugin("Filesystem");
const Share = registerPlugin("Share");
const Native = registerPlugin("PrintCaddyNative");

const REPO = "rrkennedy69/printcaddy-ios";
const WEB_JSON = `https://github.com/${REPO}/releases/download/web-latest/web.json`;
const NATIVE_URL = `https://github.com/${REPO}/releases/latest`;
const IPA_URL = `https://github.com/${REPO}/releases/latest/download/PrintCaddy.ipa`;
const APPS_JSON = `https://github.com/${REPO}/releases/latest/download/apps.json`;
const ALTSTORE_URL = APPS_JSON;
const AUTH_PAGE = "https://rrkennedy69.github.io/app-auth/";

if (Capacitor.isNativePlatform()) {
  document.documentElement.classList.add("pc-native-app");
  { const st = document.createElement("style"); st.textContent = "html.pc-native-app,html.pc-native-app body{-webkit-touch-callout:none;overscroll-behavior:none;-webkit-tap-highlight-color:transparent}html.pc-native-app body :not(input):not(textarea):not([contenteditable]):not([contenteditable] *){-webkit-user-select:none;user-select:none}"; document.documentElement.appendChild(st); }
  // ---------- no service worker ----------
  if ("serviceWorker" in navigator) { try { navigator.serviceWorker.register = () => Promise.reject(new Error("no service worker in app")); } catch (e) {} }

  // ---------- downloads -> share sheet ----------
  const toBase64 = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] || ""); r.onerror = rej; r.readAsDataURL(blob); });
  async function share(href, name) {
    try {
      const blob = await (await fetch(href)).blob();
      const safe = (name || "download").replace(/[\/\\:*?"<>|]/g, "_");
      const w = await Filesystem.writeFile({ path: safe, data: await toBase64(blob), directory: "DOCUMENTS", recursive: true }); // kept in Files › On My iPad › PrintCaddy
      try { await Native.exportFile({ url: w.uri }); } // Files app "Save to…"; the copy also stays in Files › On My iPad › PrintCaddy
      catch (err) { await Share.share({ title: safe, files: [w.uri], url: w.uri }); }
    } catch (e) { if (!/cancel/i.test(String(e && e.message))) alert("Could not export: " + (e && e.message ? e.message : e)); }
  }
  function intercept(a) {
    if (!a || !a.hasAttribute || !a.hasAttribute("download")) return false;
    const href = a.href || ""; if (!/^(blob:|data:)/.test(href)) return false;
    share(href, a.getAttribute("download") || "download"); return true;
  }
  const origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { if (intercept(this)) return; return origClick.apply(this, arguments); };
  document.addEventListener("click", (e) => { const a = e.target && e.target.closest && e.target.closest("a[download]"); if (a && intercept(a)) { e.preventDefault(); e.stopPropagation(); } }, true);
  // Plain external links (target=_blank) open in Safari instead of replacing the app.
  document.addEventListener("click", (e) => {
    const a = e.target && e.target.closest && e.target.closest("a[href]"); if (!a || a.hasAttribute("download")) return;
    if (/^https?:/.test(a.href) && new URL(a.href).host !== location.host) { e.preventDefault(); Browser.open({ url: a.href }); }
  }, true);

  // ---------- Google sign-in bridge (replaces the GIS token client the web app uses) ----------
  let pending = null;
  App.addListener("appUrlOpen", (ev) => handleAuthUrl(String(ev && ev.url || "")));
  function handleAuthUrl(url) {
    if (!url.startsWith("printcaddy://auth")) return;
    const p = new URLSearchParams(url.split("#")[1] || url.split("?")[1] || "");
    const cur = pending; if (!cur || p.get("state") !== cur.state) return; pending = null;
    Browser.close().catch(() => {});
    if (p.get("access_token")) cur.cb({ access_token: p.get("access_token"), expires_in: Number(p.get("expires_in") || 3600), scope: cur.scope, token_type: "Bearer" });
    else if (cur.err) cur.err({ type: p.get("error") || "popup_closed" }); else cur.cb({ error: p.get("error") || "failed" });
  }
  Browser.addListener("browserFinished", () => { setTimeout(() => { const cur = pending; if (cur) { pending = null; cur.err ? cur.err({ type: "popup_closed" }) : cur.cb({ error: "cancelled" }); } }, 800); });
  const oauth2 = {
    initTokenClient(conf) {
      return {
        requestAccessToken(cfg) {
          const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
          pending = { state, cb: conf.callback, err: conf.error_callback, scope: conf.scope };
          const q = new URLSearchParams({ state, scope: conf.scope || "" });
          if (cfg && cfg.login_hint) q.set("hint", cfg.login_hint);
          const url = AUTH_PAGE + "?" + q.toString();
          Native.authenticate({ url, callbackScheme: "printcaddy" }).then((r) => handleAuthUrl(r.url)).catch((e) => {
            const m = String(e && (e.code || e.message) || e);
            if (/cancel/i.test(m)) { const cur = pending; pending = null; if (cur) cur.err ? cur.err({ type: "popup_closed" }) : cur.cb({ error: "cancelled" }); }
            else Browser.open({ url, presentationStyle: "popover" }); // older shell without the native plugin
          });
        },
      };
    },
    revoke(token, done) { fetch("https://oauth2.googleapis.com/revoke?token=" + encodeURIComponent(token), { method: "POST" }).catch(() => {}).finally(() => done && done({})); },
    hasGrantedAllScopes: () => true,
  };
  window.google = window.google || {}; window.google.accounts = window.google.accounts || {}; window.google.accounts.oauth2 = oauth2;

  // ---------- in-app updates ----------
  Updater.notifyAppReady().catch(() => {});
  let bundled = "", nativeVersion = "", latest = null;
  const bundledP = fetch("/version.json", { cache: "no-store" }).then((r) => r.json()).then((j) => { bundled = j.build || ""; }).catch(() => {});
  App.getInfo().then((i) => { nativeVersion = `${i.version} (${i.build})`; }).catch(() => {});
  async function check() {
    await bundledP;
    try {
      const r = await CapacitorHttp.get({ url: WEB_JSON + "?x=" + Date.now(), headers: { "Cache-Control": "no-cache" } });
      const j = typeof r.data === "string" ? JSON.parse(r.data) : r.data;
      if (!j || !j.build) return { available: false, error: "no update info yet" };
      latest = j;
      return { available: j.build > bundled, build: j.build };
    } catch (e) { return { available: false, error: String(e && e.message || e) }; }
  }
  async function install() {
    if (!latest) { const c = await check(); if (!c.available) throw new Error(c.error || "no update available"); }
    showBanner("Downloading update…", null);
    const b = await Updater.download({ url: latest.url, version: latest.build });
    await Updater.set({ id: b.id }); // reloads the app on the new bundle
  }
  function showBanner(text, onInstall) {
    const go = () => {
      let el = document.getElementById("pc-update-banner");
      if (!el) { el = document.createElement("div"); el.id = "pc-update-banner"; el.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);bottom:calc(16px + env(safe-area-inset-bottom));z-index:2147483647;background:#1f2937;color:#fff;font:15px -apple-system,system-ui,sans-serif;padding:10px 12px 10px 16px;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.3);display:flex;gap:10px;align-items:center"; document.body.appendChild(el); }
      el.innerHTML = ""; const s = document.createElement("span"); s.textContent = text; el.appendChild(s);
      el.onclick = onInstall ? null : () => el.remove();
      if (onInstall) {
        const b = document.createElement("button"); b.textContent = "Install"; b.style.cssText = "background:#1a6fd6;color:#fff;border:0;border-radius:8px;padding:6px 14px;font:inherit";
        b.onclick = () => onInstall().catch((e) => showBanner("Update failed: " + (e && e.message || e), null)); el.appendChild(b);
        const x = document.createElement("button"); x.textContent = "Later"; x.style.cssText = "background:transparent;color:#ccc;border:0;font:inherit"; x.onclick = () => el.remove(); el.appendChild(x);
      }
    };
    document.body ? go() : document.addEventListener("DOMContentLoaded", go);
  }
  async function checkNative() {
    try {
      const i = await App.getInfo();
      const r = await CapacitorHttp.get({ url: APPS_JSON + "?x=" + Date.now() });
      const j = typeof r.data === "string" ? JSON.parse(r.data) : r.data;
      const latestV = j && j.apps && j.apps[0] && j.apps[0].version;
      const num = (v) => String(v || "0").split(".").map(Number);
      const a = num(latestV), b = num(i.version); let newer = false;
      for (let k = 0; k < Math.max(a.length, b.length); k++) { if ((a[k] || 0) !== (b[k] || 0)) { newer = (a[k] || 0) > (b[k] || 0); break; } }
      return { available: newer, version: latestV, current: i.version, ipaUrl: IPA_URL, releaseUrl: NATIVE_URL };
    } catch (e) { return { available: false, error: String(e && e.message || e) }; }
  }
  async function provisioning() { try { return await Native.provisioning(); } catch (e) { return { found: false }; } }
  window.PrintCaddyApp = { checkNative, provisioning, ipaUrl: IPA_URL, info: () => ({ webBuild: bundled, nativeVersion }), check, install, nativeUpdateUrl: NATIVE_URL, altStoreSourceUrl: ALTSTORE_URL };
  if (!sessionStorage.getItem("pc-update-checked")) {
    sessionStorage.setItem("pc-update-checked", "1");
    setTimeout(() => provisioning().then((pr) => {
      if (!pr.expires) return; const left = new Date(pr.expires) - Date.now();
      if (left < 36 * 3600e3) showBanner(left > 0 ? `PrintCaddy's signing expires ${new Date(pr.expires).toLocaleString()} – re-sign it with Sideloadly before then.` : "PrintCaddy's signing has expired – re-install it with Sideloadly.", null);
    }), 1500);
    setTimeout(() => check().then((c) => { if (c.available) showBanner(`PrintCaddy update available (${c.build})`, install); }), 3000);
  }
}
