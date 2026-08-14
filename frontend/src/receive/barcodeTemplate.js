export const BARCODE_TEMPLATE_KEY = "pos.barcodeTemplate.v1"
export const BARCODE_PRESETS_KEY = "pos.barcodePresets.v1"
export const ACTIVE_BARCODE_PRESET_KEY = "pos.activeBarcodePreset.v1"
export const DEFAULT_BARCODE_PRESET_ID = "default"

export const defaultBarcodeTemplate = {
  labelWidthMm: 50,
  labelHeightMm: 25,
  barcodeHeightMm: 10,
  barcodeScale: 2,
  doubleLabelWidthMm: 30,
  doubleLabelHeightMm: 20,
  doubleLabelGapMm: 2,
  doubleBarcodeHeightMm: 7,
  doubleBarcodeScale: 1,
  showName: true,
  showSku: true,
  showPrice: true,
  showBarcodeText: true,
  title: "Tem mã vạch",
}

function asNum(v, fallback) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

export function normalizeBarcodeTemplate(input) {
  const raw = input || {}
  return {
    labelWidthMm: clamp(asNum(raw.labelWidthMm, defaultBarcodeTemplate.labelWidthMm), 10, 150),
    labelHeightMm: clamp(asNum(raw.labelHeightMm, defaultBarcodeTemplate.labelHeightMm), 10, 100),
    barcodeHeightMm: clamp(asNum(raw.barcodeHeightMm, defaultBarcodeTemplate.barcodeHeightMm), 4, 40),
    barcodeScale: clamp(Math.floor(asNum(raw.barcodeScale, defaultBarcodeTemplate.barcodeScale)), 1, 5),
    doubleLabelWidthMm: clamp(asNum(raw.doubleLabelWidthMm, defaultBarcodeTemplate.doubleLabelWidthMm), 10, 100),
    doubleLabelHeightMm: clamp(asNum(raw.doubleLabelHeightMm, defaultBarcodeTemplate.doubleLabelHeightMm), 10, 100),
    doubleLabelGapMm: clamp(asNum(raw.doubleLabelGapMm, defaultBarcodeTemplate.doubleLabelGapMm), 0, 20),
    doubleBarcodeHeightMm: clamp(asNum(raw.doubleBarcodeHeightMm, defaultBarcodeTemplate.doubleBarcodeHeightMm), 4, 40),
    doubleBarcodeScale: clamp(Math.floor(asNum(raw.doubleBarcodeScale, defaultBarcodeTemplate.doubleBarcodeScale)), 1, 5),
    showName: Boolean(raw.showName ?? defaultBarcodeTemplate.showName),
    showSku: Boolean(raw.showSku ?? defaultBarcodeTemplate.showSku),
    showPrice: Boolean(raw.showPrice ?? defaultBarcodeTemplate.showPrice),
    showBarcodeText: Boolean(raw.showBarcodeText ?? defaultBarcodeTemplate.showBarcodeText),
    title: String(raw.title ?? defaultBarcodeTemplate.title),
  }
}

function loadLegacyBarcodeTemplate() {
  try {
    const raw = localStorage.getItem(BARCODE_TEMPLATE_KEY)
    if (!raw) return defaultBarcodeTemplate
    return normalizeBarcodeTemplate(JSON.parse(raw))
  } catch {
    return defaultBarcodeTemplate
  }
}

function normalizePreset(preset, index = 0) {
  return {
    id: String(preset?.id || `preset_${index + 1}`),
    name: String(preset?.name || `Mẫu tem ${index + 1}`).trim() || `Mẫu tem ${index + 1}`,
    template: normalizeBarcodeTemplate(preset?.template),
  }
}

export function loadBarcodePresets() {
  try {
    const raw = localStorage.getItem(BARCODE_PRESETS_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    if (Array.isArray(parsed) && parsed.length) return parsed.map(normalizePreset)
  } catch {
    // Migrate the old single-template setting below.
  }

  const migrated = [{
    id: DEFAULT_BARCODE_PRESET_ID,
    name: "Mặc định",
    template: normalizeBarcodeTemplate(loadLegacyBarcodeTemplate()),
  }]
  localStorage.setItem(BARCODE_PRESETS_KEY, JSON.stringify(migrated))
  localStorage.setItem(ACTIVE_BARCODE_PRESET_KEY, DEFAULT_BARCODE_PRESET_ID)
  return migrated
}

export function saveBarcodePresets(next) {
  const normalized = (Array.isArray(next) ? next : []).map(normalizePreset)
  if (!normalized.length) throw new Error("Cần giữ lại ít nhất một preset tem.")
  localStorage.setItem(BARCODE_PRESETS_KEY, JSON.stringify(normalized))
  return normalized
}

export function loadActiveBarcodePresetId() {
  const presets = loadBarcodePresets()
  const savedId = localStorage.getItem(ACTIVE_BARCODE_PRESET_KEY)
  return presets.some((preset) => preset.id === savedId) ? savedId : presets[0].id
}

export function setActiveBarcodePreset(id) {
  const presets = loadBarcodePresets()
  const selected = presets.find((preset) => preset.id === String(id)) || presets[0]
  localStorage.setItem(ACTIVE_BARCODE_PRESET_KEY, selected.id)
  localStorage.setItem(BARCODE_TEMPLATE_KEY, JSON.stringify(selected.template))
  window.dispatchEvent(new CustomEvent("barcode:preset-change", { detail: { id: selected.id } }))
  return selected
}

export function createBarcodePreset(name, template) {
  const presets = loadBarcodePresets()
  const id = `preset_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const created = normalizePreset({ id, name, template }, presets.length)
  saveBarcodePresets([...presets, created])
  setActiveBarcodePreset(created.id)
  return created
}

export function renameBarcodePreset(id, name) {
  const cleanName = String(name || "").trim()
  if (!cleanName) throw new Error("Tên preset không được để trống.")
  return saveBarcodePresets(loadBarcodePresets().map((preset) => (
    preset.id === id ? { ...preset, name: cleanName } : preset
  )))
}

export function deleteBarcodePreset(id) {
  const presets = loadBarcodePresets()
  if (presets.length <= 1) throw new Error("Cần giữ lại ít nhất một preset tem.")
  const remaining = saveBarcodePresets(presets.filter((preset) => preset.id !== id))
  const activeId = loadActiveBarcodePresetId()
  return setActiveBarcodePreset(activeId === id ? remaining[0].id : activeId)
}

export function loadBarcodeTemplate() {
  const presets = loadBarcodePresets()
  const activeId = loadActiveBarcodePresetId()
  return presets.find((preset) => preset.id === activeId)?.template || presets[0].template
}

export function saveBarcodeTemplate(next) {
  const normalized = normalizeBarcodeTemplate(next)
  const activeId = loadActiveBarcodePresetId()
  saveBarcodePresets(loadBarcodePresets().map((preset) => (
    preset.id === activeId ? { ...preset, template: normalized } : preset
  )))
  localStorage.setItem(BARCODE_TEMPLATE_KEY, JSON.stringify(normalized))
  window.dispatchEvent(new CustomEvent("barcode:preset-change", { detail: { id: activeId } }))
  return normalized
}

export const barcodePresets = {
  label_25x50: {
    ...defaultBarcodeTemplate,
    labelWidthMm: 50,
    labelHeightMm: 25,
    barcodeHeightMm: 10,
  },
  label_16x28: {
    ...defaultBarcodeTemplate,
    labelWidthMm: 28,
    labelHeightMm: 16,
    barcodeHeightMm: 6,
    barcodeScale: 1,
    showName: false,
    showPrice: false,
  },
}
