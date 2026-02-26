export const BARCODE_TEMPLATE_KEY = "pos.barcodeTemplate.v1"

export const defaultBarcodeTemplate = {
  printMode: "sheet", // sheet | thermal
  paperSize: "a4", // a4 | a4_landscape
  pageMarginMm: 6,
  columns: 4,
  gapMm: 3,
  labelWidthMm: 50,
  labelHeightMm: 25,
  barcodeHeightMm: 10,
  barcodeScale: 2,
  showName: true,
  showSku: true,
  showPrice: true,
  showBarcodeText: true,
  title: "Tem mã vạch",
}

function asNum(v, fallback) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

export function normalizeBarcodeTemplate(input) {
  const raw = input || {}
  const paperSize = raw.paperSize === "a4_landscape" ? "a4_landscape" : "a4"
  return {
    ...defaultBarcodeTemplate,
    ...raw,
    printMode: raw.printMode === "thermal" ? "thermal" : "sheet",
    paperSize,
    pageMarginMm: clamp(asNum(raw.pageMarginMm, defaultBarcodeTemplate.pageMarginMm), 0, 20),
    columns: clamp(Math.floor(asNum(raw.columns, defaultBarcodeTemplate.columns)), 1, 12),
    gapMm: clamp(asNum(raw.gapMm, defaultBarcodeTemplate.gapMm), 0, 10),
    labelWidthMm: clamp(asNum(raw.labelWidthMm, defaultBarcodeTemplate.labelWidthMm), 10, 150),
    labelHeightMm: clamp(asNum(raw.labelHeightMm, defaultBarcodeTemplate.labelHeightMm), 10, 100),
    barcodeHeightMm: clamp(asNum(raw.barcodeHeightMm, defaultBarcodeTemplate.barcodeHeightMm), 4, 40),
    barcodeScale: clamp(Math.floor(asNum(raw.barcodeScale, defaultBarcodeTemplate.barcodeScale)), 1, 5),
    showName: Boolean(raw.showName ?? defaultBarcodeTemplate.showName),
    showSku: Boolean(raw.showSku ?? defaultBarcodeTemplate.showSku),
    showPrice: Boolean(raw.showPrice ?? defaultBarcodeTemplate.showPrice),
    showBarcodeText: Boolean(raw.showBarcodeText ?? defaultBarcodeTemplate.showBarcodeText),
    title: String(raw.title ?? defaultBarcodeTemplate.title),
  }
}

export function loadBarcodeTemplate() {
  try {
    const raw = localStorage.getItem(BARCODE_TEMPLATE_KEY)
    if (!raw) return defaultBarcodeTemplate
    return normalizeBarcodeTemplate(JSON.parse(raw))
  } catch {
    return defaultBarcodeTemplate
  }
}

export function saveBarcodeTemplate(next) {
  const normalized = normalizeBarcodeTemplate(next)
  localStorage.setItem(BARCODE_TEMPLATE_KEY, JSON.stringify(normalized))
  return normalized
}

export const barcodePresets = {
  label_25x50: {
    ...defaultBarcodeTemplate,
    columns: 4,
    labelWidthMm: 50,
    labelHeightMm: 25,
    gapMm: 3,
    pageMarginMm: 6,
    barcodeHeightMm: 10,
  },
  label_16x28: {
    ...defaultBarcodeTemplate,
    columns: 6,
    labelWidthMm: 28,
    labelHeightMm: 16,
    gapMm: 2,
    pageMarginMm: 5,
    barcodeHeightMm: 6,
    barcodeScale: 1,
    showName: false,
    showPrice: false,
  },
}
