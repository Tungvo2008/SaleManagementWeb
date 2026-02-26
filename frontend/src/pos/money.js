export function fmtVnd(n) {
  const x = typeof n === "string" ? Number(n) : Number(n ?? 0)
  if (!Number.isFinite(x)) return "-"
  return x.toLocaleString("vi-VN")
}

export function fmtQty(n) {
  if (n === null || n === undefined) return "-"
  if (typeof n === "number") return String(n)
  if (typeof n === "string") return n
  return String(n)
}

