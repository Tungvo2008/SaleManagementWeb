import { useEffect, useMemo, useState } from "react"
import {
  barcodePresets,
  createBarcodePreset,
  deleteBarcodePreset,
  defaultBarcodeTemplate,
  loadActiveBarcodePresetId,
  loadBarcodePresets,
  normalizeBarcodeTemplate,
  renameBarcodePreset,
  setActiveBarcodePreset,
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
  const [presets, setPresets] = useState(() => loadBarcodePresets())
  const [activePresetId, setActivePresetId] = useState(() => loadActiveBarcodePresetId())
  const [presetName, setPresetName] = useState("")
  const [presetMessage, setPresetMessage] = useState("")

  useEffect(() => {
    setForm(template || defaultBarcodeTemplate)
  }, [template])

  useEffect(() => {
    const active = presets.find((preset) => preset.id === activePresetId)
    setPresetName(active?.name || "")
  }, [activePresetId, presets])

  const cfg = useMemo(() => normalizeBarcodeTemplate(form), [form])
  const isDouble = templateMode === "double"
  const previewWidth = isDouble ? cfg.doubleLabelWidthMm : cfg.labelWidthMm
  const previewHeight = isDouble ? cfg.doubleLabelHeightMm : cfg.labelHeightMm
  const previewGap = isDouble ? cfg.doubleLabelGapMm : 0
  const previewPageWidth = isDouble ? previewWidth * 2 + previewGap : previewWidth
  const compactPreview = previewHeight <= 18 || previewWidth <= 28
  const textScale = isDouble ? cfg.doubleTextScale : cfg.textScale

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function applyPreset(key) {
    const p = barcodePresets[key]
    if (!p) return
    setForm(normalizeBarcodeTemplate(p))
  }

  function refreshPresets(selectedId = loadActiveBarcodePresetId()) {
    setPresets(loadBarcodePresets())
    setActivePresetId(selectedId)
  }

  function choosePreset(id) {
    const selected = setActiveBarcodePreset(id)
    setForm(selected.template)
    refreshPresets(selected.id)
    setPresetMessage(`Đang dùng preset “${selected.name}”.`)
  }

  function saveCurrentPreset() {
    onSave(cfg)
    refreshPresets(activePresetId)
    setPresetMessage("Đã lưu cấu hình vào preset hiện tại.")
  }

  function addPreset() {
    const name = presetName.trim() || `Mẫu tem ${presets.length + 1}`
    const created = createBarcodePreset(name, cfg)
    setForm(created.template)
    refreshPresets(created.id)
    onSave(created.template)
    setPresetMessage(`Đã tạo preset “${created.name}”.`)
  }

  function duplicatePreset() {
    const active = presets.find((preset) => preset.id === activePresetId)
    const created = createBarcodePreset(`${active?.name || "Mẫu tem"} - bản sao`, cfg)
    setForm(created.template)
    refreshPresets(created.id)
    onSave(created.template)
    setPresetMessage(`Đã nhân bản thành “${created.name}”.`)
  }

  function renamePreset() {
    try {
      renameBarcodePreset(activePresetId, presetName)
      refreshPresets(activePresetId)
      setPresetMessage("Đã đổi tên preset.")
    } catch (error) {
      setPresetMessage(error.message)
    }
  }

  function removePreset() {
    const active = presets.find((preset) => preset.id === activePresetId)
    if (!window.confirm(`Xoá preset “${active?.name || "này"}”?`)) return
    try {
      const selected = deleteBarcodePreset(activePresetId)
      setForm(selected.template)
      refreshPresets(selected.id)
      onSave(selected.template)
      setPresetMessage("Đã xoá preset và chuyển sang mẫu còn lại.")
    } catch (error) {
      setPresetMessage(error.message)
    }
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
            Áp dụng 50x25
          </button>
          <button className="bctBtn" onClick={() => applyPreset("label_16x28")}>
            Áp dụng 28x16
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
          <button className="bctBtn bctBtnPrimary" onClick={saveCurrentPreset}>
            Lưu preset
          </button>
        </div>
      </div>

      <div className="bctPresetManager">
        <div className="bctPresetIntro">
          <b>Preset tem</b>
          <span>Lưu nhiều kích thước tem và chọn lại khi in mà không cần nhập thông số mỗi lần.</span>
        </div>
        <label className="bctPresetField">
          <span>Preset đang dùng</span>
          <select value={activePresetId} onChange={(event) => choosePreset(event.target.value)}>
            {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
          </select>
        </label>
        <label className="bctPresetField bctPresetNameField">
          <span>Tên preset</span>
          <input value={presetName} onChange={(event) => setPresetName(event.target.value)} placeholder="VD: Tem đôi 25x15" />
        </label>
        <div className="bctPresetActions">
          <button className="bctBtn" type="button" onClick={addPreset}>+ Tạo mới</button>
          <button className="bctBtn" type="button" onClick={renamePreset}>Đổi tên</button>
          <button className="bctBtn" type="button" onClick={duplicatePreset}>Nhân bản</button>
          <button className="bctBtn bctBtnDanger" type="button" onClick={removePreset} disabled={presets.length <= 1}>Xoá</button>
        </div>
        {presetMessage ? <div className="bctPresetMessage">{presetMessage}</div> : null}
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
            <label>
              <span>Text scale (0.4 - 2)</span>
              <input
                type="number"
                min="0.4"
                max="2"
                step="0.1"
                value={textScale}
                onChange={(e) => setField(isDouble ? "doubleTextScale" : "textScale", e.target.value)}
              />
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
                  <div
                    key={idx}
                    className={`bctLabel ${compactPreview ? "bctLabelCompact" : ""}`}
                    style={{ width: `${previewWidth}mm`, height: `${previewHeight}mm` }}
                  >
                    <div className="bctName" style={{ fontSize: `${(compactPreview ? 7 : 9) * textScale}px` }}>{lb.name}</div>
                    <div className="bctPrice" style={{ fontSize: `${(compactPreview ? 7 : 8) * textScale}px` }}>{formatMoneyVN(lb.price)}đ</div>
                    <div className="bctCode" style={{ fontSize: `${(compactPreview ? 6 : 9) * textScale}px` }}>[{lb.code}]</div>
                  </div>
                ))}
                </div>
                <div className="bctRollWidth">Khổ in: {previewPageWidth} × {previewHeight}mm</div>
              </div>
            </div>
            <div className="bctHint">Preview chỉ để canh bố cục. In thật sẽ dùng barcode ảnh.</div>
            {compactPreview ? (
              <div className="bctCompactNotice">Đang dùng bố cục compact để giữ đủ Tên + Giá + Barcode trên tem nhỏ.</div>
            ) : null}
            <div className="bctHint">
              Khi in: {isDouble ? "mỗi cặp tem" : "mỗi tem"} là 1 trang `{previewPageWidth} × {previewHeight}mm`, không qua khổ A4.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
