export const RECEIPT_TEMPLATE_KEY = "pos.receiptTemplate.v1"

export const defaultReceiptTemplate = {
  storeName: "Cua Hang",
  storePhone: "",
  storeAddress: "",
  headerNote: "",
  footerText: "Cam on quy khach.",
  showSku: true,
  showBarcode: true,
  showPricingMode: true,
  showThankYou: true,
  printLayout: "thermal", // "thermal" | "a4"
  paperSize: "80", // "58" | "80"
}

export function normalizeReceiptTemplate(input) {
  const raw = input || {}
  return {
    ...defaultReceiptTemplate,
    ...raw,
    storeName: String(raw.storeName ?? defaultReceiptTemplate.storeName),
    storePhone: String(raw.storePhone ?? defaultReceiptTemplate.storePhone),
    storeAddress: String(raw.storeAddress ?? defaultReceiptTemplate.storeAddress),
    headerNote: String(raw.headerNote ?? defaultReceiptTemplate.headerNote),
    footerText: String(raw.footerText ?? defaultReceiptTemplate.footerText),
    showSku: Boolean(raw.showSku ?? defaultReceiptTemplate.showSku),
    showBarcode: Boolean(raw.showBarcode ?? defaultReceiptTemplate.showBarcode),
    showPricingMode: Boolean(raw.showPricingMode ?? defaultReceiptTemplate.showPricingMode),
    showThankYou: Boolean(raw.showThankYou ?? defaultReceiptTemplate.showThankYou),
    printLayout: raw.printLayout === "a4" ? "a4" : "thermal",
    paperSize: raw.paperSize === "58" ? "58" : "80",
  }
}

export function loadReceiptTemplate() {
  try {
    const raw = localStorage.getItem(RECEIPT_TEMPLATE_KEY)
    if (!raw) return defaultReceiptTemplate
    return normalizeReceiptTemplate(JSON.parse(raw))
  } catch {
    return defaultReceiptTemplate
  }
}

export function saveReceiptTemplate(next) {
  const normalized = normalizeReceiptTemplate(next)
  localStorage.setItem(RECEIPT_TEMPLATE_KEY, JSON.stringify(normalized))
  return normalized
}
