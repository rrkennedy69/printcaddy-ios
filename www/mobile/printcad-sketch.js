/* PrintCaddy "Sketch" shape: draw outlines on a top-down grid (freehand or point by point), then extrude
   them into a solid. The outlines go in through the editor's own SVG import, so the result is a normal
   sketch body: saved in .lyl and Drive, exported to STL, resized with its handles, editable later with "Edit sketch". */
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  var st = null; // state while open
  function bridge() { return window.PrintCADEditorBridge || null; }
  function h(tag, attrs, parent) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
  function el(tag, cls, parent, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (parent) parent.appendChild(e); return e; }
  function r2(v) { return Math.round(v * 100) / 100; }
  function snapStep() { var b = bridge(), g = b && b.snapGrid ? Number(b.snapGrid()) : 1; return g > 0 && isFinite(g) ? g : 0; }
  function snap(v) { var g = snapStep(); return g ? Math.round(v / g) * g : v; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function bbox(pts) { var a = [Infinity, Infinity, -Infinity, -Infinity]; pts.forEach(function (p) { a[0] = Math.min(a[0], p[0]); a[1] = Math.min(a[1], p[1]); a[2] = Math.max(a[2], p[0]); a[3] = Math.max(a[3], p[1]); }); return a; }
  function area(pts) { var s = 0; for (var i = 0; i < pts.length; i++) { var a = pts[i], b = pts[(i + 1) % pts.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
  function rdp(pts, eps) {
    if (pts.length < 3) return pts.slice();
    var dmax = 0, idx = 0, a = pts[0], b = pts[pts.length - 1];
    for (var i = 1; i < pts.length - 1; i++) {
      var p = pts[i], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1e-9;
      var d = L < 1e-6 ? Math.hypot(p[0] - a[0], p[1] - a[1]) : Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / L; if (d > dmax) { dmax = d; idx = i; }
    }
    if (dmax > eps) { var l = rdp(pts.slice(0, idx + 1), eps), r = rdp(pts.slice(idx), eps); return l.slice(0, -1).concat(r); }
    return [a, b];
  }
  function inside(pt, poly) { var c = false; for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) { var a = poly[i], b = poly[j]; if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < (b[0] - a[0]) * (pt[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }

  var CSS = ".pcsk{position:fixed;inset:0;z-index:2147482000;background:#f7fbff;display:flex;flex-direction:column;font:13px system-ui,sans-serif;color:#1f2a37;touch-action:none;-webkit-user-select:none;user-select:none}" +
    ".pcsk-top{display:flex;align-items:center;gap:4px;padding:calc(6px + env(safe-area-inset-top,0px)) 8px 6px;background:#fff;border-bottom:1px solid #d7e3ef;overflow-x:auto;scrollbar-width:none;flex:0 0 auto}.pcsk-top::-webkit-scrollbar{display:none}" +
    ".pcsk-top .t{font-weight:700;margin-right:6px;white-space:nowrap}.pcsk-sp{flex:1 1 8px}.pcsk-sep{width:1px;height:26px;background:#d7e3ef;margin:0 3px;flex:0 0 auto}" +
    ".pcsk button{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;gap:5px;min-width:36px;height:36px;padding:0 8px;border:1px solid transparent;border-radius:8px;background:none;color:#1f2a37;font:inherit;cursor:pointer}" +
    ".pcsk button:hover{background:#eef4fb}.pcsk button[aria-pressed=true]{background:#dbeafe;border-color:#93c5fd;color:#1d4ed8}.pcsk button:disabled{opacity:.35}" +
    ".pcsk button svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}" +
    ".pcsk .pcsk-finish{background:#1d72d8;color:#fff;font-weight:600;padding:0 12px}.pcsk .pcsk-finish:hover{background:#155fb8}" +
    ".pcsk-stage{position:relative;flex:1 1 auto;overflow:hidden}.pcsk-stage svg.pcsk-c{position:absolute;inset:0;width:100%;height:100%;display:block}" +
    ".pcsk-side{position:absolute;left:8px;top:8px;display:flex;flex-direction:column;gap:4px;background:#fff;border:1px solid #d7e3ef;border-radius:10px;padding:4px;box-shadow:0 2px 8px rgba(30,60,90,.08)}" +
    ".pcsk-opts{position:absolute;right:8px;top:8px;background:#fff;border:1px solid #d7e3ef;border-radius:10px;padding:8px 10px;display:flex;flex-direction:column;gap:6px;box-shadow:0 2px 8px rgba(30,60,90,.08);min-width:150px}" +
    ".pcsk-opts label{display:flex;align-items:center;justify-content:space-between;gap:8px;white-space:nowrap}.pcsk-opts input[type=number]{width:64px;padding:4px 6px;border:1px solid #c7d6e6;border-radius:6px;font:inherit}" +
    ".pcsk-hint{position:absolute;left:50%;bottom:calc(10px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);background:rgba(31,42,55,.86);color:#fff;padding:6px 12px;border-radius:999px;font-size:12.5px;max-width:calc(100% - 20px);text-align:center;pointer-events:none}" +
    ".pcsk-dim{font:600 11px system-ui,sans-serif;fill:#1d4ed8;paint-order:stroke;stroke:#f7fbff;stroke-width:3px}" +
    "@media (max-width:640px){.pcsk-top .t,.pcsk-lbl{display:none}.pcsk-opts{top:auto;bottom:calc(46px + env(safe-area-inset-bottom,0px));right:6px;padding:6px 8px;min-width:0}.pcsk-side{left:6px;top:6px}.pcsk-hint{top:6px;bottom:auto;left:62px;right:6px;transform:none;border-radius:12px;max-width:none}.pcsk button{min-width:34px;height:34px;padding:0 6px}}";
  var I = {
    draw: '<path d="M4 20c3-1 5-6 8-6s2 4 5 4 3-5 3-8"/><path d="M15 4l5 5"/>',
    poly: '<path d="M5 18L8 6l9 3 2 9z"/><circle cx="5" cy="18" r="1.6"/><circle cx="8" cy="6" r="1.6"/><circle cx="17" cy="9" r="1.6"/><circle cx="19" cy="18" r="1.6"/>',
    edit: '<path d="M5 3l12 8-5 1.5L9.5 18z"/>',
    undo: '<path d="M9 7L4 12l5 5"/><path d="M4 12h10a6 6 0 010 12"/>', redo: '<path d="M15 7l5 5-5 5"/><path d="M20 12H10a6 6 0 000 12"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/>',
    del: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    home: '<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/>', zin: '<path d="M12 5v14M5 12h14"/>', zout: '<path d="M5 12h14"/>',
    fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', close: '<path d="M6 6l12 12M18 6L6 18"/>', check: '<path d="M5 12l5 5 9-10"/>'
  };
  function btn(parent, icon, label, onClick, cls) {
    var b = el("button", cls || "", parent, '<svg viewBox="0 0 24 24">' + I[icon] + '</svg>' + (cls === "pcsk-finish" || /pcsk-wide/.test(cls || "") ? '<span class="pcsk-lbl">' + label + "</span>" : ""));
    b.type = "button"; b.setAttribute("aria-label", label); b.title = label; b.onclick = onClick; return b;
  }

  function open() {
    var b = bridge(); if (!b) { alert("Open a design first, then choose Sketch."); return; }
    if (st) return;
    if (!document.getElementById("pcsk-css")) { var s = document.createElement("style"); s.id = "pcsk-css"; s.textContent = CSS; document.head.appendChild(s); }
    var root = el("div", "pcsk", document.body); root.setAttribute("role", "dialog"); root.setAttribute("aria-label", "Sketch");
    var top = el("div", "pcsk-top", root);
    el("span", "t", top, "Sketch");
    st = { root: root, shapes: [], sel: -1, tool: "draw", undo: [], redo: [], view: { cx: 0, cy: 0, s: 4 }, cur: null, ptrs: {}, height: 10, hole: false };
    st.bCopy = btn(top, "copy", "Copy shape", function () { if (st.sel < 0) return; push(); var c = clone(st.shapes[st.sel]); var g = snapStep() || 1; c.pts = c.pts.map(function (p) { return [p[0] + 5 * g, p[1] + 5 * g]; }); st.shapes.push(c); st.sel = st.shapes.length - 1; render(); });
    st.bDel = btn(top, "del", "Delete shape", function () { if (st.cur) { st.cur = null; render(); return; } if (st.sel < 0) return; push(); st.shapes.splice(st.sel, 1); st.sel = -1; render(); });
    el("span", "pcsk-sep", top);
    st.bUndo = btn(top, "undo", "Undo", undoFn); st.bRedo = btn(top, "redo", "Redo", redoFn);
    el("span", "pcsk-sep", top);
    st.tDraw = btn(top, "draw", "Freehand", function () { tool("draw"); }, "pcsk-wide");
    st.tPoly = btn(top, "poly", "Points", function () { tool("poly"); }, "pcsk-wide");
    st.tEdit = btn(top, "edit", "Edit points", function () { tool("edit"); }, "pcsk-wide");
    el("span", "pcsk-sp", top);
    btn(top, "close", "Cancel", close);
    st.bFinish = btn(top, "check", "Finish sketch", finish, "pcsk-finish");
    var stage = el("div", "pcsk-stage", root); st.stage = stage;
    st.svg = h("svg", { "class": "pcsk-c" }, stage);
    st.gGrid = h("g", {}, st.svg); st.gRef = h("g", {}, st.svg); st.gShapes = h("g", {}, st.svg); st.gUi = h("g", {}, st.svg);
    var side = el("div", "pcsk-side", stage);
    btn(side, "home", "Home view", function () { home(); }); btn(side, "zin", "Zoom in", function () { zoom(1.4); }); btn(side, "zout", "Zoom out", function () { zoom(1 / 1.4); }); btn(side, "fit", "Fit to drawing", fit);
    var opts = el("div", "pcsk-opts", stage);
    var lh = el("label", "", opts, '<span>Height (mm)</span>'); st.inH = el("input", "", lh); st.inH.type = "number"; st.inH.min = "0.2"; st.inH.step = "0.5"; st.inH.value = "10";
    st.inH.oninput = function () { var v = parseFloat(st.inH.value); if (v > 0) st.height = v; };
    var lo = el("label", "", opts, '<span>Make it a hole</span>'); st.inHole = el("input", "", lo); st.inHole.type = "checkbox"; st.inHole.onchange = function () { st.hole = st.inHole.checked; };
    st.hint = el("div", "pcsk-hint", stage);
    // reference: the plate and the objects already in the design
    st.plate = b.plate ? b.plate() : { width: 200, depth: 200 };
    st.refs = (b.footprints ? b.footprints() : []) || [];
    var on = function (t, f) { st.svg.addEventListener(t, f); };
    on("pointerdown", down); on("pointermove", move); on("pointerup", up); on("pointercancel", up);
    // iPad trackpad: two-finger scroll pans, pinch (ctrl+wheel or Safari gesture) zooms; a mouse wheel elsewhere zooms.
    var padOS = navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent);
    on("wheel", function (e) { e.preventDefault();
      if (padOS && !e.ctrlKey) { st.view.cx += e.deltaX / st.view.s; st.view.cy += e.deltaY / st.view.s; render(); return; }
      zoomAt(Math.pow(e.ctrlKey ? 1.01 : 1.0015, -e.deltaY), e.clientX, e.clientY); });
    var gs = 1;
    on("gesturestart", function (e) { e.preventDefault(); gs = 1; });
    on("gesturechange", function (e) { e.preventDefault(); if (e.scale > 0) { var r = st.svg.getBoundingClientRect(); zoomAt(e.scale / gs, e.clientX || r.left + r.width / 2, e.clientY || r.top + r.height / 2); gs = e.scale; } });
    on("gestureend", function (e) { e.preventDefault(); });
    on("contextmenu", function (e) { e.preventDefault(); });
    on("dblclick", function () { if (st.tool === "poly" && st.cur) closeCur(); });
    st.onKey = function (e) {
      if (e.target && /INPUT/.test(e.target.tagName)) return;
      if (e.key === "Escape") { if (st.cur) { st.cur = null; render(); } else close(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redoFn() : undoFn(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); redoFn(); }
      else if (e.key === "Delete" || e.key === "Backspace") st.bDel.click();
      else if (e.key === "Enter" && st.cur) closeCur();
      e.stopPropagation();
    };
    addEventListener("keydown", st.onKey, true);
    st.onResize = function () { render(); }; addEventListener("resize", st.onResize);
    home(); tool("draw");
  }
  function close() { if (!st) return; removeEventListener("keydown", st.onKey, true); removeEventListener("resize", st.onResize); st.root.remove(); st = null; }
  function tool(t) { if (st.cur && t !== st.tool) st.cur = null; st.tool = t; [["draw", st.tDraw], ["poly", st.tPoly], ["edit", st.tEdit]].forEach(function (x) { x[1].setAttribute("aria-pressed", String(x[0] === t)); }); render(); }
  function push() { st.undo.push(clone(st.shapes)); if (st.undo.length > 100) st.undo.shift(); st.redo = []; }
  function undoFn() { if (st.cur) { st.cur = null; render(); return; } if (!st.undo.length) return; st.redo.push(clone(st.shapes)); st.shapes = st.undo.pop(); st.sel = Math.min(st.sel, st.shapes.length - 1); render(); }
  function redoFn() { if (!st.redo.length) return; st.undo.push(clone(st.shapes)); st.shapes = st.redo.pop(); render(); }
  // view: world mm (x right, y towards the front = down on screen) -> screen px
  function size() { var r = st.svg.getBoundingClientRect(); return { w: r.width, h: r.height, l: r.left, t: r.top }; }
  function toS(p) { var z = size(); return [z.w / 2 + (p[0] - st.view.cx) * st.view.s, z.h / 2 + (p[1] - st.view.cy) * st.view.s]; }
  function toW(cx, cy) { var z = size(); return [(cx - z.l - z.w / 2) / st.view.s + st.view.cx, (cy - z.t - z.h / 2) / st.view.s + st.view.cy]; }
  function home() { var z = size(); st.view = { cx: 0, cy: 0, s: Math.max(0.3, Math.min(z.w / (st.plate.width * 1.1), z.h / (st.plate.depth * 1.1))) }; render(); }
  function zoom(f) { var z = size(); zoomAt(f, z.l + z.w / 2, z.t + z.h / 2); }
  function zoomAt(f, sx, sy) { var before = toW(sx, sy); st.view.s = Math.max(0.2, Math.min(80, st.view.s * f)); var after = toW(sx, sy); st.view.cx += before[0] - after[0]; st.view.cy += before[1] - after[1]; render(); }
  function fit() { var all = [].concat.apply([], st.shapes.map(function (s) { return s.pts; })); if (!all.length) return home(); var b = bbox(all), z = size(); st.view.cx = (b[0] + b[2]) / 2; st.view.cy = (b[1] + b[3]) / 2; st.view.s = Math.max(0.3, Math.min(60, Math.min(z.w / ((b[2] - b[0]) * 1.4 + 10), z.h / ((b[3] - b[1]) * 1.4 + 10)))); render(); }

  function down(e) {
    st.svg.setPointerCapture(e.pointerId); st.ptrs[e.pointerId] = [e.clientX, e.clientY];
    var ids = Object.keys(st.ptrs);
    if (ids.length === 2) { // two fingers: pinch and pan; drop a stroke just started
      if (st.drag && st.drag.kind === "draw") st.cur = null; st.drag = { kind: "pinch" }; st.pinch = pinchState(); render(); return;
    }
    if (ids.length > 2) return;
    var w = toW(e.clientX, e.clientY), tol = 12 / st.view.s;
    if (e.button === 1 || e.button === 2) { st.drag = { kind: "pan", x: e.clientX, y: e.clientY }; return; }
    if (st.tool === "draw") { st.cur = { pts: [w] }; st.drag = { kind: "draw" }; render(); return; }
    if (st.tool === "poly") {
      var p = [snap(w[0]), snap(w[1])];
      if (st.cur && st.cur.pts.length >= 3 && Math.hypot(w[0] - st.cur.pts[0][0], w[1] - st.cur.pts[0][1]) < tol) { closeCur(); st.drag = null; return; }
      if (!st.cur) st.cur = { pts: [] };
      var last = st.cur.pts[st.cur.pts.length - 1]; if (!last || last[0] !== p[0] || last[1] !== p[1]) st.cur.pts.push(p);
      st.drag = { kind: "polypt" }; render(); return;
    }
    // edit: a point of the selected shape, else a shape (move it), else pan
    if (st.sel >= 0) {
      var sp = st.shapes[st.sel].pts; for (var i = 0; i < sp.length; i++) if (Math.hypot(sp[i][0] - w[0], sp[i][1] - w[1]) < tol) { push(); st.drag = { kind: "pt", i: i }; return; }
    }
    for (var k = st.shapes.length - 1; k >= 0; k--) if (inside(w, st.shapes[k].pts)) { st.sel = k; push(); st.drag = { kind: "move", w: [snap(w[0]), snap(w[1])], orig: clone(st.shapes[k].pts), moved: false }; render(); return; }
    st.sel = -1; st.drag = { kind: "pan", x: e.clientX, y: e.clientY }; render();
  }
  function pinchState() { var p = Object.keys(st.ptrs).map(function (k) { return st.ptrs[k]; }); return { d: Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]) || 1, m: [(p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2] }; }
  function move(e) {
    if (!st.ptrs[e.pointerId]) { hover(e); return; } st.ptrs[e.pointerId] = [e.clientX, e.clientY];
    var d = st.drag; if (!d) return; var w = toW(e.clientX, e.clientY);
    if (d.kind === "pinch") { var n = pinchState(), o = st.pinch; if (Object.keys(st.ptrs).length < 2) return; zoomAt(n.d / o.d, n.m[0], n.m[1]); st.view.cx -= (n.m[0] - o.m[0]) / st.view.s; st.view.cy -= (n.m[1] - o.m[1]) / st.view.s; st.pinch = n; render(); }
    else if (d.kind === "pan") { st.view.cx -= (e.clientX - d.x) / st.view.s; st.view.cy -= (e.clientY - d.y) / st.view.s; d.x = e.clientX; d.y = e.clientY; render(); }
    else if (d.kind === "draw") { var l = st.cur.pts[st.cur.pts.length - 1]; if (Math.hypot(w[0] - l[0], w[1] - l[1]) * st.view.s > 2) { st.cur.pts.push(w); render(); } }
    else if (d.kind === "polypt") { var q = st.cur.pts; q[q.length - 1] = [snap(w[0]), snap(w[1])]; render(); }
    else if (d.kind === "pt") { st.shapes[st.sel].pts[d.i] = [snap(w[0]), snap(w[1])]; render(); }
    else if (d.kind === "move") { var dx = snap(w[0]) - d.w[0], dy = snap(w[1]) - d.w[1]; if (dx || dy) d.moved = true; st.shapes[st.sel].pts = d.orig.map(function (p) { return [p[0] + dx, p[1] + dy]; }); render(); }
  }
  function hover(e) { if (st.tool === "poly" && st.cur && st.cur.pts.length) { st.ghost = toW(e.clientX, e.clientY); st.ghost = [snap(st.ghost[0]), snap(st.ghost[1])]; render(); } }
  function up(e) {
    delete st.ptrs[e.pointerId]; var d = st.drag;
    if (d && d.kind === "pinch") { if (!Object.keys(st.ptrs).length) st.drag = null; return; }
    st.drag = null; if (!d) return;
    if (d.kind === "draw" && st.cur) {
      var pts = rdp(st.cur.pts, Math.max(0.15, 1.2 / st.view.s)); if (pts.length > 2 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
      st.cur = null;
      var b = pts.length ? bbox(pts) : [0, 0, 0, 0];
      if (pts.length >= 3 && Math.abs(area(pts)) > 0.5 && b[2] - b[0] > 0.5 && b[3] - b[1] > 0.5) { push(); st.shapes.push({ pts: pts.map(function (p) { return [r2(p[0]), r2(p[1])]; }) }); st.sel = st.shapes.length - 1; }
      render();
    }
    if (d.kind === "move" && !d.moved) st.undo.pop();
  }
  function closeCur() {
    var pts = st.cur.pts.slice(); if (pts.length > 3) { var a = pts[0], z = pts[pts.length - 1]; if (a[0] === z[0] && a[1] === z[1]) pts.pop(); }
    st.cur = null; st.ghost = null;
    if (pts.length >= 3 && Math.abs(area(pts)) > 0.25) { push(); st.shapes.push({ pts: pts }); st.sel = st.shapes.length - 1; }
    render();
  }

  function render() {
    if (!st) return; var z = size(); st.svg.setAttribute("viewBox", "0 0 " + z.w + " " + z.h);
    // grid: snap-size lines when they are far enough apart, every 10 mm stronger
    var g = st.gGrid; g.innerHTML = ""; var a = toW(z.l, z.t), b = toW(z.l + z.w, z.t + z.h), step = snapStep() || 1;
    while (step * st.view.s < 7) step *= (String(step).charAt(0) === "2" ? 2.5 : 2);
    var dmin = "", dmaj = "", x0 = Math.floor(a[0] / step) * step, y0 = Math.floor(a[1] / step) * step;
    for (var x = x0; x <= b[0]; x += step) { var sx = toS([x, 0])[0].toFixed(1), maj = Math.abs(Math.round(x / 10) * 10 - x) < 1e-6; (maj ? (dmaj += "M" + sx + " 0V" + z.h) : (dmin += "M" + sx + " 0V" + z.h)); }
    for (var y = y0; y <= b[1]; y += step) { var sy = toS([0, y])[1].toFixed(1), mj = Math.abs(Math.round(y / 10) * 10 - y) < 1e-6; (mj ? (dmaj += "M0 " + sy + "H" + z.w) : (dmin += "M0 " + sy + "H" + z.w)); }
    h("path", { d: dmin, stroke: "#d6e6f5", "stroke-width": 1, fill: "none" }, g); h("path", { d: dmaj, stroke: "#a9c9e8", "stroke-width": 1, fill: "none" }, g);
    var P = st.plate, pa = toS([-P.width / 2, -P.depth / 2]); h("rect", { x: pa[0], y: pa[1], width: P.width * st.view.s, height: P.depth * st.view.s, fill: "none", stroke: "#5b8fc7", "stroke-width": 1.5, "stroke-dasharray": "6 4" }, g);
    var o = toS([0, 0]); h("path", { d: "M" + (o[0] - 8) + " " + o[1] + "h16M" + o[0] + " " + (o[1] - 8) + "v16", stroke: "#5b8fc7", "stroke-width": 1.2 }, g);
    // reference objects, faint
    var r = st.gRef; r.innerHTML = "";
    st.refs.forEach(function (f) { if (f.pts && f.pts.length > 2) h("path", { d: pathD(f.pts, true), fill: "rgba(120,130,150,.10)", stroke: "rgba(90,100,120,.45)", "stroke-width": 1, "stroke-dasharray": "3 3" }, r); });
    // shapes
    var s = st.gShapes; s.innerHTML = "";
    st.shapes.forEach(function (sh, i) { h("path", { d: pathD(sh.pts, true), fill: st.hole ? "rgba(140,150,160,.35)" : "rgba(125,185,240,.45)", stroke: i === st.sel ? "#1d4ed8" : "#2f80d8", "stroke-width": i === st.sel ? 2.4 : 1.8, "stroke-linejoin": "round" }, s); });
    var u = st.gUi; u.innerHTML = "";
    if (st.cur && st.cur.pts.length) {
      var cp = st.cur.pts.slice(); if (st.tool === "poly" && st.ghost && !st.drag) cp.push(st.ghost);
      h("path", { d: pathD(cp, false), fill: "none", stroke: "#1d4ed8", "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }, u);
      if (st.tool === "poly") st.cur.pts.forEach(function (p, k) { var q = toS(p); h("circle", { cx: q[0], cy: q[1], r: k === 0 ? 7 : 4.5, fill: k === 0 ? "#fff" : "#1d4ed8", stroke: "#1d4ed8", "stroke-width": 2 }, u); });
      dims(cp, u);
    } else if (st.sel >= 0 && st.shapes[st.sel]) {
      var sp = st.shapes[st.sel].pts;
      if (st.tool === "edit") sp.forEach(function (p) { var q = toS(p); h("rect", { x: q[0] - 5, y: q[1] - 5, width: 10, height: 10, rx: 2, fill: "#fff", stroke: "#1d4ed8", "stroke-width": 2 }, u); });
      dims(sp, u);
    }
    st.bUndo.disabled = !st.undo.length && !st.cur; st.bRedo.disabled = !st.redo.length; st.bDel.disabled = st.sel < 0 && !st.cur; st.bCopy.disabled = st.sel < 0; st.bFinish.disabled = !st.shapes.length;
    st.hint.textContent = st.tool === "draw" ? "Draw a closed shape with your finger or mouse. It closes itself when you let go." :
      st.tool === "poly" ? (st.cur ? "Tap to add points. Tap the first point (or double-click / Enter) to close." : "Tap to place the first point. Points snap to the " + (snapStep() || "free") + (snapStep() ? " mm" : "") + " grid.") :
      "Drag a point to move it, drag a shape to move it all. Two fingers or the wheel to zoom.";
  }
  function pathD(pts, closed) { return pts.map(function (p, i) { var q = toS(p); return (i ? "L" : "M") + q[0].toFixed(1) + " " + q[1].toFixed(1); }).join("") + (closed ? "Z" : ""); }
  function dims(pts, g) {
    if (pts.length < 2) return; var b = bbox(pts), w = b[2] - b[0], d = b[3] - b[1]; if (w < 0.01 && d < 0.01) return;
    var tl = toS([b[0], b[1]]), br = toS([b[2], b[3]]), off = 16, c = "#1d4ed8";
    var y = tl[1] - off; h("path", { d: "M" + tl[0] + " " + y + "H" + br[0] + "M" + tl[0] + " " + (y - 4) + "v8M" + br[0] + " " + (y - 4) + "v8", stroke: c, "stroke-width": 1.2 }, g);
    var t = h("text", { x: (tl[0] + br[0]) / 2, y: y - 5, "text-anchor": "middle", "class": "pcsk-dim" }, g); t.textContent = r2(w) + " mm";
    var x = br[0] + off; h("path", { d: "M" + x + " " + tl[1] + "V" + br[1] + "M" + (x - 4) + " " + tl[1] + "h8M" + (x - 4) + " " + br[1] + "h8", stroke: c, "stroke-width": 1.2 }, g);
    var t2 = h("text", { x: x + 6, y: (tl[1] + br[1]) / 2 + 4, "class": "pcsk-dim" }, g); t2.textContent = r2(d) + " mm";
  }

  // Finish: one SVG whose page is centred on the plate's middle, in mm, so each shape lands where it was drawn.
  function toSvg(shapes) {
    var all = [].concat.apply([], shapes.map(function (s) { return s.pts; })), b = bbox(all);
    var half = Math.ceil(Math.max(Math.abs(b[0]), Math.abs(b[1]), Math.abs(b[2]), Math.abs(b[3]), 1) + 2);
    var d = shapes.map(function (s) { var p = area(s.pts) < 0 ? s.pts : s.pts.slice().reverse(); return p.map(function (q, i) { return (i ? "L" : "M") + r2(q[0]) + " " + r2(q[1]); }).join(" ") + " Z"; }).join(" ");
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + -half + " " + -half + " " + 2 * half + " " + 2 * half + '" width="' + 2 * half + 'mm" height="' + 2 * half + 'mm"><path fill="#2f80d8" fill-rule="nonzero" d="' + d + '"/></svg>';
  }
  function finish() {
    if (!st || !st.shapes.length) return; var b = bridge(); if (!b) return;
    var bb = bbox([].concat.apply([], st.shapes.map(function (s) { return s.pts; }))), svg = toSvg(st.shapes), file = new File([svg], "Sketch.svg", { type: "image/svg+xml" }), height = st.height, hole = st.hole;
    st.bFinish.disabled = true; st.hint.textContent = "Making the solid…";
    Promise.resolve(b.importSketch(file, { height: height, hole: hole, x: (bb[0] + bb[2]) / 2, z: (bb[1] + bb[3]) / 2 })).then(function (res) {
      if (res && res.failures && res.failures.length && !(res.importedIds || []).length) { st.hint.textContent = "Could not make a solid: " + res.failures[0].reason; st.bFinish.disabled = false; return; }
      close();
    }).catch(function (err) { if (st) { st.hint.textContent = "Could not make a solid: " + (err && err.message || err); st.bFinish.disabled = false; } });
  }
  window.PrintCADSketch = { open: open, close: close, _state: function () { return st; }, _toSvg: toSvg,
    _add: function (pts) { if (!st) return; push(); st.shapes.push({ pts: pts }); st.sel = st.shapes.length - 1; render(); }, _finish: finish };

  // The "Sketch" tile in the Shapes panel, next to the basic shapes.
  var ICON = '<svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true"><path d="M9 36l6-20 16 4 6 14z" fill="#9cc8f2" stroke="#2f80d8" stroke-width="2" stroke-linejoin="round"/><path d="M27 31l13-13 4 4-13 13-6 2z" fill="#fff" stroke="#1f2a37" stroke-width="2" stroke-linejoin="round"/><path d="M38 20l4 4" stroke="#1f2a37" stroke-width="2"/></svg>';
  function addTile() {
    document.querySelectorAll(".shape-menu-dropdown .shape-menu-list").forEach(function (list) {
      if (list.querySelector(".printcad-sketch-tile") || !list.querySelector('.shape-menu-item[aria-label="Box"]')) return;
      var b = document.createElement("button"); b.type = "button"; b.className = "shape-menu-item printcad-sketch-tile"; b.title = "Sketch";
      b.setAttribute("aria-label", "Sketch"); b.setAttribute("data-pctip-title", "Sketch");
      b.innerHTML = '<span class="shape-menu-thumb" style="display:flex;align-items:center;justify-content:center">' + ICON + "</span><span>Sketch</span>";
      b.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); open(); });
      var third = list.children[2]; list.insertBefore(b, third || null);
    });
  }
  new MutationObserver(addTile).observe(document.documentElement, { childList: true, subtree: true });
})();
