from __future__ import annotations

from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class PaymentBreakdownOut(BaseModel):
    payment_method: str
    orders_count: int
    total: Decimal


class DailyReportOut(BaseModel):
    date: date
    orders_count: int
    subtotal_total: Decimal
    discount_total: Decimal
    grand_total: Decimal
    by_payment: list[PaymentBreakdownOut]

