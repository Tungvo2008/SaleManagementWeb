import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { get, patch, post } from "../api"
import SharedProductCreateModal from "../admin/ProductCreateModal"
import FieldLabel from "../ui/FieldLabel"
import { AUTO_EAN13_SENTINEL } from "../utils/ean13"
import { formatMoneyVN } from "../utils/number"
import { openPrintLabels } from "../utils/barcodeLabels"
import "./receive.css"
import "../pos/pos.css"

function asNum(v) {
  const n = typeof v === "string" ? Number(v) : Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

function fmtMoney(v) {
  return formatMoneyVN(v)
}

function AppModal({ title, children, footer, onClose, wide = false, xwide = false, zIndex = 12000 }) {
  useEffect(() => {
    function onEsc(e) {
      if (e.key === "Escape") onClose?.()
    }
    window.addEventListener("keydown", onEsc)
    return () => window.removeEventListener("keydown", onEsc)
  }, [onClose])

  return createPortal(
    <div className="rcvModalOverlay" onMouseDown={onClose} style={{ zIndex }}>
      <div
        className={`rcvModal ${xwide ? "rcvModalXwide" : wide ? "rcvModalWide" : ""}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="rcvModalHead">
          <div className="rcvModalTitle">{title}</div>
          <button className="btn" onClick={onClose}>
            Đóng (Esc)
          </button>
        </div>
        <div className="rcvModalBody">{children}</div>
        {footer ? <div className="rcvModalFooter">{footer}</div> : null}
      </div>
    </div>,
    document.body
  )
}

function SupplierPickerModal({ onClose, onPicked, onCreateNew }) {
  const [q, setQ] = useState("")
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)

  async function load(nextQ = q) {
    setLoading(true)
    setErr(null)
    try {
      const r = await get(`/api/v1/suppliers/?q=${encodeURIComponent((nextQ || "").trim())}&limit=80&is_active=true`)
      setRows(Array.isArray(r) ? r : [])
    } catch (e) {
      setErr(e?.message || "Không tải được danh sách nhà cung cấp")
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load("").catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <AppModal
      wide
      zIndex={25000}
      title="Chọn nhà cung cấp"
      onClose={onClose}
      footer={
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <button className="btn" onClick={onCreateNew}>
            + Tạo nhà cung cấp
          </button>
          <button className="btn btnPrimary" onClick={onClose}>
            Đóng
          </button>
        </div>
      }
    >
      <div className="split">
        <div>
          <div className="hint" style={{ marginTop: 0 }}>
            Tìm nhà cung cấp
          </div>
          <input
            className="input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Gõ tên / SĐT / mã..."
            onKeyDown={(e) => {
              if (e.key !== "Enter") return
              load(q).catch(() => {})
            }}
          />
        </div>
        <div>
          <div className="hint" style={{ marginTop: 0 }}>
            Trạng thái
          </div>
          <div className="pill">{loading ? "Đang tải..." : err ? `Lỗi: ${err}` : `${rows.length} kết quả`}</div>
        </div>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {rows.map((s) => (
          <button key={s.id} type="button" className="btn" onClick={() => onPicked?.(s)}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div style={{ fontWeight: 700, textAlign: "left" }}>{s.name}</div>
              <div className="pill">{s.phone || s.code || `#${s.id}`}</div>
            </div>
            <div className="hint" style={{ marginTop: 6, textAlign: "left" }}>
              {s.address || "—"}
            </div>
          </button>
        ))}
        {!loading && rows.length === 0 ? <div className="hint">Không có kết quả.</div> : null}
      </div>
    </AppModal>
  )
}

