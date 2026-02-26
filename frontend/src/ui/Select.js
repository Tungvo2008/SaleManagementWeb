import React, { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import "./select.css"

function asStr(v) {
  if (v === null || v === undefined) return ""
  return String(v)
}

export default function UiSelect({
  value,
  options,
  onChange,
  disabled = false,
  size = "md", // sm | md | lg
  placeholder = "Chọn...",
  className = "",
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const btnRef = useRef(null)
  const menuRef = useRef(null)
  const [menuPos, setMenuPos] = useState(null)

  const selected = useMemo(() => {
    const v = asStr(value)
    return (options || []).find((o) => asStr(o.value) === v) || null
  }, [value, options])

  useEffect(() => {
    if (!open) return
    function measure() {
      const btn = btnRef.current
      if (!btn) return
      const r = btn.getBoundingClientRect()
      const width = Math.max(200, Math.round(r.width))
      const left = Math.min(Math.max(10, Math.round(r.left)), Math.max(10, window.innerWidth - width - 10))

      // Prefer opening down; if not enough room, open up.
      const roomDown = window.innerHeight - r.bottom
      const estimated = 280
      const openUp = roomDown < 220 && r.top > estimated
      const top = openUp ? Math.max(10, Math.round(r.top - 6)) : Math.round(r.bottom + 6)

      setMenuPos({
        left,
        top,
        width,
        // When opening up, we anchor menu bottom to button top via translateY(-100%).
        openUp,
      })
    }

    measure()
    function onDocDown(e) {
      const btn = btnRef.current
      const menu = menuRef.current
      const t = e.target
      if (btn && btn.contains(t)) return
      if (menu && menu.contains(t)) return
      setOpen(false)
    }
    function onEsc(e) {
      if (e.key === "Escape") setOpen(false)
    }
    function onScrollOrResize() {
      // Keep it simple: re-measure while open.
      measure()
    }
    document.addEventListener("mousedown", onDocDown)
    window.addEventListener("keydown", onEsc)
    window.addEventListener("scroll", onScrollOrResize, true)
    window.addEventListener("resize", onScrollOrResize)
    return () => {
      document.removeEventListener("mousedown", onDocDown)
      window.removeEventListener("keydown", onEsc)
      window.removeEventListener("scroll", onScrollOrResize, true)
      window.removeEventListener("resize", onScrollOrResize)
    }
  }, [open])

  return (
    <div ref={rootRef} className={`uiSelect uiSelect_${size} ${className}`}>
      <button
        ref={btnRef}
        type="button"
        className="uiSelectBtn"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open ? "true" : "false"}
        onClick={() => {
          if (disabled) return
          setOpen((v) => !v)
        }}
      >
        <span className={`uiSelectLabel ${selected ? "" : "uiSelectPh"}`}>{selected ? selected.label : placeholder}</span>
        <span className={`uiSelectChevron ${open ? "uiSelectChevronOpen" : ""}`} aria-hidden="true">
          ▾
        </span>
      </button>

      {open && menuPos
        ? createPortal(
            <div
              ref={menuRef}
              className="uiSelectMenu"
              role="listbox"
              style={{
                left: menuPos.left,
                top: menuPos.top,
                width: menuPos.width,
                transform: menuPos.openUp ? "translateY(-100%)" : "none",
              }}
            >
              {(options || []).map((o) => {
                const isActive = asStr(o.value) === asStr(value)
                return (
                  <button
                    key={asStr(o.value)}
                    type="button"
                    className={`uiSelectOpt ${isActive ? "uiSelectOptActive" : ""}`}
                    onClick={() => {
                      onChange?.(o.value)
                      setOpen(false)
                    }}
                  >
                    <span>{o.label}</span>
                    {isActive ? (
                      <span className="uiSelectTick">✓</span>
                    ) : (
                      <span className="uiSelectTick uiSelectTickOff">✓</span>
                    )}
                  </button>
                )
              })}
            </div>,
            document.body
          )
        : null}
    </div>
  )
}
