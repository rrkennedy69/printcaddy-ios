/* PrintCaddy: a friendly notice after importing a very detailed mesh. It never blocks the import. */
(function () {
  var DESK = !!window.printcaddyDesktop;
  var SAVE_LIMIT = DESK ? 5000000 : 3333333;      // .lyl: 30M mesh numbers per object on the web, 45M in the desktop app (9 per triangle)
  var SAVE_NEAR = DESK ? 4500000 : 3000000;
  var PHONE_LIMIT = 500000;
  function fmt(n) { return n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "") + " million" : Math.round(n).toLocaleString(); }
  function show(d) {
    var counts = d.counts || [], total = 0, max = 0;
    counts.forEach(function (c) { total += c; if (c > max) max = c; });
    var limit = d.booleanLimit || 250000, phone = document.documentElement.classList.contains("printcad-phone");
    var msgs = [], settings = false, bad = false;
    if (max > SAVE_LIMIT) { bad = true; msgs.push("This model is too detailed to save in a PrintCaddy design (the limit is about " + fmt(SAVE_LIMIT) + " triangles per object). You can keep working with it now, but it won't be kept when the design is saved. Simplify it in your slicer or a mesh tool (for example Blender's Decimate or Meshmixer's Reduce) to keep it in a design."); }
    else if (max >= SAVE_NEAR) msgs.push("This model is close to the most PrintCaddy can save in a design (about " + fmt(SAVE_LIMIT) + " triangles per object). If saving fails, simplify it in your slicer or a mesh tool first.");
    if (max > limit) { settings = true; msgs.push("Holes and combining (group, cut, intersect) use up to " + fmt(limit) + " triangles per object, so they may be slow or turned off for this one. You can raise the limit in Settings → \"Cut imported meshes up to\"."); }
    if (phone && total > PHONE_LIMIT) msgs.push("Phones have limited memory, so a model this large may make the page slow or reload. A computer will handle it better.");
    if (!msgs.length) return;
    var old = document.querySelector(".pcis-note"); if (old) old.remove();
    var box = document.createElement("div"); box.className = "pcis-note" + (bad ? " pcis-bad" : ""); box.setAttribute("role", "status");
    var h = document.createElement("strong"); h.textContent = "Large model: " + fmt(total) + " triangles" + (counts.length > 1 ? " in " + counts.length + " objects" : ""); box.appendChild(h);
    msgs.forEach(function (m) { var p = document.createElement("p"); p.textContent = m; box.appendChild(p); });
    var row = document.createElement("div"); row.className = "pcis-row";
    if (settings) { var s = document.createElement("button"); s.type = "button"; s.textContent = "Open Settings"; s.onclick = function () { window.dispatchEvent(new Event("layerling:open-workspace-settings")); box.remove(); }; row.appendChild(s); }
    var ok = document.createElement("button"); ok.type = "button"; ok.textContent = "OK"; ok.onclick = function () { box.remove(); }; row.appendChild(ok);
    box.appendChild(row); document.body.appendChild(box);
  }
  var css = ".pcis-note{position:fixed;z-index:2147483000;left:50%;bottom:64px;transform:translateX(-50%);width:min(460px,calc(100vw - 24px));max-height:60vh;overflow:auto;background:#fffbe8;color:#3b2f00;border:1px solid #e3c35a;border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,.18);padding:12px 14px;font:14px/1.4 system-ui,sans-serif}" +
    ".pcis-note.pcis-bad{background:#fff1ee;border-color:#e59a8a;color:#4a1408}.pcis-note p{margin:6px 0 0}.pcis-row{display:flex;gap:8px;justify-content:flex-end;margin-top:10px}" +
    ".pcis-row button{font:inherit;padding:6px 14px;border-radius:8px;border:1px solid rgba(0,0,0,.2);background:#fff;cursor:pointer}.pcis-row button:last-child{background:#2f6fde;color:#fff;border-color:#2f6fde}";
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  window.addEventListener("printcad:import-size", function (e) { try { show(e.detail || {}); } catch (_) {} });
  window.PrintCADImportSize = { show: show };
})();
