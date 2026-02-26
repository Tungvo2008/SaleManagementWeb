import { useEffect, useMemo, useState } from "react"
import { get } from "../api"
import DataGrid from "./DataGrid"
import "./receive-history.css"

function todayYMD() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

function fmtQty(v) {
  const n = typeof v === "number" ? v : Number(v || 0)
  if (!Number.isFinite(n)) return String(v ?? "")
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(n)
}

function fmtDateTimeVN(v) {
  if (!v) return ""
  const d = new Date(`${v}Z`)
  if (Number.isNaN(d.getTime())) return String(v)
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(d)
}

export default function ReceiveHistoryPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)

  const [date, setDate] = useState(todayYMD())
  const [q, setQ] = useState("")
  const [variantId, setVariantId] = useState("")
  const [supplierId, setSupplierId] = useState("")
  const [limit, setLimit] = useState("500")

  async function load() {
    setLoading(true)
    setErr(null)
    try {
      const params = new URLSearchParams()
      params.set("limit", String(Math.max(1, Number(limit) || 500)))
      if (date) params.set("date", date)
      if (q.trim()) params.set("q", q.trim())
      if (variantId.trim()) params.set("variant_id", variantId.trim())
      if (supplierId.trim()) params.set("supplier_id", supplierId.trim())
      const data = await get(`/api/v1/inventory/receives?${params.toString()}`)
      setRows(Array.isArray(data) ? data : [])
    } catch (e) {
      setErr(e?.message || "Không tải được lịch sử nhập")
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  const totalQty = useMemo(() => {
    let sum = 0
    for (const r of rows) sum += Number(r.qty || 0) || 0
    return sum
  }, [rows])

  return (
    <div className="rcvh">
      <div className="rcvhTop">
        <div className="rcvhHint">
          {loading ? "Đang tải..." : err ? `Lỗi: ${err}` : `${rows.length} lần nhập · Tổng SL: ${fmtQty(totalQty)}`}
        </div>
        <div className="rcvhActions">
          <button className="rcvhBtn" disabled={loading} onClick={() => load()}>
            Tải lại
          </button>
        </div>
      </div>

      <div className="rcvhFilters">
        <div className="rcvhField">
          <div className="rcvhLabel">Ngày (VN)</div>
          <input className="admInput" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="rcvhField">
          <div className="rcvhLabel">Tìm nhanh</div>
          <input className="admInput" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tên, SKU, NCC, ghi chú, mã cuộn..." />
        </div>
        <div className="rcvhField">
          <div className="rcvhLabel">Variant ID</div>
          <input className="admInput" value={variantId} onChange={(e) => setVariantId(e.target.value)} placeholder="VD: 12" />
        </div>
        <div className="rcvhField">
          <div className="rcvhLabel">Supplier ID</div>
          <input className="admInput" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} placeholder="VD: 3" />
        </div>
        <div className="rcvhField">
          <div className="rcvhLabel">Giới hạn</div>
          <input className="admInput" value={limit} onChange={(e) => setLimit(e.target.value)} />
        </div>
        <div className="rcvhField rcvhFieldBtn">
          <button className="rcvhBtn rcvhBtnPrimary" disabled={loading} onClick={() => load()}>
            Áp dụng lọc
          </button>
          <button
            className="rcvhBtn"
            disabled={loading}
            onClick={() => {
              setDate("")
              setQ("")
              setVariantId("")
              setSupplierId("")
              setLimit("500")
            }}
          >
            Xoá lọc
          </button>
        </div>
      </div>

      <DataGrid
        id="inventory.receiveHistory"
        rows={rows}
        rowKey={(r) => r.id}
        columns={[
          { key: "id", title: "ID", width: 90, minWidth: 70, render: (r) => <span className="rcvhMono">#{r.id}</span> },
          {
            key: "created_at",
            title: "Ngày giờ nhập (VN)",
            width: 190,
            minWidth: 160,
            getValue: (r) => r.created_at || null,
            render: (r) => <span className="rcvhMono">{fmtDateTimeVN(r.created_at)}</span>,
          },
          { key: "variant_id", title: "Variant ID", width: 110, minWidth: 90, render: (r) => <span className="rcvhMono">{r.variant_id}</span> },
          { key: "variant_name", title: "Tên sản phẩm", fill: true, minWidth: 250, render: (r) => <span>{r.variant_name}</span> },
          { key: "sku", title: "SKU", width: 160, minWidth: 120, render: (r) => <span className="rcvhMono">{r.sku || ""}</span> },
          { key: "qty", title: "Số lượng", width: 120, minWidth: 100, align: "right", render: (r) => <span className="rcvhMono">{fmtQty(r.qty)}</span> },
          { key: "uom", title: "Đơn vị", width: 100, minWidth: 80, render: (r) => <span className="rcvhMono">{r.uom || ""}</span> },
          { key: "supplier", title: "Nhà cung cấp", width: 220, minWidth: 150, render: (r) => <span>{r.supplier_name || (r.supplier_id != null ? `NCC #${r.supplier_id}` : "—")}</span> },
          { key: "stock_unit_id", title: "ID cuộn", width: 100, minWidth: 90, render: (r) => <span className="rcvhMono">{r.stock_unit_id ?? ""}</span> },
          { key: "note", title: "Ghi chú", width: 220, minWidth: 160, render: (r) => <span>{r.note || ""}</span> },
        ]}
      />
    </div>
  )
}
