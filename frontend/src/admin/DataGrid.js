import { useEffect, useMemo, useRef, useState } from "react"
import Modal from "./Modal"
import "./datagrid.css"

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

function loadCfg(id) {
  try {
    const raw = localStorage.getItem(`adm.grid.${id}.v1`)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveCfg(id, cfg) {
  localStorage.setItem(`adm.grid.${id}.v1`, JSON.stringify(cfg))
}

function isNumericLike(v) {
  if (typeof v === "number") return Number.isFinite(v)
  if (typeof v !== "string") return false
  const s = v.trim()
  if (!s) return false
  return /^-?\d+(\.\d+)?$/.test(s)
}

function toComparable(v) {
  if (v === null || v === undefined) return { kind: "null", v: null }
  if (typeof v === "boolean") return { kind: "num", v: v ? 1 : 0 }
  if (isNumericLike(v)) return { kind: "num", v: Number(v) }
  return { kind: "str", v: String(v).toLowerCase() }
}

export default function DataGrid({ id, columns, rows, rowKey, onSnapshot }) {
  const defaults = useMemo(() => {
    const visibleKeys = columns.filter((c) => c.defaultVisible !== false).map((c) => c.key)
    const widths = {}
    for (const c of columns) {
      if (c.width) widths[c.key] = c.width
    }
    return { visibleKeys, widths, sortKey: null, sortDir: null, filters: {} }
  }, [columns])

  const [cfg, setCfg] = useState(() => loadCfg(id) || defaults)
  const [showColumns, setShowColumns] = useState(false)
  const gridRef = useRef(null)
  const topScrollRef = useRef(null)
  const topScrollInnerRef = useRef(null)
  const scrollSyncRef = useRef(null)
  const [showTopScroll, setShowTopScroll] = useState(false)

  // Keep config compatible when columns change (new keys, removed keys).
  useEffect(() => {
    const colKeys = new Set(columns.map((c) => c.key))
    const nextVisible = (cfg.visibleKeys || []).filter((k) => colKeys.has(k))
    const anyVisible = nextVisible.length ? nextVisible : defaults.visibleKeys
    const nextWidths = { ...(cfg.widths || {}) }
    for (const k of Object.keys(nextWidths)) {
      if (!colKeys.has(k)) delete nextWidths[k]
    }
    const nextFilters = { ...(cfg.filters || {}) }
    for (const k of Object.keys(nextFilters)) {
      if (!colKeys.has(k)) delete nextFilters[k]
    }
    const next = {
      visibleKeys: anyVisible,
      widths: nextWidths,
      sortKey: cfg.sortKey || null,
      sortDir: cfg.sortDir || null,
      filters: nextFilters,
    }
    setCfg(next)
    saveCfg(id, next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, columns.length])

  const visibleCols = useMemo(() => {
    const visibleSet = new Set(cfg.visibleKeys || [])
    return columns.filter((c) => visibleSet.has(c.key))
  }, [cfg.visibleKeys, columns])

  const fillKey = useMemo(() => {
    // Convention: the first column with fill=true becomes the "fill" column.
    const fillCol = columns.find((c) => c.fill)
    return fillCol ? fillCol.key : null
  }, [columns])

  // Ensure fill column is always visible.
  useEffect(() => {
    if (!fillKey) return
    setCfg((prev) => {
      const cur = new Set(prev.visibleKeys || [])
      cur.add(fillKey)
      const next = { ...prev, visibleKeys: Array.from(cur) }
      saveCfg(id, next)
      return next
    })
  }, [fillKey, id])

  const gridTemplateColumns = useMemo(() => {
    return visibleCols
      .map((c) => {
        if (fillKey && c.key === fillKey) {
          // For the fill column, a stored width acts as the minimum width.
          const stored = cfg.widths?.[c.key]
          const min = typeof stored === "number" && Number.isFinite(stored) ? stored : c.minWidth || 220
          return `minmax(${min}px, 1fr)`
        }

        const w = cfg.widths?.[c.key]
        if (typeof w === "number" && Number.isFinite(w)) return `${Math.round(w)}px`
        const min = c.minWidth || 90
        const fr = c.flex || 1
        return `minmax(${min}px, ${fr}fr)`
      })
      .join(" ")
  }, [visibleCols, cfg.widths, fillKey])

  // Resize handling
  const dragRef = useRef(null)
  useEffect(() => {
    function onMove(e) {
      if (!dragRef.current) return
      const { key, startX, startW, minW, maxW } = dragRef.current
      const dx = e.clientX - startX
      const nextW = clamp(startW + dx, minW, maxW)
      setCfg((prev) => {
        const next = { ...prev, widths: { ...(prev.widths || {}), [key]: nextW } }
        saveCfg(id, next)
        return next
      })
    }
    function onUp() {
      dragRef.current = null
      document.body.classList.remove("dgNoSelect")
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [id])

  function toggleColumn(key) {
    if (fillKey && key === fillKey) return
    setCfg((prev) => {
      const cur = new Set(prev.visibleKeys || [])
      if (cur.has(key)) cur.delete(key)
      else cur.add(key)
      const nextKeys = Array.from(cur)
      const safeKeys = nextKeys.length ? nextKeys : (defaults.visibleKeys || [])
      const next = { ...prev, visibleKeys: safeKeys }
      saveCfg(id, next)
      return next
    })
  }

  function getCurrentWidth(c) {
    const w = cfg.widths?.[c.key]
    if (typeof w === "number" && Number.isFinite(w)) return w
    if (typeof c.width === "number" && Number.isFinite(c.width)) return c.width
    return c.minWidth || 120
  }

  function resetWidths() {
    setCfg((prev) => {
      const next = { ...prev, widths: {} }
      saveCfg(id, next)
      return next
    })
  }

  function isSortable(c) {
    if (c.sortable === false) return false
    if (c.key === "actions") return false
    return true
  }

  function isFilterable(c) {
    if (c.filterable === false) return false
    if (c.key === "actions") return false
    return true
  }

  function toggleSort(key) {
    setCfg((prev) => {
      const curKey = prev.sortKey || null
      const curDir = prev.sortDir || null

      let nextKey = key
      let nextDir = "asc"
      if (curKey === key && curDir === "asc") nextDir = "desc"
      else if (curKey === key && curDir === "desc") {
        nextKey = null
        nextDir = null
      }
      const next = { ...prev, sortKey: nextKey, sortDir: nextDir }
      saveCfg(id, next)
      return next
    })
  }

  function setFilter(key, value) {
    setCfg((prev) => {
      const next = { ...prev, filters: { ...(prev.filters || {}), [key]: value } }
      saveCfg(id, next)
      return next
    })
  }

  function clearAllFilters() {
    setCfg((prev) => {
      const next = { ...prev, filters: {} }
      saveCfg(id, next)
      return next
    })
  }

  useEffect(() => {
    function syncMetrics() {
      const gridEl = gridRef.current
      const topInner = topScrollInnerRef.current
      const topEl = topScrollRef.current
      if (!gridEl) return

      const overflowX = gridEl.scrollWidth > gridEl.clientWidth + 1
      setShowTopScroll(overflowX)

      if (topInner) {
        topInner.style.width = `${gridEl.scrollWidth}px`
      }
      if (topEl && Math.abs(topEl.scrollLeft - gridEl.scrollLeft) > 1) {
        topEl.scrollLeft = gridEl.scrollLeft
      }
    }

    syncMetrics()
    const gridEl = gridRef.current
    if (!gridEl) return

    let ro = null
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => syncMetrics())
      ro.observe(gridEl)
    }

    window.addEventListener("resize", syncMetrics)
    return () => {
      window.removeEventListener("resize", syncMetrics)
      if (ro) ro.disconnect()
    }
  }, [
    visibleCols,
    rows.length,
    gridTemplateColumns,
    cfg.widths,
    cfg.filters,
    cfg.sortKey,
    cfg.sortDir,
  ])

  useEffect(() => {
    const gridEl = gridRef.current
    const topEl = topScrollRef.current
    if (!gridEl || !topEl) return

    function onGridScroll() {
      if (scrollSyncRef.current === "top") return
      scrollSyncRef.current = "grid"
      topEl.scrollLeft = gridEl.scrollLeft
      scrollSyncRef.current = null
    }
    function onTopScroll() {
      if (scrollSyncRef.current === "grid") return
      scrollSyncRef.current = "top"
      gridEl.scrollLeft = topEl.scrollLeft
      scrollSyncRef.current = null
    }

    gridEl.addEventListener("scroll", onGridScroll, { passive: true })
    topEl.addEventListener("scroll", onTopScroll, { passive: true })
    return () => {
      gridEl.removeEventListener("scroll", onGridScroll)
      topEl.removeEventListener("scroll", onTopScroll)
    }
  }, [showTopScroll])

  const filteredRows = useMemo(() => {
    const fs = cfg.filters || {}
    const active = Object.entries(fs).filter(([, v]) => String(v || "").trim())
    if (!active.length) return rows

    const colByKey = new Map(columns.map((c) => [c.key, c]))
    return rows.filter((r) => {
      for (const [k, rawNeedle] of active) {
        const col = colByKey.get(k)
        if (!col || !isFilterable(col)) continue
        const getVal = col.getFilterValue || col.getValue || ((x) => x?.[k])
        const raw = getVal(r)
        const hay = raw == null ? "" : String(raw).toLowerCase()
        const tokens = String(rawNeedle || "")
          .trim()
          .toLowerCase()
          .split(/\s+/g)
          .filter(Boolean)
        for (const t of tokens) {
          if (!hay.includes(t)) return false
        }
      }
      return true
    })
  }, [rows, cfg.filters, columns])

  const sortedRows = useMemo(() => {
    const key = cfg.sortKey
    const dir = cfg.sortDir
    if (!key || !dir) return filteredRows

    const col = columns.find((c) => c.key === key)
    if (!col || !isSortable(col)) return filteredRows

    const getVal = col.getValue || ((r) => r?.[key])
    const mult = dir === "desc" ? -1 : 1

    // Stable sort (preserve original order when equal)
    return filteredRows
      .map((r, idx) => ({ r, idx }))
      .sort((a, b) => {
        const av = toComparable(getVal(a.r))
        const bv = toComparable(getVal(b.r))
        if (av.kind === "null" && bv.kind === "null") return a.idx - b.idx
        if (av.kind === "null") return 1
        if (bv.kind === "null") return -1

        if (av.kind !== bv.kind) {
          // numbers first, then strings
          const rank = (k) => (k === "num" ? 0 : 1)
          const d0 = rank(av.kind) - rank(bv.kind)
          if (d0 !== 0) return d0
        }

        if (av.v < bv.v) return -1 * mult
        if (av.v > bv.v) return 1 * mult
        return a.idx - b.idx
      })
      .map((x) => x.r)
  }, [filteredRows, cfg.sortKey, cfg.sortDir, columns])

  // Optional: expose the current view (visible columns + filtered/sorted rows)
  // so pages can export exactly what the user is seeing.
  useEffect(() => {
    if (typeof onSnapshot !== "function") return
    onSnapshot({
      id,
      visibleCols,
      rows: sortedRows,
      cfg,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, onSnapshot, visibleCols, sortedRows, cfg.sortKey, cfg.sortDir, cfg.filters, cfg.visibleKeys, cfg.widths])

  return (
    <div className="dgWrap">
      <div className="dgToolbar">
        <div className="dgToolbarLeft">
          {Object.values(cfg.filters || {}).some((v) => String(v || "").trim()) ? (
            <button className="dgBtn" onClick={clearAllFilters} title="Xoá toàn bộ lọc theo cột">
              Xoá lọc cột
            </button>
          ) : null}
        </div>
        <button className="dgBtn" onClick={() => setShowColumns(true)}>
          Tuỳ chỉnh cột
        </button>
      </div>

      {showTopScroll ? (
        <div ref={topScrollRef} className="dgTopScroll" title="Cuộn ngang nhanh">
          <div ref={topScrollInnerRef} className="dgTopScrollInner" />
        </div>
      ) : null}

      <div ref={gridRef} className="dgGrid" style={{ gridTemplateColumns }}>
        {visibleCols.map((c) => (
          <div
            key={c.key}
            className={`dgHeadCell ${c.align === "right" ? "dgRight" : ""} ${isSortable(c) ? "dgHeadSortable" : ""}`}
          >
            {isSortable(c) ? (
              <button className="dgSortBtn" type="button" onClick={() => toggleSort(c.key)} title="Bấm để sắp xếp">
                <span className="dgHeadTitle">{c.title}</span>
                <span className={`dgSortIcon ${cfg.sortKey === c.key ? "dgSortIconOn" : ""}`}>
                  {cfg.sortKey === c.key && cfg.sortDir === "asc" ? "↑" : cfg.sortKey === c.key && cfg.sortDir === "desc" ? "↓" : "↕"}
                </span>
              </button>
            ) : (
              <div className="dgHeadTitle" title={c.title}>
                {c.title}
              </div>
            )}
            <div
              className="dgResize"
              onMouseDown={(e) => {
                const startW = getCurrentWidth(c)
                const minW = c.minWidth || 80
                const maxW = c.maxWidth || 2000

                dragRef.current = { key: c.key, startX: e.clientX, startW, minW, maxW }
                document.body.classList.add("dgNoSelect")
              }}
              title="Kéo để đổi độ rộng"
            />
          </div>
        ))}

        {visibleCols.map((c) => (
          <div key={`filter:${c.key}`} className={`dgFilterCell ${c.align === "right" ? "dgRight" : ""}`}>
            {isFilterable(c) ? (
              <input
                className="dgFilterInput"
                value={cfg.filters?.[c.key] || ""}
                onChange={(e) => setFilter(c.key, e.target.value)}
                placeholder="Lọc..."
              />
            ) : (
              <div className="dgFilterBlank" />
            )}
          </div>
        ))}

        {sortedRows.map((r) => {
          const k = rowKey(r)
          return visibleCols.map((c) => (
            <div
              key={`${k}:${c.key}`}
              className={`dgCell ${c.align === "right" ? "dgRight" : ""}`}
              title={c.title}
            >
              {c.render(r)}
            </div>
          ))
        })}
      </div>

      {showColumns ? (
        <Modal
          title="Tuỳ chỉnh cột"
          onClose={() => setShowColumns(false)}
          footer={
            <>
              <button className="admBtn" onClick={resetWidths}>
                Tự căn đều cột
              </button>
              <button className="admBtn admBtnPrimary" onClick={() => setShowColumns(false)}>
                Xong
              </button>
            </>
          }
        >
          <div className="dgCols">
            {columns.map((c) => {
              const checked = (cfg.visibleKeys || []).includes(c.key)
              return (
                <label key={c.key} className="dgColRow">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!!fillKey && c.key === fillKey}
                    onChange={() => toggleColumn(c.key)}
                  />
                  <span>{c.title}</span>
                </label>
              )
            })}
          </div>
          <div className="admLabel">
            Gợi ý: kéo mép phải của tiêu đề cột để thay đổi độ rộng. Bảng có thể rộng hơn màn hình (cuộn ngang),
            nhưng không bao giờ hẹp hơn (cột “fill” sẽ tự giãn để lấp đầy).
          </div>
        </Modal>
      ) : null}
    </div>
  )
}
