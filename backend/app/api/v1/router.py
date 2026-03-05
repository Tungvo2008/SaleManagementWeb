from fastapi import APIRouter, Depends
from app.api.v1.routes import (
    health,
    auth,
    employees,
    uploads,
    excel,
    products,
    categories,
    locations,
    stock_units,
    inventory,
    stock,
    customers,
    suppliers,
    pos_orders,
    pos,
    pos_reports,
    pos_search,
    cash_drawer,
    audit,
)
from app.api.v1.routes.auth import require_admin, require_pos, require_manager

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router, tags=["auth"])
api_router.include_router(employees.router, prefix="/employees", tags=["employees"], dependencies=[Depends(require_admin)])
api_router.include_router(uploads.router, prefix="/uploads", tags=["uploads"], dependencies=[Depends(require_manager)])
api_router.include_router(excel.router, prefix="/excel", tags=["excel"], dependencies=[Depends(require_manager)])
api_router.include_router(categories.router, prefix="/categories", tags=["categories"], dependencies=[Depends(require_pos)])
api_router.include_router(products.router, prefix="/products", tags=["products"], dependencies=[Depends(require_manager)])
api_router.include_router(locations.router, prefix="/locations", tags=["locations"], dependencies=[Depends(require_manager)])
api_router.include_router(stock_units.router, prefix="/stockunits", tags=["stock units"], dependencies=[Depends(require_manager)])
api_router.include_router(inventory.router, prefix="/inventory", tags=["inventory"], dependencies=[Depends(require_manager)])
api_router.include_router(stock.router, prefix="/stock", tags=["stock"], dependencies=[Depends(require_manager)])
api_router.include_router(customers.router, prefix="/customers", tags=["customers"], dependencies=[Depends(require_pos)])
api_router.include_router(suppliers.router, prefix="/suppliers", tags=["suppliers"], dependencies=[Depends(require_manager)])
api_router.include_router(pos.router, prefix="/pos", tags=["pos"], dependencies=[Depends(require_pos)])
api_router.include_router(pos_orders.router, prefix="/pos", tags=["pos"], dependencies=[Depends(require_pos)])
api_router.include_router(pos_reports.router, prefix="/pos", tags=["pos"], dependencies=[Depends(require_manager)])
api_router.include_router(pos_search.router, prefix="/pos", tags=["pos"], dependencies=[Depends(require_pos)])
api_router.include_router(cash_drawer.router, prefix="/pos", tags=["pos"], dependencies=[Depends(require_pos)])
api_router.include_router(audit.router, tags=["audit"], dependencies=[Depends(require_admin)])
