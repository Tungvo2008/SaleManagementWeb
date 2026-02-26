import { useEffect, useMemo, useRef, useState } from "react"
import { del, get, patch, post } from "../api"
import Modal from "./Modal"
import DataGrid from "./DataGrid"
import "./categories.css"

export default function CategoriesPage() {
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const [rows, setRows] = useState([])
  const [q, setQ] = useState("")

  const [showCreate, setShowCreate] = useState(false)
  const [editRow, setEditRow] = useState(null)
  const [deleteRow, setDeleteRow] = useState(null)

  async function loadAll() {
    setLoading(true)
    setErr(null)
    try {
      const list = await get("/api/v1/categories/")
      setRows(Array.isArray(list) ? list : [])
    } catch (e) {
      setErr(e?.message || "Không tải được danh sách danh mục")
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll().catch(() => {})
  }, [])

  const filtered = useMemo(() => {
    const qq = (q || "").trim().toLowerCase()
    if (!qq) return rows
    return rows.filter((r) => {
      const hay = [r.id, r.name, r.description, r.image_url]
        .filter((v) => v !== null && v !== undefined)
        .map((v) => String(v).toLowerCase())
        .join(" · ")
      return hay.includes(qq) || hay.includes(qq.replace(/\s+/g, ""))
    })
  }, [rows, q])

  const titleHint = useMemo(() => {
    if (loading) return "Đang tải..."
    if (err) return `Lỗi: ${err}`
    return `${filtered.length}/${rows.length} danh mục · Bấm tiêu đề cột để sắp xếp`
  }, [loading, err, filtered.length, rows.length])

  return (
    <div className="cat">
      <div className="catTop">
        <div className="catHint">{titleHint}</div>
        <div className="catActions">
          <div className="catSearch">
            <input
              className="admInput"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm theo tên / mô tả / URL / ID..."
            />
            {q.trim() ? (
              <button className="catActionBtn" disabled={busy || loading} onClick={() => setQ("")}>
                Xoá
              </button>
            ) : null}
          </div>

          <button className="catActionBtn" disabled={busy || loading} onClick={() => loadAll()}>
            Tải lại
          </button>
          <button className="catActionBtn catActionPrimary" disabled={busy || loading} onClick={() => setShowCreate(true)}>
            + Thêm danh mục
          </button>
        </div>
      </div>

      <DataGrid
        id="catalog.categories"
        columns={[
          { key: "id", title: "ID", width: 90, minWidth: 70, render: (r) => <span className="catMono">{r.id}</span> },
          { key: "name", title: "Tên", fill: true, minWidth: 260, render: (r) => <span className="catName">{r.name}</span> },
          {
            key: "description",
            title: "Mô tả",
            minWidth: 220,
            flex: 1.6,
            render: (r) => <span className="catText">{r.description || ""}</span>,
          },
          {
            key: "image_url",
            title: "Ảnh (URL)",
            minWidth: 260,
            flex: 1.4,
            render: (r) => <span className="catMono">{r.image_url || ""}</span>,
          },
          {
            key: "actions",
            title: "Thao tác",
            width: 180,
            minWidth: 160,
            render: (r) => (
              <span style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button className="admBtn" disabled={busy} onClick={() => setEditRow(r)}>
                  Sửa
                </button>
                <button className="admBtn admBtnDanger" disabled={busy} onClick={() => setDeleteRow(r)}>
                  Xoá
                </button>
              </span>
            ),
          },
        ]}
        rows={filtered}
        rowKey={(r) => r.id}
      />

      {showCreate ? (
        <CategoryModal
          title="Thêm danh mục"
          busy={busy}
          initial={{}}
          onClose={() => setShowCreate(false)}
          onSave={async (payload) => {
            setBusy(true)
            try {
              await post("/api/v1/categories/", payload)
              setShowCreate(false)
              await loadAll()
            } finally {
              setBusy(false)
            }
          }}
        />
      ) : null}

      {editRow ? (
        <CategoryModal
          title={`Sửa danh mục #${editRow.id}`}
          busy={busy}
          initial={editRow}
          onClose={() => setEditRow(null)}
          onSave={async (payload) => {
            setBusy(true)
            try {
              await patch(`/api/v1/categories/${editRow.id}`, payload)
              setEditRow(null)
              await loadAll()
            } finally {
              setBusy(false)
            }
          }}
        />
      ) : null}

      {deleteRow ? (
        <ConfirmDeleteModal
          title="Xoá danh mục"
          body={
            <>
              Bạn chắc chắn muốn xoá danh mục <b>{deleteRow.name}</b> (ID{" "}
              <span className="admMono">{deleteRow.id}</span>)?
              <div className="catWarn">Lưu ý: nếu danh mục đang được dùng cho sản phẩm, hệ thống sẽ không cho xoá.</div>
            </>
          }
          busy={busy}
          onClose={() => setDeleteRow(null)}
          onConfirm={async () => {
            setBusy(true)
            try {
              await del(`/api/v1/categories/${deleteRow.id}`)
              setDeleteRow(null)
              await loadAll()
            } finally {
              setBusy(false)
            }
          }}
        />
      ) : null}
    </div>
  )
}