function CreateCategoryModal({ busy, onClose, onCreated, onError }) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [imageUrl, setImageUrl] = useState("")
  const [saving, setSaving] = useState(false)

  async function save() {
    const n = name.trim()
    if (!n) throw new Error("Tên danh mục là bắt buộc.")
    setSaving(true)
    try {
      const c = await post("/api/v1/categories/", {
        name: n,
        description: description.trim() ? description.trim() : null,
        image_url: imageUrl.trim() ? imageUrl.trim() : null,
      })
      onCreated?.(c)
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppModal
      title="Tạo danh mục"
      onClose={onClose}
      footer={
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button className="btn" disabled={busy || saving} onClick={onClose}>
            Huỷ
          </button>
          <button className="btn btnPrimary" disabled={busy || saving} onClick={() => save().catch((e) => onError?.(e))}>
            Tạo
          </button>
        </div>
      }
    >
      <div className="split">
        <div>
          <FieldLabel className="hint" style={{ marginTop: 0 }} required>
            Tên danh mục
          </FieldLabel>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ: Lưới / Dây / Phụ kiện..." />
        </div>
        <div>
          <div className="hint" style={{ marginTop: 0 }}>
            Ảnh (URL)
          </div>
          <input className="input" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." />
        </div>
      </div>
      <div>
        <div className="hint" style={{ marginTop: 0 }}>
          Mô tả
        </div>
        <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="..." />
      </div>
    </AppModal>
  )
}

function CreateSupplierModal({ busy, onClose, onCreated, onError }) {
  const [name, setName] = useState("")
  const [code, setCode] = useState("")
  const [phone, setPhone] = useState("")
  const [address, setAddress] = useState("")
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)

  async function save() {
    const n = name.trim()
    if (!n) throw new Error("Tên nhà cung cấp là bắt buộc.")
    setSaving(true)
    try {
      const s = await post("/api/v1/suppliers/", {
        code: code.trim() ? code.trim() : null,
        name: n,
        phone: phone.trim() ? phone.trim() : null,
        address: address.trim() ? address.trim() : null,
        note: note.trim() ? note.trim() : null,
        is_active: true,
      })
      onCreated?.(s)
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppModal
      wide
      title="Tạo nhà cung cấp"
      onClose={onClose}
      footer={
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button className="btn" disabled={busy || saving} onClick={onClose}>
            Huỷ
          </button>
          <button className="btn btnPrimary" disabled={busy || saving} onClick={() => save().catch((e) => onError?.(e))}>
            Tạo
          </button>
        </div>
      }
    >
      <div className="split">
        <div>
          <FieldLabel className="hint" style={{ marginTop: 0 }} required>
            Tên nhà cung cấp
          </FieldLabel>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ: NCC A" />
        </div>
        <div>
          <div className="hint" style={{ marginTop: 0 }}>
            Mã (tuỳ chọn)
          </div>
          <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="VD: NCC-001" />
        </div>
      </div>
      <div className="split">
        <div>
          <div className="hint" style={{ marginTop: 0 }}>
            SĐT
          </div>
          <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="..." />
        </div>
        <div>
          <div className="hint" style={{ marginTop: 0 }}>
            Địa chỉ
          </div>
          <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="..." />
        </div>
      </div>
      <div>
        <div className="hint" style={{ marginTop: 0 }}>
          Ghi chú
        </div>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="..." />
      </div>
    </AppModal>
  )
}

function CreateProductModal({ busy, categories, locations, suppliers, existingVariants, onClose, onCreated }) {
  return (
    <SharedProductCreateModal
      busy={busy}
      categories={categories}
      locations={locations}
      suppliers={suppliers}
      existingVariants={existingVariants}
      onClose={onClose}
      onCreated={(created) => {
        if (!created) {
          onCreated?.(null)
          return
        }
        onCreated?.({
          variant_id: created.id,
          parent_id: created.parent_id ?? null,
          parent_name: null,
          sku: created.sku,
          barcode: created.barcode,
          name: created.name,
          uom: created.uom,
          price: created.price,
          roll_price: created.roll_price,
          track_stock_unit: created.track_stock_unit,
          stock: created.stock,
          rolls_total: 0,
          rolls_full: 0,
          rolls_partial: 0,
        })
      }}
    />
  )
}

