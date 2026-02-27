import { useEffect, useMemo, useState } from "react"
import Pos from "./pos/Pos"
import ReceiptTemplatePage from "./pos/ReceiptTemplatePage"
import BarcodeTemplatePage from "./admin/BarcodeTemplatePage"
import AdminShell from "./admin/AdminShell"
import DashboardPage from "./admin/DashboardPage"
import CategoriesPage from "./admin/CategoriesPage"
import ProductsPage from "./admin/ProductsPage"
import StockPage from "./admin/StockPage"
import ReceiveHistoryPage from "./admin/ReceiveHistoryPage"
import RollsPage from "./admin/RollsPage"
import ImagesPage from "./admin/ImagesPage"
import PricingPage from "./admin/PricingPage"
import CustomersPage from "./admin/CustomersPage"
import SuppliersPage from "./admin/SuppliersPage"
import OrdersPage from "./admin/OrdersPage"
import AuditPage from "./admin/AuditPage"
import EmployeesPage from "./admin/EmployeesPage"
import ExcelPage from "./admin/ExcelPage"
import ReceivePrintPage from "./receive/ReceivePrintPage"
import LoginPage from "./LoginPage"
import { me, logout } from "./auth"
import {
  defaultReceiptTemplate,
  loadReceiptTemplate,
  saveReceiptTemplate,
} from "./pos/receiptTemplate"
import {
  defaultBarcodeTemplate,
  loadBarcodeTemplate,
  saveBarcodeTemplate,
} from "./receive/barcodeTemplate"
import "./app-shell.css"

function withTimeout(promise, ms, message = "Request timeout") {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms)
    promise
      .then((v) => {
        clearTimeout(t)
        resolve(v)
      })
      .catch((e) => {
        clearTimeout(t)
        reject(e)
      })
  })
}

function getHashRoute() {
  const hash = window.location.hash || "#/app/dashboard"
  if (hash.startsWith("#/login")) return { mode: "login" }
  if (hash.startsWith("#/app/login")) return { mode: "login" }
  if (hash.startsWith("#/pos")) return { mode: "pos" }
  if (hash.startsWith("#/receive")) return { mode: "receive" }

  // Admin pages
  if (hash.startsWith("#/app/")) {
    const page = hash.replace("#/app/", "").split("?")[0] || "dashboard"
    if (page === "template") return { mode: "app", page: "template" }
    if (page === "barcode-template") return { mode: "app", page: "barcode-template" }
    if (page === "categories") return { mode: "app", page: "categories" }
    if (page === "products") return { mode: "app", page: "products" }
    if (page === "stock") return { mode: "app", page: "stock" }
    if (page === "receive-history") return { mode: "app", page: "receive-history" }
    if (page === "rolls") return { mode: "app", page: "rolls" }
    if (page === "images") return { mode: "app", page: "images" }
    if (page === "pricing") return { mode: "app", page: "pricing" }
    if (page === "customers") return { mode: "app", page: "customers" }
    if (page === "suppliers") return { mode: "app", page: "suppliers" }
    if (page === "excel") return { mode: "app", page: "excel" }
    if (page === "orders") return { mode: "app", page: "orders" }
    if (page === "audit") return { mode: "app", page: "audit" }
    if (page === "employees") return { mode: "app", page: "employees" }
    return { mode: "app", page: "dashboard" }
  }

  return { mode: "app", page: "dashboard" }
}

