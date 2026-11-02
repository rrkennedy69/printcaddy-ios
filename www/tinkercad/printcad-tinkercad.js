/* "Import from Tinkercad" for PrintCaddy. Runs entirely in the browser.
 * - Tinkercad STL / OBJ (+MTL or the OBJ .zip) / SVG / 3MF exports go to PrintCaddy's own importer (meshes; SVG becomes an editable sketch body).
 * - A .lyl made by the "Export to PrintCaddy" bookmark (community Tinkercad importer, MIT) opens directly:
 *   keeps groups, hole/solid state, colours, visibility and Boolean operands (each part a mesh).
 * - A JSON capture from that bookmark is converted here with its MIT-licensed converter (browser-convert.js). */
(function () {
  "use strict";
  var BASE = "/tinkercad/";
  var ACCEPT = ".stl,.obj,.mtl,.zip,.svg,.3mf,.lyl,.json";
  /* iOS/iPadOS map `accept` to UTIs and grey out .stl/.3mf/.lyl in the Files app, so leave the picker open there
   * (an iPad in desktop mode says Macintosh but has touch points) and check the ending after selection. */
  var IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  var OK_EXT = /\.(stl|obj|mtl|zip|svg|3mf|lyl|json)$/i;
  function loadScript(src) {
    return new Promise(function (ok, bad) {
      if (document.querySelector('script[src="' + src + '"]')) return ok();
      var s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = function () { bad(new Error("Could not load " + src)); };
      document.head.appendChild(s);
    });
  }
  function converter() {
    if (window.convertTinkercadToLayerling) return Promise.resolve(window.convertTinkercadToLayerling);
    return loadScript(BASE + "browser-assemblies.js").then(function () { return loadScript(BASE + "browser-convert.js"); })
      .then(function () { return window.convertTinkercadToLayerling; });
  }

  /* ---- tiny zip read/write (stored output) so a bookmark .lyl can be ungrouped here ---- */
  var CRC = (function () { var t = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { var c = 0xffffffff; for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  function inflateRaw(bytes) {
    return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }
  function readZip(buf) {
    var u = new Uint8Array(buf), v = new DataView(buf), e = u.length - 22;
    while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) return Promise.reject(new Error("Not a zip file"));
    var n = v.getUint16(e + 10, true), p = v.getUint32(e + 16, true), list = [];
    for (var i = 0; i < n; i++) {
      var method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true), nl = v.getUint16(p + 28, true),
        xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), off = v.getUint32(p + 42, true);
      var name = new TextDecoder().decode(u.subarray(p + 46, p + 46 + nl));
      var start = off + 30 + v.getUint16(off + 26, true) + v.getUint16(off + 28, true);
      list.push({ name: name, method: method, data: u.subarray(start, start + size) });
      p += 46 + nl + xl + cl;
    }
    return Promise.all(list.map(function (f) {
      return (f.method === 8 ? inflateRaw(f.data) : Promise.resolve(f.data)).then(function (d) { return [f.name, d]; });
    }));
  }
  function writeZip(entries) {
    var parts = [], central = [], off = 0, enc = new TextEncoder();
    entries.forEach(function (e) {
      var name = enc.encode(e[0]), data = e[1], crc = crc32(data), h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      var c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      central.push(new Uint8Array(c.buffer), name);
      off += 30 + name.length + data.length;
    });
    var size = central.reduce(function (a, b) { return a + b.length; }, 0), end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true); end.setUint32(12, size, true); end.setUint32(16, off, true);
    return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: "application/zip" });
  }
  /** Every shape of a Tinkercad .lyl becomes its own top-level object: groups are dissolved,
   * each part keeps its colour, hole/solid state and place. Returns null if nothing to change. */
  function ungroupDoc(doc) {
    var st = doc.states && doc.states[0]; if (!st || !st.nodes) return null;
    var byId = {}; st.nodes.forEach(function (n) { byId[n.nodeId] = n; });
    var leaves = [], grouped = false;
    function walk(id, dx, dz, de) {
      var n = byId[id]; if (!n) return;
      var kids = n.groupedShapeNodeIds || [], d = n.definition || {};
      if (!kids.length) { d.x = (d.x || 0) + dx; d.z = (d.z || 0) + dz; d.elevation = (d.elevation || 0) + de; leaves.push(n); return; }
      grouped = true;
      kids.forEach(function (k) { walk(k, dx + (d.x || 0), dz + (d.z || 0), de + (d.elevation || 0)); });
    }
    (st.rootNodeIds || []).forEach(function (id) { walk(id, 0, 0, 0); });
    if (!grouped) return null;
    st.nodes = leaves; st.rootNodeIds = leaves.map(function (n) { return n.nodeId; });
    doc.features = []; doc.groups = [];
    var used = {}; leaves.forEach(function (n) { if (n.importedMesh) used[n.importedMesh.meshAssetId] = 1; });
    doc.assets = (doc.assets || []).filter(function (a) { return a.kind !== "derived-mesh" || used[a.id]; });
    return doc;
  }
  /* ---- every Tinkercad import comes in the default slate grey #8a98a6; holes stay holes ---- */
  var TAN = "#8a98a6", TAN_KD = "Kd 0.541 0.596 0.651", TAN_NUM = String(0x8a98a6);
  function tanDoc(doc) {
    var changed = false;
    (doc.states || []).forEach(function (st) {
      (st.nodes || []).forEach(function (n) {
        var d = n.definition; if (!d || d.hole) return;
        if (typeof d.color === "string" && d.color.toLowerCase() !== TAN) { d.color = TAN; changed = true; }
        if (d.multicolor) { d.multicolor = false; changed = true; }
      });
    });
    return changed;
  }
  function tanMtl(t) { return t.replace(/^(\s*)Kd\s+.*$/gm, "$1" + TAN_KD); }
  function tanObj(t) {
    return t.replace(/^(\s*usemtl\s+)color_\d+\s*$/gm, "$1color_" + TAN_NUM)
      .replace(/^(v\s+\S+\s+\S+\s+\S+)\s+\S+\s+\S+\s+\S+.*$/gm, "$1");
  }
  function tan3mf(t) { return t.replace(/\b(displaycolor|color)(\s*=\s*")#[0-9a-fA-F]{3,8}"/g, "$1$2" + TAN + '"'); }
  function tanSvg(t) {
    var keep = /^(none|transparent|inherit|currentcolor|url\()/i;
    return t.replace(/\b(fill|stroke)(\s*=\s*")([^"]*)"/g, function (m, k, eq, v) { return keep.test(v.trim()) ? m : k + eq + TAN + '"'; })
      .replace(/\b(fill|stroke)(\s*:\s*)([^;"'}]+)/g, function (m, k, c, v) { return keep.test(v.trim()) ? m : k + c + TAN; });
  }
  function textFile(f, fix) { return f.text().then(function (t) { return new File([fix(t)], f.name, { type: f.type }); }); }
  function zipFile(f, fixEntry) {
    return f.arrayBuffer().then(readZip).then(function (entries) {
      var dec = new TextDecoder(), enc = new TextEncoder();
      return new File([writeZip(entries.map(function (e) { var fx = fixEntry(e[0]); return fx ? [e[0], enc.encode(fx(dec.decode(e[1])))] : e; }))], f.name, { type: f.type || "application/zip" });
    }).catch(function () { return f; });
  }
  function tanFile(f) {
    if (/\.mtl$/i.test(f.name)) return textFile(f, tanMtl);
    if (/\.obj$/i.test(f.name)) return textFile(f, tanObj);
    if (/\.svg$/i.test(f.name)) return textFile(f, tanSvg);
    if (/\.3mf$/i.test(f.name)) return zipFile(f, function (n) { return /\.model$/i.test(n) ? tan3mf : null; });
    if (/\.zip$/i.test(f.name)) return zipFile(f, function (n) { return /\.mtl$/i.test(n) ? tanMtl : /\.obj$/i.test(n) ? tanObj : /\.svg$/i.test(n) ? tanSvg : /\.3mf$/i.test(n) ? null : null; });
    return Promise.resolve(f); // STL carries no colour; it gets the app's default (tan)
  }
  function ungroupLyl(file) {
    return file.arrayBuffer().then(readZip).then(function (entries) {
      var pj = entries.find(function (e) { return e[0] === "project.json"; }); if (!pj) return file;
      var doc = JSON.parse(new TextDecoder().decode(pj[1]));
      if (!/tinkercad/i.test(String(doc.createdWithVersion || ""))) return file; // only Tinkercad exports
      var orig = {}; (doc.assets || []).forEach(function (a) { orig[a.path] = 1; });
      var recolored = tanDoc(doc), ungrouped = !!ungroupDoc(doc);
      if (!recolored && !ungrouped) return file;
      var keep = {}; (doc.assets || []).forEach(function (a) { keep[a.path] = 1; });
      var out = entries.filter(function (e) { return e[0] === "project.json" || keep[e[0]] || !orig[e[0]]; })
        .map(function (e) { return e[0] === "project.json" ? [e[0], new TextEncoder().encode(JSON.stringify(doc))] : e; });
      return new File([writeZip(out)], file.name, { type: "application/zip" });
    }).catch(function () { return file; });
  }
  /** Turns any JSON capture into a .lyl File; other files pass through untouched. */
  function prepare(files, say) {
    return Promise.all(files.map(function (f) {
      if (/\.lyl$/i.test(f.name)) return ungroupLyl(f);
      if (!/\.json$/i.test(f.name)) return tanFile(f);
      say("Converting " + f.name + "…");
      return f.text().then(function (txt) {
        var capture = JSON.parse(txt);
        if (!capture || !capture.shapes || !capture.meshes) throw new Error(f.name + " is not a Tinkercad capture (no shapes/meshes).");
        var name = f.name.replace(/\.json$/i, "");
        return converter().then(function (convert) {
          return convert(capture, name, { onProgress: function (m) { if (typeof m === "string") say(m); } });
        }).then(function (blob) { return ungroupLyl(new File([blob], name + ".lyl", { type: "application/zip" })); });
      });
    }));
  }
  function open(opts) {
    opts = opts || {};
    var importFiles = opts.importFiles || function (files) { return window.PrintCADApp && window.PrintCADApp.importFiles(files); };
    var d = document.createElement("div"); d.className = "pcs-dlg pct-dlg";
    var img = function (n, alt) { return '<img src="' + BASE + 'img/' + n + '.svg" alt="' + alt + '" class="pct-img">'; };
    d.innerHTML =
      '<div class="pcs-box pct-box" role="dialog" aria-label="Import from Tinkercad">' +
      '<h3>Import from Tinkercad</h3>' +
      '<div class="pct-easy"><b>Easiest way</b><ol>' +
      '<li>In Tinkercad, click <b>Export</b>, then <b>.STL</b>. A file is saved.' + img("export-stl", "Tinkercad Export button, then .STL") + '</li>' +
      '<li>Drop that file in the box below (or tap <b>Choose file</b>). Each object comes in as its own piece.' + img("drop-here", "Drop the file into PrintCaddy") + '</li>' +
      '</ol></div>' +
      '<div class="pct-drop" tabindex="0">Drop Tinkercad files here<br><button type="button" class="pct-pick">Choose file…</button></div>' +
      '<div class="pct-msg" role="status"></div>' +
      '<details class="pct-more"><summary><b>Keep colours and holes</b> (one-time setup, 3 steps)</summary><ol>' +
      '<li><b>Save the export button.</b> Open the <a href="' + BASE + '" target="_blank" rel="noopener">Tinkercad to PrintCaddy page</a>.' +
      '<div class="pct-two"><div><b>Computer:</b> drag the blue <i>Export</i> button up to your bookmarks bar.' + img("bookmark-desktop", "Drag the blue button to the bookmarks bar") + '</div>' +
      '<div><b>iPad or phone:</b> tap <i>Copy bookmark code</i>, bookmark any page, then edit that bookmark and paste the code as its address.' + img("bookmark-mobile", "Copy the code and paste it into a bookmark") + '</div></div></li>' +
      '<li><b>Open your design in Tinkercad</b> and click (or tap) the bookmark. A file downloads.' + img("click-bookmark", "Click the bookmark in Tinkercad") + '</li>' +
      '<li><b>Drop that file</b> in the box above. Every shape comes in as its own object, with its colour, and holes stay holes.</li>' +
      '</ol></details>' +
      '<p class="pct-note">Tinkercad does not share its undo history or shape settings, so shapes arrive as solid pieces you can move, resize, colour and combine.</p>' +
      '<p style="text-align:right;margin:8px 0 0"><button type="button" class="pct-close">Close</button></p>' +
      '<input type="file" multiple hidden' + (IOS ? '' : ' accept="' + ACCEPT + '"') + '></div>';
    var input = d.querySelector("input"), msg = d.querySelector(".pct-msg");
    function say(t) { msg.textContent = t; }
    d.querySelector(".pct-pick").onclick = function () { input.click(); };
    d.querySelector(".pct-close").onclick = function () { d.remove(); };
    d.onclick = function (e) { if (e.target === d) d.remove(); };
    var drop = d.querySelector(".pct-drop");
    drop.ondragover = function (e) { e.preventDefault(); drop.classList.add("on"); };
    drop.ondragleave = function () { drop.classList.remove("on"); };
    drop.ondrop = function (e) { e.preventDefault(); drop.classList.remove("on"); run([].slice.call(e.dataTransfer.files || [])); };
    input.onchange = function () {
      var files = [].slice.call(input.files || []); input.value = ""; run(files);
    };
    function run(files) {
      if (!files.length) return;
      var bad = files.filter(function (f) { return !OK_EXT.test(f.name); });
      if (bad.length) { say("Can't import " + bad.map(function (f) { return f.name; }).join(", ") + ". Choose an STL, OBJ (+MTL or .zip), SVG, 3MF, .lyl or Tinkercad .json file."); return; }
      prepare(files, say).then(function (ready) {
        say("Importing…");
        return Promise.resolve(importFiles(ready));
      }).then(function () { d.remove(); }, function (e) { say("Import failed: " + (e && e.message || e)); });
    }
    document.body.appendChild(d);
    return d;
  }
  var css = document.createElement("style");
  css.textContent = ".pct-box{max-width:620px;max-height:88vh;overflow:auto}.pct-box h3{margin:0 0 10px}.pct-box h3{font-size:18px}.pct-box ol{display:block;margin:6px 0;padding-left:22px;list-style:decimal}.pct-box li{display:list-item;margin:0 0 10px;line-height:1.4}.pct-box li b,.pct-box li i,.pct-box li a{display:inline}" +
    ".pct-img{display:block;width:100%;max-width:300px;margin:6px 0;border-radius:8px}.pct-two{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:6px}" +
    "@media(max-width:560px){.pct-two{grid-template-columns:1fr}}.pct-drop{border:2px dashed #1a73e8;border-radius:10px;padding:16px;text-align:center;margin:8px 0;color:#1a73e8;font-weight:600}" +
    ".pct-drop.on{background:#e8f0fe}.pct-drop button{margin-top:8px}.pct-msg{min-height:1.2em}.pct-note{color:#777;font-size:12px;margin:8px 0 0}.pct-more summary{cursor:pointer;margin:6px 0}";
  document.head.appendChild(css);
  window.PrintCADTinkercad = { open: open, prepare: prepare, ungroupLyl: ungroupLyl, tanFile: tanFile };
})();
