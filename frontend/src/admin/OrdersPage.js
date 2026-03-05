import { useEffect, useMemo, useRef, useState } from "react"
import { get } from "../api"
import Modal from "./Modal"
import DataGrid from "./DataGrid"
import ExcelToolsModal from "./ExcelToolsModal"
import { defaultReceiptTemplate, normalizeReceiptTemplate, loadReceiptTemplate } from "../pos/receiptTemplate"
import { fmtDateTimeVN } from "../utils/datetime"
import "./orders.css"

function fmtMoney(v) {
  const n = typeof v === "number" ? v : Number(v || 0)
  if (!Number.isFinite(n)) return String(v ?? "")
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(n)
}

function todayYMD() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

export default function OrdersPage() {
  const [dateFrom, setDateFrom] = useState(todayYMD())
  const [dateTo, setDateTo] = useState(todayYMD())
  const [q, setQ] = useState("")
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)
  const [rows, setRows] = useState([])
  const [viewReceipt, setViewReceipt] = useState(null)
  const [viewBusy, setViewBusy] = useState(false)
  const [showExcel, setShowExcel] = useState(false)
  const snapRef = useRef(null)
  const receiptTemplate = useMemo(() => loadReceiptTemplate(), [])

  const filtered = useMemo(() => {
    const qq = (q || "").trim().toLowerCase()
    if (!qq) return rows
    return rows.filter((o) => {
      const hay = [
        o.id,
        o.payment_method,
        o.customer_id ? `kh#${o.customer_id}` : null,
        o.grand_total,
      ]
        .filter((v) => v !== null && v !== undefined)
        .map((v) => String(v).toLowerCase())
        .join(" · ")
      return hay.includes(qq) || hay.includes(qq.replace(/\s+/g, ""))
    })
  }, [rows, q])

  const sumTotal = useMemo(() => {
    let sum = 0
    for (const o of filtered) sum += Number(o?.grand_total || 0) || 0
    return sum
  }, [filtered])

  async function loadAll() {
    setLoading(true)
    setErr(null)
    try {
      const params = new URLSearchParams()
      params.set("status", "checked_out")
      if (dateFrom) params.set("date_from", dateFrom)
      if (dateTo) params.set("date_to", dateTo)
      params.set("limit", "500")
      const list = await get(`/api/v1/pos/orders/?${params.toString()}`)
      setRows(Array.isArray(list) ? list : [])
    } catch (e) {
      setErr(e?.message || "Không tải được danh sách hoá đơn")
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  async function openReceipt(orderId) {
    setViewBusy(true)
    try {
      const r = await get(`/api/v1/pos/orders/${orderId}/receipt`)
      setViewReceipt(r)
    } finally {
      setViewBusy(false)
    }
  }

  useEffect(() => {
    loadAll().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo])

  return (
    <div className="ord">
      <div className="ordTop">
        <div className="ordLeft">
          <div className="ordHint">
            {loading ? "Đang tải..." : err ? `Lỗi: ${err}` : `${filtered.length}/${rows.length} hoá đơn · Tổng ${fmtMoney(sumTotal)} đ · Bấm tiêu đề cột để sắp xếp`}
          </div>
          <div className="ordFilter">
            <div className="ordLabel">Từ ngày (VN)</div>
            <input className="ordDate" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="ordFilter">
            <div className="ordLabel">Đến ngày (VN)</div>
            <input className="ordDate" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div className="ordSearch">
            <div className="ordLabel">Tìm</div>
            <div className="ordSearchRow">
              <input className="ordSearchInput" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ID / KH# / thanh toán..." />
              {q.trim() ? (
                <button className="ordActionBtn" disabled={loading} onClick={() => setQ("")}>
                  Xoá
                </button>
              ) : null}
            </div>
          </div>
        </div>
        <div className="ordActions">
          <button className="ordActionBtn" disabled={loading} onClick={() => loadAll()}>
            Tải lại
          </button>
          <button className="ordActionBtn" disabled={loading} onClick={() => setShowExcel(true)}>
            Excel
          </button>
        </div>
      </div>

      <DataGrid
        id="orders.checked_out"
        onSnapshot={(s) => {
          snapRef.current = s
        }}
        columns={[
          { key: "id", title: "ID", width: 90, minWidth: 70, render: (o) => <span className="ordMono">#{o.id}</span> },
          {
            key: "time",
            title: "Giờ (VN)",
            width: 200,
            minWidth: 180,
            getValue: (o) => o.checked_out_at || null,
            exportValue: (o) => (o.checked_out_at ? fmtDateTimeVN(o.checked_out_at) : ""),
            render: (o) => (
              <span className="ordMono">
                {o.checked_out_at ? fmtDateTimeVN(o.checked_out_at) : "—"}
              </span>
            ),
          },
          { key: "payment_method", title: "Thanh toán", width: 140, minWidth: 120, render: (o) => <span className="ordMono">{o.payment_method || "—"}</span> },
          {
            key: "customer",
            title: "Khách",
            width: 120,
            minWidth: 110,
            getValue: (o) => o.customer_id || null,
            exportValue: (o) => (o.customer_id ? `KH#${o.customer_id}` : ""),
            render: (o) => <span className="ordMono">{o.customer_id ? `KH#${o.customer_id}` : "—"}</span>,
          },
          {
            key: "grand_total",
            title: "Tổng",
            width: 140,
            minWidth: 120,
            align: "right",
            getValue: (o) => Number(o.grand_total || 0) || 0,
            render: (o) => <span className="ordMono">{fmtMoney(o.grand_total)}</span>,
          },
          {
            key: "actions",
            title: "Thao tác",
            width: 120,
            minWidth: 110,
            render: (o) => (
              <span style={{ display: "flex", justifyContent: "flex-end" }}>
                <button className="ordMiniBtn" disabled={viewBusy} onClick={() => openReceipt(o.id)}>
                  Xem
                </button>
              </span>
            ),
          },
        ]}
        rows={filtered}
        rowKey={(o) => o.id}
      />

      {viewReceipt ? (
        <ReceiptModal receipt={viewReceipt} template={receiptTemplate} onClose={() => setViewReceipt(null)} />
      ) : null}

      {showExcel ? (
        <ExcelToolsModal
          title="Excel · Hoá đơn"
          resource="hoa_don"
          exportFilename="hoa-don.xlsx"
          getSnapshot={() => snapRef.current}
          showTemplate={false}
          showImport={false}
          onClose={() => setShowExcel(false)}
        />
      ) : null}
    </div>
  )
}

function ReceiptModal({ receipt, template, onClose }) {
  const cfg = normalizeReceiptTemplate(template || defaultReceiptTemplate)
  return (
    <Modal
      wide
      title={`Hoá đơn #${receipt.order_id}`}
      onClose={onClose}
      footer={
        <>
          <button className="admBtn" onClick={onClose}>
            Đóng
          </button>
          <button
            className="admBtn admBtnPrimary"
            onClick={() => {
              // Keep window script-writable for consistent printing across browsers.
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
  <div class="muted">${fmtDateTimeVN(receipt.created_at)}</div>
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
            <div class="muted">${
              [
                cfg.showPricingMode ? it.pricing_mode : null,
                Number(it.discount_total || 0) > 0 ? `KM:${fmtMoney(it.discount_total)}đ` : null,
                cfg.showBarcode && it.barcode ? it.barcode : null,
                cfg.showSku && it.sku ? it.sku : null,
              ]
                .filter(Boolean)
                .map(escapeHtml)
                .join(" · ")
            }</div>
          </td>
          <td class="right">${it.qty}${it.uom ? " " + it.uom : ""}</td>
          <td class="right">${fmtMoney(it.unit_price)}đ</td>
          <td class="right">${fmtMoney(it.line_total)}đ</td>
        </tr>
      `
        )
        .join("")}
    </tbody>
  </table>
  <div class="totals">
    <div class="row"><span>Tạm tính</span><span>${fmtMoney(receipt.subtotal)}đ</span></div>
    <div class="row"><span>Khuyến mãi</span><span>${fmtMoney(receipt.discount_total)}đ</span></div>
    <div class="row grand"><span>Tổng</span><span>${fmtMoney(receipt.grand_total)}đ</span></div>
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
                const blob = new Blob([html], { type: "text/html;charset=utf-8" })
                const url = URL.createObjectURL(blob)
                window.open(url, "_blank")
              }
            }}
          >
            In hoá đơn
          </button>
        </>
      }
    >
      <div className="ordReceipt">
        <div className="ordReceiptHead">
          <div>
            <div className="ordReceiptTitle">Hoá đơn #{receipt.order_id}</div>
            <div className="ordReceiptMeta">
              <span className="ordMono">{fmtDateTimeVN(receipt.created_at)}</span>
              {receipt.customer_name ? (
                <span className="ordMono">
                  {" "}
                  · Khách: {receipt.customer_name}
                  {receipt.customer_phone ? ` · ${receipt.customer_phone}` : ""}
                </span>
              ) : null}
            </div>
          </div>
          <div className="ordReceiptTotal">{fmtMoney(receipt.grand_total)} đ</div>
        </div>

        <div className="ordReceiptTable">
          <div className="ordReceiptRow ordReceiptHeadRow">
            <div>Hàng</div>
            <div className="ordRight">SL</div>
            <div className="ordRight">Đơn giá</div>
            <div className="ordRight">TT</div>
          </div>
          {receipt.items.map((it) => (
            <div key={it.item_id} className="ordReceiptRow">
              <div>
                <div style={{ fontWeight: 900 }}>{it.name}</div>
                <div className="ordReceiptSub">
                  {[
                    cfg.showPricingMode ? it.pricing_mode : null,
                    it.sku ? `SKU:${it.sku}` : null,
                    it.barcode ? `BC:${it.barcode}` : null,
                    Number(it.discount_total || 0) > 0 ? `KM:${fmtMoney(it.discount_total)}đ` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
              <div className="ordRight ordMono">
                {it.qty} {it.uom || ""}
              </div>
              <div className="ordRight ordMono">{fmtMoney(it.unit_price)}</div>
              <div className="ordRight ordMono">{fmtMoney(it.line_total)}</div>
            </div>
          ))}
        </div>

        <div className="ordReceiptTotals">
          <div className="ordReceiptTotRow">
            <span>Tạm tính</span>
            <b>{fmtMoney(receipt.subtotal)} đ</b>
          </div>
          <div className="ordReceiptTotRow">
            <span>Khuyến mãi</span>
            <b>{fmtMoney(receipt.discount_total)} đ</b>
          </div>
          <div className="ordReceiptTotRow ordReceiptGrand">
            <span>Tổng</span>
            <b>{fmtMoney(receipt.grand_total)} đ</b>
          </div>
        </div>
      </div>
    </Modal>
  )
}
