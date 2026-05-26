export function buildPrintAutoCloseScript({
  waitForImages = false,
  printDelayMs = 60,
  fallbackPrintMs = 2500,
  closeDelayMs = 120,
} = {}) {
  return `
    (function () {
      var closeScheduled = false;
      function closeSelfSoon() {
        if (closeScheduled) return;
        closeScheduled = true;
        setTimeout(function () {
          try { if (window.opener && !window.opener.closed) window.opener.focus(); } catch (_) {}
          try { window.close(); } catch (_) {}
        }, ${Number(closeDelayMs) || 120});
      }
      try {
        window.addEventListener("afterprint", closeSelfSoon, { once: true });
      } catch (_) {}
      try {
        var mql = window.matchMedia && window.matchMedia("print");
        if (mql && mql.addEventListener) {
          mql.addEventListener("change", function (e) {
            if (!e.matches) closeSelfSoon();
          }, { once: true });
        } else if (mql && mql.addListener) {
          var handler = function (e) {
            if (!e.matches) {
              try { mql.removeListener(handler); } catch (_) {}
              closeSelfSoon();
            }
          };
          mql.addListener(handler);
        }
      } catch (_) {}
      function doPrint() {
        try { window.print(); } catch (_) {}
      }
      ${waitForImages
        ? `
      var imgs = Array.prototype.slice.call(document.images || []);
      if (!imgs.length) {
        setTimeout(doPrint, ${Number(printDelayMs) || 60});
        return;
      }
      var done = 0;
      var fired = false;
      function finish() {
        done += 1;
        if (fired) return;
        if (done >= imgs.length) {
          fired = true;
          setTimeout(doPrint, ${Number(printDelayMs) || 60});
        }
      }
      imgs.forEach(function (img) {
        if (img.complete) {
          finish();
          return;
        }
        img.addEventListener("load", finish, { once: true });
        img.addEventListener("error", finish, { once: true });
      });
      setTimeout(function () {
        if (fired) return;
        fired = true;
        doPrint();
      }, ${Number(fallbackPrintMs) || 2500});
      `
        : `
      setTimeout(doPrint, ${Number(printDelayMs) || 60});
      `}
    })();
  `
}

export function openPrintDocument({
  title = "Print",
  html,
  features = "width=420,height=700",
}) {
  const w = window.open("", "_blank", features)
  if (!w) return null
  try {
    w.document.open()
    w.document.write(html)
    w.document.close()
    w.focus()
    return w
  } catch {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    window.open(url, "_blank")
    return w
  }
}
