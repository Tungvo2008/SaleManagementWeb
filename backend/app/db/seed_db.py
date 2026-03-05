from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import delete

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.audit_log import AuditLog
from app.models.category import Category
from app.models.customer import Customer
from app.models.inventory import Inventory
from app.models.location import Location
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.price_history import PriceHistory
from app.models.product import Product
from app.models.refresh_token import RefreshToken
from app.models.stock_unit import StockUnit
from app.models.supplier import Supplier
from app.models.user import User


def d(v: str) -> Decimal:
    return Decimal(v)


def seed_db() -> None:
    with SessionLocal() as db:
        # Allow rerun seed safely.
        for model in [
            AuditLog,
            PriceHistory,
            OrderItem,
            Order,
            Inventory,
            StockUnit,
            Product,
            Category,
            Location,
            Customer,
            Supplier,
            RefreshToken,
            User,
        ]:
            db.execute(delete(model))
        db.commit()

        users = [
            User(username="admin", password_hash=hash_password("admin123"), role="admin", is_active=True),
            User(username="quan_ly", password_hash=hash_password("123456"), role="manager", is_active=True),
            User(username="thu_ngan", password_hash=hash_password("123456"), role="cashier", is_active=True),
        ]
        db.add_all(users)

        categories = [
            Category(name="Lưới", description="Lưới và vật liệu theo mét"),
            Category(name="Khóa", description="Ổ khóa, bản lề, phụ kiện khóa"),
            Category(name="Dụng cụ", description="Dụng cụ cầm tay"),
            Category(name="Phụ kiện", description="Phụ kiện cửa và phụ kiện lắp đặt"),
            Category(name="Điện", description="Dây điện, CB, ổ cắm, bóng đèn"),
            Category(name="Nước", description="Ống nước, co nối, van"),
            Category(name="Keo & Chống thấm", description="Keo, silicon, chống thấm"),
        ]
        db.add_all(categories)

        suppliers = [
            Supplier(
                code="NCC-TP-01",
                name="Nhà cung cấp Vải & Lưới Thành Phát",
                phone="0911222333",
                address="Q. Bình Tân, TP.HCM",
                contact_name="Anh Phát",
            ),
            Supplier(
                code="NCC-LK-01",
                name="Công ty Kim Khí Lộc Khang",
                phone="0908111222",
                address="Q. 5, TP.HCM",
                contact_name="Chị Hạnh",
            ),
            Supplier(
                code="NCC-DC-01",
                name="Dụng cụ Minh Sơn",
                phone="0933333444",
                address="Q. Tân Phú, TP.HCM",
                contact_name="Anh Sơn",
            ),
        ]
        db.add_all(suppliers)

        customers = [
            Customer(code="KH-0001", name="Nguyễn Văn Hòa", phone="0909000001", points=120),
            Customer(code="KH-0002", name="Trần Thị Lan", phone="0909000002", points=45),
            Customer(code="KH-0003", name="Lê Minh Khánh", phone="0909000003", points=0),
        ]
        db.add_all(customers)

        locations = [
            Location(code="K-A1", name="Kệ A1", note="Kệ hàng thường"),
            Location(code="K-A2", name="Kệ A2", note="Kệ hàng thường"),
            Location(code="K-L1", name="Kệ Lưới 1", note="Khu cuộn lưới"),
            Location(code="K-L2", name="Kệ Lưới 2", note="Khu cuộn lưới"),
        ]
        db.add_all(locations)
        db.flush()

        cat_mesh, cat_lock, cat_tool, cat_misc, cat_electric, cat_plumbing, cat_chem = categories
        sup_mesh, sup_lock, sup_tool = suppliers
        loc_a1, loc_a2, loc_l1, loc_l2 = locations

        p_mesh = Product(
            category_id=cat_mesh.id,
            name="Lưới Nylon 1m",
            description="Nhóm lưới nylon theo màu và chiều dài cuộn",
            image_url=None,
            price=None,
            stock=None,
            sku=None,
            barcode=None,
            attrs={"kind": "parent"},
            is_active=True,
        )

        v_mesh_black = Product(
            parent=p_mesh,
            category_id=cat_mesh.id,
            name="Lưới Nylon - Đen (cuộn 50m)",
            description="Bán theo mét hoặc cả cuộn",
            price=d("35000"),
            roll_price=d("1650000"),
            cost_price=d("22000"),
            uom="m",
            stock=d("105"),
            sku="MESH-BLK-50M",
            barcode=None,
            attrs={"color": "đen", "meters_per_roll": 50},
            track_stock_unit=True,
            is_active=True,
        )

        v_mesh_green = Product(
            parent=p_mesh,
            category_id=cat_mesh.id,
            name="Lưới Nylon - Xanh (cuộn 50m)",
            description="Bán theo mét hoặc cả cuộn",
            price=d("36000"),
            roll_price=d("1680000"),
            cost_price=d("23000"),
            uom="m",
            stock=d("68"),
            sku="MESH-GRN-50M",
            barcode=None,
            attrs={"color": "xanh", "meters_per_roll": 50},
            track_stock_unit=True,
            is_active=True,
        )

        v_lock_vt = Product(
            category_id=cat_lock.id,
            name="Ổ khóa VT chống cắt 60mm",
            description="Ổ khóa Việt Tiệp chống cắt",
            price=d("100000"),
            roll_price=None,
            cost_price=d("68000"),
            uom="cái",
            stock=d("95"),
            sku="LOCK-VT-60",
            barcode="8938502088627",
            attrs={"brand": "Viet Tiep", "size_mm": 60},
            track_stock_unit=False,
            is_active=True,
        )

        v_lock_s11 = Product(
            category_id=cat_lock.id,
            name="Ổ khóa cửa tay nắm S11",
            description="Khóa tay nắm S11",
            price=d("240000"),
            roll_price=None,
            cost_price=d("170000"),
            uom="bộ",
            stock=d("18"),
            sku="LOCK-S11",
            barcode="8938502088634",
            attrs={"brand": "S11"},
            track_stock_unit=False,
            is_active=True,
        )

        v_glue = Product(
            category_id=cat_misc.id,
            name="Keo dán đa năng 500ml",
            description="Keo dán đa dụng",
            price=d("55000"),
            roll_price=None,
            cost_price=d("35000"),
            uom="chai",
            stock=d("39"),
            sku="GLUE-500",
            barcode="9556006012413",
            attrs={"volume_ml": 500},
            track_stock_unit=False,
            is_active=True,
        )

        v_scissors = Product(
            category_id=cat_tool.id,
            name="Kéo cắt lưới inox 10in",
            description="Kéo chuyên cắt lưới",
            price=d("180000"),
            roll_price=None,
            cost_price=d("120000"),
            uom="cây",
            stock=d("14"),
            sku="TOOL-SC-10",
            barcode="8809990017270",
            attrs={"material": "inox"},
            track_stock_unit=False,
            is_active=True,
        )

        extra_products = [
            Product(category_id=cat_electric.id, name="Dây điện Cadivi 2x1.5", description="Cuộn 100m", price=d("1850000"), cost_price=d("1610000"), uom="cuộn", stock=d("9"), sku="EL-CAD-2X15", barcode="8936000010010", track_stock_unit=False, is_active=True),
            Product(category_id=cat_electric.id, name="Dây điện Cadivi 2x2.5", description="Cuộn 100m", price=d("2850000"), cost_price=d("2520000"), uom="cuộn", stock=d("7"), sku="EL-CAD-2X25", barcode="8936000010027", track_stock_unit=False, is_active=True),
            Product(category_id=cat_electric.id, name="Aptomat 1P 20A", description="CB 1 pha", price=d("85000"), cost_price=d("62000"), uom="cái", stock=d("35"), sku="EL-CB-1P20", barcode="8936000010034", track_stock_unit=False, is_active=True),
            Product(category_id=cat_electric.id, name="Aptomat 2P 32A", description="CB 2 pha", price=d("175000"), cost_price=d("136000"), uom="cái", stock=d("22"), sku="EL-CB-2P32", barcode="8936000010041", track_stock_unit=False, is_active=True),
            Product(category_id=cat_electric.id, name="Ổ cắm đôi 3 chấu", description="Ổ cắm âm tường", price=d("69000"), cost_price=d("48000"), uom="cái", stock=d("54"), sku="EL-SOCKET-3P", barcode="8936000010058", track_stock_unit=False, is_active=True),
            Product(category_id=cat_electric.id, name="Bóng đèn LED 9W", description="Ánh sáng trắng", price=d("38000"), cost_price=d("26000"), uom="bóng", stock=d("110"), sku="EL-LED-9W", barcode="8936000010065", track_stock_unit=False, is_active=True),
            Product(category_id=cat_plumbing.id, name="Ống PVC Bình Minh phi 21", description="Ống nước cứng 4m", price=d("42000"), cost_price=d("32000"), uom="cây", stock=d("85"), sku="NU-ONG-21", barcode="8936000010072", track_stock_unit=False, is_active=True),
            Product(category_id=cat_plumbing.id, name="Ống PVC Bình Minh phi 27", description="Ống nước cứng 4m", price=d("59000"), cost_price=d("45000"), uom="cây", stock=d("76"), sku="NU-ONG-27", barcode="8936000010089", track_stock_unit=False, is_active=True),
            Product(category_id=cat_plumbing.id, name="Co PVC 21", description="Co nối 90 độ", price=d("5000"), cost_price=d("3000"), uom="cái", stock=d("340"), sku="NU-CO-21", barcode="8936000010096", track_stock_unit=False, is_active=True),
            Product(category_id=cat_plumbing.id, name="Tê PVC 21", description="Tê nối 3 nhánh", price=d("6500"), cost_price=d("4200"), uom="cái", stock=d("280"), sku="NU-TE-21", barcode="8936000010102", track_stock_unit=False, is_active=True),
            Product(category_id=cat_plumbing.id, name="Van khóa nước 21", description="Van nhựa tay gạt", price=d("32000"), cost_price=d("22000"), uom="cái", stock=d("65"), sku="NU-VAN-21", barcode="8936000010119", track_stock_unit=False, is_active=True),
            Product(category_id=cat_plumbing.id, name="Băng tan 19mm", description="Băng tan ren nước", price=d("6000"), cost_price=d("3500"), uom="cuộn", stock=d("190"), sku="NU-BT-19", barcode="8936000010126", track_stock_unit=False, is_active=True),
            Product(category_id=cat_chem.id, name="Keo dán ống PVC 100g", description="Keo dán ống nước", price=d("22000"), cost_price=d("14500"), uom="hũ", stock=d("125"), sku="KC-KEO-PVC100", barcode="8936000010133", track_stock_unit=False, is_active=True),
            Product(category_id=cat_chem.id, name="Silicon chống thấm trắng", description="Tuýp 300ml", price=d("78000"), cost_price=d("56000"), uom="tuýp", stock=d("42"), sku="KC-SIL-WHT", barcode="8936000010140", track_stock_unit=False, is_active=True),
            Product(category_id=cat_chem.id, name="Sơn chống rỉ xám 1kg", description="Sơn chống rỉ kim loại", price=d("128000"), cost_price=d("97000"), uom="lon", stock=d("28"), sku="KC-SCR-GR1", barcode="8936000010157", track_stock_unit=False, is_active=True),
            Product(category_id=cat_tool.id, name="Mỏ lết 10 inch", description="Mỏ lết chỉnh lực", price=d("115000"), cost_price=d("82000"), uom="cây", stock=d("26"), sku="TOOL-WR-10", barcode="8936000010164", track_stock_unit=False, is_active=True),
            Product(category_id=cat_tool.id, name="Kềm cắt điện 7 inch", description="Kềm cắt dây điện", price=d("98000"), cost_price=d("70000"), uom="cây", stock=d("31"), sku="TOOL-CUT-7", barcode="8936000010171", track_stock_unit=False, is_active=True),
            Product(category_id=cat_misc.id, name="Băng keo điện đen", description="Bản rộng 18mm", price=d("7000"), cost_price=d("4500"), uom="cuộn", stock=d("165"), sku="PK-BKD-BLK", barcode="8936000010188", track_stock_unit=False, is_active=True),
        ]

        db.add_all([p_mesh, v_mesh_black, v_mesh_green, v_lock_vt, v_lock_s11, v_glue, v_scissors, *extra_products])
        db.flush()

        stock_units = [
            StockUnit(
                variant_id=v_mesh_black.id,
                barcode="LUOI-DEN-0001",
                location_id=loc_l1.id,
                uom="m",
                initial_qty=d("50"),
                remaining_qty=d("50"),
                cost_roll_price=d("1050000"),
                cost_per_m=d("21000"),
                is_depleted=False,
            ),
            StockUnit(
                variant_id=v_mesh_black.id,
                barcode="LUOI-DEN-0002",
                location_id=loc_l1.id,
                uom="m",
                initial_qty=d("50"),
                remaining_qty=d("35"),
                cost_roll_price=d("1100000"),
                cost_per_m=d("22000"),
                is_depleted=False,
            ),
            StockUnit(
                variant_id=v_mesh_black.id,
                barcode="LUOI-DEN-0003",
                location_id=loc_l2.id,
                uom="m",
                initial_qty=d("50"),
                remaining_qty=d("20"),
                cost_roll_price=d("1125000"),
                cost_per_m=d("22500"),
                is_depleted=False,
            ),
            StockUnit(
                variant_id=v_mesh_black.id,
                barcode="LUOI-DEN-0004",
                location_id=loc_l2.id,
                uom="m",
                initial_qty=d("50"),
                remaining_qty=d("0"),
                cost_roll_price=d("1125000"),
                cost_per_m=d("22500"),
                is_depleted=True,
            ),
            StockUnit(
                variant_id=v_mesh_green.id,
                barcode="LUOI-XANH-0001",
                location_id=loc_l1.id,
                uom="m",
                initial_qty=d("50"),
                remaining_qty=d("50"),
                cost_roll_price=d("1150000"),
                cost_per_m=d("23000"),
                is_depleted=False,
            ),
            StockUnit(
                variant_id=v_mesh_green.id,
                barcode="LUOI-XANH-0002",
                location_id=loc_l2.id,
                uom="m",
                initial_qty=d("50"),
                remaining_qty=d("18"),
                cost_roll_price=d("1150000"),
                cost_per_m=d("23000"),
                is_depleted=False,
            ),
        ]
        db.add_all(stock_units)
        db.flush()

        su_b1, su_b2, su_b3, su_b4, su_g1, su_g2 = stock_units

        inventory_logs = [
            Inventory(type="receive", variant_id=v_mesh_black.id, stock_unit_id=su_b1.id, to_location_id=loc_l1.id, supplier_id=sup_mesh.id, qty=d("50"), note="Nhập cuộn đen #1"),
            Inventory(type="receive", variant_id=v_mesh_black.id, stock_unit_id=su_b2.id, to_location_id=loc_l1.id, supplier_id=sup_mesh.id, qty=d("50"), note="Nhập cuộn đen #2"),
            Inventory(type="receive", variant_id=v_mesh_black.id, stock_unit_id=su_b3.id, to_location_id=loc_l2.id, supplier_id=sup_mesh.id, qty=d("50"), note="Nhập cuộn đen #3"),
            Inventory(type="receive", variant_id=v_mesh_black.id, stock_unit_id=su_b4.id, to_location_id=loc_l2.id, supplier_id=sup_mesh.id, qty=d("50"), note="Nhập cuộn đen #4"),
            Inventory(type="sale", variant_id=v_mesh_black.id, stock_unit_id=su_b2.id, from_location_id=loc_l1.id, qty=d("15"), note="Bán lẻ theo mét"),
            Inventory(type="sale", variant_id=v_mesh_black.id, stock_unit_id=su_b3.id, from_location_id=loc_l2.id, qty=d("30"), note="Bán lẻ theo mét"),
            Inventory(type="sale", variant_id=v_mesh_black.id, stock_unit_id=su_b4.id, from_location_id=loc_l2.id, qty=d("50"), note="Bán nguyên cuộn"),
            Inventory(type="transfer", variant_id=v_mesh_black.id, stock_unit_id=su_b3.id, from_location_id=loc_l1.id, to_location_id=loc_l2.id, qty=d("20"), note="Chuyển kệ cuộn đang cắt dở"),
            Inventory(type="receive", variant_id=v_mesh_green.id, stock_unit_id=su_g1.id, to_location_id=loc_l1.id, supplier_id=sup_mesh.id, qty=d("50"), note="Nhập cuộn xanh #1"),
            Inventory(type="receive", variant_id=v_mesh_green.id, stock_unit_id=su_g2.id, to_location_id=loc_l2.id, supplier_id=sup_mesh.id, qty=d("50"), note="Nhập cuộn xanh #2"),
            Inventory(type="sale", variant_id=v_mesh_green.id, stock_unit_id=su_g2.id, from_location_id=loc_l2.id, qty=d("32"), note="Bán lẻ theo mét"),
            Inventory(type="receive", variant_id=v_lock_vt.id, to_location_id=loc_a1.id, supplier_id=sup_lock.id, qty=d("120"), note="Nhập lô khóa VT"),
            Inventory(type="sale", variant_id=v_lock_vt.id, from_location_id=loc_a1.id, qty=d("23"), note="Bán POS"),
            Inventory(type="adjust", variant_id=v_lock_vt.id, from_location_id=loc_a1.id, qty=d("-2"), note="Hư hỏng/hao hụt kiểm kê"),
            Inventory(type="receive", variant_id=v_lock_s11.id, to_location_id=loc_a1.id, supplier_id=sup_lock.id, qty=d("25"), note="Nhập khóa S11"),
            Inventory(type="sale", variant_id=v_lock_s11.id, from_location_id=loc_a1.id, qty=d("7"), note="Bán POS"),
            Inventory(type="receive", variant_id=v_glue.id, to_location_id=loc_a2.id, supplier_id=sup_tool.id, qty=d("60"), note="Nhập keo"),
            Inventory(type="sale", variant_id=v_glue.id, from_location_id=loc_a2.id, qty=d("21"), note="Bán POS"),
            Inventory(type="receive", variant_id=v_scissors.id, to_location_id=loc_a2.id, supplier_id=sup_tool.id, qty=d("20"), note="Nhập kéo"),
            Inventory(type="sale", variant_id=v_scissors.id, from_location_id=loc_a2.id, qty=d("6"), note="Bán POS"),
        ]
        for p in extra_products:
            inventory_logs.append(
                Inventory(
                    type="receive",
                    variant_id=p.id,
                    to_location_id=loc_a1.id if p.category_id in (cat_electric.id, cat_plumbing.id) else loc_a2.id,
                    supplier_id=sup_lock.id if p.category_id in (cat_electric.id, cat_plumbing.id) else sup_tool.id,
                    qty=p.stock or d("0"),
                    note=f"Nhập hàng mẫu {p.sku}",
                )
            )
        db.add_all(inventory_logs)

        now = datetime.now(ZoneInfo("UTC")).replace(tzinfo=None)
        order_1 = Order(
            status="checked_out",
            customer_id=customers[0].id,
            note="Khách mua tại quầy",
            subtotal=d("440000"),
            discount_mode="amount",
            discount_value=d("20000"),
            discount_total=d("20000"),
            grand_total=d("420000"),
            payment_method="cash",
            paid_amount=d("500000"),
            change_amount=d("80000"),
            checked_out_at=now,
        )
        order_2 = Order(
            status="checked_out",
            customer_id=customers[1].id,
            note="Mua cuộn lưới nguyên",
            subtotal=d("1680000"),
            discount_mode="percent",
            discount_value=d("10"),
            discount_total=d("168000"),
            grand_total=d("1512000"),
            payment_method="bank",
            paid_amount=d("1512000"),
            change_amount=d("0"),
            checked_out_at=now,
        )
        order_3 = Order(
            status="draft",
            customer_id=customers[2].id,
            note="Đơn nháp giữ hàng",
            subtotal=d("200000"),
            discount_mode="amount",
            discount_value=d("0"),
            discount_total=d("0"),
            grand_total=d("200000"),
        )
        db.add_all([order_1, order_2, order_3])
        db.flush()

        order_items = [
            OrderItem(
                order_id=order_1.id,
                variant_id=v_lock_vt.id,
                stock_unit_id=None,
                pricing_mode="normal",
                qty=d("3"),
                unit_price=d("100000"),
                discount_mode=None,
                discount_value=None,
                discount_total=d("0"),
                line_total=d("300000"),
                name_snapshot=v_lock_vt.name,
                sku_snapshot=v_lock_vt.sku,
                uom_snapshot=v_lock_vt.uom,
            ),
            OrderItem(
                order_id=order_1.id,
                variant_id=v_mesh_black.id,
                stock_unit_id=su_b2.id,
                pricing_mode="meter",
                qty=d("4"),
                unit_price=d("35000"),
                discount_mode=None,
                discount_value=None,
                discount_total=d("0"),
                line_total=d("140000"),
                name_snapshot=v_mesh_black.name,
                sku_snapshot=v_mesh_black.sku,
                uom_snapshot="m",
            ),
            OrderItem(
                order_id=order_2.id,
                variant_id=v_mesh_green.id,
                stock_unit_id=su_g1.id,
                pricing_mode="roll",
                qty=d("1"),
                unit_price=d("1680000"),
                discount_mode="percent",
                discount_value=d("10"),
                discount_total=d("168000"),
                line_total=d("1512000"),
                name_snapshot=v_mesh_green.name,
                sku_snapshot=v_mesh_green.sku,
                uom_snapshot="roll",
            ),
            OrderItem(
                order_id=order_3.id,
                variant_id=v_lock_s11.id,
                stock_unit_id=None,
                pricing_mode="normal",
                qty=d("1"),
                unit_price=d("240000"),
                discount_mode="amount",
                discount_value=d("40000"),
                discount_total=d("40000"),
                line_total=d("200000"),
                name_snapshot=v_lock_s11.name,
                sku_snapshot=v_lock_s11.sku,
                uom_snapshot=v_lock_s11.uom,
            ),
        ]
        db.add_all(order_items)

        price_history = [
            PriceHistory(variant_id=v_mesh_black.id, stock_unit_id=None, field="price", old_value=d("34000"), new_value=d("35000"), source="seed", note="Điều chỉnh giá bán"),
            PriceHistory(variant_id=v_mesh_black.id, stock_unit_id=None, field="roll_price", old_value=d("1600000"), new_value=d("1650000"), source="seed", note="Điều chỉnh giá bán cuộn"),
            PriceHistory(variant_id=v_mesh_black.id, stock_unit_id=None, field="cost_price", old_value=d("21500"), new_value=d("22000"), source="seed", note="Giá vốn trung bình cập nhật"),
            PriceHistory(variant_id=v_mesh_black.id, stock_unit_id=su_b2.id, field="cost_roll_price", old_value=d("1080000"), new_value=d("1100000"), source="seed", note="Nhập cuộn mới"),
            PriceHistory(variant_id=v_mesh_green.id, stock_unit_id=None, field="price", old_value=d("35000"), new_value=d("36000"), source="seed", note="Điều chỉnh theo thị trường"),
            PriceHistory(variant_id=v_lock_vt.id, stock_unit_id=None, field="cost_price", old_value=d("65000"), new_value=d("68000"), source="seed", note="Giá vốn tăng"),
        ]
        db.add_all(price_history)

        audit_logs = [
            AuditLog(
                actor_user_id=users[0].id,
                actor_username=users[0].username,
                request_id="seed-req-001",
                method="POST",
                path="/api/v1/products/",
                module="products",
                entity_type="product",
                entity_id=str(v_lock_vt.id),
                entity_label=v_lock_vt.name,
                action="create",
                changed_fields=["name", "price", "stock", "sku"],
                before_data=None,
                after_data={"sku": v_lock_vt.sku, "price": "100000.00", "stock": "95.00"},
                note="Tạo dữ liệu mẫu",
            ),
            AuditLog(
                actor_user_id=users[0].id,
                actor_username=users[0].username,
                request_id="seed-req-002",
                method="PATCH",
                path="/api/v1/products/{id}/pricing",
                module="pricing",
                entity_type="product",
                entity_id=str(v_mesh_black.id),
                entity_label=v_mesh_black.name,
                action="update",
                changed_fields=["price", "roll_price", "cost_price"],
                before_data={"price": "34000.00", "roll_price": "1600000.00", "cost_price": "21500.00"},
                after_data={"price": "35000.00", "roll_price": "1650000.00", "cost_price": "22000.00"},
                note="Cập nhật giá bán và giá vốn",
            ),
        ]
        db.add_all(audit_logs)

        db.commit()

        print("Seed complete.")
        print(f"- Users: {db.query(User).count()}")
        print(f"- Categories: {db.query(Category).count()}")
        print(f"- Products: {db.query(Product).count()}")
        print(f"- Stock units: {db.query(StockUnit).count()}")
        print(f"- Inventory logs: {db.query(Inventory).count()}")
        print(f"- Orders: {db.query(Order).count()}")
        print(f"- Customers: {db.query(Customer).count()}")
        print(f"- Suppliers: {db.query(Supplier).count()}")


if __name__ == "__main__":
    seed_db()
