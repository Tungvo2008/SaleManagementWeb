import { useEffect, useMemo, useState } from "react"
import { get, patch } from "../api"
import Modal from "./Modal"
import DataGrid from "./DataGrid"
import { fmtDateTimeVN } from "../utils/datetime"
import "./pricing.css"

function toNumber(v) {
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function fmtMoney(v) {
  const n = toNumber(v)
  if (n == null) return ""
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(n)
}

function fmtDateTime(v) {
  return fmtDateTimeVN(v, "")
}

function priceFieldLabel(field) {
  if (field === "price") return "Giá lẻ"
  if (field === "roll_price") return "Giá cuộn"
  if (field === "cost_price") return "Giá vốn/đv"
  if (field === "cost_roll_price") return "Giá vốn/cuộn"
  if (field === "cost_per_m") return "Giá vốn/m"
  return field || ""
}

function asPatchNumberString(v) {
  const n = toNumber(v)
  if (n == null) return null
  return n.toFixed(2)
}

function categoryNameById(categories, id) {
  if (id == null) return ""
  const found = categories.find((c) => String(c.id) === String(id))
  return found?.name || ""
}

function getEffectiveCategoryId(row, parentCategoryById) {
  if (row?.category_id != null) return row.category_id
  if (row?.parent_id == null) return null
  return parentCategoryById.get(String(row.parent_id)) ?? null
}

export default function PricingPage() {
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [notice, setNotice] = useState("")

  const [rows, setRows] = useState([])
  const [categories, setCategories] = useState([])
  const [parents, setParents] = useState([])
  const [historyRows, setHistoryRows] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyErr, setHistoryErr] = useState(null)
  const [historyVariantId, setHistoryVariantId] = useState("")
  const [historyField, setHistoryField] = useState("")

  const [q, setQ] = useState("")
  const [categoryId, setCategoryId] = useState("")
  const [editRow, setEditRow] = useState(null)

  const [bulkPercent, setBulkPercent] = useState("")
  const [bulkTarget, setBulkTarget] = useState("price")

  async function loadAll() {
    setLoading(true)
    setErr(null)
    try {
      const [variants, cats, ps] = await Promise.all([get("/api/v1/products/variants"), get("/api/v1/categories/"), get("/api/v1/products/parents")])
      setRows(Array.isArray(variants) ? variants : [])
      setCategories(Array.isArray(cats) ? cats : [])
      setParents(Array.isArray(ps) ? ps : [])
    } catch (e) {
      setErr(e?.message || "Không tải được dữ liệu bảng giá")
      setRows([])
      setCategories([])
      setParents([])
    } finally {
      setLoading(false)
    }
  }

  async function loadHistory() {
    setHistoryLoading(true)
    setHistoryErr(null)
    try {
      const params = new URLSearchParams()
      params.set("limit", "300")
      if (historyVariantId) params.set("variant_id", String(historyVariantId))
      if (historyField) params.set("field", String(historyField))
      const path = `/api/v1/products/price-history?${params.toString()}`
      const rows = await get(path)
      setHistoryRows(Array.isArray(rows) ? rows : [])
    } catch (e) {
      setHistoryErr(e?.message || "Không tải được lịch sử giá")
      setHistoryRows([])
    } finally {
      setHistoryLoading(false)
    }
  }

  useEffect(() => {
    loadAll().catch(() => {})
  }, [])

  useEffect(() => {
    loadHistory().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyVariantId, historyField])

  const parentCategoryById = useMemo(() => {
    const m = new Map()
    for (const p of parents) m.set(String(p.id), p.category_id ?? null)
    return m
  }, [parents])

  const variantNameById = useMemo(() => {
    const m = new Map()
    for (const r of rows) m.set(String(r.id), r.name || `#${r.id}`)
    return m
  }, [rows])

  const filtered = useMemo(() => {
    const qq = String(q || "").trim().toLowerCase()
    const cat = String(categoryId || "").trim()

    return rows.filter((r) => {
      const effCategoryId = getEffectiveCategoryId(r, parentCategoryById)
      if (cat && String(effCategoryId || "") !== cat) return false
      if (!qq) return true

      const catName = categoryNameById(categories, effCategoryId)
      const hay = [r.id, r.name, r.sku, r.barcode, r.uom, catName]
        .filter((v) => v !== null && v !== undefined)
        .map((v) => String(v).toLowerCase())
        .join(" · ")
      return hay.includes(qq)
    })
  }, [rows, categories, q, categoryId, parentCategoryById])

  const titleHint = useMemo(() => {
    if (loading) return "Đang tải..."
    if (err) return `Lỗi: ${err}`
    return `${filtered.length}/${rows.length} biến thể`
  }, [loading, err, filtered.length, rows.length])

  async function applyBulkPercent() {
    setErr(null)
    setNotice("")

    const p = Number(bulkPercent)
    if (!Number.isFinite(p) || p === 0) {
      setErr("% điều chỉnh phải là số khác 0.")
      return
    }
    if (!filtered.length) {
      setErr("Không có sản phẩm trong bộ lọc hiện tại.")
      return
    }

    const targetLabel =
      bulkTarget === "price"
        ? "Giá lẻ"
        : bulkTarget === "roll"
          ? "Giá cuộn"
          : bulkTarget === "cost"
            ? "Giá nhập"
            : "Giá lẻ + Giá cuộn + Giá nhập"
    const ok = window.confirm(`Áp dụng ${p}% cho ${filtered.length} biến thể (${targetLabel})?`)
    if (!ok) return

    setBusy(true)
    try {
      let changed = 0
      let skipped = 0
      let failed = 0

      for (const row of filtered) {
        const payload = {}

        if (bulkTarget === "price" || bulkTarget === "all") {
          const base = toNumber(row.price)
          if (base == null) {
            skipped += 1
          } else {
            const next = Math.max(0, base * (1 + p / 100))
            payload.price = next.toFixed(2)
          }
        }

        if (bulkTarget === "roll" || bulkTarget === "all") {
          const base = toNumber(row.roll_price)
          if (base == null) {
            skipped += 1
          } else {
            const next = Math.max(0, base * (1 + p / 100))
            payload.roll_price = next.toFixed(2)
          }
        }

        if (bulkTarget === "cost" || bulkTarget === "all") {
          const base = toNumber(row.cost_price)
          if (base == null) {
            skipped += 1
          } else {
            const next = Math.max(0, base * (1 + p / 100))
            payload.cost_price = next.toFixed(2)
          }
        }

        if (!Object.keys(payload).length) continue

        try {
          const updated = await patch(`/api/v1/products/variants/${row.id}`, payload)
          setRows((prev) => prev.map((r) => (String(r.id) === String(updated.id) ? updated : r)))
          changed += 1
        } catch {
          failed += 1
        }
      }

      setNotice(`Đã cập nhật ${changed} biến thể. Bỏ qua ${skipped}, lỗi ${failed}.`)
      await loadHistory()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pri">
      <div className="priTop">
        <div className="priHint">{titleHint}</div>
        <div className="priActions">
          <input
            className="admInput"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm theo tên / SKU / barcode..."
            style={{ width: 340 }}
          />
          <select className="admSelect" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={{ width: 220 }}>
            <option value="">Tất cả danh mục</option>
            {categories.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </select>
          <button className="priActionBtn" disabled={busy || loading} onClick={() => loadAll()}>
            Tải lại
          </button>
        </div>
      </div>

      {notice ? <div className="priNotice">{notice}</div> : null}
      {err ? <div className="admErr">{err}</div> : null}

      <div className="priBulk">
        <div className="priBulkTitle">Cập nhật nhanh theo % (trên danh sách đang lọc)</div>
        <div className="priBulkRow">
          <select className="admSelect" value={bulkTarget} onChange={(e) => setBulkTarget(e.target.value)}>
            <option value="price">Giá lẻ</option>
            <option value="roll">Giá cuộn</option>
            <option value="cost">Giá nhập</option>
            <option value="all">Giá lẻ + Giá cuộn + Giá nhập</option>
          </select>
          <input className="admInput" value={bulkPercent} onChange={(e) => setBulkPercent(e.target.value)} placeholder="VD: 5 hoặc -10" />
          <button className="priActionBtn priActionPrimary" disabled={busy || loading} onClick={() => applyBulkPercent()}>
            Áp dụng
          </button>
        </div>
      </div>

      <DataGrid
        id="catalog.pricing"
        columns={[
          { key: "id", title: "ID", width: 90, minWidth: 70, render: (r) => <span className="priMono">{r.id}</span> },
          { key: "name", title: "Sản phẩm", fill: true, minWidth: 260, render: (r) => <span className="priName">{r.name}</span> },
          { key: "sku", title: "SKU", width: 140, minWidth: 110, render: (r) => <span className="priMono">{r.sku || ""}</span> },
          {
            key: "category",
            title: "Danh mục",
            width: 170,
            minWidth: 130,
            getValue: (r) => categoryNameById(categories, getEffectiveCategoryId(r, parentCategoryById)),
            render: (r) => <span>{categoryNameById(categories, getEffectiveCategoryId(r, parentCategoryById))}</span>,
          },
          { key: "uom", title: "Đơn vị", width: 90, minWidth: 80, render: (r) => <span className="priMono">{r.uom || ""}</span> },
          {
            key: "price",
            title: "Giá lẻ",
            width: 120,
            minWidth: 100,
            align: "right",
            getValue: (r) => toNumber(r.price) ?? -1,
            render: (r) => <span className="priMono">{fmtMoney(r.price)}</span>,
          },
          {
            key: "roll_price",
            title: "Giá cuộn",
            width: 120,
            minWidth: 100,
            align: "right",
            getValue: (r) => toNumber(r.roll_price) ?? -1,
            render: (r) => <span className="priMono">{r.roll_price == null ? "" : fmtMoney(r.roll_price)}</span>,
          },
          {
            key: "cost_price",
            title: "Giá nhập",
            width: 120,
            minWidth: 100,
            align: "right",
            getValue: (r) => toNumber(r.cost_price) ?? -1,
            render: (r) => <span className="priMono">{r.cost_price == null ? "" : fmtMoney(r.cost_price)}</span>,
          },
          {
            key: "mode",
            title: "Kiểu",
            width: 100,
            minWidth: 90,
            getValue: (r) => (r.track_stock_unit ? 1 : 0),
            render: (r) => <span className="priMono">{r.track_stock_unit ? "Cuộn" : "Thường"}</span>,
          },
          {
            key: "actions",
            title: "Thao tác",
            width: 110,
            minWidth: 100,
            sortable: false,
            filterable: false,
            render: (r) => (
              <button className="admBtn" disabled={busy} onClick={() => setEditRow(r)}>
                Sửa giá
              </button>
            ),
          },
        ]}
        rows={filtered}
        rowKey={(r) => r.id}
      />

      <div className="priBulk" style={{ marginTop: 16 }}>
        <div className="priBulkTitle">Lịch sử giá</div>
        <div className="priBulkRow">
          <select className="admSelect" value={historyVariantId} onChange={(e) => setHistoryVariantId(e.target.value)}>
            <option value="">Tất cả biến thể</option>
            {rows.map((r) => (
              <option key={r.id} value={String(r.id)}>
                #{r.id} · {r.name}
              </option>
            ))}
          </select>
          <select className="admSelect" value={historyField} onChange={(e) => setHistoryField(e.target.value)}>
            <option value="">Tất cả trường giá</option>
            <option value="price">Giá lẻ</option>
            <option value="roll_price">Giá cuộn</option>
            <option value="cost_price">Giá vốn/đv</option>
            <option value="cost_roll_price">Giá vốn/cuộn</option>
            <option value="cost_per_m">Giá vốn/m</option>
          </select>
          <button className="priActionBtn" disabled={historyLoading} onClick={() => loadHistory()}>
            {historyLoading ? "Đang tải..." : "Tải lịch sử"}
          </button>
        </div>
        {historyErr ? <div className="admErr" style={{ marginTop: 8 }}>{historyErr}</div> : null}
      </div>

      <DataGrid
        id="catalog.priceHistory"
        columns={[
          {
            key: "created_at",
            title: "Thời gian",
            width: 170,
            minWidth: 150,
            getValue: (r) => Date.parse(r.created_at || 0) || 0,
            render: (r) => <span className="priMono">{fmtDateTime(r.created_at)}</span>,
          },
          {
            key: "variant_id",
            title: "Biến thể",
            width: 220,
            minWidth: 180,
            render: (r) => (
              <span>
                #{r.variant_id} · {variantNameById.get(String(r.variant_id)) || `Variant #${r.variant_id}`}
              </span>
            ),
          },
          { key: "stock_unit_id", title: "ID cuộn", width: 90, minWidth: 80, render: (r) => <span className="priMono">{r.stock_unit_id ?? ""}</span> },
          { key: "field", title: "Trường", width: 130, minWidth: 120, render: (r) => <span>{priceFieldLabel(r.field)}</span> },
          { key: "old_value", title: "Giá cũ", width: 120, minWidth: 100, align: "right", render: (r) => <span className="priMono">{r.old_value == null ? "" : fmtMoney(r.old_value)}</span> },
          { key: "new_value", title: "Giá mới", width: 120, minWidth: 100, align: "right", render: (r) => <span className="priMono">{r.new_value == null ? "" : fmtMoney(r.new_value)}</span> },
          { key: "source", title: "Nguồn", width: 170, minWidth: 120, render: (r) => <span className="priMono">{r.source}</span> },
          { key: "note", title: "Ghi chú", fill: true, minWidth: 220, render: (r) => <span>{r.note || ""}</span> },
        ]}
        rows={historyRows}
        rowKey={(r) => r.id}
      />

      {editRow ? (
        <PricingModal
          variant={editRow}
          busy={busy}
          onClose={() => setEditRow(null)}
          onSave={async (payload) => {
            setBusy(true)
            try {
              const updated = await patch(`/api/v1/products/variants/${editRow.id}`, payload)
              setRows((prev) => prev.map((r) => (String(r.id) === String(updated.id) ? updated : r)))
              await loadHistory()
              setEditRow(null)
            } finally {
              setBusy(false)
            }
          }}
        />
      ) : null}
    </div>
  )
}

function PricingModal({ variant, busy, onClose, onSave }) {
  const [price, setPrice] = useState(variant.price != null ? String(variant.price) : "")
  const [rollPrice, setRollPrice] = useState(variant.roll_price != null ? String(variant.roll_price) : "")
  const [costPrice, setCostPrice] = useState(variant.cost_price != null ? String(variant.cost_price) : "")
  const [err, setErr] = useState(null)

  return (
    <Modal
      title={`Sửa giá · ${variant.name}`}
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

              const p = toNumber(price)
              if (p == null || p < 0) {
                setErr("Giá lẻ không hợp lệ.")
                return
              }

              const rp = rollPrice.trim() ? toNumber(rollPrice) : null
              if (rollPrice.trim() && (rp == null || rp < 0)) {
                setErr("Giá cuộn không hợp lệ.")
                return
              }
              const cp = costPrice.trim() ? toNumber(costPrice) : null
              if (costPrice.trim() && (cp == null || cp < 0)) {
                setErr("Giá nhập không hợp lệ.")
                return
              }

              const payload = {
                price: asPatchNumberString(p),
                roll_price: rp == null ? null : asPatchNumberString(rp),
                cost_price: cp == null ? null : asPatchNumberString(cp),
              }

              onSave(payload).catch((e) => setErr(e?.message || "Không lưu được giá"))
            }}
          >
            Lưu giá
          </button>
        </>
      }
    >
      {err ? <div className="admErr">{err}</div> : null}

      <div className="admField">
        <div className="admLabel">Giá lẻ</div>
        <input className="admInput" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="VD: 25000" />
      </div>

      <div className="admField">
        <div className="admLabel">Giá cuộn (để trống nếu không dùng)</div>
        <input className="admInput" value={rollPrice} onChange={(e) => setRollPrice(e.target.value)} placeholder="VD: 240000" />
      </div>

      <div className="admField">
        <div className="admLabel">Giá nhập (theo đơn vị)</div>
        <input className="admInput" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} placeholder="VD: 18000" />
      </div>

      <div className="priHelp">Sản phẩm theo cuộn: nên đặt cả giá lẻ (mét) và giá cuộn.</div>
    </Modal>
  )
}
