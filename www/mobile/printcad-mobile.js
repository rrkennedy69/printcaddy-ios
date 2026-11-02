/* PrintCAD phone layout behaviour: page indicators, arrows, the two-row Modify page and camera framing. */
(function () {
  var root = document.documentElement;
  if (!root.classList.contains("printcad-phone")) return;
  var bar = null, prev, next, dots, secs = [], active = -1, raf = 0;
  function ui() {
    if (prev) return;
    // PrintCaddy: no arrow buttons; the strip scrolls by touch. Stand-ins keep the code below simple.
    prev = {}; next = {};
    dots = el("div", "pcm-ind pcm-dots", "");
  }
  function el(t, c, txt) { var e = document.createElement(t); e.className = c; e.textContent = txt; if (t === "button") e.type = "button"; document.body.appendChild(e); return e; }
  function sections() { return bar ? [].slice.call(bar.querySelectorAll(".toolbar-section")).filter(function (s) { return s.offsetParent !== null; }) : []; }
  function go(i) { secs = sections(); if (!secs.length) return; i = Math.max(0, Math.min(secs.length - 1, i));
    bar.scrollTo({ left: secs[i].offsetLeft - parseFloat(getComputedStyle(bar).paddingLeft || 0), behavior: "smooth" }); }
  // Modify is laid out in two rows: its width is half of its buttons (measured again whenever they change size).
  function modifyWidth() {
    var m = bar && bar.querySelector('.toolbar-section[data-group="modify"] .toolbar-section-tools'); if (!m) return;
    var kids = [].slice.call(m.children); if (kids.length < 2) return;
    var w = 0; kids.forEach(function (k) { w += k.getBoundingClientRect().width; });
    if (w < kids.length * 12) return; // icons not laid out yet
    var v = Math.ceil(w / 2 + 40) + "px"; if (m.dataset.w !== v) { m.dataset.w = v; if (bar.clientWidth < 600) m.style.width = v; }
  }
  // The tools strip is as tall as its tallest section plus room for the page dots underneath, never a fixed guess.
  var lastH = 0;
  function fitHeight() {
    if (!bar) return; var cs = getComputedStyle(bar), top = parseFloat(cs.paddingTop) || 0, max = 0;
    [].slice.call(bar.querySelectorAll(".toolbar-section")).forEach(function (s) { if (s.offsetParent === null) return; var st = s.getBoundingClientRect().top, lo = st;
      [].slice.call(s.children).forEach(function (c) { var r = c.getBoundingClientRect(); if (r.height) lo = Math.max(lo, r.bottom + (parseFloat(getComputedStyle(c).marginBottom) || 0)); });
      max = Math.max(max, lo - st); });
    if (max < 20) return;
    var h = Math.ceil(top + max + 14); // 14 = gap + dot strip below the icons
    if (h !== lastH) { lastH = h; root.style.setProperty("--editor-toolbar-tools-height", h + "px", "important"); window.dispatchEvent(new Event("resize")); }
  }
  function update() {
    raf = 0; if (!bar) return; modifyWidth(); fitHeight();
    secs = sections(); var x = bar.scrollLeft + parseFloat(getComputedStyle(bar).paddingLeft || 0) + 4, i = 0;
    secs.forEach(function (s, k) { if (s.offsetLeft <= x) i = k; });
    if (bar.scrollLeft + bar.clientWidth >= bar.scrollWidth - 2) { // at the end: the last fully visible section
      i = secs.length - 1; while (i > 0 && secs[i].offsetLeft > bar.scrollLeft + 20 && secs[i - 1].offsetLeft >= bar.scrollLeft) i--; i = Math.max(i, 0);
      i = secs.length - 1;
    }
    var tall = !!(secs[i] && secs[i].dataset.group === "modify");
    // Modify needs two rows while any part of it is on screen.
    var mt = bar.querySelector('.toolbar-section[data-group="modify"] .toolbar-section-tools');
    if (mt) { var wide = bar.clientWidth >= 600; mt.style.width = wide ? "" : (mt.dataset.w || ""); if (wide) tall = false; }
    root.classList.toggle("pcm-tall", tall);
    if (i !== active || dots.childElementCount !== secs.length) {
      active = i; dots.innerHTML = secs.map(function (_, k) { return "<i" + (k === i ? ' class="on"' : "") + "></i>"; }).join("");
    }
    prev.disabled = bar.scrollLeft <= 2; next.disabled = bar.scrollLeft + bar.clientWidth >= bar.scrollWidth - 2;
  }
  function sched() { if (!raf) raf = requestAnimationFrame(update); }
  var framed = new WeakSet();
  function frame() { // show the whole plate between the bars once the slim layout is in place
    var stage = document.querySelector(".workplane-stage"); if (!stage || framed.has(stage)) return; framed.add(stage);
    setTimeout(function () {
      window.dispatchEvent(new Event("resize"));
      var home = document.querySelector('.camera-controls button[aria-label*="home" i], .camera-controls button[title*="home" i]');
      if (home) home.click();
      // a narrow portrait view crops the plate's sides; step back until all of it fits
      var out = document.querySelector('.camera-controls button[aria-label="Zoom out"]');
      if (out && innerHeight > innerWidth) for (var k = 0; k < 5; k++) setTimeout(function () { out.click(); }, 300 + k * 150);
    }, 600);
  }
  function attach() {
    var b = document.querySelector(".secondary-toolbar .toolbar-mode-content");
    if (b !== bar) { if (bar) bar.removeEventListener("scroll", sched); bar = b; active = -1; if (bar) { ui(); bar.addEventListener("scroll", sched, { passive: true }); modifyWidth(); } }
    if (bar) { modifyWidth(); fitHeight(); frame(); sched(); } else root.classList.remove("pcm-tall");
  }
  new MutationObserver(function () { attach(); }).observe(document.documentElement, { childList: true, subtree: true });
  addEventListener("resize", sched); addEventListener("orientationchange", function () { setTimeout(sched, 300); });
  if (window.ResizeObserver) { var ro = new ResizeObserver(sched); var watch = function () { var b = document.querySelector(".secondary-toolbar .toolbar-mode-content"); if (b && !b.__pcmRO) { b.__pcmRO = 1; ro.observe(b); [].slice.call(b.querySelectorAll(".toolbar-section")).forEach(function (s) { ro.observe(s); }); } }; new MutationObserver(watch).observe(document.documentElement, { childList: true, subtree: true }); watch(); }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(sched);
  attach();
  window.PrintCADMobile = { go: function (i) { go(i); }, state: function () { return { active: active, count: sections().length, tall: root.classList.contains("pcm-tall") }; } };
})();
