import { useCallback, useEffect, useMemo, useState } from "react"
import { del, get, patch, post } from "../api"
import Modal from "./Modal"
import ProductCreateModal from "./ProductCreateModal"
import ExcelToolsModal from "./ExcelToolsModal"
import FieldLabel from "../ui/FieldLabel"
import { formatMoneyVN } from "../utils/number"
import "./products.css"

function fmtMoney(v) {
  return formatMoneyVN(v)
}

function normalizeSku(value) {
  return String(value || "").trim()
}

export default function ProductsPage() {
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const [rows, setRows] = useState([]) // variants
  const [q, setQ] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("")

  const [parents, setParents] = useState([])
  const [categories, setCategories] = useState([])
  const [locations, setLocations] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [expandedParentIds, setExpandedParentIds] = useState(() => new Set())

  const [showCreateProduct, setShowCreateProduct] = useState(false)
  const [showCreateParent, setShowCreateParent] = useState(false)
  const [showCreateVariant, setShowCreateVariant] = useState(false)
  const [createVariantParentId, setCreateVariantParentId] = useState("")
  const [editVariant, setEditVariant] = useState(null)
  const [deleteVariant, setDeleteVariant] = useState(null)
  const [showExcel, setShowExcel] = useState(false)

  const variantsById = useMemo(() => {
    const m = new Map()
    for (const r of rows) m.set(String(r.id), r)
    return m
  }, [rows])

  const categoryById = useMemo(() => {
    const m = new Map()
    for (const c of categories) m.set(String(c.id), c)
    return m
  }, [categories])

  const resolveCategoryIdForVariant = useCallback((v, parent) => {
    return v?.category_id ?? parent?.category_id ?? null
  }, [])

  const resolveCategoryNameForVariant = useCallback((v, parent) => {
    const id = resolveCategoryIdForVariant(v, parent)
    return id == null ? "" : categoryById.get(String(id))?.name || ""
  }, [categoryById, resolveCategoryIdForVariant])

  async function loadAll() {
    setLoading(true)
    setErr(null)
    try {
      const [variants, ps, cs, locs, sups] = await Promise.all([
        get("/api/v1/products/variants"),
        get("/api/v1/products/parents"),
        get("/api/v1/categories/"),
        get("/api/v1/locations/"),
        get("/api/v1/suppliers/?limit=200&is_active=true"),
      ])
      setRows(Array.isArray(variants) ? variants : [])
      setParents(Array.isArray(ps) ? ps : [])
      setCategories(Array.isArray(cs) ? cs : [])
      setLocations(Array.isArray(locs) ? locs : [])
      setSuppliers(Array.isArray(sups) ? sups : [])
    } catch (e) {
      setErr(e?.message || "Không tải được danh sách sản phẩm")
      setRows([])
      setParents([])
      setCategories([])
      setLocations([])
      setSuppliers([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const tree = useMemo(() => {
    const parentMap = new Map()
    for (const p of parents) {
      parentMap.set(String(p.id), { parent: p, variants: [], synthetic: false, parentMatched: false })
    }

    for (const v of rows) {
      if (v.parent_id == null) {
        parentMap.set(`__single_${v.id}`, {
          parent: { id: `single-${v.id}`, name: v.name, description: null, category_id: v.category_id ?? null, synthetic: true },
          variants: [v],
          synthetic: true,
          standalone: true,
          parentMatched: false,
        })
        continue
      }

      const k = String(v.parent_id || "")
      const g = parentMap.get(k)
      if (g) {
        g.variants.push(v)
      } else {
        const orphanKey = `__orphan_${k}`
        const fallback =
          parentMap.get(orphanKey) ||
          {
            parent: { id: v.parent_id, name: `Parent #${v.parent_id}`, description: null, category_id: null, synthetic: true },
            variants: [],
            synthetic: true,
            parentMatched: false,
          }
        fallback.variants.push(v)
        parentMap.set(orphanKey, fallback)
      }
    }

    const groups = Array.from(parentMap.values()).sort((a, b) => {
      const aId = Number(a.parent?.id)
      const bId = Number(b.parent?.id)
      if (Number.isFinite(aId) && Number.isFinite(bId)) return bId - aId
      if (Number.isFinite(aId)) return -1
      if (Number.isFinite(bId)) return 1
      return 0
    })
    const qq = (q || "").trim().toLowerCase()
    const categoryNeedle = String(categoryFilter || "").trim()
    if (!qq && !categoryNeedle) {
      for (const g of groups) g.variants.sort((a, b) => Number(b.id || 0) - Number(a.id || 0))
      return groups
    }

    const out = []
    for (const g of groups) {
      const parentHay = [
        g.parent.id,
        g.parent.name,
        g.parent.description,
        g.parent?.category_id != null ? categoryById.get(String(g.parent.category_id))?.name || "" : "",
      ]
        .filter((v) => v !== null && v !== undefined)
        .map((v) => String(v).toLowerCase())
        .join(" · ")
      const parentMatched = !qq ? false : parentHay.includes(qq)

      const matchedVariants = g.variants.filter((r) => {
        const hay = [
          r.id,
          r.name,
          r.sku,
          r.barcode,
          r.uom,
          r.parent_id,
          resolveCategoryNameForVariant(r, g.parent),
        ]
          .filter((v) => v !== null && v !== undefined)
          .map((v) => String(v).toLowerCase())
          .join(" · ")
        return !qq || hay.includes(qq)
      })

      const parentCategoryMatched =
        !categoryNeedle || String(g.parent?.category_id ?? "") === categoryNeedle
      const categoryMatchedVariants = matchedVariants.filter(
        (r) => !categoryNeedle || String(resolveCategoryIdForVariant(r, g.parent) ?? "") === categoryNeedle
      )

      if (!parentCategoryMatched && categoryMatchedVariants.length === 0) continue
      if (qq && !parentMatched && categoryMatchedVariants.length === 0) continue
      out.push({
        ...g,
        parentMatched: parentMatched && parentCategoryMatched,
        variants:
          parentMatched && parentCategoryMatched
            ? g.variants.filter(
                (r) =>
                  !categoryNeedle || String(resolveCategoryIdForVariant(r, g.parent) ?? "") === categoryNeedle
              )
            : categoryMatchedVariants,
      })
    }

    for (const g of out) g.variants.sort((a, b) => Number(b.id || 0) - Number(a.id || 0))
    return out
  }, [parents, rows, q, categoryFilter, categoryById, resolveCategoryIdForVariant, resolveCategoryNameForVariant])

  const visibleVariantsCount = useMemo(() => tree.reduce((acc, g) => acc + g.variants.length, 0), [tree])

  const exportVariants = useMemo(() => {
    const out = []
    for (const group of tree) {
      const standalone = isStandaloneGroup(group)
      if (standalone) {
        const v = group.variants[0]
        out.push({ ...v, parent_name: null, category_name: resolveCategoryNameForVariant(v, group.parent) })
        continue
      }
      // Xuất Excel nên ưu tiên đầy đủ dữ liệu biến thể (không phụ thuộc việc nhóm đang gập/mở).
      // Việc "gập/mở" chỉ là UI để nhìn cho gọn.
      for (const v of group.variants) {
        out.push({
          ...v,
          parent_name: group.parent?.name || null,
          category_name: resolveCategoryNameForVariant(v, group.parent),
        })
      }
    }
    return out
  }, [tree, resolveCategoryNameForVariant])

  const exportSnapshot = useMemo(() => {
    const visibleCols = [
      { key: "id", title: "ID", getValue: (r) => r.id },
      { key: "parent_name", title: "Nhóm (Parent)", getValue: (r) => r.parent_name || "" },
      { key: "category_name", title: "Danh mục", getValue: (r) => r.category_name || "" },
      { key: "name", title: "Tên", getValue: (r) => r.name || "" },
      { key: "sku", title: "SKU", getValue: (r) => r.sku || "" },
      { key: "barcode", title: "Barcode", getValue: (r) => r.barcode || "" },
      { key: "uom", title: "Đơn vị", getValue: (r) => r.uom || "" },
      { key: "stock", title: "Tồn", getValue: (r) => r.stock ?? "" },
      { key: "price", title: "Giá", getValue: (r) => r.price ?? "" },
      { key: "roll_price", title: "Giá cuộn", getValue: (r) => r.roll_price ?? "" },
      { key: "cost_price", title: "Giá nhập", getValue: (r) => r.cost_price ?? "" },
      { key: "track_stock_unit", title: "Theo cuộn", getValue: (r) => (r.track_stock_unit ? 1 : 0) },
      { key: "is_active", title: "Active", getValue: (r) => (r.is_active ? 1 : 0) },
    ]
    return { visibleCols, rows: exportVariants, cfg: {} }
  }, [exportVariants])

  function toggleParent(parentId) {
    setExpandedParentIds((prev) => {
      const next = new Set(prev)
      const key = String(parentId)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function isStandaloneGroup(group) {
    if (!group || group.variants.length !== 1) return false
    if (group.standalone) return true
    const v = group.variants[0]
    if (v?.attrs && typeof v.attrs === "object" && v.attrs._single_product === true) return true
    const pName = String(group.parent?.name || "").trim().toLowerCase()
    const vName = String(v?.name || "").trim().toLowerCase()
    return !group.synthetic && !!pName && pName === vName
  }

  return (
    <div className="prod">
      <div className="prodTop">
        <div className="prodHint">
          {loading ? "Đang tải..." : err ? `Lỗi: ${err}` : `${tree.length} nhóm/sản phẩm · ${visibleVariantsCount}/${rows.length} biến thể`}
        </div>
        <div className="prodActions">
          <select
            className="admSelect prodFilterSelect"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">Tất cả danh mục</option>
            {categories.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            className="admInput"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm theo parent / variant / SKU / barcode / ID / danh mục..."
            style={{ width: 360 }}
          />
          <button className="prodActionBtn" disabled={busy || loading} onClick={() => loadAll()}>
            Tải lại
          </button>
          <button className="prodActionBtn" disabled={busy || loading} onClick={() => setShowExcel(true)}>
            Excel
          </button>
          <button className="prodActionBtn prodActionPrimary" disabled={busy || loading} onClick={() => setShowCreateProduct(true)}>
            + Tạo sản phẩm
          </button>
          <button className="prodActionBtn" disabled={busy || loading} onClick={() => setShowCreateParent(true)}>
            + Thêm nhóm sản phẩm
          </button>
          <button
            className="prodActionBtn"
            disabled={busy || loading || parents.length === 0}
            onClick={() => {
              setCreateVariantParentId(parents[0]?.id ? String(parents[0].id) : "")
              setShowCreateVariant(true)
            }}
          >
            + Thêm biến thể nhanh
          </button>
        </div>
      </div>

      <div className="prodTree">
        <div className="prodTreeHead">
          <div>Sản phẩm</div>
          <div>Danh mục</div>
          <div>SKU / Barcode</div>
          <div>Đơn vị</div>
          <div className="prodRight">Tồn</div>
          <div className="prodRight">Giá</div>
          <div className="prodRight">Giá cuộn</div>
          <div className="prodRight">Giá nhập</div>
          <div>Trạng thái</div>
          <div className="prodRight">Thao tác</div>
        </div>

        <div className="prodTreeBody">
          {tree.map((group) => {
            const key = String(group.parent.id)
            const hasChildren = group.variants.length > 0
            const expanded = q.trim() ? true : expandedParentIds.has(key)
            const standalone = isStandaloneGroup(group)

            if (standalone) {
              const v = group.variants[0]
              return (
                <div className="prodTreeGroup" key={`standalone-${v.id}`}>
                  <div className="prodTreeRow prodTreeVariant prodTreeStandalone">
                    <div className="prodTreeNameCell">
                      <span className="prodExpanderEmpty" />
                      <span className="prodName">{v.name}</span>
                      <span className="prodPill">#{v.id}</span>
                    </div>
                    <div className="prodName">{resolveCategoryNameForVariant(v, group.parent) || "—"}</div>
                    <div className="prodVariantCodes">
                      <span className="prodMono">{v.sku || "—"}</span>
                      <span className="prodMono">{v.barcode || "—"}</span>
                    </div>
                    <div className="prodMono">{v.uom || "—"}</div>
                    <div className="prodMono prodRight">{fmtMoney(v.stock)}</div>
                    <div className="prodMono prodRight">{fmtMoney(v.price)}</div>
                    <div className="prodMono prodRight">{fmtMoney(v.roll_price)}</div>
                    <div className="prodMono prodRight">{fmtMoney(v.cost_price)}</div>
                    <div className="prodMono">{v.track_stock_unit ? "Theo cuộn" : "Thường"}</div>
                    <div className="prodTreeActions">
                      <button className="prodMiniBtn" disabled={busy} onClick={() => setEditVariant(v)}>
                        Sửa
                      </button>
                      <button className="prodMiniBtn prodMiniDanger" disabled={busy} onClick={() => setDeleteVariant(v)}>
                        Xoá
                      </button>
                    </div>
                  </div>
                </div>
              )
            }

            return (
              <div className="prodTreeGroup" key={`parent-${key}`}>
                <div className={`prodTreeRow prodTreeParent ${group.synthetic ? "prodTreeParentSynthetic" : ""}`}>
                  <div className="prodTreeNameCell">
                    {hasChildren ? (
                      <button
                        type="button"
                        className="prodExpanderBtn"
                        onClick={() => toggleParent(key)}
                        title={expanded ? "Thu gọn" : "Mở rộng"}
                      >
                        {expanded ? "▾" : "▸"}
                      </button>
                    ) : (
                      <span className="prodExpanderEmpty" />
                    )}
                    <span className="prodParentName">{group.parent.name || `Parent #${group.parent.id}`}</span>
                    <span className="prodPill">Parent #{group.parent.id}</span>
                    {hasChildren ? <span className="prodPill">{group.variants.length} biến thể</span> : <span className="prodPill">Chưa có biến thể</span>}
                  </div>
                  <div className="prodName">
                    {group.parent?.category_id != null
                      ? categoryById.get(String(group.parent.category_id))?.name || "—"
                      : "—"}
                  </div>
                  <div className="prodMono">—</div>
                  <div className="prodMono">—</div>
                  <div className="prodMono prodRight">—</div>
                  <div className="prodMono prodRight">—</div>
                  <div className="prodMono prodRight">—</div>
                  <div className="prodMono prodRight">—</div>
                  <div className="prodMono">{group.synthetic ? "Parent tạm" : "Nhóm sản phẩm"}</div>
                  <div className="prodRight">
                    <button
                      className="prodMiniBtn"
                      disabled={busy}
                      onClick={() => {
                        setCreateVariantParentId(String(group.parent.id))
                        setShowCreateVariant(true)
                      }}
                    >
                      + Biến thể
                    </button>
                  </div>
                </div>

                {hasChildren && expanded
                  ? group.variants.map((v) => (
                      <div className="prodTreeRow prodTreeVariant" key={`variant-${v.id}`}>
                        <div className="prodTreeNameCell">
                          <span className="prodVariantIndent">└</span>
                          <span className="prodName">{v.name}</span>
                          <span className="prodPill">#{v.id}</span>
                        </div>
                        <div className="prodName">{resolveCategoryNameForVariant(v, group.parent) || "—"}</div>
                        <div className="prodVariantCodes">
                          <span className="prodMono">{v.sku || "—"}</span>
                          <span className="prodMono">{v.barcode || "—"}</span>
                        </div>
                        <div className="prodMono">{v.uom || "—"}</div>
                        <div className="prodMono prodRight">{fmtMoney(v.stock)}</div>
                        <div className="prodMono prodRight">{fmtMoney(v.price)}</div>
                        <div className="prodMono prodRight">{fmtMoney(v.roll_price)}</div>
                        <div className="prodMono prodRight">{fmtMoney(v.cost_price)}</div>
                        <div className="prodMono">{v.track_stock_unit ? "Theo cuộn" : "Thường"}</div>
                        <div className="prodTreeActions">
                          <button className="prodMiniBtn" disabled={busy} onClick={() => setEditVariant(v)}>
                            Sửa
                          </button>
                          <button className="prodMiniBtn prodMiniDanger" disabled={busy} onClick={() => setDeleteVariant(v)}>
                            Xoá
                          </button>
                        </div>
                      </div>
                    ))
                  : null}
              </div>
            )
          })}

          {!loading && tree.length === 0 ? <div className="prodEmpty">Không có dữ liệu phù hợp.</div> : null}
        </div>
      </div>

      {showCreateProduct ? (
        <ProductCreateModal
          busy={busy}
          categories={categories}
          locations={locations}
          suppliers={suppliers}
          onClose={() => setShowCreateProduct(false)}
          onCreated={async () => {
            setShowCreateProduct(false)
            await loadAll()
          }}
        />
      ) : null}

      {showCreateParent ? (
        <CreateParentModal
          categories={categories}
          busy={busy}
          onClose={() => setShowCreateParent(false)}
          onCreate={async (payload) => {
            setBusy(true)
            try {
              await post("/api/v1/products/parents", payload)
              setShowCreateParent(false)
              await loadAll()
            } finally {
              setBusy(false)
            }
          }}
        />
      ) : null}

      {showCreateVariant ? (
        <CreateVariantModal
          parents={parents}
          initialParentId={createVariantParentId}
          busy={busy}
          onClose={() => {
            setShowCreateVariant(false)
            setCreateVariantParentId("")
          }}
          onCreate={async ({ parent_id, ...payload }) => {
            setBusy(true)
            try {
              await post(`/api/v1/products/parents/${parent_id}/variants`, payload)
              setShowCreateVariant(false)
              setCreateVariantParentId("")
              await loadAll()
            } finally {
              setBusy(false)
            }
          }}
        />
      ) : null}

      {editVariant ? (
        <EditVariantModal
          variant={variantsById.get(String(editVariant.id)) || editVariant}
          busy={busy}
          onClose={() => setEditVariant(null)}
          onSave={async (id, payload) => {
            setBusy(true)
            try {
              await patch(`/api/v1/products/variants/${id}`, payload)
              setEditVariant(null)
              await loadAll()
            } finally {
              setBusy(false)
            }
          }}
        />
      ) : null}

      {deleteVariant ? (
        <ConfirmDeleteModal
          title="Xoá biến thể"
          body={
            <>
              Bạn chắc chắn muốn xoá biến thể <b>{deleteVariant.name}</b> (ID{" "}
              <span className="admMono">{deleteVariant.id}</span>)?
            </>
          }
          busy={busy}
          onClose={() => setDeleteVariant(null)}
          onConfirm={async () => {
            setBusy(true)
            try {
              await del(`/api/v1/products/variants/${deleteVariant.id}`)
              setDeleteVariant(null)
              await loadAll()
            } finally {
              setBusy(false)
            }
          }}
        />
      ) : null}

      {showExcel ? (
        <ExcelToolsModal
          title="Excel · Sản phẩm"
          resource="products"
          templateUrl="/api/v1/excel/template/products"
          importUrl="/api/v1/excel/import/products"
          exportFilename="san-pham.xlsx"
          getSnapshot={() => exportSnapshot}
          onImported={() => loadAll().catch(() => {})}
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

function CreateParentModal({ categories, busy, onClose, onCreate }) {
  const [name, setName] = useState("")
  const [categoryId, setCategoryId] = useState("")
  const [description, setDescription] = useState("")
  const [imageUrl, setImageUrl] = useState("")
  const [err, setErr] = useState(null)

  return (
    <Modal
      title="Thêm nhóm sản phẩm"
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
              if (!name.trim()) {
                setErr("Tên nhóm sản phẩm là bắt buộc.")
                return
              }
              const payload = {
                name: name.trim(),
                description: description.trim() ? description.trim() : null,
                image_url: imageUrl.trim() ? imageUrl.trim() : null,
                category_id: categoryId ? Number(categoryId) : null,
              }
              onCreate(payload).catch((e) => setErr(e?.message || "Không tạo được nhóm sản phẩm."))
            }}
          >
            Tạo
          </button>
        </>
      }
    >
      {err ? <div className="admErr">{err}</div> : null}
      <div className="admField">
        <FieldLabel className="admLabel" required>
          Tên nhóm
        </FieldLabel>
        <input className="admInput" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ: Lưới Nylon" />
      </div>
      <div className="admGrid2">
        <div className="admField">
          <div className="admLabel">Danh mục</div>
          <select className="admSelect" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">(Không chọn)</option>
            {categories.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="admField">
          <div className="admLabel">Ảnh (URL)</div>
          <input className="admInput" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." />
        </div>
      </div>
      <div className="admField">
        <div className="admLabel">Mô tả</div>
        <textarea className="admTextarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="..." />
      </div>
    </Modal>
  )
}

function CreateVariantModal({ parents, initialParentId, busy, onClose, onCreate }) {
  const [parentId, setParentId] = useState(initialParentId || (parents?.[0]?.id ? String(parents[0].id) : ""))
  const [name, setName] = useState("")
  const [uom, setUom] = useState("pcs")
  const [price, setPrice] = useState("")
  const [costPrice, setCostPrice] = useState("")
  const [rollPrice, setRollPrice] = useState("")
  const [stock, setStock] = useState("0")
  const [sku, setSku] = useState("")
  const [barcode, setBarcode] = useState("")
  const [imageUrl, setImageUrl] = useState("")
  const [track, setTrack] = useState(false)
  const [active, setActive] = useState(true)
  const [attrsJson, setAttrsJson] = useState("")
  const [err, setErr] = useState(null)

  useEffect(() => {
    setParentId(initialParentId || (parents?.[0]?.id ? String(parents[0].id) : ""))
  }, [initialParentId, parents])

  return (
    <Modal
      wide
      title="Thêm biến thể (hàng bán)"
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
              if (!parentId) {
                setErr("Vui lòng chọn nhóm sản phẩm (parent).")
                return
              }
              if (!name.trim()) {
                setErr("Tên biến thể là bắt buộc.")
                return
              }
              if (!uom.trim()) {
                setErr("Đơn vị là bắt buộc.")
                return
              }
              if (!normalizeSku(sku)) {
                setErr("SKU là bắt buộc.")
                return
              }
              if (!price.trim()) {
                setErr("Giá là bắt buộc.")
                return
              }
              const p = Number(price)
              const cp = costPrice.trim() ? Number(costPrice) : null
              const s = Number(stock)
              if (!Number.isFinite(p)) {
                setErr("Giá không hợp lệ.")
                return
              }
              if (costPrice.trim() && (!Number.isFinite(cp) || cp < 0)) {
                setErr("Giá nhập không hợp lệ.")
                return
              }
              if (!Number.isFinite(s) || s < 0) {
                setErr("Tồn không hợp lệ.")
                return
              }
              let attrs = null
              if (attrsJson.trim()) {
                try {
                  attrs = JSON.parse(attrsJson)
                } catch {
                  setErr("Attrs phải là JSON hợp lệ (ví dụ: {\"màu\":\"đen\"}).")
                  return
                }
              }
              const payload = {
                name: name.trim(),
                uom: uom.trim(),
                price: String(p),
                cost_price: cp == null ? null : String(cp),
                roll_price: rollPrice.trim() ? String(Number(rollPrice)) : null,
                stock: String(s),
                sku: normalizeSku(sku),
                barcode: barcode.trim() ? barcode.trim() : null,
                image_url: imageUrl.trim() ? imageUrl.trim() : null,
                attrs,
                track_stock_unit: !!track,
                is_active: !!active,
                parent_id: Number(parentId),
              }
              onCreate(payload).catch((e) => setErr(e?.message || "Không tạo được biến thể."))
            }}
          >
            Tạo
          </button>
        </>
      }
    >
      {err ? <div className="admErr">{err}</div> : null}
      <div className="admGrid2">
        <div className="admField">
          <FieldLabel className="admLabel" required>
            Nhóm sản phẩm (parent)
          </FieldLabel>
          <select className="admSelect" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">(Chọn nhóm)</option>
            {parents.map((p) => (
              <option key={p.id} value={String(p.id)}>
                #{p.id} · {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="admField">
          <FieldLabel className="admLabel" required>
            Đơn vị (uom)
          </FieldLabel>
          <input className="admInput" value={uom} onChange={(e) => setUom(e.target.value)} placeholder="Ví dụ: pcs / m / kg" />
        </div>
      </div>

      <div className="admField">
        <FieldLabel className="admLabel" required>
          Tên biến thể
        </FieldLabel>
        <input className="admInput" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ: Lưới Nylon - Đen (cuộn 50m)" />
      </div>

      <div className="admGrid2">
        <div className="admField">
          <FieldLabel className="admLabel" required>
            Giá (theo uom)
          </FieldLabel>
          <input className="admInput" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Ví dụ: 2.8" />
        </div>
        <div className="admField">
          <div className="admLabel">Giá nhập (theo uom)</div>
          <input className="admInput" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} placeholder="Ví dụ: 1.9" />
        </div>
      </div>

      <div className="admField">
        <div className="admLabel">Giá cuộn (tuỳ chọn)</div>
        <input className="admInput" value={rollPrice} onChange={(e) => setRollPrice(e.target.value)} placeholder="Ví dụ: 135" />
      </div>

      <div className="admGrid2">
        <div className="admField">
          <div className="admLabel">Tồn</div>
          <input className="admInput" value={stock} onChange={(e) => setStock(e.target.value)} placeholder="0" />
        </div>
        <div className="admField">
          <div className="admLabel">Theo dõi theo cuộn (Stock Unit)</div>
          <select className="admSelect" value={track ? "1" : "0"} onChange={(e) => setTrack(e.target.value === "1")}>
            <option value="0">Không</option>
            <option value="1">Có</option>
          </select>
        </div>
      </div>

      <div className="admGrid2">
        <div className="admField">
          <FieldLabel className="admLabel" required>
            SKU
          </FieldLabel>
          <input className="admInput" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="..." />
        </div>
        <div className="admField">
          <div className="admLabel">Barcode</div>
          <input className="admInput" value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="..." />
        </div>
      </div>

      <div className="admGrid2">
        <div className="admField">
          <div className="admLabel">Ảnh (URL)</div>
          <input className="admInput" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." />
        </div>
        <div className="admField">
          <div className="admLabel">Kích hoạt</div>
          <select className="admSelect" value={active ? "1" : "0"} onChange={(e) => setActive(e.target.value === "1")}>
            <option value="1">Đang bán</option>
            <option value="0">Tạm ẩn</option>
          </select>
        </div>
      </div>

      <div className="admField">
        <div className="admLabel">Attrs (JSON, tuỳ chọn)</div>
        <textarea className="admTextarea" value={attrsJson} onChange={(e) => setAttrsJson(e.target.value)} placeholder='Ví dụ: {"color":"đen","meters_per_roll":50}' />
      </div>
    </Modal>
  )
}

function EditVariantModal({ variant, busy, onClose, onSave }) {
  const [name, setName] = useState(variant.name || "")
  const [uom, setUom] = useState(variant.uom || "")
  const [price, setPrice] = useState(variant.price != null ? String(variant.price) : "")
  const [costPrice, setCostPrice] = useState(variant.cost_price != null ? String(variant.cost_price) : "")
  const [rollPrice, setRollPrice] = useState(variant.roll_price != null ? String(variant.roll_price) : "")
  const [stock, setStock] = useState(variant.stock != null ? String(variant.stock) : "")
  const [sku, setSku] = useState(variant.sku || "")
  const [barcode, setBarcode] = useState(variant.barcode || "")
  const [imageUrl, setImageUrl] = useState(variant.image_url || "")
  const [track, setTrack] = useState(!!variant.track_stock_unit)
  const [active, setActive] = useState(!!variant.is_active)
  const [attrsJson, setAttrsJson] = useState(variant.attrs ? JSON.stringify(variant.attrs, null, 2) : "")
  const [err, setErr] = useState(null)

  return (
    <Modal
      wide
      title={`Sửa biến thể #${variant.id}`}
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
              if (!name.trim()) {
                setErr("Tên biến thể là bắt buộc.")
                return
              }
              if (!uom.trim()) {
                setErr("Đơn vị là bắt buộc.")
                return
              }
              if (!normalizeSku(sku)) {
                setErr("SKU là bắt buộc.")
                return
              }
              if (!price.trim()) {
                setErr("Giá là bắt buộc.")
                return
              }
              if (costPrice.trim()) {
                const cp = Number(costPrice)
                if (!Number.isFinite(cp) || cp < 0) {
                  setErr("Giá nhập không hợp lệ.")
                  return
                }
              }
              const payload = {
                name: name.trim(),
                uom: uom.trim(),
                price: String(Number(price)),
                cost_price: costPrice.trim() ? String(Number(costPrice)) : null,
                roll_price: rollPrice.trim() ? String(Number(rollPrice)) : null,
                stock: stock.trim() ? String(Number(stock)) : null,
                sku: normalizeSku(sku),
                barcode: barcode.trim() ? barcode.trim() : null,
                image_url: imageUrl.trim() ? imageUrl.trim() : null,
                track_stock_unit: !!track,
                is_active: !!active,
              }
              if (attrsJson.trim()) {
                try {
                  payload.attrs = JSON.parse(attrsJson)
                } catch {
                  setErr("Attrs phải là JSON hợp lệ.")
                  return
                }
              } else {
                payload.attrs = null
              }
              onSave(variant.id, payload).catch((e) => setErr(e?.message || "Không lưu được biến thể."))
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
            Tên
          </FieldLabel>
          <input className="admInput" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="admField">
          <FieldLabel className="admLabel" required>
            Đơn vị (uom)
          </FieldLabel>
          <input className="admInput" value={uom} onChange={(e) => setUom(e.target.value)} placeholder="pcs / m / kg" />
        </div>
      </div>
      <div className="admGrid2">
        <div className="admField">
          <FieldLabel className="admLabel" required>
            Giá
          </FieldLabel>
          <input className="admInput" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <div className="admField">
          <div className="admLabel">Giá nhập</div>
          <input className="admInput" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} />
        </div>
      </div>
      <div className="admField">
        <div className="admLabel">Giá cuộn</div>
        <input className="admInput" value={rollPrice} onChange={(e) => setRollPrice(e.target.value)} />
      </div>
      <div className="admGrid2">
        <div className="admField">
          <div className="admLabel">Tồn</div>
          <input className="admInput" value={stock} onChange={(e) => setStock(e.target.value)} />
        </div>
        <div className="admField">
          <div className="admLabel">Theo dõi theo cuộn (Stock Unit)</div>
          <select className="admSelect" value={track ? "1" : "0"} onChange={(e) => setTrack(e.target.value === "1")}>
            <option value="0">Không</option>
            <option value="1">Có</option>
          </select>
        </div>
      </div>
      <div className="admGrid2">
        <div className="admField">
          <FieldLabel className="admLabel" required>
            SKU
          </FieldLabel>
          <input className="admInput" value={sku} onChange={(e) => setSku(e.target.value)} />
        </div>
        <div className="admField">
          <div className="admLabel">Barcode</div>
          <input className="admInput" value={barcode} onChange={(e) => setBarcode(e.target.value)} />
        </div>
      </div>
      <div className="admGrid2">
        <div className="admField">
          <div className="admLabel">Ảnh (URL)</div>
          <input className="admInput" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
        </div>
        <div className="admField">
          <div className="admLabel">Kích hoạt</div>
          <select className="admSelect" value={active ? "1" : "0"} onChange={(e) => setActive(e.target.value === "1")}>
            <option value="1">Đang bán</option>
            <option value="0">Tạm ẩn</option>
          </select>
        </div>
      </div>
      <div className="admField">
        <div className="admLabel">Attrs (JSON)</div>
        <textarea className="admTextarea" value={attrsJson} onChange={(e) => setAttrsJson(e.target.value)} />
      </div>
    </Modal>
  )
}