function ConfirmDeleteModal({ title, body, busy, onClose, onConfirm }) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="admBtn" disabled={busy} onClick={onClose}>
            Huỷ
          </button>
          <button className="admBtn admBtnDanger" disabled={busy} onClick={onConfirm}>
            Xoá
          </button>
        </>
      }
    >
      <div className="admErr">{body}</div>
    </Modal>
  )
}

function CategoryModal({ title, busy, initial, onClose, onSave }) {
  const [name, setName] = useState(initial.name || "")
  const [description, setDescription] = useState(initial.description || "")
  const [imageUrl, setImageUrl] = useState(initial.image_url || "")
  const [file, setFile] = useState(null)
  const [err, setErr] = useState(null)
  const fileInputId = useMemo(() => `catfile_${Math.random().toString(16).slice(2)}`, [])
  const fileInputRef = useRef(null)
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  function buildPayload() {
    return {
      name: name.trim(),
      description: description.trim() ? description.trim() : null,
      image_url: imageUrl.trim() ? imageUrl.trim() : null,
    }
  }

  function readAsDataURL(f) {
    return new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onerror = () => reject(new Error("Không đọc được file"))
      r.onload = () => resolve(String(r.result || ""))
      r.readAsDataURL(f)
    })
  }

  async function uploadIfNeeded() {
    if (!file) return
    const data_url = await readAsDataURL(file)
    const r = await post("/api/v1/uploads/images", {
      data_url,
      filename: file.name,
      content_type: file.type || null,
    })
    if (r && r.url) setImageUrl(r.url)
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="admBtn" disabled={busy} onClick={onClose}>
            Huỷ
          </button>
          <button
            className="admBtn admBtnPrimary"
            disabled={busy}
            onClick={() => {
              setErr(null)
              if (!name.trim()) {
                setErr("Tên danh mục là bắt buộc.")
                return
              }
              ;(async () => {
                await uploadIfNeeded()
                await onSave(buildPayload())
              })().catch((e) => setErr(e?.message || "Không lưu được danh mục."))
            }}
          >
            Lưu
          </button>
        </>
      }
    >
      {err ? <div className="admErr">{err}</div> : null}
      <div className="admField">
        <div className="admLabel">Tên danh mục</div>
        <input className="admInput" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ: Lưới / Dây / Phụ kiện..." />
      </div>
      <div className="admField">
        <div className="admLabel">Ảnh</div>
        <input
          ref={(el) => (fileInputRef.current = el)}
          id={fileInputId}
          className="catFileInput"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => {
            const f = e.target.files && e.target.files[0] ? e.target.files[0] : null
            setFile(f)
          }}
        />

        <div className="catUploadCard">
          <div className="catUploadTop">
            <label className="admBtn catPickBtn" htmlFor={fileInputId}>
              Chọn ảnh
            </label>
            <button
              className="admBtn"
              type="button"
              disabled={!file}
              onClick={() => {
                setFile(null)
                if (fileInputRef.current) fileInputRef.current.value = ""
              }}
              title="Bỏ chọn file vừa chọn"
            >
              Bỏ chọn
            </button>
            <div className="catUploadMeta">
              {file ? (
                <>
                  <div className="catUploadName">{file.name}</div>
                  <div className="catUploadSub">Ảnh sẽ được upload khi bạn bấm “Lưu”.</div>
                </>
              ) : (
                <>
                  <div className="catUploadName">Chưa chọn file</div>
                  <div className="catUploadSub">Hỗ trợ jpg / png / webp.</div>
                </>
              )}
            </div>
          </div>

          <div className="catUploadPreviewRow">
            <div className="catPreviewBox">
              <div className="catPreviewLabel">Hiện tại</div>
              <div className="catPreviewFrame">{imageUrl ? <img alt="Ảnh hiện tại" src={imageUrl} /> : <div className="catPreviewEmpty">—</div>}</div>
            </div>
            <div className="catPreviewBox">
              <div className="catPreviewLabel">Ảnh mới</div>
              <div className="catPreviewFrame">{previewUrl ? <img alt="Ảnh mới" src={previewUrl} /> : <div className="catPreviewEmpty">—</div>}</div>
            </div>
          </div>
        </div>
      </div>
      <div className="admField">
        <div className="admLabel">Ảnh (URL)</div>
        <input className="admInput" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." />
      </div>
      <div className="admField">
        <div className="admLabel">Mô tả</div>
        <textarea className="admTextarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="..." />
      </div>
    </Modal>
  )
}
