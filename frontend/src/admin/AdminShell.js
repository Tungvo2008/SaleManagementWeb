import { useEffect, useState } from "react"
import "./admin.css"

function NavButton({ active, children, onClick }) {
  return (
    <button className={`admNavBtn ${active ? "admNavBtnActive" : ""}`} onClick={onClick}>
      {children}
    </button>
  )
}

export default function AdminShell({ active, title, onGoto, user, onLogout, children }) {
  const role = user?.role || ""
  const isAdmin = role === "admin"
  const isManager = role === "manager"
  const canManage = isAdmin || isManager
  const [isMobile, setIsMobile] = useState(() => (typeof window !== "undefined" ? window.innerWidth <= 980 : false))
  const [navOpen, setNavOpen] = useState(() => (typeof window !== "undefined" ? window.innerWidth > 980 : true))

  useEffect(() => {
    function onResize() {
      const mobile = window.innerWidth <= 980
      setIsMobile(mobile)
      if (!mobile) setNavOpen(true)
    }
    onResize()
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  function gotoAndClose(next) {
    onGoto(next)
    if (isMobile) setNavOpen(false)
  }

  return (
    <div className="admShell">
      {isMobile && navOpen ? <button className="admNavBackdrop" onClick={() => setNavOpen(false)} aria-label="Đóng menu" /> : null}
      <aside className={`admNav ${isMobile ? "admNavMobile" : ""} ${navOpen ? "admNavOpen" : ""}`}>
        {isMobile ? (
          <div className="admNavMobileHead">
            <div className="admBrandTop">Danh mục</div>
            <button className="admLogoutBtn" onClick={() => setNavOpen(false)}>
              Đóng
            </button>
          </div>
        ) : null}
        <div className="admNavScroll">
          <div className="admBrand">
            <div className="admBrandTop">Quản lý cửa hàng</div>
            <div className="admBrandSub">MVP</div>
          </div>

          <div className="admNavSection">
            <div className="admNavLabel">Tổng quan</div>
            <NavButton active={active === "dashboard"} onClick={() => gotoAndClose("dashboard")}>
              Dashboard
            </NavButton>
          </div>

          {canManage ? (
            <div className="admNavSection">
              <div className="admNavLabel">Dữ liệu</div>
              <NavButton active={active === "categories"} onClick={() => gotoAndClose("categories")}>
                Danh mục
              </NavButton>
              <NavButton active={active === "products"} onClick={() => gotoAndClose("products")}>
                Sản phẩm
              </NavButton>
              <NavButton active={active === "images"} onClick={() => gotoAndClose("images")}>
                Quản lý ảnh
              </NavButton>
              <NavButton active={active === "pricing"} onClick={() => gotoAndClose("pricing")}>
                Quản lý giá
              </NavButton>
              <NavButton active={active === "stock"} onClick={() => gotoAndClose("stock")}>
                Tồn kho
              </NavButton>
              <NavButton active={active === "receive-history"} onClick={() => gotoAndClose("receive-history")}>
                Lịch sử nhập
              </NavButton>
              <NavButton active={active === "rolls"} onClick={() => gotoAndClose("rolls")}>
                Quản lý cuộn
              </NavButton>
              <NavButton active={active === "orders"} onClick={() => gotoAndClose("orders")}>
                Hoá đơn
              </NavButton>
              <NavButton active={active === "customers"} onClick={() => gotoAndClose("customers")}>
                Khách hàng
              </NavButton>
              <NavButton active={active === "suppliers"} onClick={() => gotoAndClose("suppliers")}>
                Nhà cung cấp
              </NavButton>
              <NavButton active={active === "excel"} onClick={() => gotoAndClose("excel")}>
                Nhập/Xuất Excel
              </NavButton>
              {isAdmin ? (
                <NavButton active={active === "audit"} onClick={() => gotoAndClose("audit")}>
                  Nhật ký hệ thống
                </NavButton>
              ) : null}
              {isAdmin ? (
                <NavButton active={active === "employees"} onClick={() => gotoAndClose("employees")}>
                  Nhân viên
                </NavButton>
              ) : null}
            </div>
          ) : null}

          {canManage ? (
            <div className="admNavSection">
              <div className="admNavLabel">Cấu hình</div>
              <NavButton active={active === "barcode-template"} onClick={() => gotoAndClose("barcode-template")}>
                Mẫu tem mã vạch
              </NavButton>
              <NavButton active={active === "template"} onClick={() => gotoAndClose("template")}>
                Mẫu hóa đơn
              </NavButton>
            </div>
          ) : null}
        </div>

        <div className="admNavFooter">
          {canManage ? (
            <button className="admReceiveBtn" onClick={() => gotoAndClose("receive")}>
              Nhập hàng & in mã vạch
            </button>
          ) : null}
          <button className="admPosBtn" onClick={() => gotoAndClose("pos")}>
            Mở POS
          </button>
        </div>
      </aside>

      <main className="admMain">
        <div className="admTop">
          <div className="admTopLeft">
            {isMobile ? (
              <button className="admMenuBtn" onClick={() => setNavOpen(true)}>
                Danh mục
              </button>
            ) : null}
            <div className="admTitle">{title}</div>
          </div>
          <div className="admTopRight">
            <div className="admUserBox">
              <div className="admUserLine">
                <span className="admUserName">{user?.username || "—"}</span>
                <span className="admUserRole">{user?.role || ""}</span>
              </div>
              <button className="admLogoutBtn" onClick={onLogout}>
                Đăng xuất
              </button>
            </div>
          </div>
        </div>
        <div className="admBody">{children}</div>
      </main>
    </div>
  )
}
