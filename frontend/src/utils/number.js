export function formatNumberVN(value, options = {}) {
  const {
    empty = "",
    minimumFractionDigits = 0,
    maximumFractionDigits = 2,
  } = options

  if (value === null || value === undefined || value === "") return empty

  const n = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(n)) return String(value)

  return new Intl.NumberFormat("vi-VN", {
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(n)
}

export function formatMoneyVN(value, options = {}) {
  return formatNumberVN(value, {
    empty: "",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
    ...options,
  })
}
