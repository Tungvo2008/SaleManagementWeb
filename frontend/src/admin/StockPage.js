import { useEffect, useMemo, useRef, useState } from "react"
import { get, patch, post } from "../api"
import Modal from "./Modal"
import DataGrid from "./DataGrid"
import ExcelToolsModal from "./ExcelToolsModal"
import FieldLabel from "../ui/FieldLabel"
import "./stock.css"

function fmtQty(v) {
  const n = typeof v === "number" ? v : Number(v || 0)
  if (!Number.isFinite(n)) return v == null ? "" : String(v)
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(n)
}

function fmtMoney(v) {
  const n = typeof v === "number" ? v : Number(v || 0)
  if (!Number.isFinite(n)) return v == null ? "" : String(v)
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(n)
}

export default function StockPage() {
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const [rows, setRows] = useState([])
  const [q, setQ] = useState("")
  const [showExcel, setShowExcel] = useState(false)
  const snapRef = useRef(null)

  const [locations, setLocations] = useState([])
  const [showMove, setShowMove] = useState(false)
  const [showAdjust, setShowAdjust] = useState(false)
  const [showEditStockUnit, setShowEditStockUnit] = useState(false)

  const variantsById = useMemo(() => {
    const m = new Map()
    for (const r of rows) m.set(String(r.variant_id), r)
    return m
  }, [rows])

  async function loadStock() {
    setLoading(true)
    setErr(null)
    try {
      const [r, locs] = await Promise.all([get("/api/v1/stock/"), get("/api/v1/locations/")])
      setRows(Array.isArray(r) ? r : [])
      setLocations(Array.isArray(locs) ? locs : [])
    } catch (e) {
      setErr(e?.message || "Không tải được tồn kho")
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStock().catch(() => {})
    return () => {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = useMemo(() => {
    const qq = (q || "").trim().toLowerCase()
    if (!qq) return rows
    return rows.filter((r) => {
      const hay = [
        r.variant_id,
        r.parent_name,
        r.name,
        r.sku,
        r.uom,
      ]
        .filter((v) => v !== null && v !== undefined)
        .map((v) => String(v).toLowerCase())
        .join(" · ")
      return hay.includes(qq) || hay.includes(qq.replace(/\s+/g, ""))
    })
  }, [rows, q])

  return (
    <div className="stk">
      <div className="stkTop">
        <div className="stkHint">
          {loading ? "Đang tải..." : err ? `Lỗi: ${err}` : `${filtered.length}/${rows.length} biến thể · Bấm tiêu đề cột để sắp xếp`}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <div className="stkSearch">
            <input
              className="admInput"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm theo tên / SKU / ID / nhóm..."
            />
            {q.trim() ? (
              <button className="stkActionBtn" disabled={busy || loading} onClick={() => setQ("")}>
                Xoá
              </button>
            ) : null}
          </div>
          <button className="stkActionBtn" disabled={busy || loading} onClick={() => loadStock()}>
            Tải lại
          </button>
          <button className="stkActionBtn" disabled={busy || loading} onClick={() => setShowExcel(true)}>
            Excel
          </button>
          <button className="stkActionBtn" disabled={busy || loading} onClick={() => setShowAdjust(true)}>
            ± Điều chỉnh
          </button>
          <button className="stkActionBtn" disabled={busy || loading} onClick={() => setShowMove(true)}>
            Chuyển kệ cuộn
          </button>
          <button className="stkActionBtn" disabled={busy || loading} onClick={() => setShowEditStockUnit(true)}>
            Sửa cuộn
          </button>
        </div>
      </div>

      <DataGrid
        id="inventory.stock"
        onSnapshot={(s) => {
          snapRef.current = s
        }}
        columns={[
          { key: "variant_id", title: "ID", width: 90, minWidth: 70, render: (r) => <span className="stkMono">{r.variant_id}</span> },
          { key: "parent_name", title: "Nhóm", minWidth: 180, flex: 1.2, render: (r) => <span className="stkName">{r.parent_name || ""}</span> },
          { key: "name", title: "Tên", fill: true, minWidth: 300, render: (r) => <span className="stkName">{r.name}</span> },
          { key: "sku", title: "SKU", width: 160, minWidth: 120, render: (r) => <span className="stkMono">{r.sku || ""}</span> },
          { key: "uom", title: "Đơn vị", width: 100, minWidth: 80, render: (r) => <span className="stkMono">{r.uom || ""}</span> },
          {
            key: "cost_price",
            title: "Giá vốn/đv",
            width: 120,
            minWidth: 100,
            align: "right",
            render: (r) => <span className="stkMono">{r.cost_price == null ? "" : fmtMoney(r.cost_price)}</span>,
          },
          { key: "stock", title: "Tồn", width: 110, minWidth: 90, align: "right", render: (r) => <span className="stkMono">{fmtQty(r.stock)}</span> },
          { key: "rolls_total", title: "Cuộn", width: 90, minWidth: 80, align: "right", render: (r) => <span className="stkMono">{r.rolls_total ?? 0}</span> },
          { key: "rolls_full", title: "Nguyên", width: 90, minWidth: 80, align: "right", render: (r) => <span className="stkMono">{r.rolls_full ?? 0}</span> },
          { key: "rolls_partial", title: "Cắt dở", width: 90, minWidth: 80, align: "right", render: (r) => <span className="stkMono">{r.rolls_partial ?? 0}</span> },
        ]}
        rows={filtered}
        rowKey={(r) => r.variant_id}
      />

      {showAdjust ? (
        <InventoryAdjustModal
          variantsById={variantsById}
          busy={busy}
          onClose={() => setShowAdjust(false)}
          onSubmit={async (payload) => {
            setBusy(true)
            try {
              await post("/api/v1/inventory/adjust", payload)
              setShowAdjust(false)
              await loadStock()
            } finally {
              setBusy(false)
            }
          }}
        />
      ) : null}

      {showMove ? (
        <TransferStockUnitModal
          locations={locations}
          busy={busy}
          onClose={() => setShowMove(false)}
          onTransfer={async ({ stock_unit_id, to_location_id, note }) => {
            setBusy(true)
            try {
              await post("/api/v1/inventory/transfer", { stock_unit_id, to_location_id, note })
              setShowMove(false)
              await loadStock()
            } finally {
              setBusy(false)
            }
          }}
        />
      ) : null}

      {showEditStockUnit ? (
        <EditStockUnitModal
          locations={locations}
          busy={busy}
          onClose={() => setShowEditStockUnit(false)}
          onSave={async ({ stock_unit_id, payload }) => {
            setBusy(true)
            try {
              await patch(`/api/v1/stockunits/${stock_unit_id}`, payload)
              setShowEditStockUnit(false)
              await loadStock()
            } finally {
              setBusy(false)
            }
          }}
        />
      ) : null}

      {showExcel ? (
        <ExcelToolsModal
          title="Excel · Tồn kho"
          resource="ton_kho"
          exportFilename="ton-kho.xlsx"
          getSnapshot={() => snapRef.current}
          showTemplate={false}
          showImport={false}
          onClose={() => setShowExcel(false)}
        />
      ) : null}
    </div>
  )
}

function InventoryAdjustModal({ variantsById, busy, onClose, onSubmit }) {
  const [variantId, setVariantId] = useState("")
  const [qtyDelta, setQtyDelta] = useState("")
  const [stockUnitId, setStockUnitId] = useState("")
  const [note, setNote] = useState("")
  const [err, setErr] = useState(null)

  const picked = variantId ? variantsById.get(String(variantId)) : null

  return (
    <Modal
      title="Điều chỉnh tồn (+/-)"
      onClose={onClose}
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
              const id = Number(variantId)
              const d = Number(qtyDelta)
              if (!Number.isFinite(id) || id <= 0) return setErr("Vui lòng nhập variant_id hợp lệ.")
              if (!Number.isFinite(d) || d === 0) return setErr("Delta phải khác 0 (ví dụ: -2 hoặc +5).")
              const suId = stockUnitId.trim() ? Number(stockUnitId) : null
              if (suId != null && (!Number.isFinite(suId) || suId <= 0)) return setErr("stock_unit_id không hợp lệ.")
              onSubmit({
                variant_id: id,
                stock_unit_id: suId,
                qty: String(d),
                note: note.trim() ? note.trim() : null,
              }).catch((e) => setErr(e?.message || "Không điều chỉnh được."))
            }}
          >
            Lưu
          </button>
        </>
      }
    >
      {err ? <div className="admErr">{err}</div> : null}
      <div className="admField">
        <FieldLabel className="admLabel" required>
          Variant ID
        </FieldLabel>
        <input className="admInput admMono" value={variantId} onChange={(e) => setVariantId(e.target.value)} placeholder="Ví dụ: 12" />
        {picked ? (
          <div className="admLabel">
            Đang chọn: <b>{picked.name}</b> ({picked.uom || "—"})
          </div>
        ) : null}
      </div>
      <div className="admGrid2">
        <div className="admField">
          <FieldLabel className="admLabel" required>
            Delta (+/-)
          </FieldLabel>
          <input className="admInput" value={qtyDelta} onChange={(e) => setQtyDelta(e.target.value)} placeholder="Ví dụ: -2 hoặc 5" />
        </div>
        <div className="admField">
          <div className="admLabel">Stock Unit ID (tuỳ chọn, cho hàng cuộn)</div>
          <input className="admInput admMono" value={stockUnitId} onChange={(e) => setStockUnitId(e.target.value)} placeholder="Ví dụ: 3" />
        </div>
      </div>
      <div className="admField">
        <div className="admLabel">Ghi chú</div>
        <input className="admInput" value={note} onChange={(e) => setNote(e.target.value)} placeholder="..." />
      </div>
    </Modal>
  )
}

