import { useEffect, useMemo, useState } from "react"
import { del, get, patch, post } from "../api"
import Modal from "./Modal"
import DataGrid from "./DataGrid"
import "./partners.css"

function fmtMoney(v) {
  const n = typeof v === "number" ? v : Number(v || 0)
  if (!Number.isFinite(n)) return v == null ? "" : String(v)
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(n)
}

export default function SuppliersPage() {
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const [rows, setRows] = useState([])
  const [q, setQ] = useState("")

  const [showCreate, setShowCreate] = useState(false)
  const [editRow, setEditRow] = useState(null)
  const [deleteRow, setDeleteRow] = useState(null)

  const titleHint = useMemo(() => {
    if (loading) return "Đang tải..."
    if (err) return `Lỗi: ${err}`
    return `${rows.length} nhà cung cấp`
  }, [loading, err, rows])

  async function loadAll(nextQ = q) {
    setLoading(true)
    setErr(null)
    try {
      const url = `/api/v1/suppliers/?q=${encodeURIComponent((nextQ || "").trim())}&limit=500`
      const list = await get(url)
      setRows(Array.isArray(list) ? list : [])
    } catch (e) {
      setErr(e?.message || "Không tải được danh sách nhà cung cấp")
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
              onKeyDown={(e) => {
                if (e.key !== "Enter") return
                loadAll(q).catch(() => {})
              }}
              placeholder="Tìm theo tên / SĐT / mã..."
            />
            <button className="prtActionBtn" disabled={busy || loading} onClick={() => loadAll(q)}>
              Tìm
            </button>
          </div>
          <button className="prtActionBtn" disabled={busy || loading} onClick={() => loadAll(q)}>
            Tải lại
          </button>
          <button
            className="prtActionBtn"
            disabled={busy || loading}
            onClick={() => {
              const qq = encodeURIComponent((q || "").trim())
              window.location.href = `/api/v1/excel/export/suppliers?q=${qq}`
            }}
          >
            Xuất Excel
          </button>
          <button className="prtActionBtn prtActionPrimary" disabled={busy || loading} onClick={() => setShowCreate(true)}>
            + Thêm nhà cung cấp
          </button>
        </div>
      </div>

      <DataGrid
        id="partners.suppliers"
        columns={[
          { key: "id", title: "ID", width: 90, minWidth: 70, render: (v) => <span className="prtMono">{v.id}</span> },
          { key: "code", title: "Mã", width: 130, minWidth: 110, render: (v) => <span className="prtMono">{v.code || ""}</span> },
          { key: "name", title: "Tên", fill: true, minWidth: 260, render: (v) => <span className="prtName">{v.name}</span> },
          { key: "phone", title: "SĐT", width: 140, minWidth: 120, render: (v) => <span className="prtMono">{v.phone || ""}</span> },
          { key: "contact", title: "Liên hệ", width: 160, minWidth: 130, render: (v) => <span className="prtMono">{v.contact_name || ""}</span> },
          { key: "debt", title: "Công nợ", width: 120, minWidth: 100, align: "right", render: (v) => <span className="prtMono">{fmtMoney(v.debt)}</span> },
          {
            key: "active",
            title: "Active",
            width: 90,
            minWidth: 80,
            getValue: (v) => (v.is_active ? 1 : 0),
            render: (v) => <span className="prtMono">{v.is_active ? "có" : ""}</span>,
          },
          {
            key: "actions",
            title: "Thao tác",
            width: 180,
            minWidth: 160,
            render: (v) => (
              <span style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button className="admBtn" disabled={busy} onClick={() => setEditRow(v)}>
                  Sửa
                </button>
                <button className="admBtn admBtnDanger" disabled={busy} onClick={() => setDeleteRow(v)}>
                  Xoá
                </button>
              </span>
            ),
          },
        ]}
        rows={rows}
        rowKey={(v) => v.id}
      />

      {showCreate ? (
        <SupplierModal
          title="Thêm nhà cung cấp"
          busy={busy}
          initial={{}}
          onClose={() => setShowCreate(false)}
          onSave={async (payload) => {
            setBusy(true)
            try {
              await post("/api/v1/suppliers/", payload)
              setShowCreate(false)
              await loadAll(q)
            } finally {
              setBusy(false)
            }
          }}
        />
      ) : null}

      {editRow ? (
        <SupplierModal
          title={`Sửa nhà cung cấp #${editRow.id}`}
          busy={busy}
          initial={editRow}
          onClose={() => setEditRow(null)}
          onSave={async (payload) => {
            setBusy(true)
            try {
              await patch(`/api/v1/suppliers/${editRow.id}`, payload)
              setEditRow(null)
              await loadAll(q)
            } finally {
              setBusy(false)
            }
          }}
        />
      ) : null}

      {deleteRow ? (
        <ConfirmDeleteModal
          title="Xoá nhà cung cấp"
          body={
            <>
              Bạn chắc chắn muốn xoá nhà cung cấp <b>{deleteRow.name}</b> (ID{" "}
              <span className="admMono">{deleteRow.id}</span>)?
            </>
          }
          busy={busy}
          onClose={() => setDeleteRow(null)}
          onConfirm={async () => {
            setBusy(true)
            try {
              await del(`/api/v1/suppliers/${deleteRow.id}`)
              setDeleteRow(null)
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

function ConfirmDeleteModal({ title, body, busy, onClose, onConfirm }) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="admBtn" disabled={busy} onClick={onClose}>
            Huỷ
          </button>
          <button className="admBtn admBtnDanger" disabled={busy} onClick={onConfirm}>
            Xoá
          </button>
        </>
      }
    >
      <div className="admErr">{body}</div>
    </Modal>
  )
}

function SupplierModal({ title, busy, initial, onClose, onSave }) {
  const [code, setCode] = useState(initial.code || "")
  const [name, setName] = useState(initial.name || "")
  const [phone, setPhone] = useState(initial.phone || "")
  const [email, setEmail] = useState(initial.email || "")
  const [address, setAddress] = useState(initial.address || "")
  const [contactName, setContactName] = useState(initial.contact_name || "")
  const [taxCode, setTaxCode] = useState(initial.tax_code || "")
  const [bankName, setBankName] = useState(initial.bank_name || "")
  const [bankAccount, setBankAccount] = useState(initial.bank_account || "")
  const [bankBranch, setBankBranch] = useState(initial.bank_branch || "")
  const [debt, setDebt] = useState(initial.debt != null ? String(initial.debt) : "0")
  const [note, setNote] = useState(initial.note || "")
  const [isActive, setIsActive] = useState(initial.is_active != null ? !!initial.is_active : true)
  const [err, setErr] = useState(null)

  function buildPayload() {
    return {
      code: code.trim() ? code.trim() : null,
      name: name.trim(),
      phone: phone.trim() ? phone.trim() : null,
      email: email.trim() ? email.trim() : null,
      address: address.trim() ? address.trim() : null,
      contact_name: contactName.trim() ? contactName.trim() : null,
      tax_code: taxCode.trim() ? taxCode.trim() : null,
      bank_name: bankName.trim() ? bankName.trim() : null,
      bank_account: bankAccount.trim() ? bankAccount.trim() : null,
      bank_branch: bankBranch.trim() ? bankBranch.trim() : null,
      debt: String(debt || 0),
      note: note.trim() ? note.trim() : null,
      is_active: isActive,
    }
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="admBtn" disabled={busy} onClick={onClose}>
            Huỷ
          </button>
          <button
            className="admBtn admBtnPrimary"
            disabled={busy}
            onClick={() => {
              setErr(null)
              if (!name.trim()) {
                setErr("Tên nhà cung cấp là bắt buộc.")
                return
              }
              const d = Number(debt || 0)
              if (!Number.isFinite(d) || d < 0) {
                setErr("Công nợ không hợp lệ.")
                return
              }
              onSave(buildPayload()).catch((e) => setErr(e?.message || "Không lưu được nhà cung cấp."))
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
          <div className="admLabel">Mã nhà cung cấp</div>
          <input className="admInput" value={code} onChange={(e) => setCode(e.target.value)} placeholder="NCC001" />
        </div>
        <div className="admField">
          <div className="admLabel">Tên nhà cung cấp *</div>
          <input className="admInput" value={name} onChange={(e) => setName(e.target.value)} placeholder="Công ty ABC" />
        </div>
      </div>

      <div className="admGrid2">
        <div className="admField">
          <div className="admLabel">Số điện thoại</div>
          <input className="admInput" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="090..." />
        </div>
        <div className="admField">
          <div className="admLabel">Email</div>
          <input className="admInput" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="a@b.com" />
        </div>
      </div>

      <div className="admGrid2">
        <div className="admField">
          <div className="admLabel">Người liên hệ</div>
          <input className="admInput" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="..." />
        </div>
        <div className="admField">
          <div className="admLabel">Mã số thuế</div>
          <input className="admInput" value={taxCode} onChange={(e) => setTaxCode(e.target.value)} placeholder="..." />
        </div>
      </div>

      <div className="admField">
        <div className="admLabel">Địa chỉ</div>
        <textarea className="admTextarea" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="..." />
      </div>

      <div className="admGrid2">
        <div className="admField">
          <div className="admLabel">Ngân hàng</div>
          <input className="admInput" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="..." />
        </div>
        <div className="admField">
          <div className="admLabel">Số tài khoản</div>
          <input className="admInput" value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} placeholder="..." />
        </div>
      </div>

      <div className="admGrid2">
        <div className="admField">
          <div className="admLabel">Chi nhánh</div>
          <input className="admInput" value={bankBranch} onChange={(e) => setBankBranch(e.target.value)} placeholder="..." />
        </div>
        <div className="admField">
          <div className="admLabel">Công nợ</div>
          <input className="admInput" value={debt} onChange={(e) => setDebt(e.target.value)} />
        </div>
      </div>

      <div className="admGrid2">
        <div className="admField">
          <div className="admLabel">Trạng thái</div>
          <select className="admSelect" value={isActive ? "1" : "0"} onChange={(e) => setIsActive(e.target.value === "1")}>
            <option value="1">Đang hoạt động</option>
            <option value="0">Ngưng hoạt động</option>
          </select>
        </div>
        <div className="admField">
          <div className="admLabel">Ghi chú</div>
          <input className="admInput" value={note} onChange={(e) => setNote(e.target.value)} placeholder="..." />
        </div>
      </div>
    </Modal>
  )
}
