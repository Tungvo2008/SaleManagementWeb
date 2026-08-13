import { barcodeBcidForValue } from "./ean13"
import {
  loadBarcodeTemplate,
  normalizeBarcodeTemplate,
} from "../receive/barcodeTemplate"
import { formatMoneyVN } from "./number"
import { buildPrintAutoCloseScript, openPrintDocument } from "./print"

function chunkLabels(labels, columns) {
  const rows = []
  for (let index = 0; index < labels.length; index += columns) {
    rows.push(labels.slice(index, index + columns))
  }
  return rows
}

export function openPrintLabels({ title, labels, printWindow = null, columns = 1 }) {
  const w =
    printWindow ||
    openPrintDocument({
      title,
      html: "<!doctype html><title>Loading...</title>",
      features: "width=980,height=720",
    })
  if (!w) return
  const cfg = normalizeBarcodeTemplate(loadBarcodeTemplate())
  const labelColumns = columns === 2 ? 2 : 1
  const labelWidthMm = labelColumns === 2 ? cfg.doubleLabelWidthMm : cfg.labelWidthMm
  const labelHeightMm = labelColumns === 2 ? cfg.doubleLabelHeightMm : cfg.labelHeightMm
  const barcodeHeightMm = labelColumns === 2 ? cfg.doubleBarcodeHeightMm : cfg.barcodeHeightMm
  const barcodeScale = labelColumns === 2 ? cfg.doubleBarcodeScale : cfg.barcodeScale
  const labelGapMm = labelColumns === 2 ? cfg.doubleLabelGapMm : 0
  const pageWidthMm = labelWidthMm * labelColumns + labelGapMm * (labelColumns - 1)
  const labelRows = chunkLabels(Array.isArray(labels) ? labels : [], labelColumns)
  const compact = labelHeightMm <= 18 || labelWidthMm <= 28
  const labelPaddingMm = compact ? 0.55 : 1.2
  const nameFontPx = compact ? 7 : 12
  const priceFontPx = compact ? 7 : 11
  const textLineHeight = compact ? 1.05 : 1.15
  const effectiveBarcodeHeightMm = Math.min(
    barcodeHeightMm,
    Math.max(4, labelHeightMm - (compact ? 6 : 8))
  )

  const safeTitle = String(title || cfg.title || "In mã vạch")
    .replaceAll("<", "")
    .replaceAll(">", "")
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${safeTitle}</title>
  <style>
    body{ font-family: Arial, "Helvetica Neue", Helvetica, sans-serif; margin: 0; color:#111827; }
    .wrap{ padding: 0; }
    .top{ display:flex; justify-content: space-between; gap: 10px; align-items: baseline; margin-bottom: 8mm; }
    .h1{ font-weight: 700; font-size: 16px; }
    .muted{ color:#6b7280; font-size: 12px; }
    .grid{ display:block; }
    .label-row{ box-sizing:border-box; width:${pageWidthMm}mm; height:${labelHeightMm}mm; display:grid; grid-template-columns:repeat(${labelColumns}, ${labelWidthMm}mm); gap:${labelGapMm}mm; overflow:hidden; break-after:page; page-break-after:always; }
    .label-row:last-child{ break-after:auto; page-break-after:auto; }
    .lb{ box-sizing: border-box; border:none; border-radius:0; padding:${labelPaddingMm}mm; width:${labelWidthMm}mm; height:${labelHeightMm}mm; display:grid; grid-template-rows:minmax(0, auto) auto minmax(0, 1fr); overflow:hidden; }
    .lb-empty{ visibility:hidden; }
    .name{ min-height:${compact ? 2.2 : 3.5}mm; font-size:${nameFontPx}px; font-weight:700; line-height:${textLineHeight}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .price{ margin-top:${compact ? 0.2 : 1}mm; font-size:${priceFontPx}px; line-height:1; color:#111827; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .code{ font-size: 11px; color:#6b7280; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; overflow:hidden; text-overflow: ellipsis; white-space: nowrap; }
    .img{ min-height:0; margin-top:${compact ? 0.25 : 1}mm; display:flex; justify-content:center; align-items:flex-end; overflow:hidden; }
    img{ display:block; width:100%; height:${effectiveBarcodeHeightMm}mm; object-fit:contain; }
    @page{ size: ${pageWidthMm}mm ${labelHeightMm}mm; margin: 0; }
    @media print{
      .top{ display:none; }
      .wrap{ padding:0; }
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
      ${labelRows
        .map((row) => {
          const cells = Array.from({ length: labelColumns }).map((_, cellIndex) => {
            const lb = row[cellIndex]
            if (!lb) return `<div class="lb lb-empty"></div>`
          const code = String(lb.code || "")
          const bcid = barcodeBcidForValue(code)
          const img = code
            ? `https://bwipjs-api.metafloor.com/?bcid=${bcid}&text=${encodeURIComponent(code)}&scale=${barcodeScale}&height=${effectiveBarcodeHeightMm}&includetext=true`
            : ""
          const name = String(lb.name || "")
          const price = lb.price != null ? formatMoneyVN(lb.price) : ""
          return `
            <div class="lb">
              <div class="name">${name.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</div>
              <div class="price">Giá: ${price ? `${price}đ` : ""}</div>
              <div class="img">${img ? `<img alt="${code}" src="${img}"/>` : `<div class="code">${code}</div>`}</div>
            </div>
          `
          })
          return `<div class="label-row">${cells.join("")}</div>`
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
