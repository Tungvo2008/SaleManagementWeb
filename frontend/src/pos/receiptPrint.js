import { fmtDateTimeVN } from "../utils/datetime"
import { formatMoneyVN } from "../utils/number"
import { buildPrintAutoCloseScript, openPrintDocument } from "../utils/print"
import {
  defaultReceiptTemplate,
  normalizeReceiptTemplate,
} from "./receiptTemplate"

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function fmtMoney(value) {
  return `${formatMoneyVN(value, { empty: "0" }) || "0"} đ`
}

function fmtQty(value) {
  const number = Number(value ?? 0)
  if (!Number.isFinite(number)) return "0"
  return number.toLocaleString("vi-VN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}

function invoiceNumber(receipt) {
  return `HD${String(receipt?.order_id ?? "").padStart(6, "0")}`
}

function itemMeta(item, config) {
  return [
    config.showPricingMode ? item.pricing_mode : null,
    Number(item.discount_total || 0) > 0
      ? `KM: ${fmtMoney(item.discount_total)}`
      : null,
    config.showBarcode && item.barcode ? `BC: ${item.barcode}` : null,
    config.showSku && item.sku ? `SKU: ${item.sku}` : null,
  ]
    .filter(Boolean)
    .map(escapeHtml)
    .join(" · ")
}

function receiptHeader(receipt, config, { a4 = false } = {}) {
  const customer = receipt.customer_name || "Khách lẻ"
  return `
    <header class="receiptHeader ${a4 ? "center" : ""}">
      <div class="storeName">${escapeHtml(config.storeName || "Cửa hàng")}</div>
      ${config.storeAddress ? `<div>Địa chỉ: ${escapeHtml(config.storeAddress)}</div>` : ""}
      ${config.storePhone ? `<div>SĐT: ${escapeHtml(config.storePhone)}</div>` : ""}
      ${config.headerNote ? `<div class="headerNote">${escapeHtml(config.headerNote)}</div>` : ""}
      <div class="invoiceTitle">HÓA ĐƠN BÁN HÀNG</div>
      <div>Số HĐ: ${escapeHtml(invoiceNumber(receipt))}</div>
      <div>Ngày xuất hóa đơn: ${escapeHtml(fmtDateTimeVN(receipt.created_at))}</div>
      <div class="customer">Khách hàng: ${escapeHtml(customer)}</div>
      ${receipt.customer_phone ? `<div class="customerPhone">SĐT khách hàng: ${escapeHtml(receipt.customer_phone)}</div>` : ""}
    </header>`
}

function receiptItems(receipt, config) {
  return (receipt.items || [])
    .map((item) => {
      const meta = itemMeta(item, config)
      return `
        <tr class="itemNameRow">
          <td colspan="3">
            <div class="itemName">${escapeHtml(item.name)}${item.uom ? ` (${escapeHtml(item.uom)})` : ""}</div>
            ${meta ? `<div class="itemMeta">${meta}</div>` : ""}
          </td>
        </tr>
        <tr class="itemValueRow">
          <td>${fmtMoney(item.unit_price)}</td>
          <td>${escapeHtml(fmtQty(item.qty))}</td>
          <td>${fmtMoney(item.line_total)}</td>
        </tr>`
    })
    .join("")
}

function receiptBody(receipt, config) {
  return `
    <table>
      <thead><tr><th>Đơn giá</th><th>SL</th><th>Thành tiền</th></tr></thead>
      <tbody>${receiptItems(receipt, config)}</tbody>
    </table>
    <section class="totals">
      <div><span>Tạm tính</span><b>${fmtMoney(receipt.subtotal)}</b></div>
      <div><span>Khuyến mãi</span><b>${fmtMoney(receipt.discount_total)}</b></div>
      <div class="grand"><span>Tổng thanh toán</span><b>${fmtMoney(receipt.grand_total)}</b></div>
    </section>
    <footer>
      ${config.footerText ? `<div>${escapeHtml(config.footerText)}</div>` : ""}
      ${config.showThankYou ? "<div>Cảm ơn quý khách!</div>" : ""}
    </footer>`
}

function thermalHtml(receipt, config, autoPrint) {
  const width = config.paperSize === "58" ? 58 : 80
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Hóa đơn ${receipt.order_id}</title>
<style>
  @page { size: ${width}mm auto; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #111; font-family: Arial, "Helvetica Neue", sans-serif; }
  .receiptPage { width: ${width}mm; padding: 2.5mm; font-size: 11px; line-height: 1.35; }
  .receiptHeader { text-align: center; }
  .storeName { font-size: 17px; font-weight: 700; }
  .headerNote { margin-top: 2px; }
  .invoiceTitle { margin-top: 7px; font-size: 14px; font-weight: 700; }
  .customer { margin-top: 4px; text-align: left; }
  .customerPhone { text-align: left; }
  table { width: 100%; border-collapse: collapse; margin-top: 7px; table-layout: fixed; }
  th { padding: 5px 0; border-bottom: 1px solid #555; font-size: 10px; text-align: left; }
  th:nth-child(2) { width: 18%; text-align: center; }
  th:nth-child(3) { width: 32%; text-align: right; }
  td { padding: 3px 0; vertical-align: top; }
  .itemNameRow td { padding-bottom: 0; }
  .itemValueRow td { padding-top: 1px; padding-bottom: 5px; border-bottom: 1px dashed #777; }
  .itemValueRow td:nth-child(2) { text-align: center; }
  .itemValueRow td:nth-child(3) { text-align: right; }
  .itemName { font-size: 11px; font-weight: 700; }
  .itemMeta { color: #555; font-size: 9px; overflow-wrap: anywhere; }
  .totals { display: grid; gap: 3px; margin-top: 8px; }
  .totals > div { display: flex; justify-content: space-between; gap: 8px; }
  .grand { padding-top: 3px; border-top: 1px solid #555; font-size: 12px; }
  footer { margin-top: 9px; text-align: center; }
</style></head><body><main class="receiptPage">
${receiptHeader(receipt, config)}
${receiptBody(receipt, config)}
</main>${autoPrint ? `<script>${buildPrintAutoCloseScript()}</script>` : ""}</body></html>`
}

function a4Html(receipt, config, autoPrint) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Hóa đơn ${receipt.order_id}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #111; font-family: Arial, "Helvetica Neue", sans-serif; }
  .receiptPage { width: 100%; max-width: 186mm; margin: 0 auto; font-size: 14px; line-height: 1.4; }
  .center { text-align: center; }
  .storeName { font-size: 24px; font-weight: 700; }
  .headerNote { margin-top: 3px; }
  .invoiceTitle { margin-top: 14px; font-size: 22px; font-weight: 700; }
  .customer { margin-top: 12px; text-align: left; }
  .customerPhone { text-align: left; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; table-layout: fixed; }
  th { padding: 8px 5px; border-bottom: 1.5px solid #222; text-align: left; }
  th:nth-child(2) { width: 15%; text-align: center; }
  th:nth-child(3) { width: 24%; text-align: right; }
  td { padding: 5px; vertical-align: top; }
  .itemNameRow td { padding-bottom: 0; }
  .itemValueRow td { padding-top: 1px; padding-bottom: 8px; border-bottom: 1px dashed #888; }
  .itemValueRow td:nth-child(2) { text-align: center; }
  .itemValueRow td:nth-child(3) { text-align: right; }
  .itemName { font-weight: 700; }
  .itemMeta { color: #555; font-size: 12px; overflow-wrap: anywhere; }
  .totals { width: min(420px, 60%); display: grid; gap: 6px; margin: 16px 0 0 auto; }
  .totals > div { display: flex; justify-content: space-between; gap: 16px; }
  .grand { padding-top: 6px; border-top: 1px solid #222; font-size: 16px; }
  footer { margin-top: 38px; text-align: center; font-style: italic; }
</style></head><body><main class="receiptPage">
${receiptHeader(receipt, config, { a4: true })}
${receiptBody(receipt, config)}
</main>${autoPrint ? `<script>${buildPrintAutoCloseScript()}</script>` : ""}</body></html>`
}

export function buildReceiptPrintHtml(
  receipt,
  template,
  { autoPrint = true } = {},
) {
  const config = normalizeReceiptTemplate(template || defaultReceiptTemplate)
  return config.printLayout === "a4"
    ? a4Html(receipt, config, autoPrint)
    : thermalHtml(receipt, config, autoPrint)
}

export function openReceiptPrint(receipt, template) {
  const html = buildReceiptPrintHtml(receipt, template)
  const popup = openPrintDocument({
    title: `Hóa đơn ${receipt.order_id}`,
    html: "<!doctype html><title>Đang tải...</title>",
    features: "width=900,height=800",
  })
  if (!popup) return false

  try {
    popup.document.open()
    popup.document.write(html)
    popup.document.close()
    popup.focus()
  } catch {
    const url = URL.createObjectURL(
      new Blob([html], { type: "text/html;charset=utf-8" }),
    )
    window.open(url, "_blank")
  }
  return true
}
