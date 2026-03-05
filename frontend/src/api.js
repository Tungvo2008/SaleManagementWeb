const API_BASE = process.env.REACT_APP_API_BASE || ""

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

export async function api(path, { method = "GET", body, headers, ...rest } = {}) {
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
    // Token hết hạn / không hợp lệ -> đẩy thẳng về login.
    // Không áp dụng cho endpoint login để vẫn hiện đúng lỗi "sai tài khoản/mật khẩu".
    const isLoginCall = path.includes("/api/v1/auth/login")
    if (res.status === 401 && !isLoginCall) {
      try {
        window.dispatchEvent(new CustomEvent("auth:unauthorized"))
      } catch {
        // ignore
      }
      redirectToLogin()
    }

    let msg = null
    if (data && typeof data === "object") {
      const d = data.detail ?? data.message
      if (typeof d === "string") msg = d
      else if (d && typeof d === "object" && typeof d.message === "string") msg = d.message
      else if (typeof data.message === "string") msg = data.message
    }
    if (!msg && typeof data === "string") msg = data
    if (!msg) msg = `HTTP ${res.status}`
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
