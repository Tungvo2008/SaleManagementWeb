import { useMemo, useRef, useState } from "react"
import Modal from "./Modal"
import "./excel-tools.css"

function errMsg(e) {
  if (!e) return "Lỗi không xác định"
  if (typeof e === "string") return e
  return e?.message || "Lỗi không xác định"
}

function normalizeCell(v) {
  if (v === null || v === undefined) return ""
  if (typeof v === "number") return Number.isFinite(v) ? v : ""
  if (typeof v === "boolean") return v ? 1 : 0
  if (typeof v === "string") return v
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

async function downloadPost({ url, payload, filename }) {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `HTTP ${res.status}`)
  }
  const blob = await res.blob()
  const dlName = filename || "export.xlsx"
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = dlName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1500)
}

async function downloadGet({ url, filename }) {
  const res = await fetch(url, {
    method: "GET",
    credentials: "include",
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `HTTP ${res.status}`)
  }
  const blob = await res.blob()
  const dlName = filename || "download.xlsx"
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = dlName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1500)
}

function ErrorTable({ errors }) {
  if (!errors || errors.length === 0) return null
  return (
    <div className="xltErrBox">
      <div className="xltErrTitle">Danh sách lỗi</div>
      <div className="xltErrTable">
        <div className="xltErrHead">
          <div>Sheet</div>
          <div>Row</div>
          <div>Field</div>
          <div>Nội dung</div>
        </div>
        {errors.map((e, idx) => (
          <div key={idx} className="xltErrRow">
            <div className="xltMono">{e.sheet}</div>
            <div className="xltMono">{e.row || ""}</div>
            <div className="xltMono">{e.field}</div>
            <div>{e.message}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function ExcelToolsModal({
  title = "Excel",
  resource,
  templateUrl,
  importUrl,
  exportFilename,
  templateFilename,
  showTemplate = true,
  showImport = true,
  showExportView = true,
  getSnapshot,
  onClose,
  onImported,
}) {
  const [busy, setBusy] = useState(false)
  const [file, setFile] = useState(null)
  const [dryRun, setDryRun] = useState(true)
  const [ok, setOk] = useState(null)
  const [err, setErr] = useState(null)
  const [errors, setErrors] = useState([])
  const fileRef = useRef(null)

  const canImport = useMemo(() => !!file && !busy, [file, busy])

  async function doImport() {
    if (!file) return
    setBusy(true)
    setOk(null)
    setErr(null)
    setErrors([])
    try {
      const fd = new FormData()
      fd.append("file", file)
      const url = `${importUrl || `/api/v1/excel/import/${resource}`}${dryRun ? "?dry_run=1" : ""}`
      const res = await fetch(url, { method: "POST", credentials: "include", body: fd })
      const txt = await res.text()
      let data = null
      try {
        data = txt ? JSON.parse(txt) : null
      } catch {
        data = txt
      }
      if (!res.ok) {
        const detail = data?.detail
        const message = (typeof detail === "string" ? detail : detail?.message) || data?.message || `HTTP ${res.status}`
        setErr(message)
        if (detail?.errors && Array.isArray(detail.errors)) setErrors(detail.errors)
        throw new Error(message)
      }
      const c = data?.counts
      setOk(
        dryRun
          ? `Kiểm tra OK (không ghi DB). Dự kiến: tạo mới ${c?.created ?? 0} · cập nhật ${c?.updated ?? 0}`
          : `Import OK. Tạo mới ${c?.created ?? 0} · cập nhật ${c?.updated ?? 0}`,
      )
      if (!dryRun) {
        onImported && onImported()
      }
      if (fileRef.current) fileRef.current.value = ""
      setFile(null)
    } catch (e) {
      if (!err) setErr(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  async function doExportView() {
    const snap = typeof getSnapshot === "function" ? getSnapshot() : null
    if (!snap || !snap.visibleCols || !snap.rows) {
      setErr("Chưa có dữ liệu để xuất (bạn thử tải lại trang).")
      return
    }
    setBusy(true)
    setOk(null)
    setErr(null)
    setErrors([])
    try {
      const cols = snap.visibleCols
        .filter((c) => c && c.key !== "actions")
        .map((c) => ({ key: c.key, title: c.title || c.key, getValue: c.exportValue || c.getValue }))
      const headers = cols.map((c) => c.title)
      const rows = (snap.rows || []).map((r) => {
        const out = {}
        for (const c of cols) {
          const raw = typeof c.getValue === "function" ? c.getValue(r) : r?.[c.key]
          out[c.title] = normalizeCell(raw)
        }
        return out
      })
      await downloadPost({
        url: "/api/v1/excel/export/view",
        filename: exportFilename || `export-${resource}.xlsx`,
        payload: {
          filename: exportFilename || `export-${resource}.xlsx`,
          sheet_name: resource || "data",
          columns: headers,
          required: [],
          rows,
        },
      })
      setOk("Đã xuất file.")
    } catch (e) {
      setErr(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  async function doDownloadTemplate() {
    setBusy(true)
    setOk(null)
    setErr(null)
    setErrors([])
    try {
      const url = templateUrl || (resource ? `/api/v1/excel/template/${resource}` : "/api/v1/excel/template")
      const fn = templateFilename || (resource ? `mau-${resource}.xlsx` : "mau-nhap-du-lieu.xlsx")
      await downloadGet({ url, filename: fn })
      setOk("Đã tải file mẫu.")
    } catch (e) {
      setErr(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="admBtn" disabled={busy} onClick={onClose}>
            Đóng
          </button>
          {showTemplate ? (
            <button className="admBtn" disabled={busy} onClick={doDownloadTemplate}>
              Tải file mẫu
            </button>
          ) : null}
          {showExportView ? (
            <button className="admBtn admBtnPrimary" disabled={busy} onClick={doExportView}>
              Xuất bảng đang xem
            </button>
          ) : null}
        </>
      }
    >
      <div className="xlt">
        <div className="xltNote">
          Lưu ý: dùng định dạng <b>.xlsx</b>. Dòng 1 là tiêu đề tiếng Việt; dòng 2 (ẩn) là mã cột để import (đừng xoá).
        </div>

        {showImport ? (
          <div className="xltImportBox">
            <div className="xltRow">
              <input
                ref={fileRef}
                className="xltFile"
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xls,.xml,application/vnd.ms-excel,text/xml,application/xml"
                onChange={(e) => setFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)}
                disabled={busy}
              />
            </div>
            <label className="xltCheck">
              <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} disabled={busy} />
              Chỉ kiểm tra (không ghi DB)
            </label>
            <div className="xltRow">
              <button className="admBtn admBtnPrimary" disabled={!canImport} onClick={doImport}>
                {dryRun ? "Kiểm tra file" : "Import"}
              </button>
            </div>
            {err ? <div className="xltErr">{err}</div> : null}
            {ok ? <div className="xltOk">{ok}</div> : null}
            <ErrorTable errors={errors} />
          </div>
        ) : (
          <>
            {err ? <div className="xltErr">{err}</div> : null}
            {ok ? <div className="xltOk">{ok}</div> : null}
          </>
        )}
      </div>
    </Modal>
  )
}