function App() {
  const [route, setRoute] = useState(getHashRoute())
  const [receiptTemplate, setReceiptTemplate] = useState(() =>
    loadReceiptTemplate(),
  )
  const [barcodeTemplate, setBarcodeTemplate] = useState(() =>
    loadBarcodeTemplate(),
  )
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    if (!window.location.hash) {
      window.location.hash = "#/app/dashboard"
    }
    const onHashChange = () => setRoute(getHashRoute())
    window.addEventListener("hashchange", onHashChange)
    return () => window.removeEventListener("hashchange", onHashChange)
  }, [])

  useEffect(() => {
    let alive = true
    setAuthLoading(true)
    withTimeout(me(), 8000, "Auth check timeout")
      .then((u) => {
        if (!alive) return
        setUser(u)
      })
      .catch(() => {
        if (!alive) return
        setUser(null)
      })
      .finally(() => {
        if (!alive) return
        setAuthLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const title = useMemo(() => {
    if (route.mode === "pos") return "POS bán hàng - Gia dụng Tín Thành"
    if (route.mode === "receive") return "Nhập hàng & In mã vạch"
    if (route.page === "categories") return "Danh mục"
    if (route.page === "products") return "Sản phẩm"
    if (route.page === "stock") return "Tồn kho"
    if (route.page === "receive-history") return "Lịch sử nhập hàng"
    if (route.page === "rolls") return "Quản lý cuộn"
    if (route.page === "images") return "Quản lý ảnh"
    if (route.page === "pricing") return "Quản lý giá"
    if (route.page === "customers") return "Khách hàng"
    if (route.page === "suppliers") return "Nhà cung cấp"
    if (route.page === "excel") return "Nhập/Xuất Excel"
    if (route.page === "orders") return "Hoá đơn"
    if (route.page === "audit") return "Nhật ký hệ thống"
    if (route.page === "employees") return "Nhân viên"
    if (route.page === "template") return "Mẫu hóa đơn"
    if (route.page === "barcode-template") return "Mẫu tem mã vạch"
    return "Tổng quan"
  }, [route])

  function goto(next) {
    if (next === "login") {
      window.location.hash = "#/login"
      return
    }
    if (next === "pos") {
      window.location.hash = "#/pos"
      return
    }
    if (next === "receive") {
      window.location.hash = "#/receive"
      return
    }
    window.location.hash = `#/app/${next}`
  }

  async function handleLogout() {
    try {
      await logout()
    } finally {
      setUser(null)
      goto("login")
    }
  }

  function handleSaveTemplate(next) {
    const saved = saveReceiptTemplate(next)
    setReceiptTemplate(saved)
  }

  function handleResetTemplate() {
    const saved = saveReceiptTemplate(defaultReceiptTemplate)
    setReceiptTemplate(saved)
  }

  function handleSaveBarcodeTemplate(next) {
    const saved = saveBarcodeTemplate(next)
    setBarcodeTemplate(saved)
  }

  function handleResetBarcodeTemplate() {
    const saved = saveBarcodeTemplate(defaultBarcodeTemplate)
    setBarcodeTemplate(saved)
  }

  // Gate everything (including POS) behind login for now.
  const needsAuth = route.mode !== "login"
  useEffect(() => {
    if (!authLoading && needsAuth && !user) {
      goto("login")
    }
  }, [authLoading, needsAuth, user])

  useEffect(() => {
    if (authLoading || !user) return
    if (user.role === "cashier" && route.mode !== "pos") {
      goto("pos")
    }
  }, [authLoading, user, route.mode])

  useEffect(() => {
    if (authLoading || !user) return
    if (user.role !== "manager") return
    if (route.mode !== "app") return
    const blocked = new Set(["employees", "audit"])
    if (blocked.has(route.page)) {
      goto("dashboard")
    }
  }, [authLoading, user, route.mode, route.page])

  if (route.mode === "login") {
    return (
      <LoginPage
        onLoggedIn={(u) => {
          setUser(u)
          goto(u?.role === "cashier" ? "pos" : "dashboard")
        }}
      />
    )
  }

  if (authLoading) {
    return (
      <div className="appShell appShellGrid">
        <div className="appTopbar">
          <div className="appTitle">Đang kiểm tra đăng nhập...</div>
          <div className="appTabs"></div>
        </div>
        <div className="appBody"></div>
      </div>
    )
  }
  if (needsAuth && !user) {
    return null
  }

  if (route.mode === "pos") {
    return (
      <div className="appShell appShellGrid">
        <div className="appTopbar">
          <div className="appTitle">{title}</div>
          <div className="appTabs">
            <button className="appTab" onClick={() => goto("dashboard")}>
              Về trang chủ
            </button>
            <button className="appTab" onClick={handleLogout}>
              Đăng xuất
            </button>
          </div>
        </div>
        <div className="appBody">
          <Pos receiptTemplate={receiptTemplate} />
        </div>
      </div>
    )
  }

  if (route.mode === "receive") {
    return (
      <div className="appShell appShellGrid">
        <div className="appTopbar">
          <div className="appTitle">{title}</div>
          <div className="appTabs">
            <button className="appTab" onClick={() => goto("dashboard")}>
              Về trang chủ
            </button>
            <button className="appTab" onClick={() => goto("pos")}>
              Mở POS
            </button>
            <button className="appTab" onClick={handleLogout}>
              Đăng xuất
            </button>
          </div>
        </div>
        <div className="appBody">
          <ReceivePrintPage />
        </div>
      </div>
    )
  }

  return (
    <div className="appShell">
      <AdminShell
        active={route.page}
        title={title}
        onGoto={goto}
        user={user}
        onLogout={handleLogout}
      >
        {route.page === "template" ? (
          <ReceiptTemplatePage
            template={receiptTemplate}
            onSave={handleSaveTemplate}
            onBack={() => goto("dashboard")}
            onReset={handleResetTemplate}
          />
        ) : route.page === "barcode-template" ? (
          <BarcodeTemplatePage
            template={barcodeTemplate}
            onSave={handleSaveBarcodeTemplate}
            onReset={handleResetBarcodeTemplate}
          />
        ) : route.page === "categories" ? (
          <CategoriesPage />
        ) : route.page === "products" ? (
          <ProductsPage />
        ) : route.page === "stock" ? (
          <StockPage />
        ) : route.page === "receive-history" ? (
          <ReceiveHistoryPage />
        ) : route.page === "rolls" ? (
          <RollsPage />
        ) : route.page === "images" ? (
          <ImagesPage />
        ) : route.page === "pricing" ? (
          <PricingPage />
        ) : route.page === "customers" ? (
          <CustomersPage />
        ) : route.page === "suppliers" ? (
          <SuppliersPage />
        ) : route.page === "excel" ? (
          <ExcelPage />
        ) : route.page === "orders" ? (
          <OrdersPage />
        ) : route.page === "audit" ? (
          <AuditPage />
        ) : route.page === "employees" ? (
          <EmployeesPage />
        ) : (
          <DashboardPage />
        )}
      </AdminShell>
    </div>
  )
}

export default App
