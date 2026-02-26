import { useEffect, useRef, useState } from "react"
import { post } from "../api"
import Modal from "./Modal"

function parseAttrValues(text) {
  return String(text || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

function splitInlineAttrName(rawName, rawValues) {
  let name = String(rawName || "").trim()
  let values = String(rawValues || "").trim()

  const sepIdx = name.search(/[:=]/)
  if (sepIdx >= 0) {
    const left = name.slice(0, sepIdx).trim()
    const right = name.slice(sepIdx + 1).trim()
    if (!values && right) values = right
    name = left
  }
  return { name, values }
}

function cartesian(defs) {
  if (!defs.length) return []
  let acc = [[]]
  for (const def of defs) {
    const next = []
    for (const arr of acc) {
      for (const val of def.values) {
        next.push([...arr, { name: def.name, value: val }])
      }
    }
    acc = next
  }
  return acc
}

function cleanBarcodeBase(text) {
  return String(text || "SP")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 12)
}

function genBarcodeFromText(text) {
  const base = cleanBarcodeBase(text)
  const rnd = Math.random().toString(16).slice(2, 8).toUpperCase()
  return `BC-${base}-${rnd}`
}

function makeVariantRow(patch = {}) {
  return {
    id: `v_${Math.random().toString(16).slice(2)}`,
    key: "",
    attrs: null,
    name: "",
    sku: "",
    barcode: "",
    uom: "pcs",
    price: "",
    image_file: null,
    image_url: "",
    roll_price: "",
    ...patch,
  }
}

function buildRowsFromAttributes({ parentName, attrDefs, prevRows, defaultUom }) {
  const combos = cartesian(attrDefs)
  const prevByKey = new Map((prevRows || []).map((r) => [r.key, r]))
  return combos.map((combo) => {
    const key = combo.map((x) => `${x.name}:${x.value}`).join("|")
    const attrs = Object.fromEntries(combo.map((x) => [x.name, x.value]))
    const label = combo.map((x) => x.value).join(" / ")
    const existed = prevByKey.get(key)
    if (existed) return { ...existed, attrs, key, uom: existed.uom || defaultUom || "pcs" }
    return makeVariantRow({
      key,
      attrs,
      name: `${parentName || "Biến thể"} - ${label}`,
      uom: defaultUom || "pcs",
    })
  })
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onerror = () => reject(new Error("Không đọc được file ảnh"))
    r.onload = () => resolve(String(r.result || ""))
    r.readAsDataURL(file)
  })
}

async function uploadImage(file) {
  const data_url = await readAsDataURL(file)
  const r = await post("/api/v1/uploads/images", {
    data_url,
    filename: file.name,
    content_type: file.type || null,
  })
  if (!r?.url) throw new Error("Upload ảnh thất bại")
  return r.url
}

