from __future__ import annotations

from secrets import randbelow


AUTO_EAN13_SENTINEL = "__AUTO_EAN13__"
DEFAULT_EAN13_PREFIX = "21"


def normalize_barcode_digits(value: str | None) -> str:
    return "".join(ch for ch in str(value or "") if ch.isdigit())


def compute_ean13_check_digit(body12: str) -> str:
    digits = normalize_barcode_digits(body12)
    if len(digits) != 12:
        raise ValueError("EAN-13 body must have 12 digits")
    total = 0
    for idx, ch in enumerate(digits):
        n = int(ch)
        total += n if idx % 2 == 0 else n * 3
    return str((10 - (total % 10)) % 10)


def build_ean13(body12: str) -> str:
    digits = normalize_barcode_digits(body12)
    if len(digits) != 12:
        raise ValueError("EAN-13 body must have 12 digits")
    return f"{digits}{compute_ean13_check_digit(digits)}"


def is_valid_ean13(value: str | None) -> bool:
    digits = normalize_barcode_digits(value)
    return len(digits) == 13 and compute_ean13_check_digit(digits[:12]) == digits[12]


def generate_random_ean13(prefix: str = DEFAULT_EAN13_PREFIX) -> str:
    prefix_digits = normalize_barcode_digits(prefix or DEFAULT_EAN13_PREFIX) or DEFAULT_EAN13_PREFIX
    if len(prefix_digits) >= 12:
        body12 = prefix_digits[:12]
    else:
        remaining = 12 - len(prefix_digits)
        suffix = "".join(str(randbelow(10)) for _ in range(remaining))
        body12 = f"{prefix_digits}{suffix}"
    return build_ean13(body12)
