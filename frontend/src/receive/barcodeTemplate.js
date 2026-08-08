export const BARCODE_TEMPLATE_KEY = "pos.barcodeTemplate.v1"

export const defaultBarcodeTemplate = {
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
  return {
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
    labelWidthMm: 50,
    labelHeightMm: 25,
    barcodeHeightMm: 10,
  },
  label_16x28: {
    ...defaultBarcodeTemplate,
    labelWidthMm: 28,
    labelHeightMm: 16,
    barcodeHeightMm: 6,
    barcodeScale: 1,
    showName: false,
    showPrice: false,
  },
}
