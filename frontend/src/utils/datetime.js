export const VN_TIME_ZONE = "Asia/Ho_Chi_Minh"

const VN_DATE_FORMAT = new Intl.DateTimeFormat("vi-VN", {
  timeZone: VN_TIME_ZONE,
  dateStyle: "short",
  timeStyle: "medium",
})

function isString(v) {
  return typeof v === "string" || v instanceof String
}

function normalizeDateInput(value) {
  if (!isString(value)) return value
  let raw = String(value).trim()
  if (!raw) return raw

  if (/^\d{4}-\d{2}-\d{2} \d/.test(raw)) {
    raw = raw.replace(" ", "T")
  }

  const hasTimezone = /(Z|[+-]\d{2}:\d{2})$/i.test(raw)
  const looksLikeNaiveIso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?$/.test(raw)
  if (looksLikeNaiveIso && !hasTimezone) {
    return `${raw}Z`
  }
  return raw
}

export function parseApiDate(value) {
  if (value == null || value === "") return null
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }

  const normalized = normalizeDateInput(value)
  const d = new Date(normalized)
  if (Number.isNaN(d.getTime())) return null
  return d
}

export function fmtDateTimeVN(value, fallback = "") {
  const d = parseApiDate(value)
  if (!d) return fallback
  return VN_DATE_FORMAT.format(d)
}

export function ymdTodayVN() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: VN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

export function ymdMonthStartVN() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: VN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  })
    .formatToParts(new Date())
    .reduce((acc, p) => {
      acc[p.type] = p.value
      return acc
    }, {})
  return `${parts.year}-${parts.month}-01`
}