export default function ReceivePrintPage() {
  const SEARCH_PAGE_SIZE = 40
  const [tab, setTab] = useState("normal") // normal | rolls

  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)

  const [q, setQ] = useState("")
  const [searchBusy, setSearchBusy] = useState(false)
  const [variants, setVariants] = useState([])
  const [searchLimit, setSearchLimit] = useState(SEARCH_PAGE_SIZE)
  const [hasMoreResults, setHasMoreResults] = useState(false)
  const [picked, setPicked] = useState(null)

  const [qty, setQty] = useState("1")
  const [normalCostPrice, setNormalCostPrice] = useState("")
  const [rollCostPrice, setRollCostPrice] = useState("")
  const [note, setNote] = useState("")

  const [locations, setLocations] = useState([])
  const [locationId, setLocationId] = useState("")

  const [categories, setCategories] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [supplierId, setSupplierId] = useState("")
  const [supplierPicked, setSupplierPicked] = useState(null)

  const [supplierPickerOpen, setSupplierPickerOpen] = useState(false)
  const [showCreateCategory, setShowCreateCategory] = useState(false)
  const [showCreateSupplier, setShowCreateSupplier] = useState(false)
  const [showCreateProduct, setShowCreateProduct] = useState(false)

  const searchTimerRef = useRef(null)
  const rightCardRef = useRef(null)

  function showErr(e) {
    setToast({ kind: "error", message: e?.message || "Có lỗi xảy ra" })
  }

  function showInfo(msg) {
    setToast({ kind: "info", message: msg })
  }

  useEffect(() => {
    get("/api/v1/locations/")
      .then((r) => setLocations(Array.isArray(r) ? r : []))
      .catch(() => setLocations([]))

    get("/api/v1/categories/")
      .then((r) => setCategories(Array.isArray(r) ? r : []))
      .catch(() => setCategories([]))

    get("/api/v1/suppliers/?limit=200&is_active=true")
      .then((r) => setSuppliers(Array.isArray(r) ? r : []))
      .catch(() => setSuppliers([]))
  }, [])

  async function doSearch(nextQ) {
    const qq = (nextQ ?? q ?? "").trim()
    setSearchBusy(true)
    try {
      const r = await get(`/api/v1/pos/search/?q=${encodeURIComponent(qq)}&limit=${searchLimit}`)
      const list = Array.isArray(r?.variants) ? r.variants : []
      // Show all variants; when user picks one, UI auto-switches to matching flow.
      setVariants(list)
      setHasMoreResults(list.length >= searchLimit)
    } finally {
      setSearchBusy(false)
    }
  }

  useEffect(() => {
    setSearchLimit(SEARCH_PAGE_SIZE)
  }, [q, tab])

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      doSearch(q).catch(() => {})
    }, 180)
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, tab, searchLimit])

  useEffect(() => {
    // Do not clear picked on tab change, otherwise click->setTab will clear selection.
    setRollCostPrice("")
    setLocationId("")
  }, [tab])

  const qtyNum = useMemo(() => {
    const n = Math.floor(asNum(qty))
    return Number.isFinite(n) ? n : NaN
  }, [qty])

  const syncPickedVariant = useCallback(async (variantId) => {
    if (!variantId) return
    const fresh = await get(`/api/v1/products/variants/${variantId}`)
    const normalized = fresh
      ? {
          ...fresh,
          variant_id: fresh.variant_id ?? fresh.id,
        }
      : null
    if (!normalized) return

    setVariants((prev) =>
      (Array.isArray(prev) ? prev : []).map((item) =>
        String(item.variant_id) === String(variantId)
          ? {
              ...item,
              ...normalized,
            }
          : item
      )
    )
    setPicked((prev) =>
      prev && String(prev.variant_id) === String(variantId)
        ? {
            ...prev,
            ...normalized,
          }
        : prev
    )
  }, [])

  async function ensureBarcode() {
    if (!picked) return null
    if (picked.barcode) return picked.barcode
    const updated = await patch(`/api/v1/products/variants/${picked.variant_id}`, { barcode: AUTO_EAN13_SENTINEL })
    const bc = updated?.barcode || null
    setPicked((prev) => (prev ? { ...prev, barcode: bc } : prev))
    if (bc) showInfo(`Đã tạo barcode EAN-13: ${bc}`)
    return bc
  }

  async function receiveAndMaybePrint({ print, printWindow = null }) {
    if (!picked) throw new Error("Vui lòng chọn sản phẩm.")
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) throw new Error("Số lượng phải > 0.")

    setBusy(true)
    try {
      const supId = supplierId ? Number(supplierId) : null
      if (tab === "normal") {
        const costN = normalCostPrice.trim() ? Number(normalCostPrice) : null
        if (normalCostPrice.trim() && (!Number.isFinite(costN) || costN < 0)) {
          throw new Error("Giá nhập không hợp lệ.")
        }
        const bc = await ensureBarcode()
        if (!bc) throw new Error("Thiếu barcode.")

        await post("/api/v1/inventory/receive", {
          variant_id: picked.variant_id,
          supplier_id: supId,
          qty: String(qtyNum),
          cost_price: costN == null ? null : String(costN),
          note: note.trim() ? note.trim() : null,
        })
        await syncPickedVariant(picked.variant_id)

        if (print) {
          const labels = Array.from({ length: qtyNum }).map(() => ({
            code: bc,
            name: picked.name,
            sku: picked.sku,
            price: picked.price != null ? picked.price : "",
          }))
          openPrintLabels({ title: `Tem mã vạch (${picked.name})`, labels, printWindow })
        }

        showInfo("Đã nhập hàng.")
      } else {
        const rollCostN = rollCostPrice.trim() ? Number(rollCostPrice) : null
        if (rollCostPrice.trim() && (!Number.isFinite(rollCostN) || rollCostN < 0)) {
          throw new Error("Giá nhập/cuộn không hợp lệ.")
        }
        const loc = locationId ? Number(locationId) : null
        const res = await post("/api/v1/stockunits/receive-rolls", {
          variant_id: picked.variant_id,
          roll_count: qtyNum,
          location_id: loc,
          supplier_id: supId,
          cost_roll_price: rollCostN == null ? null : String(rollCostN),
          note: note.trim() ? note.trim() : null,
        })
        await syncPickedVariant(picked.variant_id)

        const units = Array.isArray(res) ? res : []
        if (print) {
          const labels = units.map((su) => ({
            code: su.barcode,
            name: picked.name,
            sku: picked.sku,
            price: picked.roll_price != null ? picked.roll_price : picked.price != null ? picked.price : "",
          }))
          openPrintLabels({ title: `Tem cuộn (${picked.name})`, labels, printWindow })
        }

        showInfo(`Đã nhập ${units.length} cuộn.`)
      }
    } finally {
      setBusy(false)
    }
  }

  async function printOnlyLabels({ printWindow = null } = {}) {
    if (!picked) throw new Error("Vui lòng chọn sản phẩm.")
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) throw new Error("Số lượng tem phải > 0.")

    setBusy(true)
    try {
      if (tab === "normal") {
        const bc = await ensureBarcode()
        if (!bc) throw new Error("Thiếu barcode.")
        const labels = Array.from({ length: qtyNum }).map(() => ({
          code: bc,
          name: picked.name,
          sku: picked.sku,
          price: picked.price != null ? picked.price : "",
        }))
        openPrintLabels({ title: `In tem (${picked.name})`, labels, printWindow })
        return
      }

      // Roll goods: print by existing stock_unit barcodes (no receiving needed).
      const unitsRaw = await get(`/api/v1/stockunits/?variant_id=${picked.variant_id}`)
      const units = (Array.isArray(unitsRaw) ? unitsRaw : [])
        .filter((u) => !u.is_depleted && asNum(u.remaining_qty) > 0)
        .filter((u) => String(u.barcode || "").trim())
      if (!units.length) throw new Error("Không có cuộn còn hàng để in tem.")
      if (qtyNum > units.length) {
        throw new Error(`Chỉ có ${units.length} cuộn còn hàng có barcode.`)
      }

      const labels = units.slice(0, qtyNum).map((su) => ({
        code: su.barcode,
        name: picked.name,
        sku: picked.sku,
        price: picked.roll_price != null ? picked.roll_price : picked.price != null ? picked.price : "",
      }))
      openPrintLabels({ title: `In tem cuộn (${picked.name})`, labels, printWindow })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rcvShell">
      <div className="rcvHeader">
        <div className="rcvTitle">Nhập hàng & in tem</div>
        <div className="rcvHeaderRight">
          <div className="rcvTabs">
            <button type="button" className={`btn ${tab === "normal" ? "btnPrimary" : ""}`} onClick={() => setTab("normal")} disabled={busy}>
              Hàng thường
            </button>
            <button type="button" className={`btn ${tab === "rolls" ? "btnPrimary" : ""}`} onClick={() => setTab("rolls")} disabled={busy}>
              Hàng cuộn (lưới)
            </button>
          </div>
          <div className="rcvQuick">
            <button type="button" className="btn" onClick={() => setShowCreateCategory(true)} disabled={busy}>
              + Danh mục
            </button>
            <button type="button" className="btn" onClick={() => setShowCreateSupplier(true)} disabled={busy}>
              + Nhà cung cấp
            </button>
            <button type="button" className="btn btnPrimary" onClick={() => setShowCreateProduct(true)} disabled={busy}>
              + Sản phẩm
            </button>
          </div>
        </div>
      </div>

      <div className="rcvGrid">
        <div className="card rcvCard">
          <div className="cardHeader">
            <div className="cardTitle">Chọn sản phẩm</div>
            <div className="pill">{searchBusy ? "Đang tìm..." : `${variants.length} kết quả`}</div>
          </div>
          <div className="cardBody">
            <input
              className="input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Gõ tên/SKU/barcode để tìm..."
            />
            <div className="hint">Gõ sẽ tự tìm. Bấm vào 1 dòng để chọn.</div>

            <div className="rcvResults">
              {variants.map((v) => {
                const active = picked && String(picked.variant_id) === String(v.variant_id)
                const stock = asNum(v.stock)
                return (
                  <button
                    key={v.variant_id}
                    type="button"
                    className={`rcvRow ${active ? "rcvRowActive" : ""}`}
                    onClick={() => {
                      setPicked(v)
                      setTab(v.track_stock_unit ? "rolls" : "normal")
                      // On mobile (stacked layout), auto-scroll to the right panel to reduce extra scrolling.
                      try {
                        const narrow = window.matchMedia && window.matchMedia("(max-width: 1100px)").matches
                        if (narrow) setTimeout(() => rightCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0)
                      } catch {}
                    }}
                    disabled={busy}
                  >
                    <div className="rcvRowTop">
                      <div className="rcvRowName">{v.name}</div>
                      <div className="pill">{tab === "rolls" ? `${v.rolls_full ?? 0} cuộn nguyên` : `Tồn: ${stock}`}</div>
                    </div>
                    <div className="rcvRowSub">
                      <span className="pill">{v.sku || `#${v.variant_id}`}</span>
                      {tab === "rolls" ? (
                        <>
                          <span className="pill">Giá m: {fmtMoney(v.price)}đ</span>
                          {v.roll_price != null ? <span className="pill">Giá cuộn: {fmtMoney(v.roll_price)}đ</span> : null}
                        </>
                      ) : (
                        <>
                          {v.barcode ? <span className="pill">BC: {v.barcode}</span> : <span className="pill">Chưa có barcode</span>}
                          <span className="pill">Giá: {fmtMoney(v.price)}đ</span>
                        </>
                      )}
                    </div>
                  </button>
                )
              })}
              {!searchBusy && variants.length === 0 ? <div className="hint">Không có kết quả.</div> : null}
              {!searchBusy && variants.length > 0 && hasMoreResults ? (
                <button
                  type="button"
                  className="btn"
                  onClick={() => setSearchLimit((prev) => prev + SEARCH_PAGE_SIZE)}
                  disabled={busy}
                  style={{ marginTop: 8 }}
                >
                  Xem thêm
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div ref={rightCardRef} className="card rcvCard">
          <div className="cardHeader">
            <div className="cardTitle">Nhập kho</div>
            <div className="pill">{picked ? `Đã chọn #${picked.variant_id}` : "Chưa chọn"}</div>
          </div>
          <div className="cardBody">
            {!picked ? (
              <div className="hint">Chọn 1 sản phẩm ở cột bên trái để bắt đầu.</div>
            ) : (
              <>
                <div className="rcvPicked">
                  <div className="rcvPickedName">{picked.name}</div>
                  <div className="rcvPickedMeta">
                    <span className="pill">SKU: {picked.sku || "—"}</span>
                    {tab === "normal" ? <span className="pill">BC: {picked.barcode || "—"}</span> : <span className="pill">Sẽ tạo barcode riêng cho từng cuộn</span>}
                    <span className="pill">Tồn hiện tại: {asNum(picked.stock)}</span>
                  </div>
                </div>

                <div className="split">
                  <div>
                    <div className="hint" style={{ marginTop: 0 }}>
                      Số lượng
                    </div>
                    <input className="input" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Ví dụ: 5" />
                    <div className="hint">
                      {tab === "normal"
                        ? "Hàng thường: nhập số lượng tăng tồn và in đúng số tem barcode. Hoặc chỉ in tem mà không nhập."
                        : "Hàng cuộn: nhập số cuộn; hệ thống tạo N barcode cho N cuộn. Hoặc in lại tem từ các cuộn đang có."}
                    </div>
                    {tab === "normal" ? (
                      <>
                        <div className="hint" style={{ marginTop: 10 }}>
                          Giá nhập (tuỳ chọn)
                        </div>
                        <input className="input" value={normalCostPrice} onChange={(e) => setNormalCostPrice(e.target.value)} placeholder="VD: 22000" />
                      </>
                    ) : null}
                  </div>
                  <div>
                    <div className="hint" style={{ marginTop: 0 }}>
                      Nhà cung cấp (tuỳ chọn)
                    </div>
                    <div className="rcvSupplierRow">
                      <button type="button" className="btn" disabled={busy} onClick={() => setSupplierPickerOpen(true)}>
                        Chọn NCC
                      </button>
                      <button
                        type="button"
                        className="btn"
                        disabled={busy || !supplierId}
                        onClick={() => {
                          setSupplierId("")
                          setSupplierPicked(null)
                        }}
                      >
                        Bỏ
                      </button>
                      <div className="rcvSupplierMeta">
                        <div className="rcvSupplierName">{supplierPicked?.name || (supplierId ? `NCC #${supplierId}` : "—")}</div>
                        <div className="hint" style={{ marginTop: 2 }}>
                          {supplierPicked?.phone ? `SĐT: ${supplierPicked.phone}` : "Không bắt buộc."}
                        </div>
                      </div>
                    </div>

                    <div className="hint" style={{ marginTop: 10 }}>
                      Ghi chú
                    </div>
                    <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: Nhập từ NCC A" />

                    {tab === "rolls" ? (
                      <>
                        <div className="hint" style={{ marginTop: 10 }}>
                          Giá nhập / cuộn (tuỳ chọn)
                        </div>
                        <input className="input" value={rollCostPrice} onChange={(e) => setRollCostPrice(e.target.value)} placeholder="VD: 180000" />

                        <div className="hint" style={{ marginTop: 10 }}>
                          Vị trí/kệ (tuỳ chọn)
                        </div>
                        <select className="input" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                          <option value="">(Không chọn)</option>
                          {locations.map((l) => (
                            <option key={l.id} value={String(l.id)}>
                              {l.name}
                            </option>
                          ))}
                        </select>
                      </>
                    ) : null}
                  </div>
                </div>

                <div className="rcvActions">
                  <button
                    type="button"
                    className="btn"
                    disabled={busy || !picked || !Number.isFinite(qtyNum) || qtyNum <= 0}
                    onClick={() => {
                      const pw = window.open("", "_blank", "width=980,height=720")
                      printOnlyLabels({ printWindow: pw }).catch((e) => {
                        if (pw && !pw.closed) pw.close()
                        showErr(e)
                      })
                    }}
                  >
                    Chỉ in tem
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={busy || !picked || !Number.isFinite(qtyNum) || qtyNum <= 0}
                    onClick={() => receiveAndMaybePrint({ print: false }).catch(showErr)}
                  >
                    Nhập kho
                  </button>
                  <button
                    type="button"
                    className="btn btnPrimary"
                    disabled={busy || !picked || !Number.isFinite(qtyNum) || qtyNum <= 0}
                    onClick={() => {
                      const pw = window.open("", "_blank", "width=980,height=720")
                      receiveAndMaybePrint({ print: true, printWindow: pw }).catch((e) => {
                        if (pw && !pw.closed) pw.close()
                        showErr(e)
                      })
                    }}
                  >
                    Nhập & in tem
                  </button>
                </div>

                <div className="rcvFootHint">Lưu ý: tem barcode đang dùng ảnh từ dịch vụ `bwipjs-api` (cần internet).</div>
              </>
            )}
          </div>
        </div>
      </div>

      {showCreateCategory ? (
        <CreateCategoryModal
          busy={busy}
          onClose={() => setShowCreateCategory(false)}
          onCreated={(c) => {
            setCategories((prev) => [c, ...(prev || [])])
            setShowCreateCategory(false)
            showInfo("Đã tạo danh mục.")
          }}
          onError={showErr}
        />
      ) : null}

      {showCreateSupplier ? (
        <CreateSupplierModal
          busy={busy}
          onClose={() => setShowCreateSupplier(false)}
          onCreated={(s) => {
            setSupplierId(String(s.id))
            setSupplierPicked(s)
            setShowCreateSupplier(false)
            showInfo("Đã tạo nhà cung cấp.")
          }}
          onError={showErr}
        />
      ) : null}

      {showCreateProduct ? (
        <CreateProductModal
          busy={busy}
          categories={categories}
          locations={locations}
          suppliers={suppliers}
          existingVariants={variants}
          onClose={() => setShowCreateProduct(false)}
          onCreated={(v) => {
            if (!v) {
              setShowCreateProduct(false)
              return
            }
            setShowCreateProduct(false)
            setTab(v.track_stock_unit ? "rolls" : "normal")
            setPicked(v)
            setQ(v.name || "")
            doSearch(v.name || "").catch(() => {})
            showInfo("Đã tạo sản phẩm.")
          }}
        />
      ) : null}

      {supplierPickerOpen ? (
        <SupplierPickerModal
          onClose={() => setSupplierPickerOpen(false)}
          onPicked={(sup) => {
            setSupplierId(String(sup.id))
            setSupplierPicked(sup)
            setSupplierPickerOpen(false)
          }}
          onCreateNew={() => {
            setSupplierPickerOpen(false)
            setShowCreateSupplier(true)
          }}
        />
      ) : null}

      {toast ? (
        <div className={`toast ${toast.kind === "error" ? "toastErr" : ""}`}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontWeight: 700 }}>{toast.kind === "error" ? "Lỗi" : "Thông báo"}</div>
            <button className="btn" onClick={() => setToast(null)} style={{ padding: "6px 10px" }}>
              Đóng
            </button>
          </div>
          <div style={{ marginTop: 8, color: toast.kind === "error" ? "var(--danger)" : "var(--muted)" }}>{toast.message}</div>
        </div>
      ) : null}
    </div>
  )
}
