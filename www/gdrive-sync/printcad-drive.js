/* PrintCAD <-> Google Drive glue. Listens to the app's "printcad:design-saved" event
 * (fired after every local save of a design, i.e. after every edit) and mirrors the
 * .lyl bytes to the Drive appDataFolder via PrintCADSync. Also draws the sign-in /
 * backup / restore widget. The app exposes window.PrintCADApp (listDesigns,
 * designBytes, restoreDesigns) from the start page component. */
(function () {
  "use strict";
  var S = window.PrintCADSync;
  var cfg = window.PRINTCAD_CONFIG || {};
  if (!S) { console.warn("PrintCAD: Drive sync module missing"); return; }
  var restoring = false;
  /* De-dup engine (printcad-drive-merge.js): one Drive file per design id, newest lastModified wins,
   * older copies go to appData/old-duplicates instead of being deleted. */
  var engineP = null;
  function engine() {
    if (engineP) return engineP;
    engineP = new Promise(function (ok, no) {
      if (window.PrintCADDriveMerge) return ok();
      var sc = document.createElement("script"); sc.src = "/gdrive-sync/printcad-drive-merge.js"; sc.async = true;
      sc.onload = function () { ok(); }; sc.onerror = function () { engineP = null; no(new Error("Drive merge module missing")); };
      document.head.appendChild(sc);
    }).then(function () {
      return window.PrintCADDriveMerge.createEngine(S, {
        listDesigns: function () { var a = app(); return a ? a.listDesigns() : []; },
        designBytes: function (id) { var a = app(); return a ? a.designBytes(id) : Promise.resolve(null); },
        inspectDesign: function (b) { var a = app(); return a && a.inspectDesign ? a.inspectDesign(b) : Promise.resolve(null); },
        upsertDesign: function (o) { var a = app(); if (!a || !a.upsertDesign) return Promise.reject(new Error("Open the start page first"));
          restoring = true; return Promise.resolve(a.upsertDesign(o)).finally(function () { setTimeout(function () { restoring = false; }, 3000); }); },
        deleteDesigns: function (ids) { var a = app(); return a && a.deleteDesigns ? a.deleteDesigns(ids) : Promise.resolve(); }
      }, { log: function (m) { try { console.info("PrintCaddy Drive:", m); } catch (e) {} } });
    });
    return engineP;
  }
  function thumbBytes(id) {
    var a = app(); if (!a || !a.designThumbnail) return Promise.resolve(null);
    return a.designThumbnail(id).then(dataUrlBytes).catch(function () { return null; });
  }
  /* Edits arrive many times a second; upload each design at most every 2s, always its latest state. */
  var waiting = {}, timers = {};
  function queue(id, name, bytes, lastModified) {
    waiting[id] = { id: id, name: name, bytes: bytes, lastModified: lastModified || Date.now() };
    clearTimeout(timers[id]); setStatus("pending");
    timers[id] = setTimeout(function () { flushOne(id).catch(function () {}); }, 2000);
  }
  function flushOne(id) {
    var d = waiting[id]; if (!d) return Promise.resolve(); delete waiting[id]; clearTimeout(timers[id]);
    var info = (app() && app().listDesigns().filter(function (x) { return x.id === id; })[0]) || {};
    d.createdAt = info.createdAt;
    setStatus("saving");
    return Promise.all([engine(), thumbBytes(id)]).then(function (r) { d.thumb = r[1]; return r[0].saveDesign(d); })
      .then(function (res) { setStatus("saved"); return res; }, function (e) {
        if (!waiting[id]) waiting[id] = d; // keep it for the next try
        setStatus(navigator.onLine === false ? "offline" : "error"); throw e;
      });
  }
  function flushAll() { return Promise.all(Object.keys(waiting).map(function (id) { return flushOne(id).catch(function () {}); })); }
  window.addEventListener("online", function () { if (S.isSignedIn()) flushAll(); });

  window.addEventListener("printcad:design-saved", function (e) {
    var d = e.detail || {};
    if (restoring || !d.projectId || !d.bytes) return;
    if (!S.isSignedIn()) return; // nothing queued while signed out; "Back up all" catches up
    queue(d.projectId, d.name, d.bytes, d.updatedAt);
  });

  function dataUrlBytes(url) {
    if (!url || url.indexOf("data:image/png;base64,") !== 0) return null;
    var bin = atob(url.slice(22)), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function app() { return window.PrintCADApp; }

  function backupAll() {
    var a = app(); if (!a) return Promise.reject(new Error("Open the start page first"));
    var list = a.listDesigns();
    return engine().then(function (E) {
      return list.reduce(function (p, d) {
        return p.then(function () { return Promise.all([a.designBytes(d.id), thumbBytes(d.id)]).then(function (r) {
          if (r[0]) return E.saveDesign({ id: d.id, name: d.name, createdAt: d.createdAt, lastModified: d.updatedAt || Date.now(), bytes: r[0], thumb: r[1] });
        }); });
      }, Promise.resolve());
    }).then(function () { return list.length; });
  }

  /* Restore picked Drive designs: merged by design id, newest edit wins, never a second local copy. */
  function restore(files, all) {
    if (!app()) return Promise.reject(new Error("Open the start page first"));
    return engine().then(function (E) { return E.restoreFiles(files, all || files); });
  }
  var CLEAN = "printcad.drive.cleanup.v1";
  function cleanup() { return engine().then(function (E) { return E.cleanupAll(); }).then(function (r) { try { localStorage.setItem(CLEAN, String(Date.now())); } catch (e) {} return r; }); }
  /* After sign-in: one-time duplicate cleanup, then bring newer Drive edits into designs already on this device. */
  var synced = false;
  function autoSync() {
    if (synced || !S.isSignedIn() || !app()) return; synced = true;
    var first = !localStorage.getItem(CLEAN);
    (first ? cleanup() : Promise.resolve()).then(function () { return engine(); }).then(function (E) { return E.sync({ onlyExisting: true }); })
      .then(function () { return flushAll(); }).catch(function (e) { synced = false; console.warn("PrintCaddy Drive sync:", e); });
  }
  function setStatus(st) { render(st); }
  /* Back on the start page (Home, closing a design, or the tab shown again): send waiting saves, then a full
   * sync of every design (newest edit wins, one copy per design id). At most once every 10 s; quiet when
   * offline or signed out; a small corner dot instead of a toast. */
  var lastHome = 0, homeBusy = false;
  function onStart() { return document.body.dataset.printcadView === "start"; }
  function homeSync(why) {
    var now = Date.now();
    if (homeBusy || now - lastHome < 10000) return Promise.resolve(false);
    if (!S.isSignedIn() || !app() || (typeof navigator !== "undefined" && navigator.onLine === false)) return Promise.resolve(false);
    lastHome = now; homeBusy = true;
    var dot = document.querySelector(".pcd-home-sync");
    if (!dot) { dot = document.createElement("div"); dot.className = "pcd-home-sync"; dot.setAttribute("role", "status"); dot.setAttribute("aria-label", "Syncing with Google Drive"); dot.setAttribute("data-testid", "home-sync-indicator"); document.body.appendChild(dot); }
    dot.hidden = false;
    return new Promise(function (ok) { setTimeout(ok, 400); }) // let the design being left finish saving
      .then(flushAll).then(function () { return engine(); }).then(function (E) { return E.sync({}); })
      .then(function (r) { window.dispatchEvent(new CustomEvent("printcad:home-synced", { detail: { why: why, result: r } })); return true; },
        function (e) { try { console.info("PrintCaddy Drive home sync skipped:", e && e.message || e); } catch (x) {} return false; })
      .finally(function () { homeBusy = false; dot.hidden = true; });
  }
  var wasStart = false;
  window.addEventListener("printcad:app-ready", function () { var st = onStart(); if (st && !wasStart && document.body.dataset.printcadSeen) homeSync("home"); wasStart = st; document.body.dataset.printcadSeen = "1"; });
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible" && onStart()) homeSync("visible"); });
  window.addEventListener("pageshow", function (e) { if (e.persisted && onStart()) homeSync("pageshow"); });


  /* ---------- UI ---------- */
  var el = {}, statusText = {
    "signed-out": "Not signed in", reconnect: "Drive paused – tap Reconnect", connecting: "Connecting…", "signed-in": "Google Drive on",
    pending: "Changes waiting…", saving: "Saving to Drive…", saved: "Saved to Drive", error: "Drive error", offline: "Offline – will retry"
  };
  function btn(label, fn, cls) { var b = document.createElement("button"); b.type = "button"; b.textContent = label; b.onclick = fn; if (cls) b.className = cls; return b; }
  var panels = [], lastSt = "signed-out";
  function render(st) {
    lastSt = st = st || lastSt;
    var on = S.isSignedIn(), rc = !on && S.wantsDrive && S.wantsDrive();
    if (st === "signed-out" && rc) st = "reconnect";
    var startPage = document.body.dataset.printcadView ? document.body.dataset.printcadView === "start" : !document.querySelector("canvas");
    panels = panels.filter(function (P) { return P.corner || document.body.contains(P.w); });
    panels.forEach(function (P) {
      P.w.className = (P.corner ? "pcs-w pcd-w pcd-corner pcs-" : "pcd-settings pcs-") + st;
      if (!P.busy) P.txt.textContent = statusText[st] || st;
      P.inB.style.display = on ? "none" : "";
      P.inB.textContent = rc ? "Reconnect Drive" : "Sign in with Google";
      P.outB.style.display = P.allB.style.display = P.resB.style.display = P.cleanB.style.display = on ? "" : "none";
      P.allB.disabled = P.resB.disabled = P.cleanB.disabled = !app();
      if (P.corner) P.w.dataset.page = startPage ? "start" : "editor";
    });
  }
  function dialog(all) {
    var files = all.filter(function (x) { return /\.lyl$/.test(x.name); }), pngs = {};
    all.forEach(function (x) { if (/\.png$/.test(x.name)) pngs[x.name] = x; });
    var d = document.createElement("div"); d.className = "pcs-dlg";
    var box = document.createElement("div"); box.className = "pcs-box";
    box.innerHTML = "<h3 style='margin:0 0 8px'>Your designs on Google Drive</h3>";
    if (!files.length) box.appendChild(document.createTextNode("No designs on Drive yet."));
    var ul = document.createElement("ul"); ul.style.cssText = "list-style:none;padding:0;margin:0 0 10px";
    files.forEach(function (f) {
      var li = document.createElement("li"), lab = document.createElement("label"), cb = document.createElement("input");
      cb.type = "checkbox"; cb.checked = true; cb.value = f.id; lab.appendChild(cb);
      var png = pngs[f.name.replace(/\.lyl$/, ".png")];
      if (png) {
        var img = document.createElement("img"); img.alt = ""; img.className = "pcd-thumb";
        S.load(png.id, "blob").then(function (b) { img.src = URL.createObjectURL(b); }).catch(function () {});
        lab.appendChild(img);
      }
      lab.appendChild(document.createTextNode(" " + ((f.appProperties && f.appProperties.name) || window.PrintCADDriveMerge.parseName(f.name).name)));
      var meta = document.createElement("span"); meta.style.color = "#777";
      meta.textContent = new Date(f.modifiedTime).toLocaleString() + " · " + Math.max(1, Math.round(f.size / 1024)) + " KB";
      li.appendChild(lab); li.appendChild(meta); ul.appendChild(li);
    });
    box.appendChild(ul);
    var msg = document.createElement("div"); msg.style.margin = "6px 0";
    var go = btn("Restore selected", function () {
      var ids = [].slice.call(ul.querySelectorAll("input:checked")).map(function (c) { return c.value; });
      var pick = files.filter(function (f) { return ids.indexOf(f.id) >= 0; });
      if (!pick.length) return;
      go.disabled = true; msg.textContent = "Downloading " + pick.length + "…";
      restore(pick, all).then(function (r) { msg.textContent = "Added " + r.added + ", updated " + r.updated + ", already up to date " + (r.skipped + r.uploaded) + "."; setTimeout(function () { d.remove(); }, 2500); }, function (e) { go.disabled = false; msg.textContent = "Failed: " + (e && e.message || e); });
    });
    box.appendChild(msg); box.appendChild(go); box.appendChild(document.createTextNode(" "));
    box.appendChild(btn("Close", function () { d.remove(); }));
    d.appendChild(box); d.onclick = function (e) { if (e.target === d) d.remove(); };
    document.body.appendChild(d);
  }
  function makePanel(corner) {
    var P = { corner: corner }, w = P.w = document.createElement("div");
    w.setAttribute("role", "region"); w.setAttribute("aria-label", "Google Drive backup");
    var dot = document.createElement("span"); dot.className = "pcs-dot";
    P.txt = document.createElement("span"); P.txt.className = "pcd-txt";
    P.inB = btn("Sign in with Google", function () { (S.wantsDrive && S.wantsDrive() ? S.reconnect() : S.signIn()).catch(function (e) { console.warn("PrintCAD sign-in:", e); }); }, "pcd-signin");
    P.allB = btn("Back up all", function () {
      P.allB.disabled = true; P.busy = true;
      backupAll().then(function (n) { P.txt.textContent = "Backed up " + n + " designs"; }, function (e) { P.txt.textContent = "Backup failed: " + (e && e.message || e); })
        .finally(function () { P.allB.disabled = false; setTimeout(function () { P.busy = false; }, 4000); });
    }, "pcd-all");
    P.resB = btn("Drive designs…", function () { engine().then(function (E) { return E.listLive(); }).then(function (L) { dialog(L.files); }, function (e) { P.txt.textContent = "List failed: " + (e && e.message || e); }); }, "pcd-restore");
    P.cleanB = btn("Clean up duplicates", function () {
      P.cleanB.disabled = true; P.busy = true; P.txt.textContent = "Looking for duplicates…";
      cleanup().then(function (r) { P.txt.textContent = "Moved " + r.drive.moved + " older Drive copies to old-duplicates, removed " + r.local.removed.length + " local copies"; },
        function (e) { P.txt.textContent = "Clean-up failed: " + (e && e.message || e); })
        .finally(function () { P.cleanB.disabled = false; setTimeout(function () { P.busy = false; }, 6000); });
    }, "pcd-clean");
    P.outB = btn("Sign out", function () { S.signOut(); }, "pcd-signout");
    if (!corner) {
      var h = document.createElement("div"); h.className = "pcd-settings-head";
      h.innerHTML = "<strong>Google account &amp; Drive backup</strong><span>While signed in, every design is saved to your Google Drive automatically.</span>";
      w.appendChild(h);
    }
    var row = document.createElement("div"); row.className = "pcd-row";
    [dot, P.txt].forEach(function (n) { row.appendChild(n); }); w.appendChild(row);
    var bar = document.createElement("div"); bar.className = "pcd-row";
    [P.inB, P.allB, P.resB, P.cleanB, P.outB].forEach(function (n) { bar.appendChild(n); }); w.appendChild(bar);
    if (!cfg.googleClientId) { P.inB.disabled = true; }
    panels.push(P); return P;
  }
  function mount() {
    if (panels.some(function (P) { return P.corner; })) return;
    document.body.appendChild(makePanel(true).w);
    render("signed-out");
    /* Settings dialog: the app leaves an empty [data-printcad-drive-settings] slot to fill. */
    function fill() {
      [].forEach.call(document.querySelectorAll("[data-printcad-drive-settings]"), function (slot) {
        if (slot.firstChild) return; slot.appendChild(makePanel(false).w); render();
      });
    }
    new MutationObserver(fill).observe(document.body, { childList: true, subtree: true }); fill();
  }
  S.onStatus(function (st) { render(st); if (st === "signed-in") { autoSync(); flushAll(); } });
  window.addEventListener("printcad:app-ready", function () { render(S.isSignedIn() ? "signed-in" : "signed-out"); autoSync(); });
  window.addEventListener("printcad:view", function () { render(); });

  function start() {
    mount();
    if (!cfg.googleClientId) { statusText["signed-out"] = "Drive sync not configured"; render(); return; }
    S.init({ clientId: cfg.googleClientId, appName: "PrintCAD", debounceMs: 2000 }).catch(function () {});
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
  window.PrintCADDrive = { backupAll: backupAll, restore: restore, cleanup: cleanup, engine: engine, homeSync: homeSync };
})();
