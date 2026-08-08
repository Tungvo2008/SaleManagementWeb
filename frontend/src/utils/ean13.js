export const AUTO_EAN13_SENTINEL = "__AUTO_EAN13__"

export function normalizeBarcodeDigits(value) {
  return String(value || "").replace(/\D+/g, "")
}

export function isValidEan13(value) {
  const digits = normalizeBarcodeDigits(value)
  if (!/^\d{13}$/.test(digits)) return false
  return computeEan13CheckDigit(digits.slice(0, 12)) === digits.slice(12)
}

export function computeEan13CheckDigit(body12) {
  const digits = normalizeBarcodeDigits(body12)
  if (!/^\d{12}$/.test(digits)) throw new Error("EAN-13 body must have 12 digits")
  let sum = 0
  for (let i = 0; i < digits.length; i += 1) {
    const n = Number(digits[i])
    sum += i % 2 === 0 ? n : n * 3
  }
  return String((10 - (sum % 10)) % 10)
}

export function buildEan13(body12) {
  const digits = normalizeBarcodeDigits(body12)
  if (!/^\d{12}$/.test(digits)) throw new Error("EAN-13 body must have 12 digits")
  return `${digits}${computeEan13CheckDigit(digits)}`
}

export function barcodeBcidForValue(value) {
  return isValidEan13(value) ? "ean13" : "code128"
}
