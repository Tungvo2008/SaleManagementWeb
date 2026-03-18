import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { get, patch, post } from "../api"
import { loadBarcodeTemplate, normalizeBarcodeTemplate } from "./barcodeTemplate"
import FieldLabel from "../ui/FieldLabel"
import { formatMoneyVN } from "../utils/number"
import "./receive.css"
import "../pos/pos.css"

function asNum(v) {
  const n = typeof v === "string" ? Number(v) : Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

function fmtMoney(v) {
  return formatMoneyVN(v)
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

function normalizeSku(value) {
  return String(value || "").trim()
}

function openPrintLabels({ title, labels, printWindow = null }) {
  const w = printWindow || window.open("", "_blank", "width=980,height=720")
  if (!w) return
  const cfg = normalizeBarcodeTemplate(loadBarcodeTemplate())
  const isThermal = cfg.printMode === "thermal"

  const safeTitle = String(title || cfg.title || "In mã vạch").replaceAll("<", "").replaceAll(">", "")
  const pageSize = cfg.paperSize === "a4_landscape" ? "A4 landscape" : "A4 portrait"
  const pageSizeCss = isThermal ? `${cfg.labelWidthMm}mm ${cfg.labelHeightMm}mm` : pageSize
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${safeTitle}</title>
  <style>
    body{ font-family: Arial, "Helvetica Neue", Helvetica, sans-serif; margin: 0; color:#111827; }
    .wrap{ padding: ${isThermal ? "0" : `${cfg.pageMarginMm}mm`}; }
    .top{ display:flex; justify-content: space-between; gap: 10px; align-items: baseline; margin-bottom: 8mm; }
    .h1{ font-weight: 700; font-size: 16px; }
    .muted{ color:#6b7280; font-size: 12px; }
    .grid{ display:grid; grid-template-columns: repeat(${isThermal ? 1 : cfg.columns}, ${cfg.labelWidthMm}mm); gap: ${isThermal ? 0 : cfg.gapMm}mm; justify-content: start; }
    .lb{ box-sizing: border-box; border: ${isThermal ? "none" : "1px dashed rgba(17,24,39,.25)"}; border-radius: ${isThermal ? "0" : "2mm"}; padding: ${isThermal ? "1.2mm" : "1.8mm"}; width:${cfg.labelWidthMm}mm; height:${cfg.labelHeightMm}mm; display:grid; grid-template-rows: auto auto 1fr; overflow:hidden; }
    .name{ font-size: 12px; font-weight: 700; line-height: 1.15; max-height: 28px; overflow:hidden; }
    .price{ margin-top: 1mm; font-size: 11px; color:#111827; font-weight: 700; }
    .code{ font-size: 11px; color:#6b7280; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; overflow:hidden; text-overflow: ellipsis; white-space: nowrap; }
    .img{ margin-top: 1mm; display:flex; justify-content:center; align-items:center; height: ${cfg.barcodeHeightMm + 4}mm; }
    img{ max-width: 100%; max-height: ${cfg.barcodeHeightMm + 2}mm; object-fit: contain; }
    @page{ size: ${pageSizeCss}; margin: 0; }
    @media print{
      .top{ display:none; }
      .wrap{ padding: ${isThermal ? "0" : `${cfg.pageMarginMm}mm`}; }
      ${isThermal ? ".grid{display:block;} .lb{page-break-after:always; break-after:page; margin:0;} .lb:last-child{page-break-after:auto; break-after:auto;}" : ""}
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <div class="h1">${safeTitle}</div>
      <div class="muted">Gợi ý: chỉnh Scale trong hộp thoại in nếu tem quá nhỏ/lớn.</div>
    </div>
    <div class="grid">
      ${labels
        .map((lb) => {
          const code = String(lb.code || "")
          const img = code
            ? `https://bwipjs-api.metafloor.com/?bcid=code128&text=${encodeURIComponent(code)}&scale=${cfg.barcodeScale}&height=${cfg.barcodeHeightMm}&includetext=true`
            : ""
          const name = String(lb.name || "")
          const price = lb.price != null ? formatMoneyVN(lb.price) : ""
          return `
            <div class="lb">
              <div class="name">${name.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</div>
              <div class="price">${price ? `${price}đ` : ""}</div>
              <div class="img">${img ? `<img alt="${code}" src="${img}"/>` : `<div class="code">${code}</div>`}</div>
            </div>
          `
        })
        .join("")}
    </div>
    <script>
      (function () {
        var imgs = Array.prototype.slice.call(document.images || []);
        function doPrint() {
          try { window.print(); } catch (_) {}
        }
        if (!imgs.length) {
          setTimeout(doPrint, 60);
          return;
        }
        var done = 0;
        var fired = false;
        function finish() {
          done += 1;
          if (fired) return;
          if (done >= imgs.length) {
            fired = true;
            setTimeout(doPrint, 60);
          }
        }
        imgs.forEach(function (img) {
          if (img.complete) {
            finish();
            return;
          }
          img.addEventListener("load", finish, { once: true });
          img.addEventListener("error", finish, { once: true });
        });
        setTimeout(function () {
          if (fired) return;
          fired = true;
          doPrint();
        }, 2500);
      })();
    </script>
  </div>
</body>
</html>`
  try {
    w.document.open()
    w.document.write(html)
    w.document.close()
    w.focus()
  } catch {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    window.open(url, "_blank")
  }
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
    if (existed) {
      return { ...existed, attrs, key, uom: existed.uom || defaultUom || "pcs" }
    }
    return makeVariantRow({
      key,
      attrs,
      name: `${parentName || "Biến thể"} - ${label}`,
      uom: defaultUom || "pcs",
    })
  })
}

function CreateProductModal({
  busy,
  categories,
  locations,
  supplierId,
  supplierPicked,
  onPickSupplier,
  onClearSupplier,
  onCategoryCreated,
  onClose,
  onCreated,
  onError,
}) {
  const [saving, setSaving] = useState(false)
  const [categoryOptions, setCategoryOptions] = useState(() => (Array.isArray(categories) ? categories : []))

  const [hasVariants, setHasVariants] = useState(false)
  const [activeTab, setActiveTab] = useState("basic")

  const [categoryId, setCategoryId] = useState("")
  const [showNewCategory, setShowNewCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState("")
  const [newCategoryDescription, setNewCategoryDescription] = useState("")
  const [newCategoryImageUrl, setNewCategoryImageUrl] = useState("")
  const [creatingCategory, setCreatingCategory] = useState(false)
  const [parentName, setParentName] = useState("")
  const [parentDesc, setParentDesc] = useState("")

  const [trackStockUnit, setTrackStockUnit] = useState(false)
  const [commonUom, setCommonUom] = useState("pcs")
  const [commonMetersPerRoll, setCommonMetersPerRoll] = useState("30")

  const [singleRow, setSingleRow] = useState(() => makeVariantRow({ uom: "pcs" }))

  const [attrDefs, setAttrDefs] = useState(() => [
    { id: "a1", name: "Màu", valuesText: "" },
    { id: "a2", name: "Size", valuesText: "" },
  ])
  const [variantRows, setVariantRows] = useState([])

  useEffect(() => {
    setCategoryOptions(Array.isArray(categories) ? categories : [])
  }, [categories])

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
        const valKey = v.toLowerCase()
        if (found.seen.has(valKey)) continue
        found.seen.add(valKey)
        found.values.push(v)
      }
    }

    const defs = Array.from(grouped.values()).map((x) => ({ name: x.name, values: x.values }))

    if (!defs.length) {
      throw new Error("Cần ít nhất 1 thuộc tính có tên và giá trị (ví dụ: Màu = đỏ,xanh).")
    }

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

  function readAsDataURL(f) {
    return new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onerror = () => reject(new Error("Không đọc được file"))
      r.onload = () => resolve(String(r.result || ""))
      r.readAsDataURL(f)
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
    const cameraRef = useRef(null)
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
          <div className="prdDropSub">hoặc bấm để chọn file (trên điện thoại bạn có thể chụp ảnh)</div>
          {file ? <div className="prdDropFile">Đã chọn: {file.name}</div> : null}
        </div>

        <div className="prdDropBtns">
          <button type="button" className="btn" disabled={disabled} onClick={() => cameraRef.current?.click()}>
            Chụp ảnh
          </button>
          <button type="button" className="btn" disabled={disabled} onClick={() => inputRef.current?.click()}>
            Chọn ảnh
          </button>
        </div>

        <input
          ref={inputRef}
          className="prdFileHidden"
          type="file"
          accept="image/*"
          disabled={disabled}
          onChange={(e) => {
            const f = e.target.files && e.target.files[0] ? e.target.files[0] : null
            e.target.value = ""
            pickFile(f)
          }}
        />
        <input
          ref={cameraRef}
          className="prdFileHidden"
          type="file"
          accept="image/*"
          capture="environment"
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

  function normalizeUom() {
    return String(commonUom || "").trim()
  }

  function getBaseProductName() {
    const parent = String(parentName || "").trim()
    const single = String(singleRow.name || "").trim()
    if (hasVariants) return parent
    return single || parent
  }

  function validateCommon() {
    const baseName = getBaseProductName()
    if (!baseName) {
      throw new Error(hasVariants ? "Tên sản phẩm cha (parent) là bắt buộc." : "Tên sản phẩm là bắt buộc.")
    }
    if (!normalizeUom()) throw new Error("Đơn vị là bắt buộc.")
    if (trackStockUnit) {
      const mpr = Number(commonMetersPerRoll)
      if (!Number.isFinite(mpr) || mpr <= 0) throw new Error("Mét/cuộn phải > 0.")
    }
  }

  function validateRow(row, label = "Biến thể") {
    if (!String(row.name || "").trim()) throw new Error(`${label}: Tên biến thể là bắt buộc.`)
    if (!normalizeSku(row.sku)) throw new Error(`${label}: SKU là bắt buộc.`)
    if (!String(row.price || "").trim()) throw new Error(`${label}: Giá là bắt buộc.`)
    const p = Number(row.price)
    if (!Number.isFinite(p) || p < 0) throw new Error(`${label}: Giá không hợp lệ.`)

    if (trackStockUnit && String(row.roll_price || "").trim()) {
      const rp = Number(row.roll_price)
      if (!Number.isFinite(rp) || rp < 0) throw new Error(`${label}: Giá cuộn không hợp lệ.`)
    }
  }

  function validateUniqueSkus(rows) {
    const seen = new Map()
    for (const row of rows) {
      const sku = normalizeSku(row.sku).toLowerCase()
      const label = String(row.name || "Biến thể").trim() || "Biến thể"
      if (!sku) continue
      if (seen.has(sku)) throw new Error(`SKU bị trùng trong form: ${label} và ${seen.get(sku)}.`)
      seen.set(sku, label)
    }
  }

  async function createVariantUnderParent(row, parent) {
    const label = String(row.name || "Biến thể")
    validateRow(row, label)

    let imageUrl = String(row.image_url || "").trim() || null
    if (!imageUrl && row.image_file) imageUrl = await uploadImage(row.image_file)
    let barcode = String(row.barcode || "").trim() || null
    if (!trackStockUnit && !barcode) barcode = genBarcodeFromText(row.sku || row.name || parent.name)

    const attrsPayload = row.attrs && typeof row.attrs === "object" ? { ...row.attrs } : {}
    if (trackStockUnit) attrsPayload.meters_per_roll = Number(commonMetersPerRoll)

    const child = await post(`/api/v1/products/parents/${parent.id}/variants`, {
      name: String(row.name || "").trim(),
      description: String(parentDesc || "").trim() ? String(parentDesc || "").trim() : null,
      category_id: null,
      uom: normalizeUom(),
      price: String(Number(row.price)),
      roll_price: trackStockUnit && String(row.roll_price || "").trim() ? String(Number(row.roll_price)) : null,
      stock: "0",
      sku: normalizeSku(row.sku),
      barcode,
      image_url: imageUrl,
      attrs: Object.keys(attrsPayload).length ? attrsPayload : null,
      track_stock_unit: !!trackStockUnit,
      is_active: true,
    })
    return child
  }

  async function createStandaloneVariant(row, baseProductName) {
    const label = String(row.name || "Sản phẩm")
    validateRow(row, label)

    let imageUrl = String(row.image_url || "").trim() || null
    if (!imageUrl && row.image_file) imageUrl = await uploadImage(row.image_file)
    let barcode = String(row.barcode || "").trim() || null
    if (!trackStockUnit && !barcode) barcode = genBarcodeFromText(row.sku || row.name || baseProductName)

    const attrsPayload = row.attrs && typeof row.attrs === "object" ? { ...row.attrs } : {}
    attrsPayload._single_product = true
    if (trackStockUnit) attrsPayload.meters_per_roll = Number(commonMetersPerRoll)

    const obj = await post("/api/v1/products/variants", {
      name: String(row.name || "").trim() || baseProductName,
      description: String(parentDesc || "").trim() ? String(parentDesc || "").trim() : null,
      category_id: categoryId ? Number(categoryId) : null,
      uom: normalizeUom(),
      price: String(Number(row.price)),
      roll_price: trackStockUnit && String(row.roll_price || "").trim() ? String(Number(row.roll_price)) : null,
      stock: "0",
      sku: normalizeSku(row.sku),
      barcode,
      image_url: imageUrl,
      attrs: Object.keys(attrsPayload).length ? attrsPayload : null,
      track_stock_unit: !!trackStockUnit,
      is_active: true,
    })
    return obj
  }

  async function save() {
    validateCommon()

    if (hasVariants && !variantRows.length) {
      throw new Error("Bạn đã bật biến thể nhưng chưa có dòng nào. Hãy tạo dòng ở tab Biến thể.")
    }
    validateUniqueSkus(hasVariants ? variantRows : [singleRow])

    setSaving(true)
    try {
      const baseProductName = getBaseProductName()
      let created = null
      if (hasVariants) {
        const parent = await post("/api/v1/products/parents", {
          name: baseProductName,
          description: String(parentDesc || "").trim() ? String(parentDesc || "").trim() : null,
          image_url: null,
          category_id: categoryId ? Number(categoryId) : null,
        })
        for (const row of variantRows) {
          created = await createVariantUnderParent(row, parent)
        }
      } else {
        const row = {
          ...singleRow,
          name: String(singleRow.name || "").trim() || baseProductName,
        }
        created = await createStandaloneVariant(row, baseProductName)
      }

      if (created) {
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
      }
    } finally {
      setSaving(false)
    }
  }

  async function createCategoryInline() {
    const n = String(newCategoryName || "").trim()
    if (!n) throw new Error("Tên danh mục là bắt buộc.")
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
      onCategoryCreated?.(c)
    } finally {
      setCreatingCategory(false)
    }
  }

  function renderInlineCategoryCreate() {
    if (!showNewCategory) return null
    return (
      <div className="prdInlineCreate">
        <div className="prdGrid3">
          <div>
            <FieldLabel className="hint" style={{ marginTop: 0 }} required>
              Tên danh mục
            </FieldLabel>
            <input className="input" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder="VD: Lưới / Khoá / Túi..." />
          </div>
          <div>
            <div className="hint" style={{ marginTop: 0 }}>
              Mô tả
            </div>
            <input className="input" value={newCategoryDescription} onChange={(e) => setNewCategoryDescription(e.target.value)} placeholder="..." />
          </div>
          <div>
            <div className="hint" style={{ marginTop: 0 }}>
              Ảnh URL (tuỳ chọn)
            </div>
            <input className="input" value={newCategoryImageUrl} onChange={(e) => setNewCategoryImageUrl(e.target.value)} placeholder="https://..." />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 10, flexWrap: "wrap" }}>
          <button type="button" className="btn" disabled={busy || saving || creatingCategory} onClick={() => setShowNewCategory(false)}>
            Huỷ
          </button>
          <button
            type="button"
            className="btn btnPrimary"
            disabled={busy || saving || creatingCategory}
            onClick={() => createCategoryInline().catch((e) => onError?.(e))}
          >
            {creatingCategory ? "Đang tạo..." : "Tạo danh mục"}
          </button>
        </div>
      </div>
    )
  }

  return (
    <AppModal
      xwide
      title="Tạo sản phẩm"
      onClose={onClose}
      footer={
        <div style={{ display: "flex", gap: 10, justifyContent: "space-between", flexWrap: "wrap" }}>
          <button className="btn" disabled={busy || saving} onClick={onClose}>
            Huỷ
          </button>
          <button className="btn btnPrimary" disabled={busy || saving} onClick={() => save().catch((e) => onError?.(e))}>
            Tạo sản phẩm
          </button>
        </div>
      }
    >
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
          {hasVariants ? (
            <div className="prdSection">
              <div className="prdSectionTitle">Sản phẩm cha (Parent)</div>
              <div className="prdGrid2">
                <div>
                  <FieldLabel className="hint" style={{ marginTop: 0 }} required>
                    Tên sản phẩm cha
                  </FieldLabel>
                  <input className="input" value={parentName} onChange={(e) => setParentName(e.target.value)} placeholder="VD: Lưới nylon 1m2" />
                </div>
                <div>
                  <div className="hint" style={{ marginTop: 0 }}>
                    Danh mục
                  </div>
                  <div className="prdInlineSelectRow">
                    <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                      <option value="">(Không chọn)</option>
                      {categoryOptions.map((c) => (
                        <option key={c.id} value={String(c.id)}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <button type="button" className="btn prdInlineActionBtn" disabled={busy || saving || creatingCategory} onClick={() => setShowNewCategory((v) => !v)}>
                      + Danh mục
                    </button>
                  </div>
                </div>
              </div>
              {renderInlineCategoryCreate()}
              <div>
                <div className="hint" style={{ marginTop: 10 }}>
                  Mô tả
                </div>
                <input className="input" value={parentDesc} onChange={(e) => setParentDesc(e.target.value)} placeholder="..." />
              </div>
            </div>
          ) : (
            <div className="prdSection">
              <div className="prdSectionTitle">Thông tin sản phẩm</div>
              <div className="prdGrid2">
                <div>
                  <FieldLabel className="hint" style={{ marginTop: 0 }} required>
                    Tên sản phẩm
                  </FieldLabel>
                  <input className="input" value={singleRow.name} onChange={(e) => setSingleRow((p) => ({ ...p, name: e.target.value }))} placeholder="VD: Lưới nylon xanh 1m2" />
                </div>
                <div>
                  <div className="hint" style={{ marginTop: 0 }}>
                    Danh mục
                  </div>
                  <div className="prdInlineSelectRow">
                    <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                      <option value="">(Không chọn)</option>
                      {categoryOptions.map((c) => (
                        <option key={c.id} value={String(c.id)}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <button type="button" className="btn prdInlineActionBtn" disabled={busy || saving || creatingCategory} onClick={() => setShowNewCategory((v) => !v)}>
                      + Danh mục
                    </button>
                  </div>
                </div>
              </div>
              {renderInlineCategoryCreate()}
              <div>
                <div className="hint" style={{ marginTop: 10 }}>
                  Mô tả
                </div>
                <input className="input" value={parentDesc} onChange={(e) => setParentDesc(e.target.value)} placeholder="..." />
              </div>
            </div>
          )}

          <div className="prdSection">
            <div className="prdSectionTitle">Thiết lập bán hàng</div>
            <div className="prdGrid3">
              <div>
                <FieldLabel className="hint" style={{ marginTop: 0 }} required>
                  Đơn vị mặc định
                </FieldLabel>
                <input className="input" value={commonUom} onChange={(e) => setCommonUom(e.target.value)} placeholder="pcs / m / kg..." />
              </div>
              <div>
                <div className="hint" style={{ marginTop: 0 }}>
                  Nhà cung cấp (tuỳ chọn)
                </div>
                <div className="rcvSupplierRow">
                  <button type="button" className="btn" onClick={onPickSupplier} disabled={busy || saving}>
                    Chọn NCC
                  </button>
                  <button type="button" className="btn" onClick={onClearSupplier} disabled={busy || saving || !supplierId}>
                    Bỏ
                  </button>
                </div>
                <div className="hint" style={{ marginTop: 4 }}>
                  {supplierPicked?.name || (supplierId ? `NCC #${supplierId}` : "Không bắt buộc")}
                </div>
              </div>
              <div>
                <div className="hint" style={{ marginTop: 0 }}>
                  Có biến thể?
                </div>
                <label className="prdToggleRow">
                  <input
                    type="checkbox"
                    checked={hasVariants}
                    onChange={(e) => {
                      const next = !!e.target.checked
                      setHasVariants(next)
                      if (next) {
                        if (!String(parentName || "").trim()) {
                          setParentName(String(singleRow.name || "").trim())
                        }
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
                <div className="hint" style={{ marginTop: 6 }}>
                  Bật mục này để mở tab "Biến thể" và tạo theo tổ hợp thuộc tính (màu, size, quy cách...).
                </div>
              </div>
            </div>

            <div className="prdToggleRow" style={{ marginTop: 10 }}>
              <input type="checkbox" checked={trackStockUnit} onChange={(e) => setTrackStockUnit(!!e.target.checked)} />
              <span>{trackStockUnit ? "Bán theo cuộn (dùng stock_unit)" : "Hàng thường"}</span>
            </div>

            {trackStockUnit ? (
              <div className="prdGrid2" style={{ marginTop: 10 }}>
              <div>
                <FieldLabel className="hint" style={{ marginTop: 0 }} required>
                  Mét/cuộn
                </FieldLabel>
                <input className="input" value={commonMetersPerRoll} onChange={(e) => setCommonMetersPerRoll(e.target.value)} placeholder="VD: 30" />
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
                    <FieldLabel className="hint" style={{ marginTop: 0 }} required>
                      SKU
                    </FieldLabel>
                    <input className="input" value={singleRow.sku} onChange={(e) => setSingleRow((p) => ({ ...p, sku: e.target.value }))} placeholder="..." />
                  </div>
                  <div>
                    <div className="hint" style={{ marginTop: 0 }}>
                      Barcode
                    </div>
                    <input
                      className="input"
                      value={singleRow.barcode}
                      onChange={(e) => setSingleRow((p) => ({ ...p, barcode: e.target.value }))}
                      placeholder={trackStockUnit ? "(tuỳ chọn)" : "để trống sẽ tự tạo"}
                    />
                  </div>
                </div>

                <div className="prdGrid2" style={{ marginTop: 10 }}>
                  <div>
                    <FieldLabel className="hint" style={{ marginTop: 0 }} required>
                      Giá
                    </FieldLabel>
                    <input className="input" value={singleRow.price} onChange={(e) => setSingleRow((p) => ({ ...p, price: e.target.value }))} placeholder="VD: 35000" />
                  </div>
                  {trackStockUnit ? (
                    <div>
                      <div className="hint" style={{ marginTop: 0 }}>
                        Giá cuộn (tuỳ chọn)
                      </div>
                      <input className="input" value={singleRow.roll_price} onChange={(e) => setSingleRow((p) => ({ ...p, roll_price: e.target.value }))} placeholder="VD: 240000" />
                    </div>
                  ) : (
                    <div />
                  )}
                </div>

                <div className="prdGrid2" style={{ marginTop: 10 }}>
                  <div>
                    <div className="hint" style={{ marginTop: 0 }}>
                      Ảnh sản phẩm
                    </div>
                    <ImageDropzone
                      disabled={busy || saving}
                      file={singleRow.image_file}
                      onPick={(f) => setSingleRow((p) => ({ ...p, image_file: f }))}
                    />
                  </div>
                  <div>
                    <div className="hint" style={{ marginTop: 0 }}>
                      Ảnh URL (tuỳ chọn)
                    </div>
                    <input className="input" value={singleRow.image_url} onChange={(e) => setSingleRow((p) => ({ ...p, image_url: e.target.value }))} placeholder="https://..." />
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
            <div className="hint" style={{ marginTop: 0 }}>
              Nhập tên thuộc tính và danh sách giá trị, cách nhau bởi dấu phẩy. Ví dụ: Màu = đỏ, xanh.
              Có thể nhập nhanh kiểu "Màu: đỏ" trên từng dòng, hệ thống sẽ tự gộp các dòng cùng thuộc tính.
            </div>

            <div className="prdAttrsList">
              {attrDefs.map((a) => (
                <div className="prdAttrRow" key={a.id}>
                  <input className="input" value={a.name} onChange={(e) => setAttrDef(a.id, { name: e.target.value })} placeholder="Tên thuộc tính (VD: Màu)" />
                  <input className="input" value={a.valuesText} onChange={(e) => setAttrDef(a.id, { valuesText: e.target.value })} placeholder="Giá trị (VD: đỏ, xanh, đen)" />
                  <button type="button" className="btn btnDanger" disabled={attrDefs.length <= 1} onClick={() => removeAttrDef(a.id)}>
                    Xoá
                  </button>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
              <button type="button" className="btn" onClick={addAttrDef}>
                + Thêm thuộc tính
              </button>
              <button
                type="button"
                className="btn btnPrimary"
                onClick={() => {
                  try {
                    generateRows()
                  } catch (e) {
                    onError?.(e)
                  }
                }}
              >
                Tạo dòng biến thể
              </button>
            </div>
          </div>

          <div className="prdSection">
            <div className="prdSectionTitle">Danh sách biến thể ({variantRows.length})</div>
            {!variantRows.length ? <div className="hint">Chưa có dòng. Hãy bấm "Tạo dòng biến thể".</div> : null}

            <div className="prdRowList">
              {variantRows.map((row, idx) => (
                <div className="prdRowCard" key={row.id}>
                  <div className="prdRowHead">
                    <div className="prdRowTitle">Biến thể #{idx + 1}</div>
                    <div className="prdRowMeta">{Object.entries(row.attrs || {}).map(([k, v]) => `${k}: ${v}`).join(" | ") || "Không có thuộc tính"}</div>
                  </div>

                  <div className="prdRowGridTop">
                    <div>
                      <FieldLabel className="hint" style={{ marginTop: 0 }} required>
                        Tên biến thể
                      </FieldLabel>
                      <input className="input" value={row.name} onChange={(e) => setVariantRow(row.id, { name: e.target.value })} placeholder="Tên biến thể" />
                    </div>
                    <div>
                      <FieldLabel className="hint" style={{ marginTop: 0 }} required>
                        SKU
                      </FieldLabel>
                      <input className="input" value={row.sku} onChange={(e) => setVariantRow(row.id, { sku: e.target.value })} placeholder="..." />
                    </div>
                    <div>
                      <div className="hint" style={{ marginTop: 0 }}>
                        Barcode
                      </div>
                      <input
                        className="input"
                        value={row.barcode}
                        onChange={(e) => setVariantRow(row.id, { barcode: e.target.value })}
                        placeholder={trackStockUnit ? "(tuỳ chọn)" : "để trống sẽ tự tạo"}
                      />
                    </div>
                  </div>

                  <div className="prdRowGridBottom">
                    <div>
                      <FieldLabel className="hint" style={{ marginTop: 0 }} required>
                        Giá
                      </FieldLabel>
                      <input className="input" value={row.price} onChange={(e) => setVariantRow(row.id, { price: e.target.value })} placeholder="VD: 35000" />
                    </div>
                    {trackStockUnit ? (
                      <div>
                        <div className="hint" style={{ marginTop: 0 }}>
                          Giá cuộn (tuỳ chọn)
                        </div>
                        <input className="input" value={row.roll_price || ""} onChange={(e) => setVariantRow(row.id, { roll_price: e.target.value })} placeholder="VD: 240000" />
                      </div>
                    ) : (
                      <div />
                    )}
                    <div />
                  </div>

                  <div className="prdRowGridBottom" style={{ marginTop: 10 }}>
                    <div>
                      <div className="hint" style={{ marginTop: 0 }}>
                        Ảnh biến thể
                      </div>
                      <ImageDropzone
                        disabled={busy || saving}
                        file={row.image_file}
                        onPick={(f) => setVariantRow(row.id, { image_file: f })}
                      />
                    </div>
                    <div>
                      <div className="hint" style={{ marginTop: 0 }}>
                        Ảnh URL (tuỳ chọn)
                      </div>
                      <input className="input" value={row.image_url || ""} onChange={(e) => setVariantRow(row.id, { image_url: e.target.value })} placeholder="https://..." />
                    </div>
                    <div />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </AppModal>
  )
}

export default function ReceivePrintPage() {
  const [tab, setTab] = useState("normal") // normal | rolls

  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)

  const [q, setQ] = useState("")
  const [searchBusy, setSearchBusy] = useState(false)
  const [variants, setVariants] = useState([])
  const [picked, setPicked] = useState(null)

  const [qty, setQty] = useState("1")
  const [normalCostPrice, setNormalCostPrice] = useState("")
  const [rollCostPrice, setRollCostPrice] = useState("")
  const [note, setNote] = useState("")

  const [locations, setLocations] = useState([])
  const [locationId, setLocationId] = useState("")

  const [categories, setCategories] = useState([])
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
  }, [])

  async function doSearch(nextQ) {
    const qq = (nextQ ?? q ?? "").trim()
    setSearchBusy(true)
    try {
      const r = await get(`/api/v1/pos/search/?q=${encodeURIComponent(qq)}&limit=40`)
      const list = Array.isArray(r?.variants) ? r.variants : []
      // Show all variants; when user picks one, UI auto-switches to matching flow.
      setVariants(list)
    } finally {
      setSearchBusy(false)
    }
  }

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      doSearch(q).catch(() => {})
    }, 180)
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, tab])

  useEffect(() => {
    // Do not clear picked on tab change, otherwise click->setTab will clear selection.
    setRollCostPrice("")
    setLocationId("")
  }, [tab])

  const qtyNum = useMemo(() => {
    const n = Math.floor(asNum(qty))
    return Number.isFinite(n) ? n : NaN
  }, [qty])

  async function ensureBarcode() {
    if (!picked) return null
    if (picked.barcode) return picked.barcode
    const bc = genBarcodeFromText(picked.sku || picked.name || `VAR${picked.variant_id}`)
    const updated = await patch(`/api/v1/products/variants/${picked.variant_id}`, { barcode: bc })
    setPicked((prev) => (prev ? { ...prev, barcode: updated?.barcode || bc } : prev))
    showInfo(`Đã tạo barcode: ${bc}`)
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

        if (print) {
          const labels = Array.from({ length: qtyNum }).map(() => ({
            code: bc,
            name: picked.name,
            sku: picked.sku,
            price: picked.price != null ? fmtMoney(picked.price) : "",
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

        const units = Array.isArray(res) ? res : []
        if (print) {
          const labels = units.map((su) => ({
            code: su.barcode,
            name: picked.name,
            sku: picked.sku,
            price: picked.roll_price != null ? fmtMoney(picked.roll_price) : picked.price != null ? fmtMoney(picked.price) : "",
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
          price: picked.price != null ? fmtMoney(picked.price) : "",
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
        price: picked.roll_price != null ? fmtMoney(picked.roll_price) : picked.price != null ? fmtMoney(picked.price) : "",
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
          supplierId={supplierId}
          supplierPicked={supplierPicked}
          onPickSupplier={() => setSupplierPickerOpen(true)}
          onClearSupplier={() => {
            setSupplierId("")
            setSupplierPicked(null)
          }}
          onCategoryCreated={(c) => {
            setCategories((prev) => [c, ...(prev || []).filter((x) => x.id !== c.id)])
          }}
          onClose={() => setShowCreateProduct(false)}
          onCreated={(v) => {
            setShowCreateProduct(false)
            setTab(v.track_stock_unit ? "rolls" : "normal")
            setPicked(v)
            setQ(v.name || "")
            doSearch(v.name || "").catch(() => {})
            showInfo("Đã tạo sản phẩm.")
          }}
          onError={showErr}
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
