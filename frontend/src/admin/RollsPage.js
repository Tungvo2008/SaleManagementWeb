import { useEffect, useMemo, useState } from "react"
import { get, patch, post } from "../api"
import DataGrid from "./DataGrid"
import Modal from "./Modal"
import "./rolls.css"

function asNum(v) {
  const n = typeof v === "number" ? v : Number(v || 0)
  return Number.isFinite(n) ? n : 0
}

function fmtQty(v) {
  const n = asNum(v)
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(n)
}

function fmtMoney(v, digits = 2) {
  const n = asNum(v)
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: digits }).format(n)
}

function getRollState(row) {
  const init = asNum(row.initial_qty)
  const rem = asNum(row.remaining_qty)
  if (row.is_depleted || rem <= 0) return "depleted"
  if (init > 0 && rem >= init) return "full"
  return "partial"
}

function getRollStateLabel(state) {
  if (state === "full") return "Nguyên cuộn"
  if (state === "partial") return "Cắt dở"
  return "Hết hàng"
}

export default function RollsPage() {
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)

  const [units, setUnits] = useState([])
  const [variants, setVariants] = useState([])
  const [locations, setLocations] = useState([])

  const [q, setQ] = useState("")
  const [variantId, setVariantId] = useState("")
  const [locationId, setLocationId] = useState("")
  const [status, setStatus] = useState("all")

  const [showReceive, setShowReceive] = useState(false)
  const [transferRow, setTransferRow] = useState(null)
  const [adjustRow, setAdjustRow] = useState(null)
  const [editRow, setEditRow] = useState(null)

  async function loadData() {
    setLoading(true)
    setErr(null)
    try {
      const [suRows, variantRows, locRows] = await Promise.all([
        get("/api/v1/stockunits/"),
        get("/api/v1/products/variants"),
        get("/api/v1/locations/"),
      ])
      setUnits(Array.isArray(suRows) ? suRows : [])
      setVariants(Array.isArray(variantRows) ? variantRows : [])
      setLocations(Array.isArray(locRows) ? locRows : [])
    } catch (e) {
      setErr(e?.message || "Không tải được danh sách cuộn")
      setUnits([])
      setVariants([])
      setLocations([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rollVariants = useMemo(
    () => (variants || []).filter((v) => !!v.track_stock_unit),
    [variants]
  )

  const variantById = useMemo(() => {
    const m = new Map()
    for (const v of variants || []) m.set(String(v.id), v)
    return m
  }, [variants])

  const locationById = useMemo(() => {
    const m = new Map()
    for (const l of locations || []) m.set(String(l.id), l)
    return m
  }, [locations])

  const rows = useMemo(() => {
    return (units || []).map((u) => {
      const v = variantById.get(String(u.variant_id))
      const l = u.location_id != null ? locationById.get(String(u.location_id)) : null
      const state = getRollState(u)
      return {
        ...u,
        variant_name: v?.name || `Variant #${u.variant_id}`,
        sku: v?.sku || "",
        location_name: l ? `${l.code || ""}${l.code && l.name ? " · " : ""}${l.name || ""}` : "(Chưa gán kệ)",
        state,
        state_label: getRollStateLabel(state),
      }
    })
  }, [units, variantById, locationById])

  const rowById = useMemo(() => {
    const m = new Map()
    for (const r of rows) m.set(String(r.id), r)
    return m
  }, [rows])

  const filtered = useMemo(() => {
    const qq = String(q || "").trim().toLowerCase()
    return rows.filter((r) => {
      if (variantId && String(r.variant_id) !== String(variantId)) return false
      if (locationId === "__none__" && r.location_id != null) return false
      if (locationId && locationId !== "__none__" && String(r.location_id || "") !== String(locationId)) return false

      if (status !== "all" && r.state !== status) return false

      if (!qq) return true
      const hay = [
        r.id,
        r.barcode,
        r.variant_id,
        r.variant_name,
        r.sku,
        r.location_name,
        r.initial_qty,
        r.remaining_qty,
        r.state_label,
      ]
        .filter((x) => x !== null && x !== undefined)
        .map((x) => String(x).toLowerCase())
        .join(" · ")
      return hay.includes(qq)
    })
  }, [rows, q, variantId, locationId, status])

  return (
    <div className="rol">
      <div className="rolTop">
        <div className="rolHint">
          {loading
            ? "Đang tải..."
            : err
            ? `Lỗi: ${err}`
            : `${filtered.length}/${rows.length} cuộn · Bấm tiêu đề cột để sắp xếp`}
        </div>
        <div className="rolActions">
          <div className="rolSearch">
            <input
              className="admInput"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm theo barcode / tên / SKU / kệ..."
            />
          </div>
          <button className="rolActionBtn" disabled={busy || loading} onClick={() => loadData()}>
            Tải lại
          </button>
          <button
            className="rolActionBtn"
            disabled={busy || loading}
            onClick={() => {
              const qs = []
              if (variantId) qs.push(`variant_id=${encodeURIComponent(variantId)}`)
              if (locationId && locationId !== "__none__") qs.push(`location_id=${encodeURIComponent(locationId)}`)
              const url = `/api/v1/excel/export/stock_units${qs.length ? "?" + qs.join("&") : ""}`
              window.location.href = url
            }}
          >
            Xuất Excel
          </button>
          <button className="rolActionBtn rolActionPrimary" disabled={busy || loading} onClick={() => setShowReceive(true)}>
            + Nhập cuộn
          </button>
        </div>
      </div>

      <div className="rolFilters">
        <div className="rolFilterItem">
          <div className="rolFilterLabel">Variant</div>
          <select className="rolSelect" value={variantId} onChange={(e) => setVariantId(e.target.value)}>
            <option value="">Tất cả variant</option>
            {rollVariants.map((v) => (
              <option key={v.id} value={String(v.id)}>
                #{v.id} · {v.name}
              </option>
            ))}
          </select>
        </div>
        <div className="rolFilterItem">
          <div className="rolFilterLabel">Kệ</div>
          <select className="rolSelect" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="">Tất cả kệ</option>
            <option value="__none__">(Chưa gán kệ)</option>
            {locations.map((l) => (
              <option key={l.id} value={String(l.id)}>
                {l.code || ""} {l.code && l.name ? "·" : ""} {l.name || ""}
              </option>
            ))}
          </select>
        </div>
        <div className="rolFilterItem">
          <div className="rolFilterLabel">Trạng thái</div>
          <select className="rolSelect" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">Tất cả</option>
            <option value="full">Nguyên cuộn</option>
            <option value="partial">Cắt dở</option>
            <option value="depleted">Hết hàng</option>
          </select>
        </div>
      </div>

      <DataGrid
        id="inventory.rolls"
        rows={filtered}
        rowKey={(r) => r.id}
        columns={[
          { key: "id", title: "ID cuộn", width: 90, minWidth: 70, render: (r) => <span className="rolMono">{r.id}</span> },
          { key: "barcode", title: "Barcode", width: 230, minWidth: 170, render: (r) => <span className="rolMono">{r.barcode || "—"}</span> },
          { key: "variant_id", title: "Variant ID", width: 110, minWidth: 90, render: (r) => <span className="rolMono">{r.variant_id}</span> },
          { key: "variant_name", title: "Tên variant", fill: true, minWidth: 260, render: (r) => <span className="rolName">{r.variant_name}</span> },
          { key: "sku", title: "SKU", width: 160, minWidth: 120, render: (r) => <span className="rolMono">{r.sku || "—"}</span> },
          { key: "location_name", title: "Kệ", width: 180, minWidth: 120, render: (r) => <span>{r.location_name}</span> },
          { key: "initial_qty", title: "Ban đầu", width: 100, minWidth: 80, align: "right", render: (r) => <span className="rolMono">{fmtQty(r.initial_qty)}</span> },
          { key: "remaining_qty", title: "Còn lại", width: 100, minWidth: 80, align: "right", render: (r) => <span className="rolMono">{fmtQty(r.remaining_qty)}</span> },
          { key: "cost_roll_price", title: "Giá nhập/cuộn", width: 130, minWidth: 100, align: "right", render: (r) => <span className="rolMono">{r.cost_roll_price == null ? "—" : fmtMoney(r.cost_roll_price)}</span> },
          { key: "cost_per_m", title: "Giá nhập/m", width: 110, minWidth: 90, align: "right", render: (r) => <span className="rolMono">{r.cost_per_m == null ? "—" : fmtMoney(r.cost_per_m, 4)}</span> },
          {
            key: "state",
            title: "Trạng thái",
            width: 120,
            minWidth: 100,
            render: (r) => <span className={`rolTag rolTag${r.state}`}>{r.state_label}</span>,
            getFilterValue: (r) => r.state_label,
          },
          {
            key: "actions",
            title: "Thao tác",
            width: 280,
            minWidth: 230,
            sortable: false,
            filterable: false,
            render: (r) => (
              <div className="rolCellActions">
                <button type="button" className="rolMiniBtn" onClick={() => setTransferRow(r)}>
                  Chuyển kệ
                </button>
                <button type="button" className="rolMiniBtn" onClick={() => setAdjustRow(r)}>
                  Điều chỉnh
                </button>
                <button type="button" className="rolMiniBtn" onClick={() => setEditRow(r)}>
                  Sửa
                </button>
              </div>
            ),
          },
        ]}
      />

      {showReceive ? (
        <ReceiveRollsModal
          busy={busy}
          variants={rollVariants}
          locations={locations}
          onClose={() => setShowReceive(false)}
          onSubmit={async (payload) => {
            setBusy(true)
            try {
              await post("/api/v1/stockunits/receive-rolls", payload)
              setShowReceive(false)
              await loadData()
            } finally {
              setBusy(false)
            }
          }}
        />
      ) : null}

      {transferRow ? (
        <TransferRollModal
          row={transferRow}
          busy={busy}
          locations={locations}
          onClose={() => setTransferRow(null)}
          onSubmit={async (payload) => {
            setBusy(true)
            try {
              await post("/api/v1/inventory/transfer", payload)
              setTransferRow(null)
              await loadData()
            } finally {
              setBusy(false)
            }
          }}
        />
      ) : null}

      {adjustRow ? (
        <AdjustRollModal
          row={adjustRow}
          busy={busy}
          rowById={rowById}
          onClose={() => setAdjustRow(null)}
          onSubmit={async (payload) => {
            setBusy(true)
            try {
              await post("/api/v1/inventory/adjust", payload)
              setAdjustRow(null)
              await loadData()
            } finally {
              setBusy(false)
            }
          }}
        />
      ) : null}

      {editRow ? (
        <EditRollModal
          row={editRow}
          busy={busy}
          locations={locations}
          onClose={() => setEditRow(null)}
          onSubmit={async ({ stock_unit_id, payload }) => {
            setBusy(true)
            try {
              await patch(`/api/v1/stockunits/${stock_unit_id}`, payload)
              setEditRow(null)
              await loadData()
            } finally {
              setBusy(false)
            }
          }}
        />
      ) : null}
    </div>
  )
}

function ReceiveRollsModal({ variants, locations, busy, onClose, onSubmit }) {
  const [variantId, setVariantId] = useState("")
  const [rollCount, setRollCount] = useState("1")
  const [costRollPrice, setCostRollPrice] = useState("")
  const [locationId, setLocationId] = useState("")
  const [note, setNote] = useState("")
  const [err, setErr] = useState(null)

  const picked = variantId ? (variants || []).find((v) => String(v.id) === String(variantId)) : null

  return (
    <Modal
      title="Nhập cuộn"
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
              const count = Number(rollCount)
              const costRoll = costRollPrice.trim() ? Number(costRollPrice) : null
              if (!Number.isFinite(id) || id <= 0) return setErr("Vui lòng chọn variant cuộn.")
              if (!Number.isFinite(count) || count < 1 || Math.floor(count) !== count) return setErr("Số cuộn phải là số nguyên >= 1.")
              if (costRollPrice.trim() && (!Number.isFinite(costRoll) || costRoll < 0)) return setErr("Giá nhập/cuộn không hợp lệ.")
              const loc = locationId ? Number(locationId) : null
              onSubmit({
                variant_id: id,
                roll_count: count,
                location_id: loc,
                cost_roll_price: costRoll == null ? null : String(costRoll),
                note: note.trim() ? note.trim() : null,
              }).catch((e) => setErr(e?.message || "Không nhập được cuộn."))
            }}
          >
            Nhập cuộn
          </button>
        </>
      }
    >
      {err ? <div className="admErr">{err}</div> : null}
      <div className="admField">
        <div className="admLabel">Variant cuộn</div>
        <select className="admSelect" value={variantId} onChange={(e) => setVariantId(e.target.value)}>
          <option value="">(Chọn variant)</option>
          {(variants || []).map((v) => (
            <option key={v.id} value={String(v.id)}>
              #{v.id} · {v.name} {v.sku ? `(${v.sku})` : ""}
            </option>
          ))}
        </select>
        {picked ? <div className="admLabel">Đơn vị: {picked.uom || "m"}</div> : null}
      </div>

      <div className="admGrid2">
        <div className="admField">
          <div className="admLabel">Số cuộn</div>
          <input className="admInput" value={rollCount} onChange={(e) => setRollCount(e.target.value)} />
        </div>
        <div className="admField">
          <div className="admLabel">Giá nhập / cuộn (tuỳ chọn)</div>
          <input className="admInput" value={costRollPrice} onChange={(e) => setCostRollPrice(e.target.value)} placeholder="Ví dụ: 180000" />
        </div>
      </div>

      <div className="admGrid2">
        <div className="admField">
          <div className="admLabel">Kệ (tuỳ chọn)</div>
          <select className="admSelect" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="">(Không chọn)</option>
            {locations.map((l) => (
              <option key={l.id} value={String(l.id)}>
                {l.code || ""} {l.code && l.name ? "·" : ""} {l.name || ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="admField">
        <div className="admLabel">Ghi chú</div>
        <input className="admInput" value={note} onChange={(e) => setNote(e.target.value)} placeholder="..." />
      </div>

      <div className="admLabel">
        Hệ thống dùng <span className="admMono">attrs.meters_per_roll</span> của variant để tạo mỗi cuộn.
      </div>
    </Modal>
  )
}

function TransferRollModal({ row, locations, busy, onClose, onSubmit }) {
  const [stockUnitId, setStockUnitId] = useState(String(row?.id || ""))
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
              onSubmit({
                stock_unit_id: suId,
                to_location_id: locId,
                note: note.trim() ? note.trim() : null,
              }).catch((e) => setErr(e?.message || "Không chuyển kệ được."))
            }}
          >
            Chuyển
          </button>
        </>
      }
    >
      {err ? <div className="admErr">{err}</div> : null}
      <div className="admField">
        <div className="admLabel">Thông tin cuộn</div>
        <div className="rolModalInfo">
          <span className="rolMono">ID: {row.id}</span>
          <span className="rolMono">Barcode: {row.barcode || "—"}</span>
          <span>{row.variant_name}</span>
        </div>
      </div>
      <div className="admGrid2">
        <div className="admField">
          <div className="admLabel">Stock Unit ID</div>
          <input className="admInput admMono" value={stockUnitId} onChange={(e) => setStockUnitId(e.target.value)} />
        </div>
        <div className="admField">
          <div className="admLabel">Kệ đích</div>
          <select className="admSelect" value={toLocationId} onChange={(e) => setToLocationId(e.target.value)}>
            <option value="">(Chọn kệ)</option>
            {locations.map((l) => (
              <option key={l.id} value={String(l.id)}>
                {l.code || ""} {l.code && l.name ? "·" : ""} {l.name || ""}
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

function AdjustRollModal({ row, rowById, busy, onClose, onSubmit }) {
  const [stockUnitId, setStockUnitId] = useState(String(row?.id || ""))
  const [qtyDelta, setQtyDelta] = useState("")
  const [note, setNote] = useState("")
  const [err, setErr] = useState(null)

  const picked = stockUnitId ? rowById.get(String(stockUnitId)) : null

  return (
    <Modal
      title="Điều chỉnh cuộn (+/-)"
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
              const delta = Number(qtyDelta)
              if (!Number.isFinite(suId) || suId <= 0) return setErr("stock_unit_id không hợp lệ.")
              if (!picked) return setErr("Không tìm thấy cuộn trong danh sách hiện tại. Vui lòng tải lại.")
              if (!Number.isFinite(delta) || delta === 0) return setErr("Delta phải khác 0.")
              onSubmit({
                variant_id: picked.variant_id,
                stock_unit_id: suId,
                qty: String(delta),
                note: note.trim() ? note.trim() : null,
              }).catch((e) => setErr(e?.message || "Không điều chỉnh được cuộn."))
            }}
          >
            Lưu
          </button>
        </>
      }
    >
      {err ? <div className="admErr">{err}</div> : null}
      <div className="admField">
        <div className="admLabel">Stock Unit ID</div>
        <input className="admInput admMono" value={stockUnitId} onChange={(e) => setStockUnitId(e.target.value)} />
        {picked ? (
          <div className="admLabel">
            {picked.variant_name} · Còn lại: <span className="admMono">{fmtQty(picked.remaining_qty)}</span> {picked.uom || ""}
          </div>
        ) : null}
      </div>
      <div className="admGrid2">
        <div className="admField">
          <div className="admLabel">Delta (+/-)</div>
          <input className="admInput" value={qtyDelta} onChange={(e) => setQtyDelta(e.target.value)} placeholder="Ví dụ: -2 hoặc 5" />
        </div>
        <div className="admField">
          <div className="admLabel">Ghi chú</div>
          <input className="admInput" value={note} onChange={(e) => setNote(e.target.value)} placeholder="..." />
        </div>
      </div>
    </Modal>
  )
}

function EditRollModal({ row, locations, busy, onClose, onSubmit }) {
  const [stockUnitId, setStockUnitId] = useState(String(row?.id || ""))
  const [barcode, setBarcode] = useState(String(row?.barcode || ""))
  const [remainingQty, setRemainingQty] = useState(String(row?.remaining_qty ?? ""))
  const [locationId, setLocationId] = useState(
    row?.location_id == null ? "__none__" : String(row.location_id)
  )
  const [err, setErr] = useState(null)

  return (
    <Modal
      title="Sửa cuộn"
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
              const b = barcode.trim()
              if (b !== String(row?.barcode || "")) payload.barcode = b || null

              const r = Number(remainingQty)
              if (!Number.isFinite(r) || r < 0) return setErr("remaining_qty phải >= 0.")
              payload.remaining_qty = String(r)

              if (locationId === "__none__") payload.location_id = null
              else {
                const locId = Number(locationId)
                if (!Number.isFinite(locId) || locId <= 0) return setErr("location_id không hợp lệ.")
                payload.location_id = locId
              }

              onSubmit({ stock_unit_id: suId, payload }).catch((e) => setErr(e?.message || "Không cập nhật được cuộn."))
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
          <div className="admLabel">Stock Unit ID</div>
          <input className="admInput admMono" value={stockUnitId} onChange={(e) => setStockUnitId(e.target.value)} />
        </div>
        <div className="admField">
          <div className="admLabel">Barcode</div>
          <input className="admInput admMono" value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Có thể để trống" />
        </div>
      </div>
      <div className="admGrid2">
        <div className="admField">
          <div className="admLabel">Remaining qty</div>
          <input className="admInput" value={remainingQty} onChange={(e) => setRemainingQty(e.target.value)} placeholder="Ví dụ: 12.5" />
        </div>
        <div className="admField">
          <div className="admLabel">Kệ</div>
          <select className="admSelect" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="__none__">(Bỏ kệ)</option>
            {locations.map((l) => (
              <option key={l.id} value={String(l.id)}>
                {l.code || ""} {l.code && l.name ? "·" : ""} {l.name || ""}
              </option>
            ))}
          </select>
        </div>
      </div>
    </Modal>
  )
}
