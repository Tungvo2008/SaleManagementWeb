import { useEffect, useState } from "react"
import { login } from "./auth"
import FieldLabel from "./ui/FieldLabel"
import "./login.css"

export default function LoginPage({ onLoggedIn }) {
  const [username, setUsername] = useState("admin")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Enter") {
        e.preventDefault()
        handleSubmit()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, password])

  async function handleSubmit() {
    if (loading) return
    setErr(null)
    if (!username.trim() || !password) {
      setErr("Vui lòng nhập tài khoản và mật khẩu.")
      return
    }
    setLoading(true)
    try {
      const user = await login({ username: username.trim(), password })
      onLoggedIn(user)
    } catch (e) {
      setErr(e?.message || "Đăng nhập thất bại.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="loginWrap">
      <div className="loginCard">
        <div className="loginTitle">Đăng nhập</div>
        <div className="loginSub">Vui lòng đăng nhập để sử dụng hệ thống.</div>

        <div className="loginField">
          <FieldLabel className="loginLabel" required>
            Tài khoản
          </FieldLabel>
          <input
            className="loginInput"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Ví dụ: admin"
            autoComplete="username"
          />
        </div>

        <div className="loginField">
          <FieldLabel className="loginLabel" required>
            Mật khẩu
          </FieldLabel>
          <input
            className="loginInput"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Nhập mật khẩu"
            autoComplete="current-password"
          />
        </div>

        {err ? <div className="loginErr">{err}</div> : null}

        <button className="loginBtn" onClick={handleSubmit} disabled={loading}>
          {loading ? "Đang đăng nhập..." : "Đăng nhập"}
        </button>

        <div className="loginHint">
          Tài khoản mẫu (dev): <span className="loginMono">admin</span> /{" "}
          <span className="loginMono">admin123</span>
        </div>
      </div>
    </div>
  )
}
