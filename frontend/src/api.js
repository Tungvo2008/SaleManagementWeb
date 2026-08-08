const API_BASE = process.env.REACT_APP_API_BASE || ""
let refreshPromise = null

function redirectToLogin() {
  if (typeof window === "undefined") return
  const hash = window.location.hash || ""
  if (hash.startsWith("#/login") || hash.startsWith("#/app/login")) return
  window.location.hash = "#/login"
}

async function parseBody(res) {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function validationIssueMessage(issue) {
  const field = Array.isArray(issue?.loc)
    ? issue.loc.filter((part) => part !== "body").join(".")
    : ""
  const type = String(issue?.type || "")
  const context = issue?.ctx || {}
  let message = String(issue?.msg || "Dữ liệu không hợp lệ")

  if (type === "string_too_short" && context.min_length != null) {
    message = `tối thiểu ${context.min_length} ký tự`
  } else if (type === "string_too_long" && context.max_length != null) {
    message = `tối đa ${context.max_length} ký tự`
  } else if (type === "missing") {
    message = "là bắt buộc"
  }

  return field ? `${field}: ${message}` : message
}

function apiErrorMessage(data, status) {
  if (data && typeof data === "object") {
    const detail = data.detail ?? data.message
    if (typeof detail === "string") return detail
    if (Array.isArray(detail)) return detail.map(validationIssueMessage).join(". ")
    if (detail && typeof detail === "object" && typeof detail.message === "string") {
      return detail.message
    }
    if (typeof data.message === "string") return data.message
  }
  if (typeof data === "string") return data
  return `HTTP ${status}`
}

async function refreshAuthOnce() {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: "POST",
      credentials: "include",
    })
      .then(async (res) => {
        const data = await parseBody(res)
        if (!res.ok) {
          const err = new Error(apiErrorMessage(data, res.status))
          err.status = res.status
          throw err
        }
        return data
      })
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

export async function api(path, { method = "GET", body, headers, _retried = false, ...rest } = {}) {
  const hasBody = body !== undefined
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData
  const init = {
    method,
    headers: {
      ...(headers || {}),
    },
    // We use HttpOnly cookies for auth. Keep them flowing in fetch by default.
    credentials: "include",
    ...rest,
  }

  // Only set JSON content-type when we actually send a body.
  // Setting it on GET triggers CORS preflight (OPTIONS) in browsers.
  if (hasBody && !isFormData && !init.headers["Content-Type"]) {
    init.headers["Content-Type"] = "application/json"
  }

  if (hasBody) {
    init.body = isFormData ? body : typeof body === "string" ? body : JSON.stringify(body)
  }

  const res = await fetch(`${API_BASE}${path}`, init)
  const data = await parseBody(res)

  if (!res.ok) {
    const isLoginCall = path.includes("/api/v1/auth/login")
    const isRefreshCall = path.includes("/api/v1/auth/refresh")

    // Access token hết hạn trong lúc vẫn đang dùng -> refresh im lặng rồi retry
    // đúng 1 lần, để không văng khỏi màn hình đang thao tác dở.
    if (res.status === 401 && !_retried && !isLoginCall && !isRefreshCall) {
      try {
        await refreshAuthOnce()
        return api(path, { method, body, headers, _retried: true, ...rest })
      } catch {
        // refresh fail -> xử lý như session hết hạn thật sự ở block bên dưới
      }
    }

    // Session hết hạn thật / refresh fail -> mới đẩy về login.
    // Không áp dụng cho endpoint login để vẫn hiện đúng lỗi "sai tài khoản/mật khẩu".
    if (res.status === 401 && !isLoginCall) {
      try {
        window.dispatchEvent(new CustomEvent("auth:unauthorized"))
      } catch {
        // ignore
      }
      redirectToLogin()
    }

    const msg = apiErrorMessage(data, res.status)
    const err = new Error(msg)
    err.status = res.status
    err.data = data
    throw err
  }

  return data
}

export const get = (path) => api(path)
export const post = (path, body) => api(path, { method: "POST", body })
export const patch = (path, body) => api(path, { method: "PATCH", body })
export const del = (path) => api(path, { method: "DELETE" })
