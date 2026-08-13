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
  const [templateMode, setTemplateMode] = useState("single")

  useEffect(() => {
    setForm(template || defaultBarcodeTemplate)
  }, [template])

  const cfg = useMemo(() => normalizeBarcodeTemplate(form), [form])
  const isDouble = templateMode === "double"
  const previewWidth = isDouble ? cfg.doubleLabelWidthMm : cfg.labelWidthMm
  const previewHeight = isDouble ? cfg.doubleLabelHeightMm : cfg.labelHeightMm
  const previewGap = isDouble ? cfg.doubleLabelGapMm : 0
  const previewPageWidth = isDouble ? previewWidth * 2 + previewGap : previewWidth

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

      <div className="bctModeTabs">
        <button
          type="button"
          className={`bctModeTab ${!isDouble ? "bctModeTabActive" : ""}`}
          onClick={() => setTemplateMode("single")}
        >
          <span className="bctModeIcon bctModeIconSingle"><i /></span>
          Mẫu tem đơn
        </button>
        <button
          type="button"
          className={`bctModeTab ${isDouble ? "bctModeTabActive" : ""}`}
          onClick={() => setTemplateMode("double")}
        >
          <span className="bctModeIcon bctModeIconDouble"><i /><i /></span>
          Mẫu tem đôi
        </button>
      </div>

      <div className="bctGrid">
        <div className="bctPanel">
          <div className="bctPanelHead">Thông số {isDouble ? "tem đôi" : "tem đơn"}</div>
          <div className="bctPanelBody bctForm">
            <label>
              <span>Tên tiêu đề in</span>
              <input value={form.title || ""} onChange={(e) => setField("title", e.target.value)} />
            </label>
            <label>
              <span>Rộng mỗi tem (mm)</span>
              <input type="number" value={previewWidth} onChange={(e) => setField(isDouble ? "doubleLabelWidthMm" : "labelWidthMm", e.target.value)} />
            </label>
            <label>
              <span>Cao mỗi tem (mm)</span>
              <input type="number" value={previewHeight} onChange={(e) => setField(isDouble ? "doubleLabelHeightMm" : "labelHeightMm", e.target.value)} />
            </label>
            {isDouble ? (
              <label>
                <span>Khoảng cách 2 tem (mm)</span>
                <input type="number" value={cfg.doubleLabelGapMm} onChange={(e) => setField("doubleLabelGapMm", e.target.value)} />
              </label>
            ) : null}
            <label>
              <span>Cao barcode (mm)</span>
              <input type="number" value={isDouble ? cfg.doubleBarcodeHeightMm : cfg.barcodeHeightMm} onChange={(e) => setField(isDouble ? "doubleBarcodeHeightMm" : "barcodeHeightMm", e.target.value)} />
            </label>
            <label>
              <span>Barcode scale</span>
              <input type="number" value={isDouble ? cfg.doubleBarcodeScale : cfg.barcodeScale} onChange={(e) => setField(isDouble ? "doubleBarcodeScale" : "barcodeScale", e.target.value)} />
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
              <div className="bctPreviewRoll" style={{ width: `${previewPageWidth}mm` }}>
                <div className="bctPreviewGrid" style={{ gap: `${previewGap}mm`, gridTemplateColumns: `repeat(${isDouble ? 2 : 1}, ${previewWidth}mm)` }}>
                {sampleLabels.slice(0, isDouble ? 2 : 1).map((lb, idx) => (
                  <div key={idx} className="bctLabel" style={{ width: `${previewWidth}mm`, height: `${previewHeight}mm` }}>
                    <div className="bctName">{lb.name}</div>
                    <div className="bctPrice">{formatMoneyVN(lb.price)}đ</div>
                    <div className="bctCode">[{lb.code}]</div>
                  </div>
                ))}
                </div>
                <div className="bctRollWidth">Khổ in: {previewPageWidth} × {previewHeight}mm</div>
              </div>
            </div>
            <div className="bctHint">Preview chỉ để canh bố cục. In thật sẽ dùng barcode ảnh.</div>
            <div className="bctHint">
              Khi in: {isDouble ? "mỗi cặp tem" : "mỗi tem"} là 1 trang `{previewPageWidth} × {previewHeight}mm`, không qua khổ A4.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
