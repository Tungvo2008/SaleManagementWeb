import { useEffect, useMemo, useState } from "react"
import {
  barcodePresets,
  defaultBarcodeTemplate,
  normalizeBarcodeTemplate,
} from "../receive/barcodeTemplate"
import { formatMoneyVN } from "../utils/number"
import "./barcode-template.css"

const sampleLabels = [
  { code: "BC-LUOI-XANH-001", name: "Lưới nylon xanh 1m", price: "22000" },
  { code: "BC-LUOI-XANH-002", name: "Lưới nylon xanh 1m", price: "22000" },
  { code: "BC-TEE-RED-M", name: "Áo thun trơn đỏ M", price: "199000" },
]

export default function BarcodeTemplatePage({ template, onSave, onReset }) {
  const [form, setForm] = useState(template || defaultBarcodeTemplate)

  useEffect(() => {
    setForm(template || defaultBarcodeTemplate)
  }, [template])

  const cfg = useMemo(() => normalizeBarcodeTemplate(form), [form])

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function applyPreset(key) {
    const p = barcodePresets[key]
    if (!p) return
    setForm(normalizeBarcodeTemplate(p))
  }

  return (
    <div className="bct">
      <div className="bctTop">
        <div>
          <div className="bctTitle">Mẫu tem mã vạch</div>
          <div className="bctSub">Mỗi tem được xuất thành một trang đúng kích thước rộng × cao của tem cuộn.</div>
        </div>
        <div className="bctTopActions">
          <button className="bctBtn" onClick={() => applyPreset("label_25x50")}>
            Preset 25x50
          </button>
          <button className="bctBtn" onClick={() => applyPreset("label_16x28")}>
            Preset 16x28
          </button>
          <button
            className="bctBtn bctBtnDanger"
            onClick={() => {
              if (onReset) onReset()
              setForm(defaultBarcodeTemplate)
            }}
          >
            Reset
          </button>
          <button className="bctBtn bctBtnPrimary" onClick={() => onSave(cfg)}>
            Lưu mẫu tem
          </button>
        </div>
      </div>

      <div className="bctGrid">
        <div className="bctPanel">
          <div className="bctPanelHead">Thông số in</div>
          <div className="bctPanelBody bctForm">
            <label>
              <span>Tên tiêu đề in</span>
              <input value={form.title || ""} onChange={(e) => setField("title", e.target.value)} />
            </label>
            <label>
              <span>Rộng tem (mm)</span>
              <input type="number" value={cfg.labelWidthMm} onChange={(e) => setField("labelWidthMm", e.target.value)} />
            </label>
            <label>
              <span>Cao tem (mm)</span>
              <input type="number" value={cfg.labelHeightMm} onChange={(e) => setField("labelHeightMm", e.target.value)} />
            </label>
            <label>
              <span>Cao barcode (mm)</span>
              <input type="number" value={cfg.barcodeHeightMm} onChange={(e) => setField("barcodeHeightMm", e.target.value)} />
            </label>
            <label>
              <span>Barcode scale</span>
              <input type="number" value={cfg.barcodeScale} onChange={(e) => setField("barcodeScale", e.target.value)} />
            </label>
          </div>
        </div>

        <div className="bctPanel">
          <div className="bctPanelHead">Hiển thị nội dung</div>
          <div className="bctPanelBody bctChecks">
            <div className="bctHint" style={{ marginTop: 0 }}>
              Mẫu tem hiện cố định: <b>Tên sản phẩm + Giá + Barcode</b>.
            </div>
          </div>
        </div>

        <div className="bctPanel bctPreviewWrap">
          <div className="bctPanelHead">Xem trước</div>
          <div className="bctPanelBody">
            <div className="bctPreviewPage">
              <div className="bctPreviewGrid" style={{ gap: "3mm", gridTemplateColumns: `repeat(auto-fit, ${cfg.labelWidthMm}mm)` }}>
                {sampleLabels.map((lb, idx) => (
                  <div key={idx} className="bctLabel" style={{ width: `${cfg.labelWidthMm}mm`, height: `${cfg.labelHeightMm}mm` }}>
                    <div className="bctName">{lb.name}</div>
                    <div className="bctPrice">{formatMoneyVN(lb.price)}đ</div>
                    <div className="bctCode">[{lb.code}]</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bctHint">Preview chỉ để canh bố cục. In thật sẽ dùng barcode ảnh.</div>
            <div className="bctHint">
              Khi in: mỗi tem là 1 trang `{cfg.labelWidthMm} × {cfg.labelHeightMm}mm`, không qua khổ A4.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
