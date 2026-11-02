/* PrintCAD phone detection: runs before first paint. iPhone / Android phones get html.printcad-phone; tablets (iPad) keep the normal layout. */
(function () {
  try {
    var ua = navigator.userAgent || "";
    var isTablet = /iPad|Tablet|SM-T|Nexus (7|9|10)|Kindle|Silk/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) || (/Android/i.test(ua) && !/Mobile/i.test(ua));
    var phoneUa = /iPhone|iPod|Android.+Mobile|Windows Phone|Mobile.+Firefox/i.test(ua);
    var touch = (navigator.maxTouchPoints || 0) > 0 || (window.matchMedia && matchMedia("(pointer: coarse)").matches);
    var small = Math.min(screen.width || 9999, screen.height || 9999) <= 540 || Math.min(innerWidth, innerHeight) <= 540;
    if (!isTablet && (phoneUa || (touch && small)) && !/printcad-desktop=1/.test(location.search)) document.documentElement.classList.add("printcad-phone");
  } catch (e) {}
})();
/* Tablets (iPad, Android tablets): mark them so the header can clear the status bar. */
(function () {
  var ua = navigator.userAgent || "", touch = (navigator.maxTouchPoints || 0) > 1;
  var tablet = /iPad/.test(ua) || (/Macintosh/.test(ua) && touch) || (/Android/.test(ua) && !/Mobile/.test(ua));
  if (tablet && !document.documentElement.classList.contains("printcad-phone")) document.documentElement.classList.add("printcad-tablet");
})();
