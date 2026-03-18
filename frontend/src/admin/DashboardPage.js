import { useEffect, useMemo, useState } from "react"
import { get } from "../api"
import { formatMoneyVN } from "../utils/number"
import "./dashboard.css"

function fmtMoney(v) {
  return formatMoneyVN(v)
}

function todayYMD() {
  // Default to Vietnam local date to match backend report boundaries.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

export default function DashboardPage() {
  const [date, setDate] = useState(todayYMD())
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)
  const [report, setReport] = useState(null)

  const qs = useMemo(() => `?date=${encodeURIComponent(date)}`, [date])

  useEffect(() => {
    let alive = true
    setLoading(true)
    setErr(null)
    get(`/api/v1/pos/reports/daily${qs}`)
      .then((r) => {
        if (!alive) return
        setReport(r)
      })
      .catch((e) => {
        if (!alive) return
        setErr(e?.message || "Không tải được báo cáo")
        setReport(null)
      })
      .finally(() => {
        if (!alive) return
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [qs])

  return (
    <div className="dash">
      <div className="dashHeader">
        <div className="dashFilter">
          <div className="dashLabel">Ngày (VN)</div>
          <input
            className="dashDate"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="dashStatus">
          {loading ? "Đang tải..." : err ? `Lỗi: ${err}` : ""}
        </div>
      </div>

      <div className="dashCards">
        <div className="dashCard">
          <div className="dashCardTitle">Doanh thu</div>
          <div className="dashCardValue">{fmtMoney(report?.grand_total)}</div>
          <div className="dashCardSub">Tổng thu sau giảm giá</div>
        </div>
        <div className="dashCard">
          <div className="dashCardTitle">Số đơn</div>
          <div className="dashCardValue">{report?.orders_count ?? 0}</div>
          <div className="dashCardSub">Đã checkout</div>
        </div>
        <div className="dashCard">
          <div className="dashCardTitle">Giảm giá</div>
          <div className="dashCardValue">{fmtMoney(report?.discount_total)}</div>
          <div className="dashCardSub">Tổng discount</div>
        </div>
        <div className="dashCard">
          <div className="dashCardTitle">Tạm tính</div>
          <div className="dashCardValue">{fmtMoney(report?.subtotal_total)}</div>
          <div className="dashCardSub">Trước giảm giá</div>
        </div>
      </div>

      <div className="dashPanel">
        <div className="dashPanelTitle">Công cụ nhanh</div>
        <div className="dashTools">
          <button className="dashToolBtn" onClick={() => (window.location.hash = "#/receive")}>
            Nhập hàng & In mã vạch
          </button>
          <button className="dashToolBtn" onClick={() => (window.location.hash = "#/app/rolls")}>
            Quản lý cuộn
          </button>
          <button className="dashToolBtn" onClick={() => (window.location.hash = "#/pos")}>
            Mở POS
          </button>
        </div>
        <div className="dashEmpty">Gợi ý: dùng trang “Nhập hàng & In mã vạch” để nhập kho và in tem dán nhanh.</div>
      </div>

      <div className="dashPanel">
        <div className="dashPanelTitle">Thanh toán</div>
        {!report?.by_payment?.length ? (
          <div className="dashEmpty">Chưa có dữ liệu</div>
        ) : (
          <div className="dashTable">
            <div className="dashRow dashRowHead">
              <div>Phương thức</div>
              <div>Số đơn</div>
              <div className="dashRight">Tổng</div>
            </div>
            {report.by_payment.map((r) => (
              <div key={r.payment_method} className="dashRow">
                <div className="dashMono">{r.payment_method}</div>
                <div>{r.orders_count}</div>
                <div className="dashRight">{fmtMoney(r.total)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
