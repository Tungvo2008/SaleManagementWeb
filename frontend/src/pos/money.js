import { formatMoneyVN } from "../utils/number"

export function fmtVnd(n) {
  const out = formatMoneyVN(n, { empty: "-" })
  return out || "-"
}

export function fmtQty(n) {
  if (n === null || n === undefined) return "-"
  if (typeof n === "number") return String(n)
  if (typeof n === "string") return n
  return String(n)
}