function ImageDropzone({ file, disabled, onPick }) {
  const inputRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)

  function pickFile(f) {
    if (!f) return
    onPick?.(f)
  }

  return (
    <div>
      <div
        className={`prdDropzone ${dragOver ? "prdDropzoneActive" : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return
          inputRef.current?.click()
        }}
        onDragEnter={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (disabled) return
          setDragOver(true)
        }}
        onDragOver={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (disabled) return
          setDragOver(true)
        }}
        onDragLeave={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setDragOver(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setDragOver(false)
          if (disabled) return
          const f = e.dataTransfer?.files && e.dataTransfer.files[0] ? e.dataTransfer.files[0] : null
          pickFile(f)
        }}
        aria-disabled={disabled ? "true" : "false"}
      >
        <div className="prdDropTitle">Kéo thả ảnh vào đây</div>
        <div className="prdDropSub">hoặc bấm để chọn file (jpg/png/webp)</div>
        {file ? <div className="prdDropFile">Đã chọn: {file.name}</div> : null}
      </div>
      <input
        ref={inputRef}
        className="prdFileHidden"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files && e.target.files[0] ? e.target.files[0] : null
          e.target.value = ""
          pickFile(f)
        }}
      />
    </div>
  )
}

export default function ProductCreateModal({ busy, categories, locations, suppliers, onClose, onCreated }) {
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  const [categoryOptions, setCategoryOptions] = useState(() => (Array.isArray(categories) ? categories : []))
  const [supplierOptions, setSupplierOptions] = useState(() => (Array.isArray(suppliers) ? suppliers : []))

  const [showNewCategory, setShowNewCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState("")
  const [newCategoryDescription, setNewCategoryDescription] = useState("")
  const [newCategoryImageUrl, setNewCategoryImageUrl] = useState("")
  const [creatingCategory, setCreatingCategory] = useState(false)

  const [showNewSupplier, setShowNewSupplier] = useState(false)
  const [newSupplierName, setNewSupplierName] = useState("")
  const [newSupplierPhone, setNewSupplierPhone] = useState("")
  const [newSupplierCode, setNewSupplierCode] = useState("")
  const [newSupplierAddress, setNewSupplierAddress] = useState("")
  const [creatingSupplier, setCreatingSupplier] = useState(false)

  const [hasVariants, setHasVariants] = useState(false)
  const [activeTab, setActiveTab] = useState("basic")

  const [categoryId, setCategoryId] = useState("")
  const [supplierId, setSupplierId] = useState("")
  const [parentName, setParentName] = useState("")
  const [parentDesc, setParentDesc] = useState("")

  const [trackStockUnit, setTrackStockUnit] = useState(false)
  const [commonUom, setCommonUom] = useState("pcs")
  const [commonMetersPerRoll, setCommonMetersPerRoll] = useState("30")

  const [singleRow, setSingleRow] = useState(() => makeVariantRow({ uom: "pcs" }))
  const [attrDefs, setAttrDefs] = useState(() => [{ id: "a_1", name: "", valuesText: "" }])
  const [variantRows, setVariantRows] = useState([])

  useEffect(() => {
    setCategoryOptions(Array.isArray(categories) ? categories : [])
  }, [categories])

  useEffect(() => {
    setSupplierOptions(Array.isArray(suppliers) ? suppliers : [])
  }, [suppliers])

  useEffect(() => {
    if (trackStockUnit) {
      setCommonUom((v) => (String(v || "").trim() ? v : "m"))
      setSingleRow((prev) => ({ ...prev, uom: prev.uom || "m" }))
      setVariantRows((prev) => prev.map((r) => ({ ...r, uom: r.uom || "m" })))
    } else {
      setCommonUom((v) => (String(v || "").trim() ? v : "pcs"))
      setSingleRow((prev) => ({ ...prev, uom: prev.uom || "pcs" }))
      setVariantRows((prev) => prev.map((r) => ({ ...r, uom: r.uom || "pcs" })))
    }
  }, [trackStockUnit])

  function normalizeUom() {
    const u = String(commonUom || "").trim()
    if (u) return u
    return trackStockUnit ? "m" : "pcs"
  }

  function getBaseProductName() {
    const parent = String(parentName || "").trim()
    const single = String(singleRow.name || "").trim()
    if (hasVariants) return parent
    return single || parent
  }

  function setAttrDef(id, patch) {
    setAttrDefs((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  }

  function addAttrDef() {
    setAttrDefs((prev) => [...prev, { id: `a_${Math.random().toString(16).slice(2)}`, name: "", valuesText: "" }])
  }

  function removeAttrDef(id) {
    setAttrDefs((prev) => (prev.length <= 1 ? prev : prev.filter((x) => x.id !== id)))
  }

  function setVariantRow(id, patch) {
    setVariantRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  function generateRows() {
    const grouped = new Map()

    for (const a of attrDefs) {
      const parsed = splitInlineAttrName(a.name, a.valuesText)
      const attrName = parsed.name
      const values = parseAttrValues(parsed.values)
      if (!attrName || !values.length) continue

      const mapKey = attrName.toLowerCase()
      let found = grouped.get(mapKey)
      if (!found) {
        found = { name: attrName, seen: new Set(), values: [] }
        grouped.set(mapKey, found)
      }
      for (const v of values) {
        const key = v.toLowerCase()
        if (found.seen.has(key)) continue
        found.seen.add(key)
        found.values.push(v)
      }
    }

    const defs = Array.from(grouped.values()).map((x) => ({ name: x.name, values: x.values }))
    if (!defs.length) throw new Error("Cần ít nhất 1 thuộc tính có tên và giá trị.")

    const nextRows = buildRowsFromAttributes({
      parentName: String(parentName || singleRow.name || "").trim(),
      attrDefs: defs,
      prevRows: variantRows,
      defaultUom: commonUom,
    })
    if (!nextRows.length) throw new Error("Không tạo được dòng biến thể.")

    setVariantRows(nextRows)
    setAttrDefs([{ id: `a_${Math.random().toString(16).slice(2)}`, name: "", valuesText: "" }])
    setActiveTab("variants")
  }

  function validateCommon() {
    const baseName = getBaseProductName()
    if (!baseName) throw new Error(hasVariants ? "Tên sản phẩm cha là bắt buộc." : "Tên sản phẩm là bắt buộc.")
    if (trackStockUnit) {
      const mpr = Number(commonMetersPerRoll)
      if (!Number.isFinite(mpr) || mpr <= 0) throw new Error("Mét/cuộn phải > 0.")
    }
  }

  function validateRow(row, label = "Biến thể") {
    if (!String(row.name || "").trim()) throw new Error(`${label}: Tên biến thể là bắt buộc.`)
    const price = Number(row.price)
    if (!Number.isFinite(price) || price < 0) throw new Error(`${label}: Giá không hợp lệ.`)

    if (trackStockUnit && String(row.roll_price || "").trim()) {
      const rp = Number(row.roll_price)
      if (!Number.isFinite(rp) || rp < 0) throw new Error(`${label}: Giá cuộn không hợp lệ.`)
    }
  }

  async function createVariantUnderParent(row, parent) {
    validateRow(row, String(row.name || "Biến thể"))
    let imageUrl = String(row.image_url || "").trim() || null
    if (!imageUrl && row.image_file) imageUrl = await uploadImage(row.image_file)
    let barcode = String(row.barcode || "").trim() || null
    if (!trackStockUnit && !barcode) barcode = genBarcodeFromText(row.sku || row.name || parent.name)
    const attrsPayload = row.attrs && typeof row.attrs === "object" ? { ...row.attrs } : {}
    if (trackStockUnit) attrsPayload.meters_per_roll = Number(commonMetersPerRoll)

    await post(`/api/v1/products/parents/${parent.id}/variants`, {
      name: String(row.name || "").trim(),
      description: String(parentDesc || "").trim() ? String(parentDesc || "").trim() : null,
      category_id: null,
      uom: normalizeUom(),
      price: String(Number(row.price)),
      roll_price: trackStockUnit && String(row.roll_price || "").trim() ? String(Number(row.roll_price)) : null,
      stock: "0",
      sku: String(row.sku || "").trim() ? String(row.sku || "").trim() : null,
      barcode,
      image_url: imageUrl,
      attrs: Object.keys(attrsPayload).length ? attrsPayload : null,
      track_stock_unit: !!trackStockUnit,
      is_active: true,
    })
  }

  async function createStandaloneVariant(row, baseProductName) {
    validateRow(row, String(row.name || "Sản phẩm"))
    let imageUrl = String(row.image_url || "").trim() || null
    if (!imageUrl && row.image_file) imageUrl = await uploadImage(row.image_file)
    let barcode = String(row.barcode || "").trim() || null
    if (!trackStockUnit && !barcode) barcode = genBarcodeFromText(row.sku || row.name || baseProductName)
    const attrsPayload = row.attrs && typeof row.attrs === "object" ? { ...row.attrs } : {}
    attrsPayload._single_product = true
    if (trackStockUnit) attrsPayload.meters_per_roll = Number(commonMetersPerRoll)

    await post("/api/v1/products/variants", {
      name: String(row.name || "").trim() || baseProductName,
      description: String(parentDesc || "").trim() ? String(parentDesc || "").trim() : null,
      category_id: categoryId ? Number(categoryId) : null,
      uom: normalizeUom(),
      price: String(Number(row.price)),
      roll_price: trackStockUnit && String(row.roll_price || "").trim() ? String(Number(row.roll_price)) : null,
      stock: "0",
      sku: String(row.sku || "").trim() ? String(row.sku || "").trim() : null,
      barcode,
      image_url: imageUrl,
      attrs: Object.keys(attrsPayload).length ? attrsPayload : null,
      track_stock_unit: !!trackStockUnit,
      is_active: true,
    })
  }

  async function save() {
    setErr(null)
    validateCommon()
    if (hasVariants && !variantRows.length) throw new Error("Bạn đã bật biến thể nhưng chưa có dòng nào.")

    setSaving(true)
    try {
      const baseProductName = getBaseProductName()
      if (hasVariants) {
        const parent = await post("/api/v1/products/parents", {
          name: baseProductName,
          description: String(parentDesc || "").trim() ? String(parentDesc || "").trim() : null,
          image_url: null,
          category_id: categoryId ? Number(categoryId) : null,
        })
        for (const row of variantRows) await createVariantUnderParent(row, parent)
      } else {
        const row = { ...singleRow, name: String(singleRow.name || "").trim() || baseProductName }
        await createStandaloneVariant(row, baseProductName)
      }
      onCreated?.()
    } finally {
      setSaving(false)
    }
  }

  async function createCategoryInline() {
    setErr(null)
    const n = String(newCategoryName || "").trim()
    if (!n) {
      setErr("Tên danh mục là bắt buộc.")
      return
    }

    setCreatingCategory(true)
    try {
      const c = await post("/api/v1/categories/", {
        name: n,
        description: String(newCategoryDescription || "").trim() ? String(newCategoryDescription || "").trim() : null,
        image_url: String(newCategoryImageUrl || "").trim() ? String(newCategoryImageUrl || "").trim() : null,
      })
      setCategoryOptions((prev) => [c, ...(prev || []).filter((x) => x.id !== c.id)])
      setCategoryId(String(c.id))
      setShowNewCategory(false)
      setNewCategoryName("")
      setNewCategoryDescription("")
      setNewCategoryImageUrl("")
    } catch (e) {
      setErr(e?.message || "Không tạo được danh mục.")
    } finally {
      setCreatingCategory(false)
    }
  }

  async function createSupplierInline() {
    setErr(null)
    const n = String(newSupplierName || "").trim()
    if (!n) {
      setErr("Tên nhà cung cấp là bắt buộc.")
      return
    }

    setCreatingSupplier(true)
    try {
      const s = await post("/api/v1/suppliers/", {
        code: String(newSupplierCode || "").trim() ? String(newSupplierCode || "").trim() : null,
        name: n,
        phone: String(newSupplierPhone || "").trim() ? String(newSupplierPhone || "").trim() : null,
        address: String(newSupplierAddress || "").trim() ? String(newSupplierAddress || "").trim() : null,
        is_active: true,
      })
      setSupplierOptions((prev) => [s, ...(prev || []).filter((x) => x.id !== s.id)])
      setSupplierId(String(s.id))
      setShowNewSupplier(false)
      setNewSupplierName("")
      setNewSupplierPhone("")
      setNewSupplierCode("")
      setNewSupplierAddress("")
    } catch (e) {
      setErr(e?.message || "Không tạo được nhà cung cấp.")
    } finally {
      setCreatingSupplier(false)
    }
  }

  return (
    <Modal
      xwide
      title="Tạo sản phẩm"
      onClose={onClose}
      footer={
        <>
          <button className="admBtn" disabled={busy || saving} onClick={onClose}>
            Huỷ
          </button>
          <button
            className="admBtn admBtnPrimary"
            disabled={busy || saving}
            onClick={() => save().catch((e) => setErr(e?.message || "Không tạo được sản phẩm."))}
          >
            Tạo sản phẩm
          </button>
        </>
      }
    >
      {err ? <div className="admErr">{err}</div> : null}

      <div className="prdTabBar">
        <button type="button" className={`prdTabBtn ${activeTab === "basic" ? "prdTabBtnActive" : ""}`} onClick={() => setActiveTab("basic")}>
          Thông tin chung
        </button>
        {hasVariants ? (
          <button type="button" className={`prdTabBtn ${activeTab === "variants" ? "prdTabBtnActive" : ""}`} onClick={() => setActiveTab("variants")}>
            Biến thể
          </button>
        ) : null}
      </div>

      {activeTab === "basic" ? (
        <>
          <div className="prdSection">
            <div className="prdSectionTitle">{hasVariants ? "Sản phẩm cha (Parent)" : "Thông tin sản phẩm"}</div>
            <div className="prdGrid2">
              <div>
                <div className="admLabel">{hasVariants ? "Tên sản phẩm cha" : "Tên sản phẩm"}</div>
                {hasVariants ? (
                  <input className="admInput" value={parentName} onChange={(e) => setParentName(e.target.value)} placeholder="VD: Lưới nylon 1m2" />
                ) : (
                  <input className="admInput" value={singleRow.name} onChange={(e) => setSingleRow((p) => ({ ...p, name: e.target.value }))} placeholder="VD: Lưới nylon xanh 1m2" />
                )}
              </div>
              <div>
                <div className="admLabel">Danh mục</div>
                <div className="prdInlineSelectRow">
                  <select className="admSelect" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                    <option value="">(Không chọn)</option>
                    {categoryOptions.map((c) => (
                      <option key={c.id} value={String(c.id)}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="admBtn prdInlineActionBtn"
                    disabled={busy || saving || creatingCategory}
                    onClick={() => setShowNewCategory((v) => !v)}
                  >
                    + Danh mục
                  </button>
                </div>
              </div>
            </div>
            {showNewCategory ? (
              <div className="prdInlineCreate">
                <div className="prdGrid3">
                  <div>
                    <div className="admLabel">Tên danh mục</div>
                    <input className="admInput" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder="VD: Lưới / Khoá / Túi..." />
                  </div>
                  <div>
                    <div className="admLabel">Mô tả</div>
                    <input className="admInput" value={newCategoryDescription} onChange={(e) => setNewCategoryDescription(e.target.value)} placeholder="..." />
                  </div>
                  <div>
                    <div className="admLabel">Ảnh URL (tuỳ chọn)</div>
                    <input className="admInput" value={newCategoryImageUrl} onChange={(e) => setNewCategoryImageUrl(e.target.value)} placeholder="https://..." />
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
                  <button type="button" className="admBtn" disabled={busy || saving || creatingCategory} onClick={() => setShowNewCategory(false)}>
                    Huỷ
                  </button>
                  <button type="button" className="admBtn admBtnPrimary" disabled={busy || saving || creatingCategory} onClick={() => createCategoryInline()}>
                    {creatingCategory ? "Đang tạo..." : "Tạo danh mục"}
                  </button>
                </div>
              </div>
            ) : null}
            <div>
              <div className="admLabel">Mô tả</div>
              <input className="admInput" value={parentDesc} onChange={(e) => setParentDesc(e.target.value)} placeholder="..." />
            </div>
          </div>

          <div className="prdSection">
            <div className="prdSectionTitle">Thiết lập bán hàng</div>
            <div className="prdGrid3">
              <div>
                <div className="admLabel">Đơn vị mặc định</div>
                <input className="admInput" value={commonUom} onChange={(e) => setCommonUom(e.target.value)} placeholder="pcs / m / kg..." />
              </div>
              <div>
                <div className="admLabel">Nhà cung cấp (tuỳ chọn)</div>
                <div className="prdInlineSelectRow">
                  <select className="admSelect" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                    <option value="">(Không chọn)</option>
                    {supplierOptions.map((s) => (
                      <option key={s.id} value={String(s.id)}>
                        {s.name} {s.phone ? `· ${s.phone}` : ""}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="admBtn prdInlineActionBtn"
                    disabled={busy || saving || creatingSupplier}
                    onClick={() => setShowNewSupplier((v) => !v)}
                  >
                    + Nhà cung cấp
                  </button>
                </div>
              </div>
              <div>
                <div className="admLabel">Có biến thể?</div>
                <label className="prdToggleRow">
                  <input
                    type="checkbox"
                    checked={hasVariants}
                    onChange={(e) => {
                      const next = !!e.target.checked
                      setHasVariants(next)
                      if (next) {
                        if (!String(parentName || "").trim()) setParentName(String(singleRow.name || "").trim())
                        setActiveTab("variants")
                      } else {
                        if (!String(singleRow.name || "").trim() && String(parentName || "").trim()) {
                          setSingleRow((p) => ({ ...p, name: String(parentName || "").trim() }))
                        }
                        setActiveTab("basic")
                      }
                    }}
                  />
                  <span>{hasVariants ? "Có, sản phẩm nhiều biến thể" : "Không, chỉ 1 biến thể duy nhất"}</span>
                </label>
              </div>
            </div>
            {showNewSupplier ? (
              <div className="prdInlineCreate">
                <div className="prdGrid3">
                  <div>
                    <div className="admLabel">Tên nhà cung cấp</div>
                    <input className="admInput" value={newSupplierName} onChange={(e) => setNewSupplierName(e.target.value)} placeholder="VD: Kim khí A" />
                  </div>
                  <div>
                    <div className="admLabel">SĐT (tuỳ chọn)</div>
                    <input className="admInput" value={newSupplierPhone} onChange={(e) => setNewSupplierPhone(e.target.value)} placeholder="09..." />
                  </div>
                  <div>
                    <div className="admLabel">Mã NCC (tuỳ chọn)</div>
                    <input className="admInput" value={newSupplierCode} onChange={(e) => setNewSupplierCode(e.target.value)} placeholder="NCC-001" />
                  </div>
                </div>
                <div style={{ marginTop: 10 }}>
                  <div className="admLabel">Địa chỉ (tuỳ chọn)</div>
                  <input className="admInput" value={newSupplierAddress} onChange={(e) => setNewSupplierAddress(e.target.value)} placeholder="..." />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
                  <button type="button" className="admBtn" disabled={busy || saving || creatingSupplier} onClick={() => setShowNewSupplier(false)}>
                    Huỷ
                  </button>
                  <button type="button" className="admBtn admBtnPrimary" disabled={busy || saving || creatingSupplier} onClick={() => createSupplierInline()}>
                    {creatingSupplier ? "Đang tạo..." : "Tạo NCC"}
                  </button>
                </div>
              </div>
            ) : null}

            <div className="prdToggleRow" style={{ marginTop: 10 }}>
              <input type="checkbox" checked={trackStockUnit} onChange={(e) => setTrackStockUnit(!!e.target.checked)} />
              <span>{trackStockUnit ? "Bán theo cuộn (dùng stock_unit)" : "Hàng thường"}</span>
            </div>

            {trackStockUnit ? (
              <div className="prdGrid2" style={{ marginTop: 10 }}>
                <div>
                  <div className="admLabel">Mét/cuộn</div>
                  <input className="admInput" value={commonMetersPerRoll} onChange={(e) => setCommonMetersPerRoll(e.target.value)} placeholder="VD: 30" />
                </div>
                <div />
              </div>
            ) : null}
          </div>

          {!hasVariants ? (
            <div className="prdSection">
              <div className="prdSectionTitle">Thông tin bán hàng</div>
              <div className="prdSingleCard">
                <div className="prdGrid2">
                  <div>
                    <div className="admLabel">SKU</div>
                    <input className="admInput" value={singleRow.sku} onChange={(e) => setSingleRow((p) => ({ ...p, sku: e.target.value }))} placeholder="..." />
                  </div>
                  <div>
                    <div className="admLabel">Barcode</div>
                    <input
                      className="admInput"
                      value={singleRow.barcode}
                      onChange={(e) => setSingleRow((p) => ({ ...p, barcode: e.target.value }))}
                      placeholder={trackStockUnit ? "(tuỳ chọn)" : "để trống sẽ tự tạo"}
                    />
                  </div>
                </div>

                <div className="prdGrid2" style={{ marginTop: 10 }}>
                  <div>
                    <div className="admLabel">Giá</div>
                    <input className="admInput" value={singleRow.price} onChange={(e) => setSingleRow((p) => ({ ...p, price: e.target.value }))} placeholder="VD: 35000" />
                  </div>
                  {trackStockUnit ? (
                    <div>
                      <div className="admLabel">Giá cuộn (tuỳ chọn)</div>
                      <input className="admInput" value={singleRow.roll_price} onChange={(e) => setSingleRow((p) => ({ ...p, roll_price: e.target.value }))} placeholder="VD: 240000" />
                    </div>
                  ) : (
                    <div />
                  )}
                </div>

                <div className="prdGrid2" style={{ marginTop: 10 }}>
                  <div>
                    <div className="admLabel">Ảnh sản phẩm</div>
                    <ImageDropzone
                      disabled={busy || saving}
                      file={singleRow.image_file}
                      onPick={(f) => setSingleRow((p) => ({ ...p, image_file: f }))}
                    />
                  </div>
                  <div>
                    <div className="admLabel">Ảnh URL (tuỳ chọn)</div>
                    <input className="admInput" value={singleRow.image_url} onChange={(e) => setSingleRow((p) => ({ ...p, image_url: e.target.value }))} placeholder="https://..." />
                  </div>
                </div>

              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {hasVariants && activeTab === "variants" ? (
        <>
          <div className="prdSection">
            <div className="prdSectionTitle">Thuộc tính biến thể</div>
            <div className="admLabel">Ví dụ: Màu = đỏ, xanh · Size = S, M. Có thể nhập nhanh kiểu "Màu: đỏ".</div>
            <div className="prdAttrsList">
              {attrDefs.map((a) => (
                <div className="prdAttrRow" key={a.id}>
                  <input className="admInput" value={a.name} onChange={(e) => setAttrDef(a.id, { name: e.target.value })} placeholder="Tên thuộc tính (VD: Màu)" />
                  <input className="admInput" value={a.valuesText} onChange={(e) => setAttrDef(a.id, { valuesText: e.target.value })} placeholder="Giá trị (VD: đỏ, xanh)" />
                  <button type="button" className="admBtn admBtnDanger" disabled={attrDefs.length <= 1} onClick={() => removeAttrDef(a.id)}>
                    Xoá
                  </button>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
              <button type="button" className="admBtn" onClick={addAttrDef}>
                + Thêm thuộc tính
              </button>
              <button
                type="button"
                className="admBtn admBtnPrimary"
                onClick={() => {
                  try {
                    generateRows()
                  } catch (e) {
                    setErr(e?.message || "Không tạo được dòng biến thể.")
                  }
                }}
              >
                Tạo dòng biến thể
              </button>
            </div>
          </div>

          <div className="prdSection">
            <div className="prdSectionTitle">Danh sách biến thể ({variantRows.length})</div>
            {!variantRows.length ? <div className="admLabel">Chưa có dòng. Hãy bấm "Tạo dòng biến thể".</div> : null}
            <div className="prdRowList">
              {variantRows.map((row, idx) => (
                <div className="prdRowCard" key={row.id}>
                  <div className="prdRowHead">
                    <div className="prdRowTitle">Biến thể #{idx + 1}</div>
                    <div className="prdRowMeta">{Object.entries(row.attrs || {}).map(([k, v]) => `${k}: ${v}`).join(" | ") || "Không có thuộc tính"}</div>
                  </div>

                  <div className="prdRowGridTop">
                    <div>
                      <div className="admLabel">Tên biến thể</div>
                      <input className="admInput" value={row.name} onChange={(e) => setVariantRow(row.id, { name: e.target.value })} placeholder="Tên biến thể" />
                    </div>
                    <div>
                      <div className="admLabel">SKU</div>
                      <input className="admInput" value={row.sku} onChange={(e) => setVariantRow(row.id, { sku: e.target.value })} placeholder="..." />
                    </div>
                    <div>
                      <div className="admLabel">Barcode</div>
                      <input className="admInput" value={row.barcode} onChange={(e) => setVariantRow(row.id, { barcode: e.target.value })} placeholder={trackStockUnit ? "(tuỳ chọn)" : "để trống sẽ tự tạo"} />
                    </div>
                  </div>

                  <div className="prdRowGridBottom">
                    <div>
                      <div className="admLabel">Giá</div>
                      <input className="admInput" value={row.price} onChange={(e) => setVariantRow(row.id, { price: e.target.value })} placeholder="VD: 35000" />
                    </div>
                    {trackStockUnit ? (
                      <div>
                        <div className="admLabel">Giá cuộn (tuỳ chọn)</div>
                        <input className="admInput" value={row.roll_price || ""} onChange={(e) => setVariantRow(row.id, { roll_price: e.target.value })} placeholder="VD: 240000" />
                      </div>
                    ) : (
                      <div />
                    )}
                    <div />
                  </div>

                  <div className="prdRowGridBottom">
                    <div>
                      <div className="admLabel">Ảnh sản phẩm</div>
                      <ImageDropzone
                        disabled={busy || saving}
                        file={row.image_file}
                        onPick={(f) => setVariantRow(row.id, { image_file: f })}
                      />
                    </div>
                    <div>
                      <div className="admLabel">Ảnh URL (tuỳ chọn)</div>
                      <input className="admInput" value={row.image_url || ""} onChange={(e) => setVariantRow(row.id, { image_url: e.target.value })} placeholder="https://..." />
                    </div>
                    <div />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </Modal>
  )
}
