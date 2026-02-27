from __future__ import annotations

"""
SpreadsheetML (Excel 2003 XML) helper.

Why this format:
- No extra dependencies needed (stdlib only).
- Excel can open it directly.
- We can style header cells to highlight required fields.

Limitations:
- This is NOT .xlsx. Users must upload a SpreadsheetML file (Excel: "XML Spreadsheet 2003").
"""

from dataclasses import dataclass
import html
import xml.etree.ElementTree as ET


SS_NS = "urn:schemas-microsoft-com:office:spreadsheet"
SS = f"{{{SS_NS}}}"


@dataclass(frozen=True)
class Sheet:
    name: str
    columns: list[str]
    required: set[str]
    rows: list[dict[str, object | None]] | None = None


def _x(s: object | None) -> str:
    if s is None:
        return ""
    return html.escape(str(s), quote=False)


def _workbook_header() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<?mso-application progid="Excel.Sheet"?>\n'
        '<Workbook\n'
        ' xmlns="urn:schemas-microsoft-com:office:spreadsheet"\n'
        ' xmlns:o="urn:schemas-microsoft-com:office:office"\n'
        ' xmlns:x="urn:schemas-microsoft-com:office:excel"\n'
        ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"\n'
        ' xmlns:html="http://www.w3.org/TR/REC-html40"\n'
        ">\n"
    )


def _styles() -> str:
    # Colors chosen to be readable in Excel + match "required" highlighting.
    return (
        "<Styles>\n"
        '  <Style ss:ID="sHeader">\n'
        '    <Font ss:Bold="1"/>\n'
        '    <Interior ss:Color="#E8EEF7" ss:Pattern="Solid"/>\n'
        '    <Alignment ss:Vertical="Center" ss:WrapText="1"/>\n'
        "  </Style>\n"
        '  <Style ss:ID="sReqHeader">\n'
        '    <Font ss:Bold="1"/>\n'
        '    <Interior ss:Color="#FFE3E3" ss:Pattern="Solid"/>\n'
        '    <Alignment ss:Vertical="Center" ss:WrapText="1"/>\n'
        "  </Style>\n"
        '  <Style ss:ID="sNote">\n'
        '    <Font ss:Color="#555555"/>\n'
        '    <Alignment ss:WrapText="1"/>\n'
        "  </Style>\n"
        "</Styles>\n"
    )


def _worksheet_xml(sheet: Sheet) -> str:
    cols = sheet.columns
    required = sheet.required or set()
    rows = sheet.rows or []

    out: list[str] = []
    out.append(f'<Worksheet ss:Name="{_x(sheet.name)}">')
    out.append("<Table>")

    # Header row
    out.append("<Row>")
    for c in cols:
        style = "sReqHeader" if c in required else "sHeader"
        label = f"{c} *" if c in required else c
        out.append(f'<Cell ss:StyleID="{style}"><Data ss:Type="String">{_x(label)}</Data></Cell>')
    out.append("</Row>")

    # Data rows
    for r in rows:
        out.append("<Row>")
        for c in cols:
            v = r.get(c)
            if v is None:
                out.append('<Cell><Data ss:Type="String"></Data></Cell>')
            elif isinstance(v, (int, float)):
                out.append(f'<Cell><Data ss:Type="Number">{_x(v)}</Data></Cell>')
            # keep Decimal numeric in Excel
            elif v.__class__.__name__ == "Decimal":
                out.append(f'<Cell><Data ss:Type="Number">{_x(v)}</Data></Cell>')
            else:
                out.append(f'<Cell><Data ss:Type="String">{_x(v)}</Data></Cell>')
        out.append("</Row>")

    out.append("</Table>")
    out.append("</Worksheet>\n")
    return "\n".join(out)


def build_workbook(*, sheets: list[Sheet]) -> str:
    parts: list[str] = []
    parts.append(_workbook_header())
    parts.append(_styles())
    for s in sheets:
        parts.append(_worksheet_xml(s))
    parts.append("</Workbook>\n")
    return "".join(parts)


def parse_workbook(xml_bytes: bytes) -> dict[str, list[dict[str, str | None]]]:
    """
    Parse SpreadsheetML workbook into a dict: sheet_name -> list[row_dict].
    Values are raw strings (or None).
    """
    ET.register_namespace("ss", SS_NS)
    root = ET.fromstring(xml_bytes)

    def _attr(el: ET.Element, local_name: str) -> str | None:
        return el.attrib.get(f"{SS}{local_name}") or el.attrib.get(local_name)

    wb: dict[str, list[dict[str, str | None]]] = {}
    for ws in root.findall(f".//{SS}Worksheet"):
        name = _attr(ws, "Name") or "Sheet1"
        table = ws.find(f"{SS}Table")
        if table is None:
            wb[name] = []
            continue

        rows = table.findall(f"{SS}Row")
        if not rows:
            wb[name] = []
            continue

        headers: list[str] = []
        # header row
        for cell in rows[0].findall(f"{SS}Cell"):
            data = cell.find(f"{SS}Data")
            txt = (data.text if data is not None else "") or ""
            hdr = txt.replace("*", "").strip()
            headers.append(hdr)

        data_rows: list[dict[str, str | None]] = []
        for r_idx, row_el in enumerate(rows[1:], start=2):
            # handle sparse cells using ss:Index
            values: list[str | None] = [None] * len(headers)
            cur_col = 0
            for cell in row_el.findall(f"{SS}Cell"):
                idx_attr = _attr(cell, "Index")
                if idx_attr:
                    try:
                        cur_col = int(idx_attr) - 1
                    except Exception:
                        pass
                data = cell.find(f"{SS}Data")
                txt = (data.text if data is not None else None)
                if cur_col < len(values):
                    values[cur_col] = (txt.strip() if isinstance(txt, str) else None) or None
                cur_col += 1

            # skip fully empty rows
            if all(v is None for v in values):
                continue
            row_dict = {headers[i]: values[i] for i in range(len(headers))}
            row_dict["__rownum__"] = str(r_idx)  # keep original worksheet row number for errors
            data_rows.append(row_dict)

        wb[name] = data_rows

    return wb
