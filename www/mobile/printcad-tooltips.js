/* PrintCaddy tool tips: the tool's name and a one-line description. Mouse: after ~400 ms of hovering.
   Touch: press and hold; the hold shows the tip and does not run the tool. */
(function () {
  var D = {
    "Home dashboard": "Go back to the start page with all your designs.",
    "Copy": "Copy the selected objects.", "Paste": "Paste what you copied.", "Duplicate": "Make a copy of the selection right where it is.",
    "Delete": "Remove the selected objects.", "Undo": "Take back the last change.", "Redo": "Do again what you just undid.",
    "History": "See earlier versions of this design and go back to one.", "Add shape": "Pick a box, cylinder, text or another shape to add.",
    "Show object list": "List every object in the design so you can pick, hide or rename them.", "Hide selected": "Hide the selected objects for now.",
    "Visibility options": "Show hidden objects again and other view choices.",
    "Group": "Join the selected objects into one; holes cut into the solids.", "Bundle": "Keep objects together so they move as one, without merging them.",
    "Ungroup": "Split a group back into its parts.", "Boolean Intersection": "Keep only the part where the selected objects overlap.",
    "Cut out": "Cut one object out of another.", "Hull": "Wrap the selection in one smooth outer shell.", "Loft sketches": "Make a solid that blends from one sketch to the next.",
    "Show common part": "Highlight where the selected objects overlap.",
    "Mirror": "Flip the selection front-to-back, left-to-right or upside down.", "Set rotation pivot": "Choose the point that objects turn around.",
    "Pattern": "Repeat the selection in a row, grid or circle.", "Hole pattern": "Add a row or grid of holes.", "Face": "Push or pull a flat face.",
    "Split": "Cut an object into two pieces.", "Flexi joints": "Add bendable joints for print-in-place parts.", "Cookie cutter": "Turn an outline into a cookie cutter.",
    "Chamfer": "Bevel the edges at an angle.", "Fillet": "Round off the edges.", "Hollow": "Make the object hollow with walls of a set thickness.",
    "Offset": "Grow or shrink the object's surface evenly.", "Delete face": "Remove a face from the object.", "Simplify mesh": "Use fewer triangles so big imported models run faster.",
    "Surface texture": "Add a pattern such as knurling or bumps to the surface.",
    "Align": "Line objects up by their edges or centres.", "Snap to grid": "Move objects onto the nearest grid point.", "Drop to workplane": "Set objects down flat on the work plane.",
    "Lay flat on face": "Turn an object so the face you pick lies on the plane.", "Align faces": "Turn one object so its face meets another's.", "Center on workplane": "Move the selection to the middle of the plane.",
    "Note": "Pin a text note to the design.", "Import": "Bring in STL, OBJ, 3MF, STEP, SVG files or pictures.", "Export": "Save the design as a file for your slicer or other apps.",
    "Attachments": "Keep related files, like photos or notes, with this design.", "Workspace settings": "Change units, grid, looks, backups and other preferences.",
    "Search commands": "Find any tool by typing its name.", "Quick guide": "A short tour of the basics.", "Keyboard shortcuts": "See all the keyboard shortcuts.",
    "Interactive Help": "Point at anything to learn what it does.", "3D editor": "Build and change 3D objects.", "Sketch": "Draw flat outlines to extrude or revolve.",
    "Theme": "Switch between light and dark.", "Language": "Change the language.",
    "Hide camera controls": "Fold this bar away.", "Home": "Go back to the starting view.", "Center view on selection": "Turn the view to face the selected objects.",
    "Zoom in": "Move closer.", "Zoom out": "Move further away.", "Orthographic view": "Switch between a flat view and a view with depth.",
    "Open a second view": "Show the design from a second angle side by side.", "Hide workplane": "Hide or show the grid plane.",
    "Place workplane": "Put the work plane on any face to build on it.", "Tape measure": "Measure distances between points.",
    "Place framing square": "Add a square to measure and line things up.", "Section view": "Slice the view to look inside.",
    "Rotate the view with one finger": "Choose whether one finger turns the view or moves objects.",
    "Image to SVG": "Trace a picture into a drawing you can add to your design.",
    "Import from Tinkercad": "Bring in designs exported from Tinkercad.",
    "Previous tools": "Show the previous set of tools.", "Next tools": "Show the next set of tools."
  };
  var SEL = ".secondary-toolbar button, .camera-controls button, .printcad-trace-import, .printcad-tinkercad-import, .printcad-trace-tile, .printcad-tinkercad-tile, .pcm-arrow";
  var tip = null, timer = 0, cur = null, holdFired = false, startXY = null;
  function nameOf(el) {
    var n = el.getAttribute("data-pctip-title") || el.getAttribute("aria-label") || el.getAttribute("title") || (el.textContent || "").trim();
    n = n.replace(/…$/, "").replace(/\s*\(trace a picture\)/, "");
    var key = n.replace(/\s*\(([^)]*)\)\s*$/, "").replace(/:.*$/, "").trim();
    var keys = (/\(([^)]*)\)\s*$/.exec(n) || [])[1];
    return { name: n.replace(/:.*$/, "").replace(/\s*\([^)]*\)\s*$/, "").trim() || key, keys: keys, desc: D[key] || D[n] || "" };
  }
  function stealTitle(el) { var t = el.getAttribute("title"); if (t) { el.setAttribute("data-pctip-title", t); el.removeAttribute("title"); } }
  function show(el) {
    var info = nameOf(el); if (!info.name) return;
    if (!tip) { tip = document.createElement("div"); tip.className = "pctip"; tip.setAttribute("role", "tooltip"); document.body.appendChild(tip); }
    tip.innerHTML = ""; var b = document.createElement("strong"); b.textContent = info.name; tip.appendChild(b);
    if (info.keys) { var k = document.createElement("kbd"); k.textContent = info.keys; tip.appendChild(k); }
    if (info.desc) { var p = document.createElement("span"); p.textContent = info.desc; tip.appendChild(p); }
    tip.style.left = "0px"; tip.style.top = "0px"; tip.classList.add("on");
    var r = el.getBoundingClientRect(), t = tip.getBoundingClientRect(), m = 6, W = innerWidth, H = innerHeight;
    var x = Math.min(Math.max(m, r.left + r.width / 2 - t.width / 2), W - t.width - m);
    var y = r.bottom + 8; if (y + t.height > H - m) y = r.top - t.height - 8; if (y < m) y = Math.min(H - t.height - m, r.bottom + 8);
    tip.style.left = Math.round(x) + "px"; tip.style.top = Math.round(Math.max(m, y)) + "px";
  }
  function hide() { clearTimeout(timer); timer = 0; cur = null; if (tip) tip.classList.remove("on"); }
  document.addEventListener("pointerover", function (e) {
    if (e.pointerType === "touch") return; var el = e.target.closest && e.target.closest(SEL); if (!el || el === cur) return;
    hide(); cur = el; stealTitle(el); timer = setTimeout(function () { if (cur === el && el.isConnected) show(el); }, 400);
  }, true);
  document.addEventListener("pointerout", function (e) { if (e.pointerType === "touch") return; if (cur && !(e.relatedTarget && cur.contains(e.relatedTarget))) hide(); }, true);
  document.addEventListener("pointerdown", function (e) {
    if (e.pointerType !== "touch") { hide(); return; }
    var el = e.target.closest && e.target.closest(SEL); hide(); holdFired = false; if (!el) return;
    stealTitle(el); cur = el; startXY = [e.clientX, e.clientY];
    timer = setTimeout(function () { if (cur === el) { holdFired = true; show(el); setTimeout(hide, 2600); } }, 500);
  }, true);
  document.addEventListener("pointermove", function (e) { if (e.pointerType === "touch" && startXY && timer && !holdFired && Math.abs(e.clientX - startXY[0]) + Math.abs(e.clientY - startXY[1]) > 10) hide(); }, true);
  document.addEventListener("pointerup", function (e) { if (e.pointerType === "touch" && !holdFired) { clearTimeout(timer); timer = 0; } }, true);
  document.addEventListener("pointercancel", function () { if (!holdFired) hide(); }, true);
  document.addEventListener("click", function (e) { if (holdFired) { holdFired = false; e.preventDefault(); e.stopPropagation(); } }, true);
  document.addEventListener("contextmenu", function (e) { if (e.target.closest && e.target.closest(SEL) && (holdFired || timer)) e.preventDefault(); }, true);
  addEventListener("scroll", hide, true); addEventListener("keydown", hide, true);
  var st = document.createElement("style");
  st.textContent = ".pctip{position:fixed;z-index:2147483600;max-width:min(280px,calc(100vw - 12px));padding:7px 10px;border-radius:8px;background:#2b2218;color:#fff;font:12.5px/1.35 system-ui,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.25);pointer-events:none;opacity:0;transition:opacity .12s;display:flex;flex-wrap:wrap;gap:2px 8px;align-items:baseline}" +
    ".pctip.on{opacity:1}.pctip strong{font-weight:650}.pctip kbd{font:11px system-ui,sans-serif;color:#d9c9b2;border:1px solid #6b5a45;border-radius:4px;padding:0 4px}.pctip span{flex-basis:100%;color:#eadfcd}" +
    ".secondary-toolbar button, .camera-controls button, .pcm-arrow{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}";
  document.head.appendChild(st);
  window.PrintCADTooltips = { describe: function (el) { return nameOf(el); } };
})();
