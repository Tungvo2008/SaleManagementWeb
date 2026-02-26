import { useEffect, useMemo, useState } from "react"
import { get } from "../api"
import DataGrid from "./DataGrid"
import Modal from "./Modal"
import "./audit.css"

function fmtDateTime(v) {
  if (!v) return ""
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return String(v)
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "medium" }).format(d)
}

function listToText(v) {
  if (!Array.isArray(v) || !v.length) return ""
  return v.join(", ")
}

function copyJson(v) {
  const text = JSON.stringify(v ?? null, null, 2)
  if (navigator?.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => {})
  }
}

export default function AuditPage() {
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)
  const [rows, setRows] = useState([])
  const [detailRow, setDetailRow] = useState(null)

  const [q, setQ] = useState("")
  const [module, setModule] = useState("")
  const [action, setAction] = useState("")
  const [entityType, setEntityType] = useState("")
  const [entityId, setEntityId] = useState("")
  const [requestId, setRequestId] = useState("")
  const [actorUserId, setActorUserId] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [limit, setLimit] = useState("300")

  async function load() {
    setLoading(true)
    setErr(null)
    try {
      const params = new URLSearchParams()
      if (q.trim()) params.set("q", q.trim())
      if (module.trim()) params.set("module", module.trim())
      if (action.trim()) params.set("action", action.trim())
      if (entityType.trim()) params.set("entity_type", entityType.trim())
      if (entityId.trim()) params.set("entity_id", entityId.trim())
      if (requestId.trim()) params.set("request_id", requestId.trim())
      if (actorUserId.trim()) params.set("actor_user_id", actorUserId.trim())
      if (dateFrom) params.set("date_from", `${dateFrom}T00:00:00`)
      if (dateTo) params.set("date_to", `${dateTo}T23:59:59`)
      const nLimit = Number(limit)
      params.set("limit", Number.isFinite(nLimit) && nLimit > 0 ? String(Math.floor(nLimit)) : "300")
      const data = await get(`/api/v1/audit/events?${params.toString()}`)
      setRows(Array.isArray(data) ? data : [])
    } catch (e) {
      setErr(e?.message || "Không tải được nhật ký hệ thống")
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const modules = useMemo(() => Array.from(new Set(rows.map((r) => r.module).filter(Boolean))).sort(), [rows])
  const entityTypes = useMemo(() => Array.from(new Set(rows.map((r) => r.entity_type).filter(Boolean))).sort(), [rows])

  return (
    <div className="aud">
      <div className="audTop">
        <div className="audHint">
          {loading ? "Đang tải..." : err ? `Lỗi: ${err}` : `${rows.length} bản ghi nhật ký`}
        </div>
        <div className="audActions">
          <button className="audBtn" disabled={loading} onClick={() => load()}>
            Tải lại
          </button>
          <button
            className="audBtn"
            disabled={loading}
            onClick={() => {
              setQ("")
              setModule("")
              setAction("")
              setEntityType("")
              setEntityId("")
              setRequestId("")
              setActorUserId("")
              setDateFrom("")
              setDateTo("")
              setLimit("300")
            }}
          >
            Xoá lọc
          </button>
        </div>
      </div>

      <div className="audFilters">
        <input className="admInput" placeholder="Tìm nhanh..." value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="admSelect" value={module} onChange={(e) => setModule(e.target.value)}>
          <option value="">Tất cả module</option>
          {modules.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select className="admSelect" value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">Tất cả action</option>
          <option value="create">create</option>
          <option value="update">update</option>
          <option value="delete">delete</option>
        </select>
        <select className="admSelect" value={entityType} onChange={(e) => setEntityType(e.target.value)}>
          <option value="">Tất cả entity</option>
          {entityTypes.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <input className="admInput" placeholder="entity_id" value={entityId} onChange={(e) => setEntityId(e.target.value)} />
        <input className="admInput" placeholder="request_id" value={requestId} onChange={(e) => setRequestId(e.target.value)} />
        <input className="admInput" placeholder="actor_user_id" value={actorUserId} onChange={(e) => setActorUserId(e.target.value)} />
        <input className="admInput" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <input className="admInput" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        <input className="admInput" placeholder="Giới hạn" value={limit} onChange={(e) => setLimit(e.target.value)} />
        <button className="audBtn audBtnPrimary" disabled={loading} onClick={() => load()}>
          Áp dụng
        </button>
      </div>

      <DataGrid
        id="system.audit"
        rows={rows}
        rowKey={(r) => r.id}
        columns={[
          { key: "id", title: "ID", width: 80, minWidth: 70, render: (r) => <span className="audMono">{r.id}</span> },
          {
            key: "created_at",
            title: "Thời gian",
            width: 170,
            minWidth: 150,
            getValue: (r) => Date.parse(r.created_at || 0) || 0,
            render: (r) => <span className="audMono">{fmtDateTime(r.created_at)}</span>,
          },
          { key: "action", title: "Action", width: 80, minWidth: 70, render: (r) => <span className={`audTag audTag-${r.action}`}>{r.action}</span> },
          { key: "module", title: "Module", width: 110, minWidth: 100, render: (r) => <span>{r.module || ""}</span> },
          { key: "entity_type", title: "Entity", width: 130, minWidth: 110, render: (r) => <span>{r.entity_type}</span> },
          { key: "entity_id", title: "Entity ID", width: 110, minWidth: 90, render: (r) => <span className="audMono">{r.entity_id || ""}</span> },
          { key: "request_id", title: "Request ID", width: 160, minWidth: 130, render: (r) => <span className="audMono">{r.request_id || ""}</span> },
          { key: "entity_label", title: "Nhãn", width: 220, minWidth: 160, render: (r) => <span>{r.entity_label || ""}</span> },
          { key: "actor", title: "Người sửa", width: 140, minWidth: 120, render: (r) => <span>{r.actor_username || (r.actor_user_id != null ? `#${r.actor_user_id}` : "—")}</span> },
          { key: "changed_fields", title: "Trường đổi", width: 220, minWidth: 150, render: (r) => <span className="audMono">{listToText(r.changed_fields)}</span> },
          { key: "path", title: "Path", fill: true, minWidth: 260, render: (r) => <span className="audMono">{r.path || ""}</span> },
          {
            key: "detail",
            title: "Chi tiết",
            width: 100,
            minWidth: 90,
            sortable: false,
            filterable: false,
            render: (r) => (
              <button className="audBtnMini" onClick={() => setDetailRow(r)}>
                Xem
              </button>
            ),
          },
        ]}
      />

      {detailRow ? (
        <Modal
          title={`Log #${detailRow.id} · ${detailRow.entity_type} ${detailRow.entity_id || ""}`}
          onClose={() => setDetailRow(null)}
          footer={
            <>
              <button className="admBtn" onClick={() => copyJson(detailRow.before_data)}>
                Copy before
              </button>
              <button className="admBtn" onClick={() => copyJson(detailRow.after_data)}>
                Copy after
              </button>
              <button className="admBtn admBtnPrimary" onClick={() => setDetailRow(null)}>
                Đóng
              </button>
            </>
          }
        >
          <div className="audDetailGrid">
            <div>
              <div className="admLabel">Before</div>
              <pre className="audPre">{JSON.stringify(detailRow.before_data, null, 2)}</pre>
            </div>
            <div>
              <div className="admLabel">After</div>
              <pre className="audPre">{JSON.stringify(detailRow.after_data, null, 2)}</pre>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}