function TransferStockUnitModal({ locations, busy, onClose, onTransfer }) {
  const [stockUnitId, setStockUnitId] = useState("")
  const [toLocationId, setToLocationId] = useState("")
  const [note, setNote] = useState("")
  const [err, setErr] = useState(null)

  return (
    <Modal
      title="Chuyển kệ cuộn"
      onClose={onClose}
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
              const suId = Number(stockUnitId)
              const locId = Number(toLocationId)
              if (!Number.isFinite(suId) || suId <= 0) return setErr("stock_unit_id không hợp lệ.")
              if (!Number.isFinite(locId) || locId <= 0) return setErr("Vui lòng chọn kệ đích.")
              onTransfer({ stock_unit_id: suId, to_location_id: locId, note: note.trim() ? note.trim() : null }).catch((e) =>
                setErr(e?.message || "Không chuyển kệ được.")
              )
            }}
          >
            Chuyển
          </button>
        </>
      }
    >
      {err ? <div className="admErr">{err}</div> : null}
      <div className="admGrid2">
        <div className="admField">
          <FieldLabel className="admLabel" required>
            Stock Unit ID
          </FieldLabel>
          <input className="admInput admMono" value={stockUnitId} onChange={(e) => setStockUnitId(e.target.value)} placeholder="Ví dụ: 5" />
        </div>
        <div className="admField">
          <FieldLabel className="admLabel" required>
            Kệ đích
          </FieldLabel>
          <select className="admSelect" value={toLocationId} onChange={(e) => setToLocationId(e.target.value)}>
            <option value="">(Chọn kệ)</option>
            {locations.map((l) => (
              <option key={l.id} value={String(l.id)}>
                {l.code} · {l.name || ""}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="admField">
        <div className="admLabel">Ghi chú</div>
        <input className="admInput" value={note} onChange={(e) => setNote(e.target.value)} placeholder="..." />
      </div>
    </Modal>
  )
}

function EditStockUnitModal({ locations, busy, onClose, onSave }) {
  const [stockUnitId, setStockUnitId] = useState("")
  const [remainingQty, setRemainingQty] = useState("")
  const [locationId, setLocationId] = useState("")
  const [err, setErr] = useState(null)

  return (
    <Modal
      title="Sửa cuộn (cập nhật remaining_qty / location)"
      onClose={onClose}
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
              const suId = Number(stockUnitId)
              if (!Number.isFinite(suId) || suId <= 0) return setErr("stock_unit_id không hợp lệ.")
              const payload = {}
              if (remainingQty.trim()) {
                const rq = Number(remainingQty)
                if (!Number.isFinite(rq) || rq < 0) return setErr("remaining_qty phải >= 0.")
                payload.remaining_qty = String(rq)
              }
              if (locationId.trim()) {
                const locId = Number(locationId)
                if (!Number.isFinite(locId) || locId <= 0) return setErr("location_id không hợp lệ.")
                payload.location_id = locId
              }
              if (!Object.keys(payload).length) return setErr("Vui lòng nhập ít nhất 1 trường để cập nhật.")
              onSave({ stock_unit_id: suId, payload }).catch((e) => setErr(e?.message || "Không cập nhật được cuộn."))
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
            Stock Unit ID
          </FieldLabel>
          <input className="admInput admMono" value={stockUnitId} onChange={(e) => setStockUnitId(e.target.value)} placeholder="Ví dụ: 5" />
        </div>
        <div className="admField">
          <div className="admLabel">Remaining qty (m)</div>
          <input className="admInput" value={remainingQty} onChange={(e) => setRemainingQty(e.target.value)} placeholder="Ví dụ: 12.5" />
        </div>
      </div>
      <div className="admField">
        <div className="admLabel">Kệ (tuỳ chọn)</div>
        <select className="admSelect" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
          <option value="">(Không đổi)</option>
          {locations.map((l) => (
            <option key={l.id} value={String(l.id)}>
              {l.code} · {l.name || ""}
            </option>
          ))}
        </select>
      </div>
    </Modal>
  )
}
