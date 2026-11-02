/* PrintCaddy "Image to SVG": trace a picture into a drawing, preview it, download it or add it to the design.
   Uses imagetracerjs (public domain, Unlicense) loaded on first use. Everything runs in the browser. */
(function () {
  var MAX = 700, lib = null, state = null, timer = 0;
  function loadLib() {
    if (window.ImageTracer) return Promise.resolve();
    if (lib) return lib;
    lib = new Promise(function (ok, bad) { var s = document.createElement("script"); s.src = "/trace/imagetracer_v1.2.6.js"; s.onload = ok; s.onerror = function () { lib = null; bad(new Error("Could not load the tracer")); }; document.head.appendChild(s); });
    return lib;
  }
  function h(tag, attrs, kids) {
    var e = document.createElement(tag); for (var k in attrs || {}) { if (k === "text") e.textContent = attrs[k]; else if (k.slice(0, 2) === "on") e[k] = attrs[k]; else e.setAttribute(k, attrs[k]); }
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); }); return e;
  }
  function otsu(gray) {
    var hist = new Array(256).fill(0), n = gray.length; for (var i = 0; i < n; i++) hist[gray[i]]++;
    var sum = 0; for (i = 0; i < 256; i++) sum += i * hist[i];
    var sb = 0, wb = 0, best = 0, t = 128; for (i = 0; i < 256; i++) { wb += hist[i]; if (!wb) continue; var wf = n - wb; if (!wf) break; sb += i * hist[i];
      var mb = sb / wb, mf = (sum - sb) / wf, v = wb * wf * (mb - mf) * (mb - mf); if (v > best) { best = v; t = i; } }
    return t;
  }
  function readImage(file) {
    return new Promise(function (ok, bad) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var s = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight)), w = Math.max(1, Math.round(img.naturalWidth * s)), hh = Math.max(1, Math.round(img.naturalHeight * s));
        var c = document.createElement("canvas"); c.width = w; c.height = hh; var x = c.getContext("2d", { willReadFrequently: true });
        x.fillStyle = "#fff"; x.fillRect(0, 0, w, hh); x.drawImage(img, 0, 0, w, hh); URL.revokeObjectURL(url);
        var d = x.getImageData(0, 0, w, hh), g = new Uint8Array(w * hh);
        for (var i = 0; i < g.length; i++) g[i] = Math.round(.299 * d.data[i * 4] + .587 * d.data[i * 4 + 1] + .114 * d.data[i * 4 + 2]);
        ok({ w: w, h: hh, data: d, gray: g, auto: otsu(g), name: file.name.replace(/\.[^.]+$/, "") || "traced" });
      };
      img.onerror = function () { URL.revokeObjectURL(url); bad(new Error("This picture could not be read. Try a PNG or JPG.")); };
      img.src = url;
    });
  }
  function blur(g, w, hh, r) { if (r < 1) return g; var o = new Uint8Array(g.length), t = new Float32Array(g.length), x, y, k, s, c;
    for (y = 0; y < hh; y++) for (x = 0; x < w; x++) { s = 0; c = 0; for (k = -r; k <= r; k++) { var xx = x + k; if (xx >= 0 && xx < w) { s += g[y * w + xx]; c++; } } t[y * w + x] = s / c; }
    for (y = 0; y < hh; y++) for (x = 0; x < w; x++) { s = 0; c = 0; for (k = -r; k <= r; k++) { var yy = y + k; if (yy >= 0 && yy < hh) { s += t[yy * w + x]; c++; } } o[y * w + x] = Math.round(s / c); }
    return o; }
  function opts(o, scale) {
    var detail = +o.detail; // 1 (smooth) .. 5 (detailed)
    var tol = [0, 3, 2, 1.2, .8, .5][detail];
    return { ltres: tol, qtres: tol, pathomit: Math.round(+o.specks), rightangleenhance: true, scale: scale, roundcoords: 2, viewbox: true, desc: false, linefilter: detail <= 2, strokewidth: 0 };
  }
  function trace(o) {
    var im = state.img, w = im.w, hh = im.h, scale = (+o.width > 0 ? +o.width : 100) / w, svg, IT = window.ImageTracer;
    var smooth = [0, 2, 1, 1, 0, 0][+o.detail];
    if (o.mode === "outline") {
      var g = blur(im.gray, w, hh, smooth), d = new ImageData(w, hh), thr = +o.threshold, inv = !!o.invert;
      for (var i = 0; i < g.length; i++) { var dark = g[i] < thr; if (inv) dark = !dark; var v = dark ? 0 : 255; d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = v; d.data[i * 4 + 3] = 255; }
      var p = opts(o, scale); p.pal = [{ r: 0, g: 0, b: 0, a: 255 }, { r: 255, g: 255, b: 255, a: 255 }]; p.colorquantcycles = 1;
      var td = IT.imagedataToTracedata(d, p); td.layers[1] = []; // drop the white background
      svg = IT.getsvgstring(td, p);
    } else {
      var p2 = opts(o, scale); p2.numberofcolors = +o.colors; p2.colorsampling = 2; p2.colorquantcycles = 3; p2.blurradius = smooth * 2; p2.blurdelta = 40;
      var td2 = IT.imagedataToTracedata(im.data, p2);
      // the colour in the corners is taken as the background and left out
      var bg = nearest(td2.palette, im.data, w, hh); if (bg >= 0) td2.layers[bg] = [];
      svg = IT.getsvgstring(td2, p2);
    }
    svg = svg.replace(/<desc>[\s\S]*?<\/desc>/, "").replace(/ stroke="[^"]*" stroke-width="[^"]*"/g, "").replace(/ opacity="1"/g, "");
    var paths = (svg.match(/<path\b/g) || []).length;
    return { svg: svg, paths: paths, wmm: Math.round(w * scale * 10) / 10, hmm: Math.round(hh * scale * 10) / 10 };
  }
  function nearest(pal, d, w, hh) {
    var px = [0, w - 1, (hh - 1) * w, hh * w - 1], best = -1, counts = {};
    px.forEach(function (p) { var r = d.data[p * 4], g = d.data[p * 4 + 1], b = d.data[p * 4 + 2], bi = -1, bd = 1e9;
      pal.forEach(function (c, k) { var dd = (c.r - r) * (c.r - r) + (c.g - g) * (c.g - g) + (c.b - b) * (c.b - b); if (dd < bd) { bd = dd; bi = k; } }); counts[bi] = (counts[bi] || 0) + 1; });
    var top = 0; for (var k in counts) if (counts[k] > top) { top = counts[k]; best = +k; } return top >= 2 ? best : -1;
  }
  var CSS = ".pctr-back{position:fixed;inset:0;z-index:2147482000;background:rgba(20,16,10,.45);display:flex;align-items:center;justify-content:center;padding:12px}" +
    ".pctr{background:#fffdf9;color:#2b2218;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.25);width:min(860px,100%);max-height:calc(100dvh - 24px);display:flex;flex-direction:column;font:14px/1.4 system-ui,sans-serif;overflow:hidden}" +
    ".pctr header{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #eadfcd}.pctr header h2{margin:0;font-size:17px}" +
    ".pctr .pctr-x{border:0;background:none;font-size:22px;cursor:pointer;color:#6b5a45;line-height:1}" +
    ".pctr-body{display:flex;gap:14px;padding:14px 16px;overflow:auto;min-height:0}.pctr-prev{flex:1 1 55%;min-height:240px;background:#fff repeating-conic-gradient(#f2ece2 0 25%,#fff 0 50%) 0 0/16px 16px;border:1px solid #eadfcd;border-radius:10px;display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative}" +
    ".pctr-prev svg{max-width:100%;max-height:100%;width:auto;height:auto}.pctr-prev .pctr-msg{color:#7a6a55;text-align:center;padding:16px}" +
    ".pctr-ctl{flex:1 1 45%;display:flex;flex-direction:column;gap:10px;min-width:220px}.pctr-ctl label{display:flex;flex-direction:column;gap:3px;font-weight:600;font-size:13px}.pctr-ctl label small{font-weight:400;color:#7a6a55}" +
    ".pctr-ctl .pctr-row{flex-direction:row;align-items:center;gap:8px}.pctr-ctl input[type=range]{width:100%}.pctr-ctl input[type=number],.pctr-ctl select{font:inherit;padding:5px 8px;border:1px solid #d8c9b2;border-radius:8px;background:#fff}" +
    ".pctr-seg{display:flex;border:1px solid #d8c9b2;border-radius:9px;overflow:hidden}.pctr-seg button{flex:1;font:inherit;padding:6px 8px;border:0;background:#fff;cursor:pointer}.pctr-seg button.on{background:#2f6fde;color:#fff}" +
    ".pctr-pick{font:inherit;padding:9px 12px;border:1px dashed #c9b493;border-radius:10px;background:#fbf6ee;cursor:pointer}.pctr-info{font-size:12px;color:#7a6a55}" +
    ".pctr footer{display:flex;gap:8px;justify-content:flex-end;padding:12px 16px;border-top:1px solid #eadfcd;flex-wrap:wrap}.pctr footer button{font:inherit;padding:8px 16px;border-radius:9px;border:1px solid #cdbda5;background:#fff;cursor:pointer}" +
    ".pctr footer .pctr-add{background:#2f6fde;border-color:#2f6fde;color:#fff}.pctr footer button:disabled{opacity:.45;cursor:default}" +
    "@media (max-width:640px){.pctr-body{flex-direction:column}.pctr-prev{min-height:200px;flex-basis:auto;height:38vh}.pctr-ctl{min-width:0}.pctr{max-height:calc(100dvh - 16px)}.pctr-back{padding:8px}}";
  function open(options) {
    options = options || {};
    if (!document.getElementById("pctr-css")) document.head.appendChild(h("style", { id: "pctr-css", text: CSS }));
    var old = document.querySelector(".pctr-back"); if (old) old.remove();
    var o = { mode: "outline", threshold: 128, invert: false, detail: 3, specks: 8, colors: 4, width: 80 };
    state = { img: null, out: null };
    var prev = h("div", { "class": "pctr-prev" }, [h("div", { "class": "pctr-msg", text: "Choose a picture to start. Logos, drawings and clear photos with good contrast work best." })]);
    var file = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/*", style: "display:none" });
    var info = h("div", { "class": "pctr-info", text: "" });
    function range(key, min, max, step, label, hint) { var i = h("input", { type: "range", min: min, max: max, step: step, value: o[key] }); i.oninput = function () { o[key] = +i.value; run(); }; var l = h("label", {}, [label, i, hint ? h("small", { text: hint }) : null]); l.input = i; return l; }
    var thr = range("threshold", 1, 254, 1, "Light / dark cut-off", "Moves the line between what counts as dark and light.");
    var inv = h("input", { type: "checkbox" }); inv.onchange = function () { o.invert = inv.checked; run(); };
    var invL = h("label", { "class": "pctr-row" }, [inv, "Swap dark and light"]);
    var det = range("detail", 1, 5, 1, "Smooth ↔ detailed", "Left gives smoother curves, right keeps more small detail.");
    var spk = range("specks", 0, 200, 1, "Remove small specks", "Drops tiny dots and noise. Higher removes bigger bits.");
    var col = range("colors", 2, 8, 1, "Number of colours", "Each colour becomes its own layer.");
    var seg = h("div", { "class": "pctr-seg" });
    var bOut = h("button", { type: "button", text: "One colour outline" }), bCol = h("button", { type: "button", text: "Colour layers" });
    seg.appendChild(bOut); seg.appendChild(bCol);
    function setMode(m) { o.mode = m; bOut.className = m === "outline" ? "on" : ""; bCol.className = m === "outline" ? "" : "on"; thr.style.display = invL.style.display = m === "outline" ? "" : "none"; col.style.display = m === "outline" ? "none" : ""; run(); }
    bOut.onclick = function () { setMode("outline"); }; bCol.onclick = function () { setMode("colors"); };
    var wIn = h("input", { type: "number", min: "1", max: "1000", step: "1", value: o.width }); wIn.oninput = function () { var v = parseFloat(wIn.value); if (v > 0) { o.width = v; run(); } };
    var pick = h("button", { type: "button", "class": "pctr-pick", text: "Choose a picture…" }); pick.onclick = function () { file.click(); };
    var dl = h("button", { type: "button", text: "Download SVG", disabled: "" }), add = h("button", { type: "button", "class": "pctr-add", text: "Add to design", disabled: "" });
    var close = function () { back.remove(); document.removeEventListener("keydown", esc); };
    function esc(e) { if (e.key === "Escape") close(); }
    var back = h("div", { "class": "pctr-back", role: "dialog", "aria-modal": "true", "aria-label": "Image to SVG" }, [h("div", { "class": "pctr" }, [
      h("header", {}, [h("h2", { text: "Image to SVG" }), h("button", { type: "button", "class": "pctr-x", "aria-label": "Close", text: "×", onclick: close })]),
      h("div", { "class": "pctr-body" }, [prev, h("div", { "class": "pctr-ctl" }, [pick, file,
        h("label", {}, ["Style", seg]), thr, invL, col, det, spk,
        h("label", {}, ["Width in mm", wIn, h("small", { text: "The height follows the picture's shape." })]), info])]),
      h("footer", {}, [dl, add])])]);
    back.onclick = function (e) { if (e.target === back) close(); };
    document.addEventListener("keydown", esc);
    document.body.appendChild(back);
    setMode("outline");
    function run() { clearTimeout(timer); if (!state.img) return; timer = setTimeout(go, 120); }
    function go() {
      try { var r = trace(o); state.out = r; prev.innerHTML = r.svg;
        info.textContent = r.paths ? r.paths + " shapes · " + r.wmm + " × " + r.hmm + " mm" : "Nothing to trace with these settings. Try moving the cut-off or swapping dark and light.";
        dl.disabled = add.disabled = !r.paths;
      } catch (err) { info.textContent = "Tracing failed: " + (err && err.message || err); dl.disabled = add.disabled = true; }
    }
    function load(f) {
      if (!f) return; info.textContent = "Reading the picture…";
      Promise.all([loadLib(), readImage(f)]).then(function (r) { state.img = r[1]; o.threshold = Math.min(254, Math.max(1, state.img.auto)); thr.input.value = o.threshold; pick.textContent = "Choose another picture…"; go(); })
        .catch(function (err) { info.textContent = err.message || String(err); });
    }
    file.onchange = function () { load(file.files && file.files[0]); file.value = ""; };
    prev.ondragover = function (e) { e.preventDefault(); }; prev.ondrop = function (e) { e.preventDefault(); load(e.dataTransfer.files[0]); };
    function svgFile() { return new File([state.out.svg], (state.img.name || "traced") + ".svg", { type: "image/svg+xml" }); }
    dl.onclick = function () { if (!state.out) return; var a = h("a", { href: URL.createObjectURL(svgFile()), download: state.img.name + ".svg" }); document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000); };
    add.onclick = function () {
      if (!state.out) return; var f = svgFile();
      var run2 = options.importFiles || (window.PrintCADApp && window.PrintCADApp.importFiles);
      if (!run2) { info.textContent = "Open a design first, then try again."; return; }
      add.disabled = true; add.textContent = "Adding…";
      Promise.resolve(run2([f])).then(close, function (err) { add.disabled = false; add.textContent = "Add to design"; info.textContent = "Could not add it: " + (err && err.message || err); });
    };
    if (options.file) load(options.file);
    return back;
  }
  window.PrintCADTrace = { open: open, _trace: function (o) { return trace(o); } };
})();
