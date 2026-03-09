import React, { useEffect, useMemo, useRef, useState } from "react"
import { del, get, patch, post } from "../api"
import { fmtQty, fmtVnd } from "./money"
import { fmtDateTimeVN, ymdMonthStartVN, ymdTodayVN } from "../utils/datetime"
import "./pos.css"
import {
  defaultReceiptTemplate,
  normalizeReceiptTemplate,
} from "./receiptTemplate"
import UiSelect from "../ui/Select"

const LS_ORDER_ID = "pos.orderId"

function asNum(v) {
  const n = typeof v === "string" ? Number(v) : Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

function clampMoneyInput(s) {
  // allow empty; otherwise keep only digits + dot
  if (s === "") return ""
  const cleaned = String(s).replace(/[^\d.]/g, "")
  return cleaned
}

function selectAllOnFocus(e) {
  // UX: click/focus auto-selects number fields so cashier can overwrite quickly.
  try {
    e.currentTarget.select()
  } catch {
    // ignore
  }
}

function isEnterKey(e) {
  return e.key === "Enter"
}

function round2(n) {
  return Math.round(n * 100) / 100
}

function computeDiscountAmount({ mode, valueStr, base }) {
  const raw = valueStr === "" ? 0 : Number(valueStr)
  if (!Number.isFinite(raw) || raw < 0) return NaN
  if (mode === "percent") {
    if (raw > 100) return NaN
    return round2((base * raw) / 100)
  }
  return round2(raw)
}

function roundUp(value, step) {
  if (value <= 0) return step
  return Math.ceil(value / step) * step
}

function nearlyEqual(a, b) {
  return Math.abs(a - b) < 0.000001
}

function todayYmd() {
  return ymdTodayVN()
}

function monthStartYmd() {
  return ymdMonthStartVN()
}

function fmtDateTime(v) {
  return fmtDateTimeVN(v, "—")
}

function useHotkeys(map) {
  useEffect(() => {
    function onKeyDown(e) {
      const key = e.key.toLowerCase()
      const combo = [
        e.ctrlKey ? "ctrl" : null,
        e.shiftKey ? "shift" : null,
        e.altKey ? "alt" : null,
        key,
      ]
        .filter(Boolean)
        .join("+")

      const fn = map[combo] || map[key]
      if (fn) {
        e.preventDefault()
        fn(e)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [map])
}

function Toast({ kind, message, onClose }) {
  useEffect(() => {
    if (!message) return
    const t = setTimeout(onClose, 3200)
    return () => clearTimeout(t)
  }, [message, onClose])

  if (!message) return null
  return (
    <div className={`toast ${kind === "error" ? "toastErr" : ""}`}>
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ fontWeight: 800 }}>
          {kind === "error" ? "Lỗi" : "Thông báo"}
        </div>
        <button
          className="btn"
          onClick={onClose}
          style={{ padding: "6px 10px" }}
        >
          Đóng
        </button>
      </div>
      <div
        style={{
          marginTop: 8,
          color: kind === "error" ? "var(--danger)" : "var(--muted)",
        }}
      >
        {message}
      </div>
    </div>
  )
}

function Modal({ title, children, footer, onClose, wide }) {
  return (
    <div className="modalOverlay" onMouseDown={onClose}>
      <div
        className={`modal ${wide ? "modalWide" : ""}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="cardHeader">
          <div className="modalTitle">{title}</div>
          <button className="btn" onClick={onClose}>
            Đóng (Esc)
          </button>
        </div>
        <div className="modalBody">{children}</div>
        {footer ? <div className="modalFooter">{footer}</div> : null}
      </div>
    </div>
  )
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function ReceiptModal({ receipt, onClose, onRefund, template }) {
  if (!receipt) return null
  const cfg = normalizeReceiptTemplate(template || defaultReceiptTemplate)
  return (
    <Modal
      wide
      title={`Hoá đơn #${receipt.order_id}`}
      onClose={onClose}
      footer={
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          {receipt.status === "checked_out" ? (
            <button
              className="btn"
              onClick={() => {
                if (!onRefund) return
                onRefund(receipt.order_id)
              }}
            >
              Refund
            </button>
          ) : null}
          <button
            className="btn btnPrimary"
            onClick={() => {
              // NOTE:
              // Using `noopener,noreferrer` here can make `document.write` fail
              // on some browsers (new window becomes inaccessible), resulting in
              // a blank print popup.
              const w = window.open("", "_blank", "width=420,height=700")
              if (!w) return
              const isThermal = (cfg.printLayout || "thermal") === "thermal"
              const paperWidthMm = cfg.paperSize === "58" ? 58 : 80
              const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Receipt ${receipt.order_id}</title>
  <style>
    @page { size: ${isThermal ? "auto" : "A4"}; margin: ${isThermal ? "0" : "10mm"}; }
    body { font-family: Arial, "Helvetica Neue", Helvetica, sans-serif; margin: ${isThermal ? "0" : "16px"}; color: #121417; }
    .wrap { width: ${isThermal ? `${paperWidthMm}mm` : "760px"}; padding: ${isThermal ? "2mm" : "0"}; }
    h1 { font-size: 18px; margin: 0 0 8px; }
    .muted { color: #5d6066; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { border-bottom: 1px solid rgba(18,20,23,0.12); padding: 8px 0; font-size: 13px; vertical-align: top; }
    th { text-align: left; font-size: 12px; color: #5d6066; font-weight: 700; }
    .right { text-align: right; }
    .totals { margin-top: 12px; display: grid; gap: 6px; }
    .row { display: flex; justify-content: space-between; font-size: 13px; }
    .grand { font-weight: 800; font-size: 14px; }
  </style>
</head>
<body>
  <div class="wrap">
  <h1>${escapeHtml(cfg.storeName || "Cua Hang")} - Hoa don #${receipt.order_id}</h1>
  ${cfg.storeAddress ? `<div class="muted">${escapeHtml(cfg.storeAddress)}</div>` : ""}
  ${cfg.storePhone ? `<div class="muted">SDT: ${escapeHtml(cfg.storePhone)}</div>` : ""}
  ${receipt.customer_name ? `<div class="muted">Khach: ${escapeHtml(receipt.customer_name)}${receipt.customer_phone ? ` - ${escapeHtml(receipt.customer_phone)}` : ""}</div>` : ""}
  ${cfg.headerNote ? `<div class="muted">${escapeHtml(cfg.headerNote)}</div>` : ""}
  <div class="muted">${fmtDateTime(receipt.created_at)}</div>
  <table>
    <thead>
      <tr>
        <th>Hàng</th>
        <th class="right">SL</th>
        <th class="right">Đơn giá</th>
        <th class="right">TT</th>
      </tr>
    </thead>
    <tbody>
      ${receipt.items
        .map(
          (it) => `
        <tr>
          <td>
            <div style="font-weight:700">${escapeHtml(it.name)}</div>
            <div class="muted">${[
              cfg.showPricingMode ? it.pricing_mode : null,
              Number(it.discount_total || 0) > 0
                ? `KM:${fmtVnd(it.discount_total)}đ`
                : null,
              cfg.showBarcode && it.barcode ? it.barcode : null,
              cfg.showSku && it.sku ? it.sku : null,
            ]
              .filter(Boolean)
              .map(escapeHtml)
              .join(" · ")}</div>
          </td>
          <td class="right">${it.qty}${it.uom ? " " + it.uom : ""}</td>
          <td class="right">${fmtVnd(it.unit_price)}đ</td>
          <td class="right">${fmtVnd(it.line_total)}đ</td>
        </tr>
      `,
        )
        .join("")}
    </tbody>
  </table>
  <div class="totals">
    <div class="row"><span>Tạm tính</span><span>${fmtVnd(receipt.subtotal)}đ</span></div>
    <div class="row"><span>Khuyến mãi</span><span>${fmtVnd(receipt.discount_total)}đ</span></div>
    <div class="row grand"><span>Tổng</span><span>${fmtVnd(receipt.grand_total)}đ</span></div>
  </div>
  ${cfg.footerText ? `<div class="muted">${escapeHtml(cfg.footerText)}</div>` : ""}
  ${cfg.showThankYou ? `<div class="muted">Cam on quy khach!</div>` : ""}
  </div>
  <script>window.print()</script>
</body>
</html>`
              try {
                w.document.open()
                w.document.write(html)
                w.document.close()
                w.focus()
              } catch {
                // Fallback: open printable HTML via blob URL
                const blob = new Blob([html], {
                  type: "text/html;charset=utf-8",
                })
                const url = URL.createObjectURL(blob)
                window.open(url, "_blank")
              }
            }}
          >
            In hoá đơn
          </button>
        </div>
      }
    >
      <div className="receipt">
        <div className="receiptHead" style={{ marginBottom: 6 }}>
          <div className="receiptTitle">{cfg.storeName || "Cua Hang"}</div>
          <div className="receiptMeta">
            {cfg.storePhone ? (
              <span className="pill">SDT: {cfg.storePhone}</span>
            ) : null}
            {receipt.customer_name ? (
              <span className="pill">
                Khách: {receipt.customer_name}
                {receipt.customer_phone ? ` · ${receipt.customer_phone}` : ""}
              </span>
            ) : null}
          </div>
        </div>
        {cfg.storeAddress ? (
          <div className="hint" style={{ marginBottom: 4 }}>
            {cfg.storeAddress}
          </div>
        ) : null}
        {cfg.headerNote ? (
          <div className="hint" style={{ marginBottom: 8 }}>
            {cfg.headerNote}
          </div>
        ) : null}
        <div className="receiptHead">
          <div className="receiptTitle">
            Tổng: {fmtVnd(receipt.grand_total)} đ
          </div>
          <div className="receiptMeta">
            <span className="pill">Status: {receipt.status}</span>
            <span className="pill">
              {fmtDateTime(receipt.created_at)}
            </span>
          </div>
        </div>

        <div className="tableWrap">
          <table className="table">
            <thead>
              <tr>
                <th>Hàng</th>
                <th className="right">SL</th>
                <th className="right">Đơn giá</th>
                <th className="right">Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              {receipt.items.map((it) => (
                <tr key={it.item_id}>
                  <td>
                    <div className="tName">{it.name}</div>
                    <div className="tMeta">
                      {cfg.showPricingMode ? (
                        <span className="pill">{it.pricing_mode}</span>
                      ) : null}
                      {asNum(it.discount_total) > 0 ? (
                        <span className="pill">
                          KM: {fmtVnd(asNum(it.discount_total))} đ
                        </span>
                      ) : null}
                      {cfg.showBarcode && it.barcode ? (
                        <span className="pill">BC: {it.barcode}</span>
                      ) : null}
                      {cfg.showSku && it.sku ? (
                        <span className="pill">SKU: {it.sku}</span>
                      ) : null}
                    </div>
                  </td>
                  <td className="right">
                    {fmtQty(it.qty)} {it.uom || ""}
                  </td>
                  <td className="right">{fmtVnd(it.unit_price)} đ</td>
                  <td className="right">{fmtVnd(it.line_total)} đ</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {cfg.footerText ? (
          <div className="hint" style={{ marginTop: 8 }}>
            {cfg.footerText}
          </div>
        ) : null}
        {cfg.showThankYou ? (
          <div className="hint" style={{ marginTop: 4 }}>
            Cam on quy khach!
          </div>
        ) : null}
      </div>
    </Modal>
  )
}

function LineEditModal({ item, onClose, onSave }) {
  const [mode, setMode] = useState(item.pricing_mode)
  const [qty, setQty] = useState(String(item.qty))
  const [err, setErr] = useState("")

  const isRollLine =
    item.pricing_mode === "meter" || item.pricing_mode === "roll"

  function submit() {
    setErr("")
    const q = Number(qty)
    if (!Number.isFinite(q) || q <= 0) {
      setErr("Số lượng phải > 0")
      return
    }
    if (isRollLine) {
      onSave({ mode, qty: mode === "meter" ? String(q) : undefined })
    } else {
      onSave({ qty: String(q) })
    }
  }

  return (
    <Modal
      title={`Sửa dòng: ${item.name}`}
      onClose={onClose}
      footer={
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="btn" onClick={onClose}>
            Huỷ
          </button>
          <button className="btn btnPrimary" onClick={submit}>
            Lưu
          </button>
        </div>
      }
    >
      {isRollLine ? (
        <div className="split">
          <div>
            <div className="hint" style={{ marginTop: 0 }}>
              Chế độ bán
            </div>
            <UiSelect
              value={mode}
              onChange={(v) => setMode(String(v))}
              options={[
                { value: "meter", label: "Theo mét" },
                { value: "roll", label: "Nguyên cuộn" },
              ]}
            />
            <div className="hint">
              Nếu chọn “nguyên cuộn”, hệ thống sẽ kiểm tra cuộn phải full.
            </div>
          </div>
          <div>
            <div className="hint" style={{ marginTop: 0 }}>
              Số lượng {mode === "meter" ? "(m)" : "(mặc định 1 cuộn)"}
            </div>
            <input
              className="input"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              onFocus={selectAllOnFocus}
              onKeyDown={(e) => {
                if (!isEnterKey(e)) return
                e.preventDefault()
                submit()
              }}
              disabled={mode === "roll"}
            />
          </div>
        </div>
      ) : (
        <div>
          <div className="hint" style={{ marginTop: 0 }}>
            Số lượng
          </div>
          <input
            className="input"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            onFocus={selectAllOnFocus}
            onKeyDown={(e) => {
              if (!isEnterKey(e)) return
              e.preventDefault()
              submit()
            }}
          />
        </div>
      )}
      {err ? <div className="payStatus payStatusErr">{err}</div> : null}
    </Modal>
  )
}

function RollPickerModal({ su, onClose, onAddMeter, onAddRoll }) {
  const [qty, setQty] = useState("")
  const [err, setErr] = useState("")
  const canSellRoll = su.is_full_roll && su.roll_price != null

  useEffect(() => {
    setQty("1")
    setErr("")
  }, [su])

  function submitMeter() {
    setErr("")
    const q = Number(qty)
    if (!Number.isFinite(q) || q <= 0) {
      setErr("Số mét phải > 0")
      return
    }
    onAddMeter(String(q))
  }

  return (
    <Modal
      wide
      title={`Cuộn: ${su.variant_name}`}
      onClose={onClose}
      footer={
        <div
          style={{
            display: "flex",
            gap: 10,
            justifyContent: "space-between",
            flexWrap: "wrap",
          }}
        >
          <div className="hint" style={{ margin: 0 }}>
            Barcode: <b>{su.barcode}</b> · Còn:{" "}
            <b>
              {fmtQty(su.remaining_qty)}/{fmtQty(su.initial_qty)}{" "}
              {su.uom || "m"}
            </b>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              className="btn"
              onClick={() => {
                onClose()
              }}
            >
              Để sau
            </button>
          </div>
        </div>
      }
    >
      <div className="split">
        <div className="card flatCard">
          <div className="cardHeader">
            <div className="cardTitle">Bán theo mét</div>
            <div className="pill">
              Giá/m: {su.price == null ? "—" : `${fmtVnd(su.price)} đ`}
            </div>
          </div>
          <div className="cardBody">
            <input
              className="input"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              onFocus={selectAllOnFocus}
              onKeyDown={(e) => {
                if (!isEnterKey(e)) return
                e.preventDefault()
                submitMeter()
              }}
              placeholder="Số mét"
            />
            <div className="hint">Nhấn Enter để thêm nhanh theo mét.</div>
            <button className="btn btnPrimary" onClick={submitMeter}>
              Thêm mét
            </button>
          </div>
        </div>

        {canSellRoll ? (
          <div className="card flatCard">
            <div className="cardHeader">
              <div className="cardTitle">Bán nguyên cuộn</div>
              <div className="pill">Giá cuộn: {fmtVnd(su.roll_price)} đ</div>
            </div>
            <div className="cardBody">
              <div className="hint" style={{ marginTop: 0 }}>
                Cuộn full: có thể bán nguyên cuộn.
              </div>
              <button className="btn btnPrimary" onClick={onAddRoll}>
                Thêm cuộn
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {!canSellRoll ? (
        <div className="hint" style={{ marginTop: 4 }}>
          Cuộn đã cắt dở hoặc chưa có giá cuộn, nên chỉ bán theo mét.
        </div>
      ) : null}

      {err ? <div className="payStatus payStatusErr">{err}</div> : null}
    </Modal>
  )
}

function BillHistoryModal({
  rows,
  busy,
  q,
  setQ,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  sort,
  setSort,
  onSearch,
  onOpenReceipt,
  onOpenRefund,
  onClose,
}) {
  return (
    <Modal
      wide
      title="Bill cũ (đã thanh toán)"
      onClose={onClose}
      footer={
        <div
          style={{
            display: "flex",
            gap: 10,
            justifyContent: "space-between",
            flexWrap: "wrap",
          }}
        >
          <div className="hint" style={{ margin: 0 }}>
            Chọn bill để xem chi tiết hoặc hoàn hàng một phần.
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn" disabled={busy} onClick={onClose}>
              Đóng
            </button>
          </div>
        </div>
      }
    >
      <div className="billFilters">
        <input
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm theo mã bill / ghi chú / tên khách / SĐT..."
        />
        <input
          className="input"
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
        />
        <input
          className="input"
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
        />
        <UiSelect
          value={sort}
          onChange={(v) => setSort(String(v))}
          options={[
            { value: "newest", label: "Mới nhất" },
            { value: "oldest", label: "Cũ nhất" },
            { value: "total_desc", label: "Tổng tiền giảm dần" },
            { value: "total_asc", label: "Tổng tiền tăng dần" },
          ]}
        />
        <button className="btn btnPrimary" disabled={busy} onClick={onSearch}>
          Tìm
        </button>
      </div>

      <div className="tableWrap">
        <table className="table">
          <thead>
            <tr>
              <th>Mã bill</th>
              <th>Thời gian</th>
              <th>Khách hàng</th>
              <th>Thanh toán</th>
              <th className="right">Tổng</th>
              <th className="right">...</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <b>#{r.id}</b>
                </td>
                <td>
                  {r.checked_out_at
                    ? fmtDateTime(r.checked_out_at)
                    : fmtDateTime(r.created_at)}
                </td>
                <td>
                  {r.customer_name ? (
                    <>
                      <div className="tName">{r.customer_name}</div>
                      <div className="hint">{r.customer_phone || "—"}</div>
                    </>
                  ) : (
                    "Khách lẻ"
                  )}
                </td>
                <td>{r.payment_method || "—"}</td>
                <td className="right" style={{ fontWeight: 900 }}>
                  {fmtVnd(r.grand_total)} đ
                </td>
                <td className="right">
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      justifyContent: "flex-end",
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      className="btn"
                      disabled={busy}
                      onClick={() => onOpenReceipt(r.id)}
                    >
                      Mở bill
                    </button>
                    <button
                      className="btn btnPrimary"
                      disabled={busy}
                      onClick={() => onOpenRefund(r.id)}
                    >
                      Refund
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={6}>
                  <div className="hint">Không có dữ liệu.</div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}

function RefundModal({ receipt, busy, onClose, onSubmit }) {
  const [qtyMap, setQtyMap] = useState({})
  const [note, setNote] = useState("")
  const [err, setErr] = useState("")

  const refundableItems = useMemo(() => {
    const all = receipt?.items || []
    return all.filter((it) => asNum(it.refundable_qty) > 0)
  }, [receipt])

  function setQty(itemId, v) {
    setQtyMap((prev) => ({ ...prev, [itemId]: v }))
  }

  function submit() {
    setErr("")
    const lines = []
    for (const it of refundableItems) {
      const raw = qtyMap[it.item_id]
      if (raw === undefined || raw === null || String(raw).trim() === "")
        continue
      const qty = Number(raw)
      if (!Number.isFinite(qty) || qty <= 0) {
        setErr(`Số lượng refund không hợp lệ ở dòng #${it.item_id}`)
        return
      }
      if (qty > asNum(it.refundable_qty)) {
        setErr(`Dòng #${it.item_id} vượt quá số còn được refund`)
        return
      }
      if (it.pricing_mode === "roll" && qty !== 1) {
        setErr(`Dòng #${it.item_id} (cuộn) chỉ hỗ trợ refund 1 cuộn`)
        return
      }
      lines.push({ item_id: it.item_id, qty: String(qty) })
    }
    if (!lines.length) {
      setErr("Chưa nhập số lượng refund")
      return
    }
    onSubmit({ items: lines, note: note.trim() || null })
  }

  return (
    <Modal
      wide
      title={`Refund bill #${receipt?.order_id || ""}`}
      onClose={onClose}
      footer={
        <div
          style={{
            display: "flex",
            gap: 10,
            justifyContent: "flex-end",
            flexWrap: "wrap",
          }}
        >
          <button className="btn" disabled={busy} onClick={onClose}>
            Huỷ
          </button>
          <button className="btn btnPrimary" disabled={busy} onClick={submit}>
            Xác nhận refund
          </button>
        </div>
      }
    >
      {err ? <div className="payStatus payStatusErr">{err}</div> : null}

      <div className="hint">
        Chỉ hoàn những dòng có <b>còn được refund</b>. Hàng hoàn sẽ được cộng
        lại tồn kho.
      </div>

      <div className="tableWrap">
        <table className="table">
          <thead>
            <tr>
              <th>Hàng</th>
              <th className="right">Đã bán</th>
              <th className="right">Đã refund</th>
              <th className="right">Còn refund</th>
              <th className="right">Refund lần này</th>
            </tr>
          </thead>
          <tbody>
            {refundableItems.map((it) => (
              <tr key={it.item_id}>
                <td>
                  <div className="tName">{it.name}</div>
                  <div className="tMeta">
                    <span className="pill">#{it.item_id}</span>
                    <span className="pill">{it.pricing_mode}</span>
                    {it.sku ? (
                      <span className="pill">SKU: {it.sku}</span>
                    ) : null}
                  </div>
                </td>
                <td className="right">
                  {fmtQty(it.qty)} {it.uom || ""}
                </td>
                <td className="right">
                  {fmtQty(it.refunded_qty)} {it.uom || ""}
                </td>
                <td className="right">
                  <b>
                    {fmtQty(it.refundable_qty)} {it.uom || ""}
                  </b>
                </td>
                <td className="right">
                  <input
                    className="input refundQtyInput"
                    value={qtyMap[it.item_id] ?? ""}
                    onChange={(e) =>
                      setQty(it.item_id, clampMoneyInput(e.target.value))
                    }
                    onFocus={selectAllOnFocus}
                    placeholder={it.pricing_mode === "roll" ? "1" : "0"}
                  />
                </td>
              </tr>
            ))}
            {!refundableItems.length ? (
              <tr>
                <td colSpan={5}>
                  <div className="hint">
                    Bill này đã refund hết hoặc không còn dòng nào có thể
                    refund.
                  </div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div>
        <div className="hint" style={{ marginTop: 0 }}>
          Ghi chú refund
        </div>
        <input
          className="input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Lý do hoàn hàng..."
        />
      </div>
    </Modal>
  )
}

function CashDrawerModal({
  session,
  busy,
  userRole,
  onClose,
  onRefresh,
  onOpenSession,
  onCloseSession,
  onManagerWithdraw,
}) {
  const [openingCash, setOpeningCash] = useState("")
  const [openNote, setOpenNote] = useState("")
  const [countedCash, setCountedCash] = useState("")
  const [closeNote, setCloseNote] = useState("")
  const [withdrawAmount, setWithdrawAmount] = useState("")
  const [withdrawNote, setWithdrawNote] = useState("")
  const [err, setErr] = useState("")
  const [showDrawerInfo, setShowDrawerInfo] = useState(false)

  const canManagerWithdraw = userRole === "admin" || userRole === "manager"

  async function submitOpen() {
    setErr("")
    try {
      await onOpenSession({
        opening_cash: openingCash === "" ? "0" : openingCash,
        note: openNote.trim() || null,
      })
      setOpeningCash("")
      setOpenNote("")
    } catch (e) {
      setErr(e?.message || "Không mở được ca")
    }
  }

  async function submitClose() {
    setErr("")
    try {
      if (countedCash === "") throw new Error("Nhập số tiền kiểm quỹ thực tế")
      await onCloseSession({
        counted_cash: countedCash,
        note: closeNote.trim() || null,
      })
      setCountedCash("")
      setCloseNote("")
    } catch (e) {
      setErr(e?.message || "Không đóng được ca")
    }
  }

  async function submitWithdraw() {
    setErr("")
    try {
      if (withdrawAmount === "") throw new Error("Nhập số tiền rút")
      await onManagerWithdraw({
        amount: withdrawAmount,
        note: withdrawNote.trim() || null,
      })
      setWithdrawAmount("")
      setWithdrawNote("")
    } catch (e) {
      setErr(e?.message || "Không rút tiền được")
    }
  }

  return (
    <Modal
      wide
      title="Quản lý thùng tiền"
      onClose={onClose}
      footer={
        <div
          style={{
            display: "flex",
            gap: 10,
            justifyContent: "space-between",
            flexWrap: "wrap",
          }}
        >
          <button className="btn" disabled={busy} onClick={onRefresh}>
            Tải lại
          </button>
          <button className="btn" disabled={busy} onClick={onClose}>
            Đóng
          </button>
        </div>
      }
    >
      {err ? <div className="payStatus payStatusErr">{err}</div> : null}

      {!session ? (
        <div className="card flatCard">
          <div className="cardHeader">
            <div className="cardTitle">Chưa có ca mở</div>
            <div className="pill">Bắt buộc mở ca trước khi thanh toán</div>
          </div>
          <div className="cardBody" style={{ display: "grid", gap: 10 }}>
            <div>
              <div className="hint" style={{ marginTop: 0 }}>
                Tiền đầu ca
              </div>
              <input
                className="input"
                value={openingCash}
                onChange={(e) =>
                  setOpeningCash(clampMoneyInput(e.target.value))
                }
                onFocus={selectAllOnFocus}
                placeholder="0"
              />
            </div>
            <div>
              <div className="hint" style={{ marginTop: 0 }}>
                Ghi chú (tuỳ chọn)
              </div>
              <input
                className="input"
                value={openNote}
                onChange={(e) => setOpenNote(e.target.value)}
                placeholder="..."
              />
            </div>
            <div>
              <button
                className="btn btnPrimary"
                disabled={busy}
                onClick={submitOpen}
              >
                Mở ca mới
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          <div className="miniCard">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
                alignItems: "center",
              }}
            >
              <div className="miniTitle">Ca hiện tại #{session.id}</div>
              <button
                className="btn btnIconAction"
                style={{ width: 38, height: 38 }}
                type="button"
                onClick={() => setShowDrawerInfo((v) => !v)}
                title={showDrawerInfo ? "Ẩn thông tin ca" : "Hiện thông tin ca"}
                aria-label={
                  showDrawerInfo ? "Ẩn thông tin ca" : "Hiện thông tin ca"
                }
              >
                {showDrawerInfo ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 640 640"
                    className="iconSvg"
                    aria-hidden="true"
                  >
                    <path
                      d="M320 96C239.2 96 174.5 132.8 127.4 176.6C80.6 220.1 49.3 272 34.4 307.7C31.1 315.6 31.1 324.4 34.4 332.3C49.3 368 80.6 420 127.4 463.4C174.5 507.1 239.2 544 320 544C400.8 544 465.5 507.2 512.6 463.4C559.4 419.9 590.7 368 605.6 332.3C608.9 324.4 608.9 315.6 605.6 307.7C590.7 272 559.4 220 512.6 176.6C465.5 132.9 400.8 96 320 96zM176 320C176 240.5 240.5 176 320 176C399.5 176 464 240.5 464 320C464 399.5 399.5 464 320 464C240.5 464 176 399.5 176 320zM320 256C320 291.3 291.3 320 256 320C244.5 320 233.7 317 224.3 311.6C223.3 322.5 224.2 333.7 227.2 344.8C240.9 396 293.6 426.4 344.8 412.7C396 399 426.4 346.3 412.7 295.1C400.5 249.4 357.2 220.3 311.6 224.3C316.9 233.6 320 244.4 320 256z"
                      fill="currentColor"
                    />
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 640 640"
                    className="iconSvg"
                    aria-hidden="true"
                  >
                    <path
                      d="M73 39.1C63.6 29.7 48.4 29.7 39.1 39.1C29.8 48.5 29.7 63.7 39 73.1L567 601.1C576.4 610.5 591.6 610.5 600.9 601.1C610.2 591.7 610.3 576.5 600.9 567.2L504.5 470.8C507.2 468.4 509.9 466 512.5 463.6C559.3 420.1 590.6 368.2 605.5 332.5C608.8 324.6 608.8 315.8 605.5 307.9C590.6 272.2 559.3 220.2 512.5 176.8C465.4 133.1 400.7 96.2 319.9 96.2C263.1 96.2 214.3 114.4 173.9 140.4L73 39.1zM236.5 202.7C260 185.9 288.9 176 320 176C399.5 176 464 240.5 464 320C464 351.1 454.1 379.9 437.3 403.5L402.6 368.8C415.3 347.4 419.6 321.1 412.7 295.1C399 243.9 346.3 213.5 295.1 227.2C286.5 229.5 278.4 232.9 271.1 237.2L236.4 202.5zM357.3 459.1C345.4 462.3 332.9 464 320 464C240.5 464 176 399.5 176 320C176 307.1 177.7 294.6 180.9 282.7L101.4 203.2C68.8 240 46.4 279 34.5 307.7C31.2 315.6 31.2 324.4 34.5 332.3C49.4 368 80.7 420 127.5 463.4C174.6 507.1 239.3 544 320.1 544C357.4 544 391.3 536.1 421.6 523.4L357.4 459.2z"
                      fill="currentColor"
                    />
                  </svg>
                )}
              </button>
            </div>
            <div className="miniMeta">
              <span className="pill">Trạng thái: {session.status}</span>
              {showDrawerInfo ? (
                <>
                  <span className="pill">
                    Mở lúc: {fmtDateTime(session.opened_at)}
                  </span>
                  <span className="pill">
                    Mở bởi:{" "}
                    {session.opened_by_username ||
                      `#${session.opened_by_user_id}`}
                  </span>
                  <span className="pill">
                    Tiền đầu ca: {fmtVnd(session.opening_cash)} đ
                  </span>
                  <span className="pill">
                    Tiền dự kiến hiện tại: {fmtVnd(session.expected_cash)} đ
                  </span>
                </>
              ) : (
                <span className="pill">Thông tin ca đang ẩn</span>
              )}
            </div>
          </div>

          {canManagerWithdraw ? (
            <div className="card flatCard">
              <div className="cardHeader">
                <div className="cardTitle">Manager rút tiền</div>
              </div>
              <div className="cardBody" style={{ display: "grid", gap: 10 }}>
                <div className="split">
                  <div>
                    <div className="hint" style={{ marginTop: 0 }}>
                      Số tiền rút
                    </div>
                    <input
                      className="input"
                      value={withdrawAmount}
                      onChange={(e) =>
                        setWithdrawAmount(clampMoneyInput(e.target.value))
                      }
                      onFocus={selectAllOnFocus}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <div className="hint" style={{ marginTop: 0 }}>
                      Ghi chú
                    </div>
                    <input
                      className="input"
                      value={withdrawNote}
                      onChange={(e) => setWithdrawNote(e.target.value)}
                      placeholder="Lý do rút..."
                    />
                  </div>
                </div>
                <div>
                  <button
                    className="btn btnDanger"
                    disabled={busy}
                    onClick={submitWithdraw}
                  >
                    Rút tiền khỏi thùng
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <div className="card flatCard">
            <div className="cardHeader">
              <div className="cardTitle">Đóng ca</div>
            </div>
            <div className="cardBody" style={{ display: "grid", gap: 10 }}>
              <div className="split">
                <div>
                  <div className="hint" style={{ marginTop: 0 }}>
                    Kiểm quỹ thực tế
                  </div>
                  <input
                    className="input"
                    value={countedCash}
                    onChange={(e) =>
                      setCountedCash(clampMoneyInput(e.target.value))
                    }
                    onFocus={selectAllOnFocus}
                    placeholder="0"
                  />
                </div>
                <div>
                  <div className="hint" style={{ marginTop: 0 }}>
                    Ghi chú đóng ca
                  </div>
                  <input
                    className="input"
                    value={closeNote}
                    onChange={(e) => setCloseNote(e.target.value)}
                    placeholder="..."
                  />
                </div>
              </div>
              <div>
                <button
                  className="btn btnPrimary"
                  disabled={busy}
                  onClick={submitClose}
                >
                  Đóng ca
                </button>
              </div>
            </div>
          </div>

          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>Loại</th>
                  <th className="right">Tiền vào/ra</th>
                  <th>Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {(session.entries || []).map((e) => (
                  <tr key={e.id}>
                    <td>{fmtDateTime(e.created_at)}</td>
                    <td>{e.entry_type}</td>
                    <td className="right">
                      {showDrawerInfo ? `${fmtVnd(e.delta_cash)} đ` : "••••••"}
                    </td>
                    <td>{e.note || "—"}</td>
                  </tr>
                ))}
                {!session.entries?.length ? (
                  <tr>
                    <td colSpan={4}>
                      <div className="hint">Chưa có log.</div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  )
}

export default function Pos({
  receiptTemplate = defaultReceiptTemplate,
  user = null,
  onGotoDashboard = () => {},
  onLogout = () => {},
}) {
  const [drafts, setDrafts] = useState([])
  const [order, setOrder] = useState(null)
  const [receipt, setReceipt] = useState(null)

  const [q, setQ] = useState("")
  const [searchOut, setSearchOut] = useState(null)
  const [categories, setCategories] = useState([])
  const [selectedCategoryId, setSelectedCategoryId] = useState("all")
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState({ kind: "info", message: "" })

  const [rollModal, setRollModal] = useState(null)
  const [editLine, setEditLine] = useState(null)
  const [receiptModal, setReceiptModal] = useState(null)
  const [customerModalOpen, setCustomerModalOpen] = useState(false)
  const [customerQ, setCustomerQ] = useState("")
  const [customerBusy, setCustomerBusy] = useState(false)
  const [customerRows, setCustomerRows] = useState([])
  const [newCustomerName, setNewCustomerName] = useState("")
  const [newCustomerPhone, setNewCustomerPhone] = useState("")

  const [payModalOpen, setPayModalOpen] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState("cash")
  const [paidAmount, setPaidAmount] = useState("")
  const [mixCashAmount, setMixCashAmount] = useState("")
  const [mixBankAmount, setMixBankAmount] = useState("")
  const [note, setNote] = useState("")

  const [invoiceDiscOpen, setInvoiceDiscOpen] = useState(false)
  const [invoiceDiscMode, setInvoiceDiscMode] = useState("amount") // "amount" | "percent"
  const [invoiceDiscValue, setInvoiceDiscValue] = useState("0") // amount or percent

  const [lineDiscItem, setLineDiscItem] = useState(null)
  const [lineDiscMode, setLineDiscMode] = useState("none") // none|amount|percent
  const [lineDiscValue, setLineDiscValue] = useState("0")
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyBusy, setHistoryBusy] = useState(false)
  const [historyRows, setHistoryRows] = useState([])
  const [historyQ, setHistoryQ] = useState("")
  const [historyDateFrom, setHistoryDateFrom] = useState(monthStartYmd())
  const [historyDateTo, setHistoryDateTo] = useState(todayYmd())
  const [historySort, setHistorySort] = useState("newest")
  const [refundReceipt, setRefundReceipt] = useState(null)
  const [refundBusy, setRefundBusy] = useState(false)
  const [drawerModalOpen, setDrawerModalOpen] = useState(false)
  const [drawerBusy, setDrawerBusy] = useState(false)
  const [drawerSession, setDrawerSession] = useState(null)

  const scanRef = useRef(null)
  const searchTimerRef = useRef(null)

  function showErr(e) {
    const msg = e?.message || "Có lỗi xảy ra"
    setToast({ kind: "error", message: msg })
  }

  function showInfo(msg) {
    setToast({ kind: "info", message: msg })
  }

  function closeAllModals() {
    setRollModal(null)
    setEditLine(null)
    setPayModalOpen(false)
    setReceiptModal(null)
    setCustomerModalOpen(false)
    setInvoiceDiscOpen(false)
    setLineDiscItem(null)
    setHistoryOpen(false)
    setRefundReceipt(null)
    setDrawerModalOpen(false)
  }

  useHotkeys({
    escape: () => closeAllModals(),
    "ctrl+k": () => scanRef.current?.focus(),
    f2: () => createDraftOrder(),
    f4: () => {
      if (!drawerSession || drawerSession.status !== "open") {
        showInfo("Chưa mở ca thùng tiền")
        return
      }
      if (order?.status === "draft") setPayModalOpen(true)
    },
  })

  const cartItems = receipt?.items || []
  const allVariants = useMemo(() => searchOut?.variants || [], [searchOut])

  const filteredVariants = useMemo(() => {
    if (selectedCategoryId === "all") return allVariants
    return allVariants.filter(
      (v) => String(v.parent_category_id) === String(selectedCategoryId),
    )
  }, [allVariants, selectedCategoryId])

  const categoryCounts = useMemo(() => {
    const byId = new Map()
    let total = 0
    for (const v of allVariants) {
      total += 1
      const id =
        v.parent_category_id == null ? null : String(v.parent_category_id)
      byId.set(id, (byId.get(id) || 0) + 1)
    }
    return { total, byId }
  }, [allVariants])

  const subtotal = useMemo(() => asNum(receipt?.subtotal), [receipt])
  const discountTotal = useMemo(() => asNum(receipt?.discount_total), [receipt])
  const grandTotal = useMemo(() => asNum(receipt?.grand_total), [receipt])
  const customerName = receipt?.customer_name || null
  const customerPhone = receipt?.customer_phone || null
  const customerId =
    receipt?.customer_id != null ? receipt.customer_id : order?.customer_id
  const drawerIsOpen = !!drawerSession && drawerSession.status === "open"

  const paidValue = useMemo(() => {
    if (paymentMethod === "mixed") {
      const cash = mixCashAmount === "" ? 0 : Number(mixCashAmount)
      const bank = mixBankAmount === "" ? 0 : Number(mixBankAmount)
      if (!Number.isFinite(cash) || !Number.isFinite(bank)) return NaN
      return cash + bank
    }
    const paid = paidAmount === "" ? grandTotal : Number(paidAmount)
    return Number.isFinite(paid) ? paid : NaN
  }, [paymentMethod, paidAmount, mixCashAmount, mixBankAmount, grandTotal])

  const paymentError = useMemo(() => {
    if (!drawerIsOpen) return "Chưa mở ca thùng tiền"
    if (!Number.isFinite(paidValue) || paidValue < 0)
      return "Tiền khách đưa không hợp lệ"
    if (paymentMethod === "mixed") {
      const cash = mixCashAmount === "" ? 0 : Number(mixCashAmount)
      const bank = mixBankAmount === "" ? 0 : Number(mixBankAmount)
      if (
        !Number.isFinite(cash) ||
        !Number.isFinite(bank) ||
        cash < 0 ||
        bank < 0
      ) {
        return "Tiền mặt/chuyển khoản không hợp lệ"
      }
      if (cash <= 0 && bank <= 0) {
        return "Nhập ít nhất một khoản thanh toán > 0"
      }
      if (paidValue < grandTotal) return "Tổng thanh toán chưa đủ"
      return null
    }
    if (paymentMethod === "cash") {
      if (paidValue < grandTotal) return "Tiền khách đưa chưa đủ"
      return null
    }
    if (!nearlyEqual(paidValue, grandTotal)) {
      return "Chuyển khoản/Momo phải bằng đúng tổng tiền"
    }
    return null
  }, [
    drawerIsOpen,
    paidValue,
    paymentMethod,
    grandTotal,
    mixCashAmount,
    mixBankAmount,
  ])

  const changePreview = useMemo(() => {
    if (!Number.isFinite(paidValue)) return 0
    return Math.max(0, paidValue - grandTotal)
  }, [paidValue, grandTotal])

  const shortagePreview = useMemo(() => {
    if (!Number.isFinite(paidValue)) return 0
    return Math.max(0, grandTotal - paidValue)
  }, [paidValue, grandTotal])

  const quickCashAmounts = useMemo(() => {
    const g = grandTotal
    const values = [g, roundUp(g, 10000), roundUp(g, 50000), roundUp(g, 100000)]
    return Array.from(new Set(values.filter((v) => v > 0)))
  }, [grandTotal])

  async function saveOrderMeta(next) {
    if (!order || order.status !== "draft") return
    setBusy(true)
    try {
      const o = await patch(`/api/v1/pos/orders/${order.id}`, next)
      setOrder(o)
      setNote(o.note || "")
      await refreshReceipt(order.id)
    } finally {
      setBusy(false)
    }
  }

  async function persistDraftMetaBeforeCheckout() {
    if (!order || order.status !== "draft") return null
    const currentNote = order.note || ""
    const nextNote = note || ""

    const dirtyNote = nextNote !== currentNote
    if (!dirtyNote) return null

    const updatedOrder = await patch(`/api/v1/pos/orders/${order.id}`, {
      note: nextNote || null,
    })
    setOrder(updatedOrder)
    setNote(updatedOrder.note || "")

    const updatedReceipt = await refreshReceipt(order.id)
    return updatedReceipt
  }

  async function refreshDrafts() {
    const list = await get(`/api/v1/pos/orders/?status=draft`)
    setDrafts(list)
  }

  async function refreshReceipt(orderId) {
    const r = await get(`/api/v1/pos/orders/${orderId}/receipt`)
    setReceipt(r)
    return r
  }

  async function loadCheckedOrders() {
    setHistoryBusy(true)
    try {
      const params = new URLSearchParams()
      params.set("status", "checked_out")
      if (historyDateFrom) params.set("date_from", historyDateFrom)
      if (historyDateTo) params.set("date_to", historyDateTo)
      if (historyQ.trim()) params.set("q", historyQ.trim())
      if (historySort) params.set("sort", historySort)
      params.set("limit", "500")
      const list = await get(`/api/v1/pos/orders/?${params.toString()}`)
      setHistoryRows(Array.isArray(list) ? list : [])
    } finally {
      setHistoryBusy(false)
    }
  }

  async function refreshCashDrawer({ silent404 = true } = {}) {
    setDrawerBusy(true)
    try {
      const r = await get(
        "/api/v1/pos/cash-drawer/current?include_entries=true&entry_limit=200",
      )
      setDrawerSession(r)
      return r
    } catch (e) {
      if (e?.status === 404) {
        setDrawerSession(null)
        if (!silent404) showInfo("Chưa mở ca thùng tiền")
        return null
      }
      throw e
    } finally {
      setDrawerBusy(false)
    }
  }

  async function openCashDrawerModal() {
    setDrawerModalOpen(true)
    try {
      await refreshCashDrawer({ silent404: true })
    } catch (e) {
      showErr(e)
    }
  }

  async function openCashDrawerSession(payload) {
    setDrawerBusy(true)
    try {
      const r = await post("/api/v1/pos/cash-drawer/open", payload)
      setDrawerSession(r)
      showInfo("Đã mở ca thùng tiền")
    } finally {
      setDrawerBusy(false)
    }
  }

  async function closeCashDrawerSession(payload) {
    setDrawerBusy(true)
    try {
      const r = await post("/api/v1/pos/cash-drawer/current/close", payload)
      setDrawerSession(null)
      setDrawerModalOpen(false)
      setPayModalOpen(false)
      showInfo(`Đã đóng ca #${r.id}`)
    } finally {
      setDrawerBusy(false)
    }
  }

  async function managerWithdrawCash(payload) {
    setDrawerBusy(true)
    try {
      const r = await post(
        "/api/v1/pos/cash-drawer/current/manager-withdraw",
        payload,
      )
      setDrawerSession(r)
      showInfo("Đã ghi nhận rút tiền khỏi thùng")
    } finally {
      setDrawerBusy(false)
    }
  }

  async function openOrderHistory() {
    setHistoryOpen(true)
    await loadCheckedOrders()
  }

  async function openOldReceipt(orderId) {
    setHistoryBusy(true)
    try {
      const r = await get(`/api/v1/pos/orders/${orderId}/receipt`)
      setReceiptModal(r)
      setHistoryOpen(false)
    } finally {
      setHistoryBusy(false)
    }
  }

  async function openRefund(orderId) {
    setRefundBusy(true)
    try {
      const r = await get(`/api/v1/pos/orders/${orderId}/receipt`)
      setRefundReceipt(r)
      setHistoryOpen(false)
    } finally {
      setRefundBusy(false)
    }
  }

  async function submitRefund(payload) {
    if (!refundReceipt?.order_id) return
    setRefundBusy(true)
    try {
      const out = await post(
        `/api/v1/pos/orders/${refundReceipt.order_id}/refund`,
        payload,
      )
      const latestReceipt = await get(
        `/api/v1/pos/orders/${refundReceipt.order_id}/receipt`,
      )
      setRefundReceipt(latestReceipt)
      if (receiptModal?.order_id === refundReceipt.order_id) {
        setReceiptModal(latestReceipt)
      }
      await loadCheckedOrders()
      showInfo(`Đã refund ${fmtVnd(out.refund_total)} đ`)
    } finally {
      setRefundBusy(false)
    }
  }

  async function loadCustomers(nextQ = customerQ) {
    const qq = (nextQ || "").trim()
    setCustomerBusy(true)
    try {
      const list = await get(
        `/api/v1/customers/?q=${encodeURIComponent(qq)}&limit=50&is_active=true`,
      )
      setCustomerRows(Array.isArray(list) ? list : [])
    } finally {
      setCustomerBusy(false)
    }
  }

  async function selectCustomer(id) {
    if (!order || order.status !== "draft") return
    await saveOrderMeta({ customer_id: id })
    setCustomerModalOpen(false)
    setCustomerQ("")
    setCustomerRows([])
    setNewCustomerName("")
    setNewCustomerPhone("")
    scanRef.current?.focus()
  }

  async function clearCustomer() {
    if (!order || order.status !== "draft") return
    await saveOrderMeta({ customer_id: null })
    scanRef.current?.focus()
  }

  async function loadOrder(orderId) {
    const o = await get(`/api/v1/pos/orders/${orderId}`)
    setOrder(o)
    setNote(o.note || "")
    await refreshReceipt(orderId)
    await refreshDrafts()
  }

  async function createDraftOrder() {
    setBusy(true)
    try {
      const o = await post(`/api/v1/pos/orders/`, { note: null })
      localStorage.setItem(LS_ORDER_ID, String(o.id))
      setPaidAmount("")
      setPaymentMethod("cash")
      setMixCashAmount("")
      setMixBankAmount("")
      await loadOrder(o.id)
      // Không reset vùng tìm kiếm khi tạo đơn mới.
      await doSearch(q)
      scanRef.current?.focus()
    } catch (e) {
      showErr(e)
    } finally {
      setBusy(false)
    }
  }

  async function switchDraft(orderId) {
    localStorage.setItem(LS_ORDER_ID, String(orderId))
    await loadOrder(orderId)
    scanRef.current?.focus()
  }

  async function cancelDraft() {
    if (!order) return
    if (!cartItems.length) {
      showInfo("Đơn đang trống, không cần huỷ.")
      return
    }
    setBusy(true)
    try {
      await post(`/api/v1/pos/orders/${order.id}/cancel`, {})
      showInfo("Đã huỷ đơn nháp.")
      localStorage.removeItem(LS_ORDER_ID)
      await createDraftOrder()
    } catch (e) {
      showErr(e)
    } finally {
      setBusy(false)
    }
  }

  async function doSearch(nextQ) {
    const qq = (nextQ ?? q).trim()
    // Keep trailing slash to avoid FastAPI 307 redirect (which can cause browser preflight trouble).
    const url = `/api/v1/pos/search/?q=${encodeURIComponent(qq)}&limit=500`
    const out = await get(url)
    setSearchOut(out)
    return out
  }

  async function addNormal(variantId, qty) {
    if (!order) return
    setBusy(true)
    try {
      await post(`/api/v1/pos/orders/${order.id}/items/normal`, {
        variant_id: variantId,
        qty: String(qty),
      })
      await refreshReceipt(order.id)
      await refreshDrafts()
    } finally {
      setBusy(false)
    }
  }

  async function addRoll({ barcode, mode, qty }) {
    if (!order) return
    setBusy(true)
    try {
      await post(`/api/v1/pos/orders/${order.id}/items/roll`, {
        barcode,
        mode,
        qty,
      })
      await refreshReceipt(order.id)
      await refreshDrafts()
    } finally {
      setBusy(false)
    }
  }

  async function updateItem(item) {
    if (!order) return
    setBusy(true)
    try {
      if (item.pricing_mode === "normal") {
        await patch(
          `/api/v1/pos/orders/${order.id}/items/${item.item_id}/normal`,
          { qty: item.qty },
        )
      } else {
        await patch(
          `/api/v1/pos/orders/${order.id}/items/${item.item_id}/roll`,
          { mode: item.mode, qty: item.qty },
        )
      }
      await refreshReceipt(order.id)
    } finally {
      setBusy(false)
    }
  }

  async function deleteItem(itemId) {
    if (!order) return
    setBusy(true)
    try {
      await del(`/api/v1/pos/orders/${order.id}/items/${itemId}`)
      await refreshReceipt(order.id)
    } finally {
      setBusy(false)
    }
  }

  async function onScanEnter() {
    if (!order) return
    const out = await doSearch()
    if (!out) return

    if (out.stock_unit) {
      if (out.stock_unit.is_reserved) {
        showErr(new Error("Cuộn này đang nằm trong một đơn nháp khác"))
        return
      }
      setRollModal(out.stock_unit)
      return
    }

    if (out.exact_variant) {
      if (out.exact_variant.track_stock_unit) {
        showInfo("Mặt hàng này quản lý theo cuộn. Hãy scan barcode của cuộn.")
        return
      }
      await addNormal(out.exact_variant.variant_id, 1)
      setQ("")
      // Giữ danh sách hàng luôn hiện (q="" sẽ ra danh sách theo danh mục)
      doSearch("").catch(() => {})
      return
    }

    showInfo("Không có match chính xác. Chọn trong danh sách.")
  }

  async function checkout() {
    if (!order) return
    setBusy(true)
    try {
      const updatedReceipt = await persistDraftMetaBeforeCheckout()
      const payable = updatedReceipt
        ? asNum(updatedReceipt.grand_total)
        : grandTotal
      let paid = 0
      const checkoutPayload = {
        payment_method: paymentMethod,
        note: note || null,
      }

      if (paymentMethod === "mixed") {
        const cash = mixCashAmount === "" ? 0 : Number(mixCashAmount)
        const bank = mixBankAmount === "" ? 0 : Number(mixBankAmount)
        if (
          !Number.isFinite(cash) ||
          !Number.isFinite(bank) ||
          cash < 0 ||
          bank < 0
        ) {
          throw new Error("Tiền mặt/chuyển khoản không hợp lệ")
        }
        paid = cash + bank
        if (paid <= 0) throw new Error("Nhập ít nhất một khoản thanh toán > 0")
        if (paid < payable) throw new Error("Tổng thanh toán chưa đủ")
        checkoutPayload.cash_amount = String(cash)
        checkoutPayload.bank_amount = String(bank)
        checkoutPayload.paid_amount = String(paid)
      } else {
        paid = paidAmount === "" ? payable : Number(paidAmount)
        if (!Number.isFinite(paid) || paid < 0)
          throw new Error("Tiền khách đưa không hợp lệ")
        if (paymentMethod === "cash" && paid < payable)
          throw new Error("Tiền khách đưa chưa đủ")
        if (paymentMethod !== "cash" && !nearlyEqual(paid, payable)) {
          throw new Error("Chuyển khoản/Momo phải bằng đúng tổng tiền")
        }
        checkoutPayload.paid_amount = String(paid)
      }

      await post(`/api/v1/pos/orders/${order.id}/checkout`, checkoutPayload)
      await refreshCashDrawer({ silent404: true })

      const r = await refreshReceipt(order.id)
      setReceiptModal(r)
      await loadOrder(order.id) // reload order status/fields
      setPayModalOpen(false)
      showInfo("Đã thanh toán xong.")

      localStorage.removeItem(LS_ORDER_ID)
      await createDraftOrder()
    } catch (e) {
      showErr(e)
    } finally {
      setBusy(false)
    }
  }

  // initial load
  useEffect(() => {
    ;(async () => {
      try {
        const saved = localStorage.getItem(LS_ORDER_ID)
        if (saved) {
          await loadOrder(saved)
        } else {
          await createDraftOrder()
        }
        await refreshCashDrawer({ silent404: true })
      } catch (e) {
        showErr(e)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        const list = await get(`/api/v1/categories/`)
        setCategories(Array.isArray(list) ? list : [])
      } catch {
        setCategories([])
      }
    })()
  }, [])

  // Customer typeahead inside modal
  useEffect(() => {
    if (!customerModalOpen) return
    const t = setTimeout(() => {
      loadCustomers(customerQ).catch(() => {})
    }, 220)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerModalOpen, customerQ])

  function openInvoiceDiscount() {
    if (!order || order.status !== "draft") return
    const mode = order.discount_mode || "amount"
    const value =
      mode === "percent"
        ? String(order.discount_value != null ? order.discount_value : 0)
        : String(
            order.discount_value != null ? order.discount_value : discountTotal,
          )
    setInvoiceDiscMode(mode)
    setInvoiceDiscValue(value)
    setInvoiceDiscOpen(true)
  }

  function openLineDiscount(it) {
    const mode = it.discount_mode || "none"
    setLineDiscItem(it)
    setLineDiscMode(mode)
    setLineDiscValue(
      it.discount_value != null ? String(it.discount_value) : "0",
    )
  }

  async function applyInvoiceDiscount() {
    if (busy || !order || order.status !== "draft") return
    const val = invoiceDiscValue === "" ? 0 : Number(invoiceDiscValue)
    if (!Number.isFinite(val) || val < 0)
      throw new Error("Giá trị khuyến mãi không hợp lệ")
    if (invoiceDiscMode === "percent" && val > 100)
      throw new Error("Phần trăm phải <= 100")
    const computed = computeDiscountAmount({
      mode: invoiceDiscMode,
      valueStr: invoiceDiscValue,
      base: subtotal,
    })
    if (!Number.isFinite(computed)) throw new Error("Khuyến mãi không hợp lệ")

    await saveOrderMeta({
      discount_mode: invoiceDiscMode,
      discount_value: String(val),
    })
    setInvoiceDiscOpen(false)
  }

  async function applyLineDiscount() {
    if (busy || !order || order.status !== "draft" || !lineDiscItem) return
    if (lineDiscMode !== "none") {
      const val = lineDiscValue === "" ? 0 : Number(lineDiscValue)
      if (!Number.isFinite(val) || val < 0)
        throw new Error("Giá trị khuyến mãi không hợp lệ")
      if (lineDiscMode === "percent" && val > 100)
        throw new Error("Phần trăm phải <= 100")
    }

    const payload =
      lineDiscMode === "none"
        ? { mode: "none", value: null }
        : { mode: lineDiscMode, value: String(Number(lineDiscValue || 0)) }

    await patch(
      `/api/v1/pos/orders/${order.id}/items/${lineDiscItem.item_id}/discount`,
      payload,
    )
    await refreshReceipt(order.id)
    setLineDiscItem(null)
  }

  // debounce typeahead search
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      doSearch(q).catch(() => {})
    }, 220)
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  return (
    <div className="posKiotShell">
      <div className="posHeader">
        <button
          className="btn posHeaderEdgeBtn posHeaderHomeBtn"
          onClick={onGotoDashboard}
          title="Về trang chủ"
          aria-label="Về trang chủ"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 640 640"
            className="iconSvg"
            aria-hidden="true"
          >
            <path
              d="M320 112.5L80 304L80 528C80 554.5 101.5 576 128 576L224 576L224 400C224 373.5 245.5 352 272 352L368 352C394.5 352 416 373.5 416 400L416 576L512 576C538.5 576 560 554.5 560 528L560 304L320 112.5zM357.4 54.5C336 37.4 304 37.4 282.6 54.5L42.6 246C32.2 254.3 30.5 269.4 38.8 279.8C47.1 290.2 62.2 291.9 72.6 283.6L312.6 92.1C316.9 88.7 323.1 88.7 327.4 92.1L567.4 283.6C577.8 291.9 592.9 290.2 601.2 279.8C609.5 269.4 607.8 254.3 597.4 246L357.4 54.5z"
              fill="currentColor"
            />
          </svg>
        </button>

        <div className="posCustomerHead">
          <div className="posCustomerMini">
            <div className="posCustomerMiniLabel">Khách hàng</div>
            <div className="posCustomerMiniValue">
              {customerName ? (
                <>
                  {customerName}
                  {customerPhone ? ` · ${customerPhone}` : ""}
                </>
              ) : (
                "Khách lẻ"
              )}
            </div>
          </div>
          <div className="posCustomerBtns">
            <button
              className="btn btnPrimary"
              disabled={busy || !order || order.status !== "draft"}
              onClick={async () => {
                try {
                  setCustomerModalOpen(true)
                  setCustomerQ("")
                  setCustomerRows([])
                  await loadCustomers("")
                } catch (e) {
                  showErr(e)
                }
              }}
            >
              Chọn KH
            </button>
            <button
              className="btn"
              disabled={
                busy || !order || order.status !== "draft" || !customerId
              }
              onClick={async () => {
                try {
                  await clearCustomer()
                } catch (e) {
                  showErr(e)
                }
              }}
            >
              Huỷ KH
            </button>
          </div>
        </div>

        <div className="posHeaderActions">
          <button
            className={`btn ${drawerIsOpen ? "" : "btnDanger"}`}
            disabled={busy || drawerBusy}
            onClick={openCashDrawerModal}
          >
            {drawerIsOpen
              ? `Thùng tiền #${drawerSession.id}`
              : "Mở ca thùng tiền"}
          </button>
          <button
            className="btn"
            disabled={busy || historyBusy || refundBusy}
            onClick={async () => {
              try {
                await openOrderHistory()
              } catch (e) {
                showErr(e)
              }
            }}
          >
            Bill cũ / Refund
          </button>
          <button
            className="btn"
            disabled={busy || !order || order.status !== "draft"}
            onClick={cancelDraft}
          >
            Huỷ đơn
          </button>
        </div>

        <div className="posScan">
          <input
            ref={scanRef}
            className="input inputScan"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === "Enter") {
                try {
                  await onScanEnter()
                } catch (err) {
                  showErr(err)
                }
              }
            }}
            placeholder="Scan barcode (cuộn/hàng thường) hoặc gõ tên/sku/barcode…"
            autoComplete="off"
          />
          <button
            className="btn btnPrimary btnIconAction"
            disabled={busy}
            onClick={async () => {
              try {
                await onScanEnter()
              } catch (e) {
                showErr(e)
              }
            }}
            aria-label="Tìm và thêm sản phẩm"
            title="Tìm và thêm sản phẩm"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 640 640"
              className="iconSvg"
              aria-hidden="true"
            >
              <path
                d="M480 272C480 317.9 465.1 360.3 440 394.7L566.6 521.4C579.1 533.9 579.1 554.2 566.6 566.7C554.1 579.2 533.8 579.2 521.3 566.7L394.7 440C360.3 465.1 317.9 480 272 480C157.1 480 64 386.9 64 272C64 157.1 157.1 64 272 64C386.9 64 480 157.1 480 272zM272 416C351.5 416 416 351.5 416 272C416 192.5 351.5 128 272 128C192.5 128 128 192.5 128 272C128 351.5 192.5 416 272 416z"
                fill="currentColor"
              />
            </svg>
          </button>
        </div>

        <button className="btn posHeaderEdgeBtn posHeaderLogoutBtn" onClick={onLogout}>
          Đăng xuất
        </button>
      </div>

      <div className="posDraftTabs">
        <div className="tabs">
          {drafts.slice(0, 6).map((d) => (
            <button
              key={d.id}
              className={`tab ${String(order?.id) === String(d.id) ? "tabActive" : ""}`}
              onClick={() => switchDraft(d.id)}
              disabled={busy}
              title={`Hóa đơn ${d.id}`}
            >
              Hóa đơn {d.id}
            </button>
          ))}
          <button
            className="tab tabNew"
            onClick={createDraftOrder}
            disabled={busy}
          >
            + Đơn
          </button>
        </div>
        <div className="pill">
          {order ? (
            <>
              Đơn hiện tại: <b>#{order.id}</b> · {order.status}
            </>
          ) : (
            "Đang tải…"
          )}
        </div>
      </div>

      <div className="posMain2">
        <div className="cartCol">
          <div className="panel panelCart">
            <div className="panelHead">
              <div className="panelTitle">Hoá đơn</div>
              <div className="pill">{cartItems.length} dòng</div>
            </div>
            <div className="panelBody scroll">
              {cartItems.length === 0 ? (
                <div className="hint">Chưa có món. Scan để thêm.</div>
              ) : (
                <div className="tableWrap">
                  <table className="table cartTable">
                    <colgroup>
                      <col className="cartColName" />
                      <col className="cartColQty" />
                      <col className="cartColPrice" />
                      <col className="cartColTotal" />
                      <col className="cartColActions" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Hàng</th>
                        <th className="right">SL</th>
                        <th className="right">Đơn giá</th>
                        <th className="right">Tạm tính</th>
                        <th className="right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cartItems.map((it) => (
                        <tr key={it.item_id}>
                          <td>
                            <div className="tName">{it.name}</div>
                            <div className="tMeta">
                              <span className="pill">{it.pricing_mode}</span>
                              {asNum(it.discount_total) > 0 ? (
                                <span className="pill">
                                  KM: {fmtVnd(asNum(it.discount_total))} đ
                                </span>
                              ) : null}
                              {it.barcode ? (
                                <span className="pill">BC: {it.barcode}</span>
                              ) : null}
                              {it.sku ? (
                                <span className="pill">SKU: {it.sku}</span>
                              ) : null}
                            </div>
                          </td>
                          <td className="right">
                            <div className="qtyBox">
                              {(it.pricing_mode === "normal" ||
                                it.pricing_mode === "meter") && (
                                <button
                                  className="qtyBtn"
                                  disabled={busy}
                                  onClick={async () => {
                                    try {
                                      const next = Math.max(
                                        0,
                                        asNum(it.qty) - 1,
                                      )
                                      if (next <= 0) {
                                        await deleteItem(it.item_id)
                                        return
                                      }
                                      await updateItem({
                                        item_id: it.item_id,
                                        pricing_mode: it.pricing_mode,
                                        qty: String(next),
                                        mode: it.pricing_mode,
                                      })
                                    } catch (e) {
                                      showErr(e)
                                    }
                                  }}
                                >
                                  -
                                </button>
                              )}
                              <div className="qtyText">
                                {fmtQty(it.qty)} {it.uom || ""}
                              </div>
                              {(it.pricing_mode === "normal" ||
                                it.pricing_mode === "meter") && (
                                <button
                                  className="qtyBtn"
                                  disabled={busy}
                                  onClick={async () => {
                                    try {
                                      const next = asNum(it.qty) + 1
                                      await updateItem({
                                        item_id: it.item_id,
                                        pricing_mode: it.pricing_mode,
                                        qty: String(next),
                                        mode: it.pricing_mode,
                                      })
                                    } catch (e) {
                                      showErr(e)
                                    }
                                  }}
                                >
                                  +
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="right">{fmtVnd(it.unit_price)} đ</td>
                          <td className="right" style={{ fontWeight: 900 }}>
                            {fmtVnd(it.line_total)} đ
                          </td>
                          <td className="right cartActionsCell">
                            <div className="cartActions">
                              <button
                                className="btn cartActionBtn"
                                disabled={busy}
                                onClick={() => openLineDiscount(it)}
                                title="Khuyến mãi dòng"
                                aria-label="Khuyến mãi dòng"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  viewBox="0 0 640 640"
                                  className="iconSvg"
                                  aria-hidden="true"
                                >
                                  <path
                                    d="M96.5 160L96.5 309.5C96.5 326.5 103.2 342.8 115.2 354.8L307.2 546.8C332.2 571.8 372.7 571.8 397.7 546.8L547.2 397.3C572.2 372.3 572.2 331.8 547.2 306.8L355.2 114.8C343.2 102.7 327 96 310 96L160.5 96C125.2 96 96.5 124.7 96.5 160zM208.5 176C226.2 176 240.5 190.3 240.5 208C240.5 225.7 226.2 240 208.5 240C190.8 240 176.5 225.7 176.5 208C176.5 190.3 190.8 176 208.5 176z"
                                    fill="currentColor"
                                  />
                                </svg>
                              </button>
                              <button
                                className="btn cartActionBtn"
                                disabled={busy}
                                onClick={() => setEditLine(it)}
                                title="Sửa dòng"
                                aria-label="Sửa dòng"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  viewBox="0 0 640 640"
                                  className="iconSvg"
                                  aria-hidden="true"
                                >
                                  <path
                                    d="M535.6 85.7C513.7 63.8 478.3 63.8 456.4 85.7L432 110.1L529.9 208L554.3 183.6C576.2 161.7 576.2 126.3 554.3 104.4L535.6 85.7zM236.4 305.7C230.3 311.8 225.6 319.3 222.9 327.6L193.3 416.4C190.4 425 192.7 434.5 199.1 441C205.5 447.5 215 449.7 223.7 446.8L312.5 417.2C320.7 414.5 328.2 409.8 334.4 403.7L496 241.9L398.1 144L236.4 305.7zM160 128C107 128 64 171 64 224L64 480C64 533 107 576 160 576L416 576C469 576 512 533 512 480L512 384C512 366.3 497.7 352 480 352C462.3 352 448 366.3 448 384L448 480C448 497.7 433.7 512 416 512L160 512C142.3 512 128 497.7 128 480L128 224C128 206.3 142.3 192 160 192L256 192C273.7 192 288 177.7 288 160C288 142.3 273.7 128 256 128L160 128z"
                                    fill="currentColor"
                                  />
                                </svg>
                              </button>
                              <button
                                className="btn btnDanger cartActionBtn"
                                disabled={busy}
                                onClick={() => deleteItem(it.item_id)}
                                title="Xoá dòng"
                                aria-label="Xoá dòng"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  viewBox="0 0 640 640"
                                  className="iconSvg"
                                  aria-hidden="true"
                                >
                                  <path
                                    d="M232.7 69.9L224 96L128 96C110.3 96 96 110.3 96 128C96 145.7 110.3 160 128 160L512 160C529.7 160 544 145.7 544 128C544 110.3 529.7 96 512 96L416 96L407.3 69.9C402.9 56.8 390.7 48 376.9 48L263.1 48C249.3 48 237.1 56.8 232.7 69.9zM512 208L128 208L149.1 531.1C150.7 556.4 171.7 576 197 576L443 576C468.3 576 489.3 556.4 490.9 531.1L512 208z"
                                    fill="currentColor"
                                  />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="checkoutBar">
            <div className="checkoutLeft">
              <div className="checkoutDiscountBox">
                <div className="checkoutLabel">Khuyến mãi hoá đơn</div>
                <div className="discSummary">
                  <div className="pill discountPill">
                    {order?.discount_mode === "percent"
                      ? `Theo %: ${asNum(order?.discount_value)}% (=${fmtVnd(discountTotal)} đ)`
                      : `Theo tiền: ${fmtVnd(discountTotal)} đ`}
                  </div>
                  <div className="discountActions">
                    <button
                      className="btn btnPrimary"
                      disabled={busy || !order || order.status !== "draft"}
                      onClick={openInvoiceDiscount}
                    >
                      Sửa KM
                    </button>
                    <button
                      className="btn"
                      disabled={
                        busy ||
                        !order ||
                        order.status !== "draft" ||
                        discountTotal <= 0
                      }
                      onClick={() =>
                        saveOrderMeta({
                          discount_mode: "amount",
                          discount_value: "0",
                        })
                      }
                    >
                      Xoá KM
                    </button>
                  </div>
                </div>
              </div>
              <div>
                <div className="checkoutLabel">Ghi chú đơn hàng</div>
                <input
                  className="input"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  onBlur={() => saveOrderMeta({ note })}
                  placeholder="..."
                />
              </div>
            </div>

            <div className="checkoutRight">
              <div className="checkoutTotals">
                <div className="checkoutRow">
                  <span>Tổng tiền hàng</span>
                  <b>{fmtVnd(subtotal)} đ</b>
                </div>
                <div className="checkoutRow">
                  <span>Khuyến mãi</span>
                  <b>{fmtVnd(discountTotal)} đ</b>
                </div>
                <div className="checkoutRow checkoutGrand">
                  <span>Khách cần trả</span>
                  <b>{fmtVnd(grandTotal)} đ</b>
                </div>
              </div>
              <button
                className="btn btnPrimary btnCheckout"
                disabled={
                  busy ||
                  !order ||
                  order.status !== "draft" ||
                  cartItems.length === 0 ||
                  !drawerIsOpen
                }
                onClick={() => {
                  if (!drawerIsOpen) {
                    showInfo("Chưa mở ca thùng tiền")
                    return
                  }
                  setPayModalOpen(true)
                }}
              >
                THANH TOÁN
              </button>
              {!drawerIsOpen ? (
                <div className="payStatus payStatusErr">
                  Chưa mở ca thùng tiền: không thể thanh toán.
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="panel panelCatalog">
          <div className="panelHead">
            <div className="panelTitle">Hàng hoá</div>
            <div className="pill">{filteredVariants.length} sp</div>
          </div>
          <div className="panelBody panelBodyTight">
            <div className="catalogSplit">
              <div className="catalogContent scroll">
                {!searchOut ? (
                  <div className="hint">Gõ từ khoá để hiện danh sách hàng.</div>
                ) : null}

                {searchOut?.stock_unit ? (
                  <div className="miniCard">
                    <div className="miniTitle">
                      Cuộn: {searchOut.stock_unit.variant_name}
                    </div>
                    <div className="miniMeta">
                      <span className="pill">
                        BC: {searchOut.stock_unit.barcode}
                      </span>
                      <span className="pill">
                        Giá/m:{" "}
                        {searchOut.stock_unit.price == null
                          ? "—"
                          : `${fmtVnd(searchOut.stock_unit.price)} đ`}
                      </span>
                      <span className="pill">
                        Giá cuộn:{" "}
                        {searchOut.stock_unit.roll_price == null
                          ? "—"
                          : `${fmtVnd(searchOut.stock_unit.roll_price)} đ`}
                      </span>
                      <span className="pill">
                        Còn: {fmtQty(searchOut.stock_unit.remaining_qty)}/
                        {fmtQty(searchOut.stock_unit.initial_qty)}{" "}
                        {searchOut.stock_unit.uom || "m"}
                      </span>
                      {searchOut.stock_unit.is_full_roll ? (
                        <span className="pill">Full</span>
                      ) : (
                        <span className="pill">Cắt dở</span>
                      )}
                      {searchOut.stock_unit.is_reserved ? (
                        <span className="pill">Reserved</span>
                      ) : null}
                    </div>
                    <div className="miniActions">
                      <button
                        className="btn btnPrimary"
                        disabled={busy || searchOut.stock_unit.is_reserved}
                        onClick={() => setRollModal(searchOut.stock_unit)}
                      >
                        Chọn kiểu bán
                      </button>
                    </div>
                  </div>
                ) : null}

                {filteredVariants.length ? (
                  <div className="productGrid">
                    {filteredVariants.map((v) => (
                      <button
                        key={v.variant_id}
                        className={`productCard ${v.track_stock_unit ? "productDisabled" : ""}`}
                        disabled={busy}
                        onClick={async () => {
                          try {
                            if (v.track_stock_unit) {
                              showInfo(
                                "Hàng theo cuộn: hãy scan barcode của cuộn để thêm.",
                              )
                              return
                            }
                            await addNormal(v.variant_id, 1)
                          } catch (e) {
                            showErr(e)
                          }
                        }}
                      >
                        <div className="pThumb">
                          <div className="pThumbFallback">
                            {(v.name || "?").slice(0, 1).toUpperCase()}
                          </div>
                          {v.image_url ? (
                            // eslint-disable-next-line jsx-a11y/alt-text
                            <img
                              src={v.image_url}
                              onError={(e) => {
                                e.currentTarget.style.display = "none"
                              }}
                            />
                          ) : null}
                        </div>
                        <div className="pName">{v.name}</div>
                        <div className="pPrice">
                          {v.track_stock_unit
                            ? `Giá/m: ${fmtVnd(v.price ?? 0)} đ`
                            : `${fmtVnd(v.price ?? 0)} đ`}
                        </div>
                        <div className="pMeta">
                          <span>
                            Tồn: {fmtQty(v.stock)} {v.uom || ""}
                          </span>
                          {v.parent_category_name ? (
                            <span>DM: {v.parent_category_name}</span>
                          ) : null}
                          {v.barcode ? <span>BC: {v.barcode}</span> : null}
                          {v.track_stock_unit && v.roll_price != null ? (
                            <span>Giá cuộn: {fmtVnd(v.roll_price)} đ</span>
                          ) : null}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : null}
                {searchOut && !filteredVariants.length ? (
                  <div className="hint">
                    Không có sản phẩm trong danh mục đang chọn.
                  </div>
                ) : null}
              </div>

              <div
                className="catalogCats scroll"
                role="tablist"
                aria-label="Danh mục"
              >
                <button
                  type="button"
                  className={`catVTab ${selectedCategoryId === "all" ? "catVTabActive" : ""}`}
                  onClick={() => setSelectedCategoryId("all")}
                  disabled={busy}
                >
                  Tất cả ({categoryCounts.total})
                </button>
                {categories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`catVTab ${String(selectedCategoryId) === String(c.id) ? "catVTabActive" : ""}`}
                    onClick={() => setSelectedCategoryId(String(c.id))}
                    disabled={busy}
                    title={c.name}
                  >
                    {c.name} ({categoryCounts.byId.get(String(c.id)) || 0})
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {rollModal ? (
        <RollPickerModal
          su={rollModal}
          onClose={() => setRollModal(null)}
          onAddMeter={async (qty) => {
            try {
              await addRoll({ barcode: rollModal.barcode, mode: "meter", qty })
              setRollModal(null)
              setQ("")
              doSearch("").catch(() => {})
              scanRef.current?.focus()
            } catch (e) {
              showErr(e)
            }
          }}
          onAddRoll={async () => {
            try {
              await addRoll({ barcode: rollModal.barcode, mode: "roll" })
              setRollModal(null)
              setQ("")
              doSearch("").catch(() => {})
              scanRef.current?.focus()
            } catch (e) {
              showErr(e)
            }
          }}
        />
      ) : null}

      {editLine ? (
        <LineEditModal
          item={editLine}
          onClose={() => setEditLine(null)}
          onSave={async (next) => {
            try {
              if (editLine.pricing_mode === "normal") {
                await updateItem({
                  item_id: editLine.item_id,
                  pricing_mode: "normal",
                  qty: next.qty,
                })
              } else {
                await updateItem({
                  item_id: editLine.item_id,
                  pricing_mode: editLine.pricing_mode,
                  mode: next.mode,
                  qty: next.mode === "meter" ? next.qty : undefined,
                })
              }
              setEditLine(null)
            } catch (e) {
              showErr(e)
            }
          }}
        />
      ) : null}

      {invoiceDiscOpen ? (
        <Modal
          wide
          title="Khuyến mãi hoá đơn"
          onClose={() => setInvoiceDiscOpen(false)}
          footer={
            <div
              style={{
                display: "flex",
                gap: 10,
                justifyContent: "space-between",
                flexWrap: "wrap",
              }}
            >
              <button
                className="btn btnDanger"
                disabled={busy || !order || order.status !== "draft"}
                onClick={async () => {
                  try {
                    await saveOrderMeta({
                      discount_mode: "amount",
                      discount_value: "0",
                    })
                    setInvoiceDiscOpen(false)
                  } catch (e) {
                    showErr(e)
                  }
                }}
              >
                Xoá khuyến mãi
              </button>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  className="btn"
                  onClick={() => setInvoiceDiscOpen(false)}
                  disabled={busy}
                >
                  Huỷ
                </button>
                <button
                  className="btn btnPrimary"
                  disabled={busy || !order || order.status !== "draft"}
                  onClick={async () => {
                    try {
                      await applyInvoiceDiscount()
                    } catch (e) {
                      showErr(e)
                    }
                  }}
                >
                  Áp dụng
                </button>
              </div>
            </div>
          }
        >
          <div className="split invoiceDiscountEditor">
            <div>
              <div className="hint" style={{ marginTop: 0 }}>
                Kiểu khuyến mãi
              </div>
              <UiSelect
                value={invoiceDiscMode}
                onChange={(v) => setInvoiceDiscMode(String(v))}
                options={[
                  { value: "amount", label: "Theo số tiền" },
                  { value: "percent", label: "Theo %" },
                ]}
              />
            </div>
            <div>
              <div className="hint" style={{ marginTop: 0 }}>
                Giá trị {invoiceDiscMode === "percent" ? "(%)" : "(đ)"}
              </div>
              <input
                className="input"
                value={invoiceDiscValue}
                onChange={(e) =>
                  setInvoiceDiscValue(clampMoneyInput(e.target.value))
                }
                onFocus={selectAllOnFocus}
                onKeyDown={async (e) => {
                  if (!isEnterKey(e)) return
                  e.preventDefault()
                  try {
                    await applyInvoiceDiscount()
                  } catch (err) {
                    showErr(err)
                  }
                }}
                placeholder={invoiceDiscMode === "percent" ? "Ví dụ: 10" : "0"}
              />
            </div>
          </div>
          <div className="miniCard invoiceDiscountPreview">
            <div className="miniTitle">Xem trước</div>
            {(() => {
              const disc = Math.min(
                subtotal,
                computeDiscountAmount({
                  mode: invoiceDiscMode,
                  valueStr: invoiceDiscValue,
                  base: subtotal,
                }) || 0,
              )
              const net = Math.max(0, subtotal - disc)
              return (
                <div className="miniMeta">
                  <span className="pill">Tạm tính: {fmtVnd(subtotal)} đ</span>
                  <span className="pill">KM: {fmtVnd(disc)} đ</span>
                  <span className="pill">Cần trả: {fmtVnd(net)} đ</span>
                </div>
              )
            })()}
          </div>
          <div className="hint" style={{ marginTop: 0 }}>
            Lưu ý: khuyến mãi theo % sẽ tự tính theo tạm tính hiện tại.
          </div>
        </Modal>
      ) : null}

      {lineDiscItem ? (
        <Modal
          wide
          title={`Khuyến mãi sản phẩm: ${lineDiscItem.name}`}
          onClose={() => setLineDiscItem(null)}
          footer={
            <div
              style={{
                display: "flex",
                gap: 10,
                justifyContent: "flex-end",
                flexWrap: "wrap",
              }}
            >
              <button
                className="btn"
                onClick={() => setLineDiscItem(null)}
                disabled={busy}
              >
                Huỷ
              </button>
              <button
                className="btn btnPrimary"
                disabled={busy || !order || order.status !== "draft"}
                onClick={async () => {
                  try {
                    await applyLineDiscount()
                  } catch (e) {
                    showErr(e)
                  }
                }}
              >
                Áp dụng
              </button>
            </div>
          }
        >
          <div className="split">
            <div>
              <div className="hint" style={{ marginTop: 0 }}>
                Kiểu khuyến mãi
              </div>
              <UiSelect
                value={lineDiscMode}
                onChange={(v) => setLineDiscMode(String(v))}
                options={[
                  { value: "none", label: "Không" },
                  { value: "amount", label: "Theo số tiền" },
                  { value: "percent", label: "Theo %" },
                ]}
              />
            </div>
            <div>
              <div className="hint" style={{ marginTop: 0 }}>
                Giá trị {lineDiscMode === "percent" ? "(%)" : "(đ)"}
              </div>
              <input
                className="input"
                disabled={lineDiscMode === "none"}
                value={lineDiscMode === "none" ? "" : lineDiscValue}
                onChange={(e) =>
                  setLineDiscValue(clampMoneyInput(e.target.value))
                }
                onFocus={selectAllOnFocus}
                onKeyDown={async (e) => {
                  if (!isEnterKey(e)) return
                  e.preventDefault()
                  try {
                    await applyLineDiscount()
                  } catch (err) {
                    showErr(err)
                  }
                }}
                placeholder={lineDiscMode === "percent" ? "Ví dụ: 10" : "0"}
              />
            </div>
          </div>

          <div className="miniCard">
            <div className="miniTitle">Xem trước</div>
            {(() => {
              const base =
                asNum(lineDiscItem.qty) * asNum(lineDiscItem.unit_price)
              const disc =
                lineDiscMode === "none"
                  ? 0
                  : Math.min(
                      base,
                      computeDiscountAmount({
                        mode: lineDiscMode,
                        valueStr: lineDiscValue,
                        base,
                      }) || 0,
                    )
              const net = Math.max(0, base - disc)
              return (
                <div className="miniMeta">
                  <span className="pill">Gốc: {fmtVnd(base)} đ</span>
                  <span className="pill">KM: {fmtVnd(disc)} đ</span>
                  <span className="pill">Còn: {fmtVnd(net)} đ</span>
                </div>
              )
            })()}
          </div>
        </Modal>
      ) : null}

      {customerModalOpen ? (
        <Modal
          wide
          title="Chọn khách hàng"
          onClose={() => setCustomerModalOpen(false)}
          footer={
            <div
              style={{
                display: "flex",
                gap: 10,
                justifyContent: "space-between",
                flexWrap: "wrap",
              }}
            >
              <button
                className="btn"
                disabled={busy || !order || order.status !== "draft"}
                onClick={async () => {
                  try {
                    await clearCustomer()
                    setCustomerModalOpen(false)
                  } catch (e) {
                    showErr(e)
                  }
                }}
              >
                Bỏ khách hàng
              </button>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  className="btn"
                  onClick={() => setCustomerModalOpen(false)}
                  disabled={busy}
                >
                  Đóng
                </button>
              </div>
            </div>
          }
        >
          <div className="split">
            <div className="card flatCard">
              <div className="cardHeader">
                <div className="cardTitle">Tìm khách hàng</div>
                <div className="pill">
                  {customerBusy
                    ? "Đang tải..."
                    : `${customerRows.length} kết quả`}
                </div>
              </div>
              <div className="cardBody">
                <input
                  className="input"
                  value={customerQ}
                  onChange={(e) => setCustomerQ(e.target.value)}
                  onFocus={selectAllOnFocus}
                  placeholder="Gõ tên / SĐT / mã..."
                />
                <div className="hint">Enter không bắt buộc: gõ sẽ tự tìm.</div>
                <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                  {customerRows.map((c) => (
                    <button
                      key={c.id}
                      className="btn"
                      disabled={busy || customerBusy}
                      onClick={async () => {
                        try {
                          await selectCustomer(c.id)
                        } catch (e) {
                          showErr(e)
                        }
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 10,
                        }}
                      >
                        <div style={{ fontWeight: 900, textAlign: "left" }}>
                          {c.name}
                        </div>
                        <div className="pill">{c.phone || "—"}</div>
                      </div>
                    </button>
                  ))}
                  {!customerBusy && customerRows.length === 0 ? (
                    <div className="hint">Không có kết quả.</div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="card flatCard">
              <div className="cardHeader">
                <div className="cardTitle">Thêm nhanh</div>
                <div className="pill">Tạo & chọn</div>
              </div>
              <div className="cardBody">
                <div className="hint" style={{ marginTop: 0 }}>
                  Tạo khách hàng mới ngay trong POS để gắn vào hoá đơn.
                </div>
                <div className="hint">Tên khách hàng *</div>
                <input
                  className="input"
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  placeholder="Nguyễn Văn A"
                />
                <div className="hint">Số điện thoại (tuỳ chọn)</div>
                <input
                  className="input"
                  value={newCustomerPhone}
                  onChange={(e) => setNewCustomerPhone(e.target.value)}
                  placeholder="090..."
                />
                <button
                  className="btn btnPrimary"
                  disabled={
                    busy || customerBusy || !order || order.status !== "draft"
                  }
                  onClick={async () => {
                    try {
                      const name = (newCustomerName || "").trim()
                      const phone = (newCustomerPhone || "").trim()
                      if (!name) throw new Error("Tên khách hàng là bắt buộc")

                      const created = await post("/api/v1/customers/", {
                        name,
                        phone: phone || null,
                      })
                      await selectCustomer(created.id)
                    } catch (e) {
                      showErr(e)
                    }
                  }}
                >
                  Tạo & chọn
                </button>
              </div>
            </div>
          </div>
        </Modal>
      ) : null}

      {drawerModalOpen ? (
        <CashDrawerModal
          session={drawerSession}
          busy={busy || drawerBusy}
          userRole={user?.role}
          onClose={() => setDrawerModalOpen(false)}
          onRefresh={async () => {
            try {
              await refreshCashDrawer({ silent404: true })
            } catch (e) {
              showErr(e)
            }
          }}
          onOpenSession={openCashDrawerSession}
          onCloseSession={closeCashDrawerSession}
          onManagerWithdraw={managerWithdrawCash}
        />
      ) : null}

      {payModalOpen ? (
        <Modal
          title="Thanh toán"
          onClose={() => setPayModalOpen(false)}
          footer={
            <div
              style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}
            >
              <button
                className="btn"
                onClick={() => setPayModalOpen(false)}
                disabled={busy}
              >
                Huỷ
              </button>
              <button
                className="btn btnPrimary"
                onClick={checkout}
                disabled={busy || !!paymentError || cartItems.length === 0}
              >
                Xác nhận
              </button>
            </div>
          }
        >
          <div className="hint" style={{ marginTop: 0 }}>
            Tổng cần thu: <b>{fmtVnd(grandTotal)} đ</b>
          </div>

          <div className="split">
            <div>
              <div className="hint" style={{ marginTop: 0 }}>
                Phương thức
              </div>
              <UiSelect
                value={paymentMethod}
                onChange={(v) => {
                  const next = String(v)
                  setPaymentMethod(next)
                }}
                options={[
                  { value: "cash", label: "Tiền mặt" },
                  { value: "bank", label: "Chuyển khoản" },
                  { value: "momo", label: "Momo" },
                  { value: "mixed", label: "Tiền mặt + Chuyển khoản" },
                ]}
              />
            </div>
            <div>
              {paymentMethod === "mixed" ? (
                <>
                  <div className="hint" style={{ marginTop: 0 }}>
                    Tiền mặt
                  </div>
                  <input
                    className="input"
                    value={mixCashAmount}
                    onChange={(e) =>
                      setMixCashAmount(clampMoneyInput(e.target.value))
                    }
                    onFocus={selectAllOnFocus}
                    onKeyDown={async (e) => {
                      if (!isEnterKey(e)) return
                      e.preventDefault()
                      if (busy || !!paymentError || cartItems.length === 0)
                        return
                      try {
                        await checkout()
                      } catch (err) {
                        showErr(err)
                      }
                    }}
                    placeholder="0"
                  />
                  <div className="hint" style={{ marginTop: 8 }}>
                    Chuyển khoản
                  </div>
                  <input
                    className="input"
                    value={mixBankAmount}
                    onChange={(e) =>
                      setMixBankAmount(clampMoneyInput(e.target.value))
                    }
                    onFocus={selectAllOnFocus}
                    onKeyDown={async (e) => {
                      if (!isEnterKey(e)) return
                      e.preventDefault()
                      if (busy || !!paymentError || cartItems.length === 0)
                        return
                      try {
                        await checkout()
                      } catch (err) {
                        showErr(err)
                      }
                    }}
                    placeholder="0"
                  />
                  <div className="payStatus">
                    Tổng đã nhập: <b>{fmtVnd(paidValue)} đ</b>
                  </div>
                  {shortagePreview > 0 ? (
                    <div className="payStatus payStatusErr">
                      Thiếu: <b>{fmtVnd(shortagePreview)} đ</b>
                    </div>
                  ) : (
                    <div className="payStatus">
                      Tiền thối (preview): <b>{fmtVnd(changePreview)} đ</b>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="hint" style={{ marginTop: 0 }}>
                    Khách đưa
                  </div>
                  <input
                    className="input"
                    value={paidAmount}
                    onChange={(e) =>
                      setPaidAmount(clampMoneyInput(e.target.value))
                    }
                    onFocus={selectAllOnFocus}
                    onKeyDown={async (e) => {
                      if (!isEnterKey(e)) return
                      e.preventDefault()
                      if (busy || !!paymentError || cartItems.length === 0)
                        return
                      try {
                        await checkout()
                      } catch (err) {
                        showErr(err)
                      }
                    }}
                    placeholder={`Mặc định = ${fmtVnd(grandTotal)}`}
                  />
                  {paymentMethod === "cash" ? (
                    <div className="payQuick">
                      {quickCashAmounts.map((v) => (
                        <button
                          key={v}
                          className="payQuickBtn"
                          onClick={() => setPaidAmount(String(v))}
                          type="button"
                        >
                          {fmtVnd(v)} đ
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {paymentMethod === "cash" ? (
                    <>
                      {shortagePreview > 0 ? (
                        <div className="payStatus payStatusErr">
                          Thiếu: <b>{fmtVnd(shortagePreview)} đ</b>
                        </div>
                      ) : (
                        <div className="payStatus">
                          Tiền thối (preview): <b>{fmtVnd(changePreview)} đ</b>
                        </div>
                      )}
                    </>
                  ) : (
                    <div
                      className={`payStatus ${paymentError ? "payStatusErr" : ""}`}
                    >
                      {paymentError
                        ? paymentError
                        : "Đúng tổng: có thể thanh toán"}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <div>
            <div className="hint" style={{ marginTop: 0 }}>
              Ghi chú (tuỳ chọn)
            </div>
            <input
              className="input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="..."
            />
          </div>
          {paymentError ? (
            <div className="payStatus payStatusErr">{paymentError}</div>
          ) : null}
        </Modal>
      ) : null}

      {historyOpen ? (
        <BillHistoryModal
          rows={historyRows}
          busy={historyBusy || refundBusy}
          q={historyQ}
          setQ={setHistoryQ}
          dateFrom={historyDateFrom}
          setDateFrom={setHistoryDateFrom}
          dateTo={historyDateTo}
          setDateTo={setHistoryDateTo}
          sort={historySort}
          setSort={setHistorySort}
          onSearch={async () => {
            try {
              await loadCheckedOrders()
            } catch (e) {
              showErr(e)
            }
          }}
          onOpenReceipt={async (orderId) => {
            try {
              await openOldReceipt(orderId)
            } catch (e) {
              showErr(e)
            }
          }}
          onOpenRefund={async (orderId) => {
            try {
              await openRefund(orderId)
            } catch (e) {
              showErr(e)
            }
          }}
          onClose={() => setHistoryOpen(false)}
        />
      ) : null}

      {refundReceipt ? (
        <RefundModal
          receipt={refundReceipt}
          busy={refundBusy || historyBusy}
          onClose={() => setRefundReceipt(null)}
          onSubmit={async (payload) => {
            try {
              await submitRefund(payload)
            } catch (e) {
              showErr(e)
            }
          }}
        />
      ) : null}

      <ReceiptModal
        receipt={receiptModal}
        onClose={() => setReceiptModal(null)}
        onRefund={async (orderId) => {
          try {
            setReceiptModal(null)
            await openRefund(orderId)
          } catch (e) {
            showErr(e)
          }
        }}
        template={receiptTemplate}
      />
      <Toast
        kind={toast.kind}
        message={toast.message}
        onClose={() => setToast((t) => ({ ...t, message: "" }))}
      />
    </div>
  )
}
