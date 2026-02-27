import { useMemo, useState } from "react"
import { post } from "../api"
import "./excel.css"

async function downloadGet(url, filename) {
  const res = await fetch(url, { method: "GET", credentials: "include" })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `HTTP ${res.status}`)
  }
  const blob = await res.blob()
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = filename || "download.xlsx"
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1500)
}

function ErrorTable({ errors }) {
  if (!errors || errors.length === 0) return null
  return (
    <div className="xlErrBox">
      <div className="xlErrTitle">Danh sách lỗi</div>
      <div className="xlErrTable">
        <div className="xlErrHead">
          <div>Sheet</div>
          <div>Row</div>
          <div>Field</div>
          <div>Nội dung</div>
        </div>
        {errors.map((e, idx) => (
          <div key={idx} className="xlErrRow">
            <div className="xlMono">{e.sheet}</div>
            <div className="xlMono">{e.row || ""}</div>
            <div className="xlMono">{e.field}</div>
            <div>{e.message}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function ExcelPage() {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [okMsg, setOkMsg] = useState(null)
  const [errors, setErrors] = useState([])
  const [file, setFile] = useState(null)

  const canImport = useMemo(() => !!file && !busy, [file, busy])

  async function doImport() {
    if (!file) return
    setBusy(true)
    setErr(null)
    setOkMsg(null)
    setErrors([])
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await post("/api/v1/excel/import", fd)
      const c = res?.counts
      setOkMsg(`Import thành công. Tạo mới: ${c?.created ?? 0} · Cập nhật: ${c?.updated ?? 0}`)
    } catch (e) {
      const msg = e?.message || "Import thất bại"
      setErr(msg)
      const detail = e?.data?.detail
      if (detail?.errors && Array.isArray(detail.errors)) {
        setErrors(detail.errors)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="xl">
      <div className="xlTop">
        <div className="xlHint">Nhập/Xuất dữ liệu bằng Excel (dùng định dạng .xlsx).</div>
      </div>

      <div className="xlGrid">
        <div className="xlCard">
          <div className="xlCardTitle">1) Tải file mẫu</div>
          <div className="xlCardBody">
            <div className="xlNote">
              File mẫu có nhiều sheet: sản phẩm, khách hàng, nhà cung cấp, cuộn... Cột bắt buộc được tô màu và có dấu <b>*</b>.
            </div>
            <button
              className="xlBtn xlBtnPrimary"
              onClick={() => {
                setErr(null)
                setOkMsg(null)
                downloadGet("/api/v1/excel/template", "mau-nhap-du-lieu.xlsx").catch((e) => setErr(e?.message || "Không tải được file mẫu"))
              }}
              disabled={busy}
            >
              Tải Excel mẫu
            </button>
          </div>
        </div>

        <div className="xlCard">
          <div className="xlCardTitle">2) Import (validate + ghi vào DB)</div>
          <div className="xlCardBody">
            <div className="xlRow">
              <input
                className="xlFile"
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xls,.xml,application/vnd.ms-excel,text/xml,application/xml"
                onChange={(e) => setFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)}
                disabled={busy}
              />
              <button className="xlBtn xlBtnPrimary" disabled={!canImport} onClick={() => doImport()}>
                Import
              </button>
            </div>
            {err ? <div className="xlErr">{err}</div> : null}
            {okMsg ? <div className="xlOk">{okMsg}</div> : null}
            <ErrorTable errors={errors} />
          </div>
        </div>

        <div className="xlCard">
          <div className="xlCardTitle">3) Xuất dữ liệu hiện có</div>
          <div className="xlCardBody">
            <div className="xlNote">Xuất nhanh từng bảng ra Excel.</div>
            <div className="xlBtns">
              <button
                className="xlBtn"
                onClick={() => downloadGet("/api/v1/excel/export/products", "san-pham.xlsx").catch((e) => setErr(e?.message || "Không xuất được"))}
                disabled={busy}
              >
                Xuất Sản phẩm
              </button>
              <button
                className="xlBtn"
                onClick={() => downloadGet("/api/v1/excel/export/stock_units", "cuon-stock-units.xlsx").catch((e) => setErr(e?.message || "Không xuất được"))}
                disabled={busy}
              >
                Xuất Cuộn (StockUnit)
              </button>
              <button
                className="xlBtn"
                onClick={() => downloadGet("/api/v1/excel/export/customers", "khach-hang.xlsx").catch((e) => setErr(e?.message || "Không xuất được"))}
                disabled={busy}
              >
                Xuất Khách hàng
              </button>
              <button
                className="xlBtn"
                onClick={() => downloadGet("/api/v1/excel/export/suppliers", "nha-cung-cap.xlsx").catch((e) => setErr(e?.message || "Không xuất được"))}
                disabled={busy}
              >
                Xuất Nhà cung cấp
              </button>
              <button
                className="xlBtn"
                onClick={() => downloadGet("/api/v1/excel/export/categories", "danh-muc.xlsx").catch((e) => setErr(e?.message || "Không xuất được"))}
                disabled={busy}
              >
                Xuất Danh mục
              </button>
              <button
                className="xlBtn"
                onClick={() => downloadGet("/api/v1/excel/export/locations", "ke.xlsx").catch((e) => setErr(e?.message || "Không xuất được"))}
                disabled={busy}
              >
                Xuất Kệ (Location)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
