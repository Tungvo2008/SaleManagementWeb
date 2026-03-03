import { useEffect, useMemo, useRef, useState } from "react"
import { get, patch, post } from "../api"
import "./mobile-images.css"

function fmtMoney(v) {
  const n = typeof v === "number" ? v : Number(v || 0)
  if (!Number.isFinite(n)) return v == null ? "" : String(v)
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(n)
}

function isTouchDevice() {
  try {
    return window.matchMedia && window.matchMedia("(pointer: coarse)").matches
  } catch {
    return false
  }
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onerror = () => reject(new Error("Không đọc được file ảnh"))
    r.onload = () => resolve(String(r.result || ""))
    r.readAsDataURL(file)
  })
}

async function downscaleImageToDataUrl(file, { maxW = 1400, maxH = 1400, quality = 0.86 } = {}) {
  // Fast path: small files -> keep original
  if (file.size <= 700_000) {
    return { data_url: await readAsDataURL(file), content_type: file.type || null }
  }

  const dataUrl = await readAsDataURL(file)
  const img = new Image()
  img.decoding = "async"
  const loaded = new Promise((resolve, reject) => {
    img.onload = resolve
    img.onerror = () => reject(new Error("Không đọc được ảnh"))
  })
  img.src = dataUrl
  await loaded

  const w0 = img.naturalWidth || img.width
  const h0 = img.naturalHeight || img.height
  if (!w0 || !h0) return { data_url: dataUrl, content_type: file.type || null }

  const ratio = Math.min(1, maxW / w0, maxH / h0)
  const w = Math.max(1, Math.round(w0 * ratio))
  const h = Math.max(1, Math.round(h0 * ratio))
  if (ratio >= 1) return { data_url: dataUrl, content_type: file.type || null }

  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")
  if (!ctx) return { data_url: dataUrl, content_type: file.type || null }
  ctx.drawImage(img, 0, 0, w, h)

  const outType = "image/jpeg"
  const out = canvas.toDataURL(outType, quality)
  return { data_url: out, content_type: outType }
}

