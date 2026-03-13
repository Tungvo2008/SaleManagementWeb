import { useEffect, useMemo, useState } from "react"
import { get, patch, post } from "../api"
import DataGrid from "./DataGrid"
import Modal from "./Modal"
import { fmtDateTimeVN } from "../utils/datetime"
import FieldLabel from "../ui/FieldLabel"
import "./partners.css"

export default function EmployeesPage() {
  const [rows, setRows] = useState([])
  const [q, setQ] = useState("")
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [editRow, setEditRow] = useState(null)

  const titleHint = useMemo(() => {
    if (loading) return "Đang tải..."
    if (err) return `Lỗi: ${err}`
    return `${rows.length} nhân viên`
  }, [loading, err, rows])

  async function loadAll(nextQ = q) {
    setLoading(true)
    setErr(null)
    try {
      const list = await get(`/api/v1/employees/?q=${encodeURIComponent((nextQ || "").trim())}&limit=500`)
      setRows(Array.isArray(list) ? list : [])
    } catch (e) {
      setErr(e?.message || "Không tải được danh sách nhân viên")
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll("").catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="prt">
      <div className="prtTop">
        <div className="prtHint">{titleHint}</div>
        <div className="prtActions">
          <div className="prtSearch">
            <input
              className="admInput"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadAll(q).catch(() => {})}
              placeholder="Tìm theo username..."
            />
            <button className="prtActionBtn" disabled={busy || loading} onClick={() => loadAll(q)}>
              Tìm
            </button>
          </div>
          <button className="prtActionBtn" disabled={busy || loading} onClick={() => loadAll(q)}>
            Tải lại
          </button>
          <button className="prtActionBtn prtActionPrimary" disabled={busy || loading} onClick={() => setCreateOpen(true)}>
            + Thêm nhân viên
          </button>
        </div>
      </div>

      <DataGrid
        id="employees"
        columns={[
          { key: "id", title: "ID", width: 80, minWidth: 70, render: (v) => <span className="prtMono">{v.id}</span> },
          { key: "username", title: "Tài khoản", fill: true, minWidth: 220, render: (v) => <span className="prtName">{v.username}</span> },
          { key: "role", title: "Vai trò", width: 130, minWidth: 110, render: (v) => <span className="prtMono">{v.role}</span> },
          {
            key: "is_active",
            title: "Trạng thái",
            width: 110,
            minWidth: 90,
            getValue: (v) => (v.is_active ? 1 : 0),
            render: (v) => <span className="prtMono">{v.is_active ? "active" : "khóa"}</span>,
          },
          {
            key: "created_at",
            title: "Tạo lúc",
            width: 190,
            minWidth: 150,
            render: (v) => <span className="prtMono">{fmtDateTimeVN(v.created_at, "")}</span>,
          },
          {
            key: "actions",
            title: "Thao tác",
            width: 140,
            minWidth: 120,
            render: (v) => (
              <span style={{ display: "flex", justifyContent: "flex-end" }}>
                <button className="admBtn" disabled={busy} onClick={() => setEditRow(v)}>
                  Sửa
                </button>
              </span>
            ),
          },
        ]}
        rows={rows}
        rowKey={(v) => v.id}
      />

      {createOpen ? (
        <EmployeeModal
          title="Thêm nhân viên"
          busy={busy}
          initial={{ role: "cashier", is_active: true }}
          onClose={() => setCreateOpen(false)}
          onSave={async (payload) => {
            setBusy(true)
            try {
              await post("/api/v1/employees/", payload)
              setCreateOpen(false)
              await loadAll(q)
            } finally {
              setBusy(false)
            }
          }}
        />
      ) : null}

      {editRow ? (
        <EmployeeModal
          title={`Sửa nhân viên #${editRow.id}`}
          busy={busy}
          initial={editRow}
          isEdit
          onClose={() => setEditRow(null)}
          onSave={async (payload) => {
            setBusy(true)
            try {
              await patch(`/api/v1/employees/${editRow.id}`, payload)
              setEditRow(null)
              await loadAll(q)
            } finally {
              setBusy(false)
            }
          }}
        />
      ) : null}
    </div>
  )
}

function EmployeeModal({ title, busy, initial, isEdit = false, onClose, onSave }) {
  const [username, setUsername] = useState(initial.username || "")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState(initial.role || "cashier")
  const [isActive, setIsActive] = useState(initial.is_active != null ? !!initial.is_active : true)
  const [err, setErr] = useState(null)

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="admBtn" disabled={busy} onClick={onClose}>
            Hủy
          </button>
          <button
            className="admBtn admBtnPrimary"
            disabled={busy}
            onClick={() => {
              setErr(null)
              if (!username.trim()) return setErr("Username là bắt buộc.")
              if (!isEdit && password.length < 6) return setErr("Mật khẩu tối thiểu 6 ký tự.")
              const payload = {
                username: username.trim(),
                role,
                is_active: isActive,
              }
              if (password.trim()) payload.password = password
              onSave(payload).catch((e) => setErr(e?.message || "Không lưu được nhân viên"))
            }}
          >
            Lưu
          </button>
        </>
      }
    >
      {err ? <div className="admErr">{err}</div> : null}
      <div className="admGrid2">
        <div className="admField">
          <FieldLabel className="admLabel" required>
            Username
          </FieldLabel>
          <input className="admInput" value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div className="admField">
          <div className="admLabel">Vai trò</div>
          <select className="admSelect" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="cashier">cashier</option>
            <option value="manager">manager</option>
            <option value="admin">admin</option>
          </select>
        </div>
        <div className="admField">
          <FieldLabel className="admLabel" required={!isEdit}>
            {isEdit ? "Mật khẩu mới (tuỳ chọn)" : "Mật khẩu"}
          </FieldLabel>
          <input className="admInput" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <label className="admCheck" style={{ marginTop: 28 }}>
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Active
        </label>
      </div>
    </Modal>
  )
}
