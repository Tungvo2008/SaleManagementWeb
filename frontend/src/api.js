const API_BASE = process.env.REACT_APP_API_BASE || ""

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
    const msg =
      (data && typeof data === "object" && (data.detail || data.message)) ||
      (typeof data === "string" ? data : null) ||
      `HTTP ${res.status}`
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