export default function MobileImagesPage() {
  const [q, setQ] = useState("")
  const [searchBusy, setSearchBusy] = useState(false)
  const [variants, setVariants] = useState([])
  const [picked, setPicked] = useState(null)

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [ok, setOk] = useState(null)

  const [file, setFile] = useState(null)
  const [imageUrl, setImageUrl] = useState("")

  const cameraRef = useRef(null)
  const fileRef = useRef(null)
  const timerRef = useRef(null)

  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  async function doSearch(nextQ) {
    const qq = String(nextQ ?? q ?? "").trim()
    setSearchBusy(true)
    try {
      const r = await get(`/api/v1/pos/search/?q=${encodeURIComponent(qq)}&limit=40`)
      const list = Array.isArray(r?.variants) ? r.variants : []
      setVariants(list)
    } finally {
      setSearchBusy(false)
    }
  }

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      doSearch(q).catch(() => {})
    }, 200)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  function pickVariant(v) {
    setPicked(v)
    setErr(null)
    setOk(null)
    setFile(null)
    setImageUrl(String(v?.image_url || ""))
  }

  async function uploadIfNeeded() {
    if (!file) return String(imageUrl || "").trim() || null

    const { data_url, content_type } = await downscaleImageToDataUrl(file)
    const r = await post("/api/v1/uploads/images", {
      data_url,
      filename: file.name,
      content_type,
    })
    if (!r?.url) throw new Error("Upload ảnh thất bại")
    return String(r.url)
  }

  async function save() {
    if (!picked) return
    setBusy(true)
    setErr(null)
    setOk(null)
    try {
      const finalUrl = await uploadIfNeeded()
      const updated = await patch(`/api/v1/products/variants/${picked.variant_id}`, {
        image_url: finalUrl ? String(finalUrl) : null,
      })
      setPicked((p) => (p ? { ...p, image_url: updated?.image_url || finalUrl } : p))
      setImageUrl(updated?.image_url || finalUrl || "")
      setFile(null)
      setOk("Đã lưu ảnh.")
    } catch (e) {
      setErr(e?.message || "Không lưu được ảnh")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mimg">
      <div className="mimgTop">
        <div className="mimgTitle">Ảnh sản phẩm</div>
        <div className="mimgHint">Tối ưu cho điện thoại: chọn sản phẩm → chụp ảnh → lưu.</div>
      </div>

      <div className="mimgGrid">
        <div className="mimgCard">
          <div className="mimgCardHead">
            <div className="mimgCardTitle">Tìm & chọn</div>
            <div className="mimgPill">{searchBusy ? "Đang tìm..." : `${variants.length} kết quả`}</div>
          </div>
          <div className="mimgCardBody">
            <input className="mimgInput" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Gõ tên / SKU / barcode..." />
            <div className="mimgList">
              {variants.map((v) => {
                const active = picked && String(picked.variant_id) === String(v.variant_id)
                return (
                  <button key={v.variant_id} type="button" className={`mimgRow ${active ? "mimgRowActive" : ""}`} onClick={() => pickVariant(v)} disabled={busy}>
                    <div className="mimgRowLeft">
                      <div className="mimgRowName">{v.name}</div>
                      <div className="mimgRowSub">
                        <span className="mimgPill">{v.sku || `#${v.variant_id}`}</span>
                        <span className="mimgPill">Giá: {fmtMoney(v.price)}đ</span>
                      </div>
                    </div>
                    <div className="mimgRowRight">
                      {v.image_url ? <img className="mimgThumb" src={v.image_url} alt={v.name} /> : <div className="mimgThumbEmpty">—</div>}
                    </div>
                  </button>
                )
              })}
              {!searchBusy && variants.length === 0 ? <div className="mimgEmpty">Không có kết quả.</div> : null}
            </div>
          </div>
        </div>

        <div className="mimgCard">
          <div className="mimgCardHead">
            <div className="mimgCardTitle">Cập nhật ảnh</div>
            <div className="mimgPill">{picked ? `Đã chọn #${picked.variant_id}` : "Chưa chọn"}</div>
          </div>
          <div className="mimgCardBody">
            {!picked ? (
              <div className="mimgEmpty">Hãy chọn 1 sản phẩm ở phía trên.</div>
            ) : (
              <>
                {err ? <div className="mimgErr">{err}</div> : null}
                {ok ? <div className="mimgOk">{ok}</div> : null}

                <div className="mimgPicked">
                  <div className="mimgPickedName">{picked.name}</div>
                  <div className="mimgPickedMeta">
                    <span className="mimgPill">SKU: {picked.sku || "—"}</span>
                    {picked.barcode ? <span className="mimgPill">BC: {picked.barcode}</span> : null}
                  </div>
                </div>

                <div className="mimgPreviewGrid">
                  <div className="mimgPreview">
                    <div className="mimgLabel">Ảnh hiện tại</div>
                    <div className="mimgFrame">{picked.image_url ? <img src={picked.image_url} alt={picked.name} /> : <div className="mimgThumbEmpty">Chưa có</div>}</div>
                  </div>
                  <div className="mimgPreview">
                    <div className="mimgLabel">Ảnh mới</div>
                    <div className="mimgFrame">{previewUrl ? <img src={previewUrl} alt="Ảnh mới" /> : <div className="mimgThumbEmpty">Chưa chọn</div>}</div>
                  </div>
                </div>

                <div className="mimgBtnRow">
                  <button
                    type="button"
                    className="mimgBtn"
                    onClick={() => cameraRef.current?.click()}
                    disabled={busy}
                    title="Chụp bằng camera (nếu trình duyệt hỗ trợ)"
                  >
                    Chụp ảnh
                  </button>
                  <button type="button" className="mimgBtn" onClick={() => fileRef.current?.click()} disabled={busy}>
                    Chọn từ máy
                  </button>
                  <button
                    type="button"
                    className="mimgBtn mimgBtnDanger"
                    onClick={() => {
                      setFile(null)
                      setImageUrl("")
                      setOk(null)
                      setErr(null)
                      if (cameraRef.current) cameraRef.current.value = ""
                      if (fileRef.current) fileRef.current.value = ""
                    }}
                    disabled={busy}
                  >
                    Xoá ảnh
                  </button>
                </div>

                <input
                  ref={cameraRef}
                  className="mimgHidden"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => {
                    const f = e.target.files && e.target.files[0] ? e.target.files[0] : null
                    e.target.value = ""
                    setFile(f)
                    setOk(null)
                    setErr(null)
                  }}
                />
                <input
                  ref={fileRef}
                  className="mimgHidden"
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const f = e.target.files && e.target.files[0] ? e.target.files[0] : null
                    e.target.value = ""
                    setFile(f)
                    setOk(null)
                    setErr(null)
                  }}
                />

                <div className="mimgField">
                  <div className="mimgLabel">Ảnh URL (tuỳ chọn)</div>
                  <input className="mimgInput" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="/uploads/images/... hoặc https://..." />
                </div>

                <div className="mimgActions">
                  <button type="button" className="mimgBtn mimgBtnPrimary" onClick={() => save()} disabled={busy}>
                    Lưu ảnh
                  </button>
                </div>

                {isTouchDevice() ? <div className="mimgFootHint">Mẹo: ảnh lớn sẽ được tự nén trước khi upload để nhanh hơn.</div> : null}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

