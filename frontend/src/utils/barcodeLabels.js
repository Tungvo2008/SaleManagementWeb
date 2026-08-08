import { barcodeBcidForValue } from "./ean13"
import { loadBarcodeTemplate, normalizeBarcodeTemplate } from "../receive/barcodeTemplate"
import { formatMoneyVN } from "./number"
import { buildPrintAutoCloseScript, openPrintDocument } from "./print"

export function openPrintLabels({ title, labels, printWindow = null }) {
  const w = printWindow || openPrintDocument({ title, html: "<!doctype html><title>Loading...</title>", features: "width=980,height=720" })
  if (!w) return
  const cfg = normalizeBarcodeTemplate(loadBarcodeTemplate())
  const isThermal = cfg.printMode === "thermal"

  const safeTitle = String(title || cfg.title || "In mã vạch").replaceAll("<", "").replaceAll(">", "")
  const pageSize = cfg.paperSize === "a4_landscape" ? "A4 landscape" : "A4 portrait"
  const pageSizeCss = isThermal ? `${cfg.labelWidthMm}mm ${cfg.labelHeightMm}mm` : pageSize
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${safeTitle}</title>
  <style>
    body{ font-family: Arial, "Helvetica Neue", Helvetica, sans-serif; margin: 0; color:#111827; }
    .wrap{ padding: ${isThermal ? "0" : `${cfg.pageMarginMm}mm`}; }
    .top{ display:flex; justify-content: space-between; gap: 10px; align-items: baseline; margin-bottom: 8mm; }
    .h1{ font-weight: 700; font-size: 16px; }
    .muted{ color:#6b7280; font-size: 12px; }
    .grid{ display:grid; grid-template-columns: repeat(${isThermal ? 1 : cfg.columns}, ${cfg.labelWidthMm}mm); gap: ${isThermal ? 0 : cfg.gapMm}mm; justify-content: start; }
    .lb{ box-sizing: border-box; border: ${isThermal ? "none" : "1px dashed rgba(17,24,39,.25)"}; border-radius: ${isThermal ? "0" : "2mm"}; padding: ${isThermal ? "1.2mm" : "1.8mm"}; width:${cfg.labelWidthMm}mm; height:${cfg.labelHeightMm}mm; display:grid; grid-template-rows: auto auto 1fr; overflow:hidden; }
    .name{ font-size: 12px; font-weight: 700; line-height: 1.15; max-height: 28px; overflow:hidden; }
    .price{ margin-top: 1mm; font-size: 11px; color:#111827; font-weight: 700; }
    .code{ font-size: 11px; color:#6b7280; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; overflow:hidden; text-overflow: ellipsis; white-space: nowrap; }
    .img{ margin-top: 1mm; display:flex; justify-content:center; align-items:center; height: ${cfg.barcodeHeightMm + 4}mm; }
    img{ max-width: 100%; max-height: ${cfg.barcodeHeightMm + 2}mm; object-fit: contain; }
    @page{ size: ${pageSizeCss}; margin: 0; }
    @media print{
      .top{ display:none; }
      .wrap{ padding: ${isThermal ? "0" : `${cfg.pageMarginMm}mm`}; }
      ${isThermal ? ".grid{display:block;} .lb{page-break-after:always; break-after:page; margin:0;} .lb:last-child{page-break-after:auto; break-after:auto;}" : ""}
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <div class="h1">${safeTitle}</div>
      <div class="muted">Gợi ý: chỉnh Scale trong hộp thoại in nếu tem quá nhỏ/lớn.</div>
    </div>
    <div class="grid">
      ${labels
        .map((lb) => {
          const code = String(lb.code || "")
          const bcid = barcodeBcidForValue(code)
          const img = code
            ? `https://bwipjs-api.metafloor.com/?bcid=${bcid}&text=${encodeURIComponent(code)}&scale=${cfg.barcodeScale}&height=${cfg.barcodeHeightMm}&includetext=true`
            : ""
          const name = String(lb.name || "")
          const price = lb.price != null ? formatMoneyVN(lb.price) : ""
          return `
            <div class="lb">
              <div class="name">${name.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</div>
              <div class="price">${price ? `${price}đ` : ""}</div>
              <div class="img">${img ? `<img alt="${code}" src="${img}"/>` : `<div class="code">${code}</div>`}</div>
            </div>
          `
        })
        .join("")}
    </div>
    <script>${buildPrintAutoCloseScript({ waitForImages: true })}</script>
  </div>
</body>
</html>`
  try {
    w.document.open()
    w.document.write(html)
    w.document.close()
    w.focus()
  } catch {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    window.open(url, "_blank")
  }
}
