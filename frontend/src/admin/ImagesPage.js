import { useEffect, useMemo, useRef, useState } from "react"
import { get, patch, post } from "../api"
import Modal from "./Modal"
import DataGrid from "./DataGrid"
import "./images.css"

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

export default function ImagesPage() {
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [rows, setRows] = useState([])
  const [categories, setCategories] = useState([])
  const [parents, setParents] = useState([])

  const [q, setQ] = useState("")
  const [categoryId, setCategoryId] = useState("")
  const [editRow, setEditRow] = useState(null)

  async function loadAll() {
    setLoading(true)
    setErr(null)
    try {
      const [variants, cats, ps] = await Promise.all([get("/api/v1/products/variants"), get("/api/v1/categories/"), get("/api/v1/products/parents")])
      setRows(Array.isArray(variants) ? variants : [])
      setCategories(Array.isArray(cats) ? cats : [])
      setParents(Array.isArray(ps) ? ps : [])
    } catch (e) {
      setErr(e?.message || "Không tải được dữ liệu ảnh sản phẩm")
      setRows([])
      setCategories([])
      setParents([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll().catch(() => {})
  }, [])

  const parentCategoryById = useMemo(() => {
    const m = new Map()
    for (const p of parents) m.set(String(p.id), p.category_id ?? null)
    return m
  }, [parents])

  const filtered = useMemo(() => {
    const qq = String(q || "").trim().toLowerCase()
    const cat = String(categoryId || "").trim()

    return rows.filter((r) => {
      const effCategoryId = getEffectiveCategoryId(r, parentCategoryById)
      if (cat && String(effCategoryId || "") !== cat) return false
      if (!qq) return true

      const catName = categoryNameById(categories, effCategoryId)
      const hay = [r.id, r.name, r.sku, r.barcode, r.image_url, catName]
        .filter((v) => v !== null && v !== undefined)
        .map((v) => String(v).toLowerCase())
        .join(" · ")
      return hay.includes(qq)
    })
  }, [rows, q, categoryId, categories, parentCategoryById])

  const titleHint = useMemo(() => {
    if (loading) return "Đang tải..."
    if (err) return `Lỗi: ${err}`
    return `${filtered.length}/${rows.length} biến thể`
  }, [loading, err, filtered.length, rows.length])

  return (
    <div className="imgp">
      <div className="imgpTop">
        <div className="imgpHint">{titleHint}</div>
        <div className="imgpActions">
          <input
            className="admInput"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm theo tên / SKU / barcode / ảnh..."
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
          <button className="imgpActionBtn" disabled={busy || loading} onClick={() => loadAll()}>
            Tải lại
          </button>
        </div>
      </div>

      <DataGrid
        id="catalog.images"
        columns={[
          { key: "id", title: "ID", width: 90, minWidth: 70, render: (r) => <span className="imgpMono">{r.id}</span> },
          { key: "name", title: "Sản phẩm", fill: true, minWidth: 260, render: (r) => <span className="imgpName">{r.name}</span> },
          { key: "sku", title: "SKU", width: 140, minWidth: 110, render: (r) => <span className="imgpMono">{r.sku || ""}</span> },
          {
            key: "category",
            title: "Danh mục",
            width: 170,
            minWidth: 130,
            getValue: (r) => categoryNameById(categories, getEffectiveCategoryId(r, parentCategoryById)),
            render: (r) => <span className="imgpText">{categoryNameById(categories, getEffectiveCategoryId(r, parentCategoryById))}</span>,
          },
          {
            key: "image_preview",
            title: "Ảnh",
            width: 120,
            minWidth: 100,
            sortable: false,
            filterable: false,
            render: (r) => (
              <div className="imgpThumbWrap">{r.image_url ? <img className="imgpThumb" src={r.image_url} alt={r.name} /> : <span className="imgpEmpty">—</span>}</div>
            ),
          },
          {
            key: "image_url",
            title: "Ảnh URL",
            minWidth: 260,
            flex: 1.2,
            render: (r) => <span className="imgpMono">{r.image_url || ""}</span>,
          },
          {
            key: "actions",
            title: "Thao tác",
            width: 130,
            minWidth: 120,
            sortable: false,
            filterable: false,
            render: (r) => (
              <button className="admBtn" disabled={busy} onClick={() => setEditRow(r)}>
                Cập nhật ảnh
              </button>
            ),
          },
        ]}
        rows={filtered}
        rowKey={(r) => r.id}
      />

      {editRow ? (
        <VariantImageModal
          variant={editRow}
          busy={busy}
          onClose={() => setEditRow(null)}
          onSave={async (payload) => {
            setBusy(true)
            try {
              const updated = await patch(`/api/v1/products/variants/${editRow.id}`, payload)
              setRows((prev) => prev.map((r) => (String(r.id) === String(updated.id) ? updated : r)))
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

function VariantImageModal({ variant, busy, onClose, onSave }) {
  const [imageUrl, setImageUrl] = useState(variant.image_url || "")
  const [file, setFile] = useState(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [err, setErr] = useState(null)
  const fileInputRef = useRef(null)

  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  function readAsDataURL(f) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = () => reject(new Error("Không đọc được file ảnh"))
      reader.onload = () => resolve(String(reader.result || ""))
      reader.readAsDataURL(f)
    })
  }

  async function uploadIfNeeded() {
    if (!file) return imageUrl
    const data_url = await readAsDataURL(file)
    const r = await post("/api/v1/uploads/images", {
      data_url,
      filename: file.name,
      content_type: file.type || null,
    })
    if (!r?.url) throw new Error("Upload ảnh thất bại")
    return r.url
  }

  function setPickedFile(f) {
    if (!f) {
      setFile(null)
      return
    }
    if (!String(f.type || "").startsWith("image/")) {
      setErr("Chỉ chấp nhận file ảnh (jpg/png/webp)")
      return
    }
    setErr(null)
    setFile(f)
  }

  return (
    <Modal
      title={`Cập nhật ảnh · ${variant.name}`}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="admBtn" disabled={busy} onClick={onClose}>
            Huỷ
          </button>
          <button
            className="admBtn"
            disabled={busy}
            onClick={() => {
              setFile(null)
              setImageUrl("")
              setErr(null)
              if (fileInputRef.current) fileInputRef.current.value = ""
            }}
          >
            Xoá ảnh
          </button>
          <button
            className="admBtn admBtnPrimary"
            disabled={busy}
            onClick={() => {
              setErr(null)
              ;(async () => {
                const finalUrl = await uploadIfNeeded()
                await onSave({ image_url: String(finalUrl || "").trim() || null })
              })().catch((e) => setErr(e?.message || "Không lưu được ảnh"))
            }}
          >
            Lưu ảnh
          </button>
        </>
      }
    >
      {err ? <div className="admErr">{err}</div> : null}

      <div className="admGrid2">
        <div className="admField">
          <div className="admLabel">Ảnh hiện tại</div>
          <div className="imgpPreviewFrame">{variant.image_url ? <img src={variant.image_url} alt={variant.name} /> : <div className="imgpEmpty">Chưa có ảnh</div>}</div>
        </div>
        <div className="admField">
          <div className="admLabel">Ảnh mới</div>
          <div className="imgpPreviewFrame">{previewUrl ? <img src={previewUrl} alt="Ảnh mới" /> : <div className="imgpEmpty">Chưa chọn file</div>}</div>
        </div>
      </div>

      <div className="admField">
        <div className="admLabel">Chọn file ảnh</div>
        <div
          className={`imgpDropzone ${isDragOver ? "imgpDropzoneActive" : ""}`}
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault()
              fileInputRef.current?.click()
            }
          }}
          onDragEnter={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setIsDragOver(true)
          }}
          onDragOver={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setIsDragOver(true)
          }}
          onDragLeave={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setIsDragOver(false)
          }}
          onDrop={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setIsDragOver(false)
            const f = e.dataTransfer?.files && e.dataTransfer.files[0] ? e.dataTransfer.files[0] : null
            setPickedFile(f)
          }}
        >
          <div className="imgpDropTitle">Kéo thả ảnh vào đây</div>
          <div className="imgpDropSub">hoặc bấm để chọn file (jpg/png/webp)</div>
          {file ? <div className="imgpDropFile">Đã chọn: {file.name}</div> : null}
        </div>
        <input
          ref={fileInputRef}
          className="imgpFile imgpFileHidden"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => {
            const f = e.target.files && e.target.files[0] ? e.target.files[0] : null
            setPickedFile(f)
          }}
        />
      </div>

      <div className="admField">
        <div className="admLabel">Ảnh URL</div>
        <input className="admInput" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="/uploads/images/... hoặc https://..." />
      </div>
    </Modal>
  )
}
