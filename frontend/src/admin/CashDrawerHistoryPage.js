import { useEffect, useMemo, useState } from "react"
import { get } from "../api"
import DataGrid from "./DataGrid"
import Modal from "./Modal"
import { formatMoneyVN } from "../utils/number"
import { fmtDateTimeVN } from "../utils/datetime"
import "./cash-drawer-history.css"

function fmtMoney(v) {
  return `${formatMoneyVN(v, { empty: "-" })} đ`
}

function sessionStatusLabel(v) {
  if (v === "open") return "Đang mở"
  if (v === "closed") return "Đã đóng"
  return v || "—"
}

function entryTypeLabel(v) {
  if (v === "opening") return "Mở ca"
  if (v === "closing") return "Đóng ca"
  if (v === "sale_cash_in") return "Thu tiền bán hàng"
  if (v === "manager_withdraw") return "Manager rút tiền"
  return v || "—"
}

export default function CashDrawerHistoryPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)
  const [status, setStatus] = useState("")
  const [limit, setLimit] = useState("200")
  const [q, setQ] = useState("")
  const [detail, setDetail] = useState(null)
  const [detailBusy, setDetailBusy] = useState(false)

  const filtered = useMemo(() => {
    const needle = (q || "").trim().toLowerCase()
    if (!needle) return rows
    return rows.filter((r) => {
      const hay = [
        r.id,
        r.status,
        r.opened_by_username,
        r.closed_by_username,
        r.note,
      ]
        .filter(Boolean)
        .map((v) => String(v).toLowerCase())
        .join(" · ")
      return hay.includes(needle)
    })
  }, [rows, q])

  async function loadAll() {
    setLoading(true)
    setErr(null)
    try {
      const params = new URLSearchParams()
      const nLimit = Number(limit || 200)
      params.set(
        "limit",
        String(
          Number.isFinite(nLimit) && nLimit > 0
            ? Math.min(Math.floor(nLimit), 500)
            : 200,
        ),
      )
      if (status) params.set("status", status)
      const data = await get(`/api/v1/pos/cash-drawer/sessions?${params.toString()}`)
      setRows(Array.isArray(data) ? data : [])
    } catch (e) {
      setErr(e?.message || "Không tải được lịch sử thùng tiền")
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  async function openDetail(sessionId) {
    setDetailBusy(true)
    try {
      const data = await get(
        `/api/v1/pos/cash-drawer/sessions/${sessionId}?include_entries=true&entry_limit=500`,
      )
      setDetail(data)
    } catch (e) {
      setErr(e?.message || "Không tải được chi tiết ca")
    } finally {
      setDetailBusy(false)
    }
  }

  useEffect(() => {
    loadAll().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="cdh">
      <div className="cdhTop">
        <div className="cdhHint">
          {loading
            ? "Đang tải..."
            : err
              ? `Lỗi: ${err}`
              : `${filtered.length}/${rows.length} ca thùng tiền`}
        </div>
        <div className="cdhActions">
          <button className="cdhBtn" disabled={loading} onClick={() => loadAll()}>
            Tải lại
          </button>
        </div>
      </div>

      <div className="cdhFilters">
        <div className="cdhField">
          <div className="cdhLabel">Trạng thái</div>
          <select
            className="admSelect"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Tất cả</option>
            <option value="open">Đang mở</option>
            <option value="closed">Đã đóng</option>
          </select>
        </div>

        <div className="cdhField">
          <div className="cdhLabel">Giới hạn</div>
          <input
            className="admInput"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            placeholder="200"
          />
        </div>

        <div className="cdhField cdhFieldGrow">
          <div className="cdhLabel">Tìm nhanh</div>
          <input
            className="admInput"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ID ca, người mở, người đóng, ghi chú..."
          />
        </div>

        <div className="cdhField cdhFieldBtn">
          <button className="cdhBtn cdhBtnPrimary" disabled={loading} onClick={() => loadAll()}>
            Áp dụng
          </button>
        </div>
      </div>

      <DataGrid
        id="cashDrawer.history"
        rows={filtered}
        rowKey={(r) => r.id}
        columns={[
          {
            key: "id",
            title: "Ca #",
            width: 90,
            minWidth: 80,
            render: (r) => <span className="cdhMono">#{r.id}</span>,
          },
          {
            key: "status",
            title: "Trạng thái",
            width: 120,
            minWidth: 100,
            getValue: (r) => r.status || "",
            render: (r) => <span>{sessionStatusLabel(r.status)}</span>,
          },
          {
            key: "opened_at",
            title: "Mở lúc (VN)",
            width: 190,
            minWidth: 170,
            getValue: (r) => r.opened_at || null,
            render: (r) => <span className="cdhMono">{fmtDateTimeVN(r.opened_at, "—")}</span>,
          },
          {
            key: "closed_at",
            title: "Đóng lúc (VN)",
            width: 190,
            minWidth: 170,
            getValue: (r) => r.closed_at || null,
            render: (r) => <span className="cdhMono">{fmtDateTimeVN(r.closed_at, "—")}</span>,
          },
          {
            key: "opening_cash",
            title: "Tiền đầu ca",
            width: 140,
            minWidth: 120,
            align: "right",
            getValue: (r) => Number(r.opening_cash || 0) || 0,
            render: (r) => <span className="cdhMono">{fmtMoney(r.opening_cash)}</span>,
          },
          {
            key: "expected_cash",
            title: "Tiền dự kiến",
            width: 140,
            minWidth: 120,
            align: "right",
            getValue: (r) => Number(r.expected_cash || 0) || 0,
            render: (r) => <span className="cdhMono">{fmtMoney(r.expected_cash)}</span>,
          },
          {
            key: "counted_cash",
            title: "Tiền kiểm quỹ",
            width: 150,
            minWidth: 130,
            align: "right",
            getValue: (r) => Number(r.counted_cash || 0) || 0,
            render: (r) => (
              <span className="cdhMono">
                {r.counted_cash == null ? "—" : fmtMoney(r.counted_cash)}
              </span>
            ),
          },
          {
            key: "variance",
            title: "Chênh lệch",
            width: 140,
            minWidth: 120,
            align: "right",
            getValue: (r) => Number(r.variance || 0) || 0,
            render: (r) => (
              <span className="cdhMono">
                {r.variance == null ? "—" : fmtMoney(r.variance)}
              </span>
            ),
          },
          {
            key: "opened_by_username",
            title: "Mở bởi",
            width: 120,
            minWidth: 100,
            getValue: (r) => r.opened_by_username || "",
            render: (r) => <span>{r.opened_by_username || `#${r.opened_by_user_id}`}</span>,
          },
          {
            key: "closed_by_username",
            title: "Đóng bởi",
            width: 120,
            minWidth: 100,
            getValue: (r) => r.closed_by_username || "",
            render: (r) => (
              <span>{r.closed_by_username || (r.closed_by_user_id ? `#${r.closed_by_user_id}` : "—")}</span>
            ),
          },
          {
            key: "note",
            title: "Ghi chú",
            fill: true,
            minWidth: 220,
            render: (r) => <span>{r.note || "—"}</span>,
          },
          {
            key: "actions",
            title: "Thao tác",
            width: 110,
            minWidth: 100,
            render: (r) => (
              <span style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  className="cdhMiniBtn"
                  disabled={detailBusy}
                  onClick={() => openDetail(r.id)}
                >
                  Chi tiết
                </button>
              </span>
            ),
          },
        ]}
      />

      {detail ? (
        <Modal
          wide
          title={`Chi tiết ca #${detail.id}`}
          onClose={() => setDetail(null)}
          footer={
            <button className="admBtn" onClick={() => setDetail(null)}>
              Đóng
            </button>
          }
        >
          <div className="cdhDetailMeta">
            <span className="pill">Trạng thái: {sessionStatusLabel(detail.status)}</span>
            <span className="pill">Mở lúc: {fmtDateTimeVN(detail.opened_at, "—")}</span>
            <span className="pill">Đóng lúc: {fmtDateTimeVN(detail.closed_at, "—")}</span>
            <span className="pill">
              Mở bởi: {detail.opened_by_username || `#${detail.opened_by_user_id}`}
            </span>
            <span className="pill">
              Đóng bởi:{" "}
              {detail.closed_by_username ||
                (detail.closed_by_user_id ? `#${detail.closed_by_user_id}` : "—")}
            </span>
            <span className="pill">Tiền đầu ca: {fmtMoney(detail.opening_cash)}</span>
            <span className="pill">Tiền dự kiến: {fmtMoney(detail.expected_cash)}</span>
            <span className="pill">
              Tiền kiểm quỹ:{" "}
              {detail.counted_cash == null ? "—" : fmtMoney(detail.counted_cash)}
            </span>
            <span className="pill">
              Chênh lệch: {detail.variance == null ? "—" : fmtMoney(detail.variance)}
            </span>
          </div>

          <div className="cdhEntries">
            <table className="table">
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>Loại</th>
                  <th className="right">Tiền</th>
                  <th>Order</th>
                  <th>Người tạo</th>
                  <th>Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {(detail.entries || []).map((e) => (
                  <tr key={e.id}>
                    <td className="cdhMono">{fmtDateTimeVN(e.created_at, "—")}</td>
                    <td>{entryTypeLabel(e.entry_type)}</td>
                    <td className="right cdhMono">{fmtMoney(e.delta_cash)}</td>
                    <td>{e.order_id == null ? "—" : `#${e.order_id}`}</td>
                    <td>#{e.created_by_user_id}</td>
                    <td>{e.note || "—"}</td>
                  </tr>
                ))}
                {!detail.entries?.length ? (
                  <tr>
                    <td colSpan={6}>Không có log trong ca này.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}
