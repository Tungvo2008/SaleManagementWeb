import React, { useEffect, useMemo, useState } from "react"
import { defaultReceiptTemplate } from "./receiptTemplate"
import { buildReceiptPrintHtml } from "./receiptPrint"
import "./template-page.css"
import UiSelect from "../ui/Select"

const sampleReceipt = {
  order_id: 1001,
  created_at: new Date().toISOString(),
  items: [
    {
      item_id: 1,
      name: "Ao Thun Tron - Do / M",
      pricing_mode: "normal",
      qty: "2",
      unit_price: "199000",
      line_total: "398000",
      sku: "TEE-RED-M",
      barcode: "BC-TEE-RED-M",
      uom: "pcs",
    },
    {
      item_id: 2,
      name: "Luoi Nylon - Xanh",
      pricing_mode: "meter",
      qty: "3",
      unit_price: "22000",
      line_total: "66000",
      sku: "MESH-GRN-30M",
      barcode: "LUOI-XANH-0002",
      uom: "m",
    },
  ],
  subtotal: "464000",
  discount_total: "14000",
  grand_total: "450000",
}

export default function ReceiptTemplatePage({ template, onSave, onBack }) {
  const [form, setForm] = useState(template)

  useEffect(() => {
    setForm(template)
  }, [template])

  const previewPaperWidth = useMemo(() => {
    if (form.printLayout === "a4") return 760
    return form.paperSize === "58" ? 300 : 380
  }, [form.paperSize, form.printLayout])
  const previewHtml = useMemo(
    () => buildReceiptPrintHtml(sampleReceipt, form, { autoPrint: false }),
    [form],
  )

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="tplShell">
      <div className="tplTop">
        <div>
          <div className="tplTitle">Tuy Chinh Template Hoa Don</div>
          <div className="tplSub">Trang rieng cho mau in. Luu xong quay lai POS de in.</div>
        </div>
        <div className="tplTopActions">
          <button className="tplBtn" onClick={() => onBack()}>
            Quay lai POS
          </button>
          <button className="tplBtn tplBtnDanger" onClick={() => onSave(defaultReceiptTemplate)}>
            Reset mac dinh
          </button>
          <button className="tplBtn tplBtnPrimary" onClick={() => onSave(form)}>
            Luu template
          </button>
        </div>
      </div>

      <div className="tplGrid">
        <div className="tplPanel">
          <div className="tplPanelHead">Noi dung hoa don</div>
          <div className="tplPanelBody">
            <label className="tplField">
              <span>Ten cua hang</span>
              <input value={form.storeName} onChange={(e) => updateField("storeName", e.target.value)} />
            </label>
            <label className="tplField">
              <span>So dien thoai</span>
              <input value={form.storePhone} onChange={(e) => updateField("storePhone", e.target.value)} />
            </label>
            <label className="tplField">
              <span>Dia chi</span>
              <input value={form.storeAddress} onChange={(e) => updateField("storeAddress", e.target.value)} />
            </label>
            <label className="tplField">
              <span>Ghi chu dau hoa don</span>
              <input value={form.headerNote} onChange={(e) => updateField("headerNote", e.target.value)} />
            </label>
            <label className="tplField">
              <span>Footer</span>
              <input value={form.footerText} onChange={(e) => updateField("footerText", e.target.value)} />
            </label>
          </div>
        </div>

        <div className="tplPanel">
          <div className="tplPanelHead">Tuy chon hien thi</div>
          <div className="tplPanelBody">
            <label className="tplCheck">
              <input
                type="checkbox"
                checked={form.showSku}
                onChange={(e) => updateField("showSku", e.target.checked)}
              />
              <span>Hien SKU</span>
            </label>
            <label className="tplCheck">
              <input
                type="checkbox"
                checked={form.showBarcode}
                onChange={(e) => updateField("showBarcode", e.target.checked)}
              />
              <span>Hien barcode</span>
            </label>
            <label className="tplCheck">
              <input
                type="checkbox"
                checked={form.showPricingMode}
                onChange={(e) => updateField("showPricingMode", e.target.checked)}
              />
              <span>Hien mode ban (normal/meter/roll)</span>
            </label>
            <label className="tplCheck">
              <input
                type="checkbox"
                checked={form.showThankYou}
                onChange={(e) => updateField("showThankYou", e.target.checked)}
              />
              <span>Hien loi cam on</span>
            </label>

            <label className="tplField">
              <span>Kiểu in</span>
              <UiSelect
                value={form.printLayout || "thermal"}
                onChange={(v) => updateField("printLayout", String(v))}
                options={[
                  { value: "thermal", label: "Máy in hóa đơn (nhiệt)" },
                  { value: "a4", label: "Máy in văn phòng (A4)" },
                ]}
              />
            </label>

            <label className="tplField">
              <span>Kich thuoc giay</span>
              <UiSelect
                value={form.paperSize}
                onChange={(v) => updateField("paperSize", String(v))}
                options={[
                  { value: "80", label: "80mm" },
                  { value: "58", label: "58mm" },
                ]}
              />
            </label>
          </div>
        </div>

        <div className="tplPanel tplPreview">
          <div className="tplPanelHead">Xem truoc</div>
          <div className="tplPanelBody">
            <iframe
              className="receiptPreviewFrame"
              style={{ width: previewPaperWidth }}
              srcDoc={previewHtml}
              title="Xem trước hóa đơn"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
