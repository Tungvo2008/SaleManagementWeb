import { useEffect, useMemo, useRef, useState } from "react"
import { del, get, patch, post } from "../api"
import Modal from "./Modal"
import DataGrid from "./DataGrid"
import ExcelToolsModal from "./ExcelToolsModal"
import FieldLabel from "../ui/FieldLabel"
import { formatMoneyVN } from "../utils/number"
import "./partners.css"

function fmtMoney(v) {
  return formatMoneyVN(v)
}

export default function CustomersPage() {
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const [rows, setRows] = useState([])
  const [q, setQ] = useState("")

  const [showCreate, setShowCreate] = useState(false)
  const [editRow, setEditRow] = useState(null)
  const [deleteRow, setDeleteRow] = useState(null)
  const [showExcel, setShowExcel] = useState(false)
  const snapRef = useRef(null)

  const titleHint = useMemo(() => {
    if (loading) return "Đang tải..."
    if (err) return `Lỗi: ${err}`
    return `${rows.length} khách hàng`
  }, [loading, err, rows])

  async function loadAll(nextQ = q) {
    setLoading(true)
    setErr(null)
    try {
      const url = `/api/v1/customers/?q=${encodeURIComponent((nextQ || "").trim())}&limit=500`
      const list = await get(url)
      setRows(Array.isArray(list) ? list : [])
    } catch (e) {
      setErr(e?.message || "Không tải được danh sách khách hàng")
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
              setShowExcel(true)
            }}
          >
            Excel
          </button>
          <button className="prtActionBtn prtActionPrimary" disabled={busy || loading} onClick={() => setShowCreate(true)}>
            + Thêm khách hàng
          </button>
        </div>
      </div>

      <DataGrid
        id="partners.customers"
        onSnapshot={(s) => {
          snapRef.current = s
        }}
        columns={[
          { key: "id", title: "ID", width: 90, minWidth: 70, render: (v) => <span className="prtMono">{v.id}</span> },
          { key: "code", title: "Mã", width: 130, minWidth: 110, render: (v) => <span className="prtMono">{v.code || ""}</span> },
          { key: "name", title: "Tên", fill: true, minWidth: 240, render: (v) => <span className="prtName">{v.name}</span> },
          { key: "phone", title: "SĐT", width: 140, minWidth: 120, render: (v) => <span className="prtMono">{v.phone || ""}</span> },
          { key: "email", title: "Email", width: 190, minWidth: 160, render: (v) => <span className="prtMono">{v.email || ""}</span> },
          { key: "points", title: "Điểm", width: 90, minWidth: 80, align: "right", render: (v) => <span className="prtMono">{v.points ?? 0}</span> },
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
        <CustomerModal
          title="Thêm khách hàng"
          busy={busy}
          initial={{}}
          onClose={() => setShowCreate(false)}
          onSave={async (payload) => {
            setBusy(true)
            try {
              await post("/api/v1/customers/", payload)
              setShowCreate(false)
              await loadAll(q)
            } finally {
              setBusy(false)
            }
          }}
        />
      ) : null}

      {editRow ? (
        <CustomerModal
          title={`Sửa khách hàng #${editRow.id}`}
          busy={busy}
          initial={editRow}
          onClose={() => setEditRow(null)}
          onSave={async (payload) => {
            setBusy(true)
            try {
              await patch(`/api/v1/customers/${editRow.id}`, payload)
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
          title="Xoá khách hàng"
          body={
            <>
              Bạn chắc chắn muốn xoá khách hàng <b>{deleteRow.name}</b> (ID{" "}
              <span className="admMono">{deleteRow.id}</span>)?
            </>
          }
          busy={busy}
          onClose={() => setDeleteRow(null)}
          onConfirm={async () => {
            setBusy(true)
            try {
              await del(`/api/v1/customers/${deleteRow.id}`)
              setDeleteRow(null)
              await loadAll(q)
            } finally {
              setBusy(false)
            }
          }}
        />
      ) : null}

      {showExcel ? (
        <ExcelToolsModal
          title="Excel · Khách hàng"
          resource="customers"
          templateUrl="/api/v1/excel/template/customers"
          importUrl="/api/v1/excel/import/customers"
          exportFilename="khach-hang.xlsx"
          getSnapshot={() => snapRef.current}
          onImported={() => loadAll(q).catch(() => {})}
          onClose={() => setShowExcel(false)}
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

function CustomerModal({ title, busy, initial, onClose, onSave }) {
  const [code, setCode] = useState(initial.code || "")
  const [name, setName] = useState(initial.name || "")
  const [phone, setPhone] = useState(initial.phone || "")
  const [email, setEmail] = useState(initial.email || "")
  const [address, setAddress] = useState(initial.address || "")
  const [taxCode, setTaxCode] = useState(initial.tax_code || "")
  const [gender, setGender] = useState(initial.gender || "unknown")
  const [birthday, setBirthday] = useState(initial.birthday || "")
  const [points, setPoints] = useState(initial.points != null ? String(initial.points) : "0")
  const [debt, setDebt] = useState(initial.debt != null ? String(initial.debt) : "0")
  const [note, setNote] = useState(initial.note || "")
  const [isActive, setIsActive] = useState(initial.is_active != null ? !!initial.is_active : true)
  const [err, setErr] = useState(null)

  function buildPayload() {
    const p = {
      code: code.trim() ? code.trim() : null,
      name: name.trim(),
      phone: phone.trim() ? phone.trim() : null,
      email: email.trim() ? email.trim() : null,
      address: address.trim() ? address.trim() : null,
      tax_code: taxCode.trim() ? taxCode.trim() : null,
      gender,
      birthday: birthday ? birthday : null,
      points: Number(points || 0),
      debt: String(debt || 0),
      note: note.trim() ? note.trim() : null,
      is_active: isActive,
    }
    return p
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
                setErr("Tên khách hàng là bắt buộc.")
                return
              }
              const pts = Number(points || 0)
              if (!Number.isFinite(pts) || pts < 0) {
                setErr("Điểm không hợp lệ.")
                return
              }
              const d = Number(debt || 0)
              if (!Number.isFinite(d) || d < 0) {
                setErr("Công nợ không hợp lệ.")
                return
              }
              onSave(buildPayload()).catch((e) => setErr(e?.message || "Không lưu được khách hàng."))
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
          <div className="admLabel">Mã khách hàng</div>
          <input className="admInput" value={code} onChange={(e) => setCode(e.target.value)} placeholder="KH001" />
        </div>
        <div className="admField">
          <FieldLabel className="admLabel" required>
            Tên khách hàng
          </FieldLabel>
          <input className="admInput" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nguyễn Văn A" />
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
          <div className="admLabel">Giới tính</div>
          <select className="admSelect" value={gender} onChange={(e) => setGender(e.target.value)}>
            <option value="unknown">Không rõ</option>
            <option value="male">Nam</option>
            <option value="female">Nữ</option>
            <option value="other">Khác</option>
          </select>
        </div>
        <div className="admField">
          <div className="admLabel">Ngày sinh</div>
          <input className="admInput" type="date" value={birthday || ""} onChange={(e) => setBirthday(e.target.value)} />
        </div>
      </div>

      <div className="admGrid2">
        <div className="admField">
          <div className="admLabel">Điểm</div>
          <input className="admInput" value={points} onChange={(e) => setPoints(e.target.value)} />
        </div>
        <div className="admField">
          <div className="admLabel">Công nợ</div>
          <input className="admInput" value={debt} onChange={(e) => setDebt(e.target.value)} />
        </div>
      </div>

      <div className="admField">
        <div className="admLabel">Địa chỉ</div>
        <textarea className="admTextarea" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="..." />
      </div>

      <div className="admGrid2">
        <div className="admField">
          <div className="admLabel">Mã số thuế</div>
          <input className="admInput" value={taxCode} onChange={(e) => setTaxCode(e.target.value)} placeholder="..." />
        </div>
        <div className="admField">
          <div className="admLabel">Trạng thái</div>
          <select className="admSelect" value={isActive ? "1" : "0"} onChange={(e) => setIsActive(e.target.value === "1")}>
            <option value="1">Đang hoạt động</option>
            <option value="0">Ngưng hoạt động</option>
          </select>
        </div>
      </div>

      <div className="admField">
        <div className="admLabel">Ghi chú</div>
        <textarea className="admTextarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="..." />
      </div>
    </Modal>
  )
}
