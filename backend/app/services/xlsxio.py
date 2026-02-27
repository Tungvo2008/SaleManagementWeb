from __future__ import annotations

"""
Minimal XLSX (Office Open XML) read/write helpers (stdlib only).

We intentionally do NOT depend on openpyxl/xlsxwriter to keep the project
install-free in restricted environments.

Supported:
- Write: workbook with multiple sheets, sharedStrings, basic styles, hidden rows.
- Read: sharedStrings, inlineStr, numbers -> returns strings/None.
"""

from dataclasses import dataclass
from datetime import datetime
import io
import zipfile
import xml.etree.ElementTree as ET


NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
NS_PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships"


def _qn(ns: str, tag: str) -> str:
    return f"{{{ns}}}{tag}"


def _col_letters(n0: int) -> str:
    n = n0 + 1
    out = ""
    while n:
        n, r = divmod(n - 1, 26)
        out = chr(ord("A") + r) + out
    return out


def _col_index(col_letters: str) -> int:
    n = 0
    for ch in col_letters:
        if "A" <= ch <= "Z":
            n = n * 26 + (ord(ch) - ord("A") + 1)
        elif "a" <= ch <= "z":
            n = n * 26 + (ord(ch) - ord("a") + 1)
        else:
            break
    return max(0, n - 1)


def _cell_ref(col0: int, row1: int) -> str:
    return f"{_col_letters(col0)}{row1}"


def _is_number_like(v: object) -> bool:
    return isinstance(v, (int, float)) or v.__class__.__name__ == "Decimal"


@dataclass(frozen=True)
class XlsxSheet:
    name: str
    keys: list[str] | None = None
    labels: list[str] | None = None
    required_keys: set[str] | None = None
    rows: list[dict[str, object | None]] | None = None
    include_key_row: bool = False  # row2 (hidden) containing internal keys


def build_xlsx(*, sheets: list[XlsxSheet]) -> bytes:
    """
    Build an .xlsx file as bytes.
    - If include_key_row=True, we write:
        row1 = labels (styled)
        row2 = keys (hidden)
        data starts at row3
    - Otherwise:
        row1 = labels (styled)
        data starts at row2
    """
    ET.register_namespace("", NS_MAIN)
    ET.register_namespace("r", NS_REL)

    # ---------- Collect shared strings ----------
    shared: dict[str, int] = {}
    shared_list: list[str] = []

    def _ss(s: str) -> int:
        if s in shared:
            return shared[s]
        idx = len(shared_list)
        shared[s] = idx
        shared_list.append(s)
        return idx

    def _add_str(v: object | None) -> None:
        if v is None:
            return
        if isinstance(v, str):
            _ss(v)
        elif _is_number_like(v):
            return
        else:
            _ss(str(v))

    for sh in sheets:
        labels = sh.labels or sh.keys or []
        for s in labels:
            _add_str(s)
        if sh.include_key_row and sh.keys:
            for k in sh.keys:
                _add_str(k)
        for r in sh.rows or []:
            if sh.keys:
                for k in sh.keys:
                    _add_str(r.get(k))
            else:
                # for ad-hoc sheets: keep dict insertion order
                for v in r.values():
                    _add_str(v)

    # ---------- styles.xml (basic: header normal + header required) ----------
    style_xml = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="{NS_MAIN}">
  <fonts count="2">
    <font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE8EEF7"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFE3E3"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="1">
    <border><left/><right/><top/><bottom/><diagonal/></border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="3">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
    <xf numFmtId="0" fontId="1" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
  <dxfs count="0"/>
  <tableStyles count="0" defaultTableStyle="TableStyleMedium9" defaultPivotStyle="PivotStyleLight16"/>
</styleSheet>
"""

    # ---------- workbook.xml ----------
    # Rely on ET.register_namespace("r", NS_REL) + usage of r:id attributes to
    # emit the `xmlns:r="..."` declaration. Do NOT set it manually, otherwise
    # ElementTree may serialize duplicate attributes (invalid XML).
    wb = ET.Element(_qn(NS_MAIN, "workbook"))
    sheets_el = ET.SubElement(wb, _qn(NS_MAIN, "sheets"))
    for idx, sh in enumerate(sheets, start=1):
        se = ET.SubElement(sheets_el, _qn(NS_MAIN, "sheet"))
        se.set("name", sh.name[:31])  # Excel limit
        se.set("sheetId", str(idx))
        se.set(_qn(NS_REL, "id"), f"rId{idx}")

    wb_xml = ET.tostring(wb, encoding="utf-8", xml_declaration=True, short_empty_elements=True)

    # ---------- workbook.xml.rels ----------
    rels = ET.Element(_qn(NS_PKG_REL, "Relationships"))
    for idx in range(1, len(sheets) + 1):
        r = ET.SubElement(rels, _qn(NS_PKG_REL, "Relationship"))
        r.set("Id", f"rId{idx}")
        r.set("Type", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet")
        r.set("Target", f"worksheets/sheet{idx}.xml")
    # styles
    r_styles = ET.SubElement(rels, _qn(NS_PKG_REL, "Relationship"))
    r_styles.set("Id", f"rId{len(sheets)+1}")
    r_styles.set("Type", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles")
    r_styles.set("Target", "styles.xml")
    # sharedStrings
    r_ss = ET.SubElement(rels, _qn(NS_PKG_REL, "Relationship"))
    r_ss.set("Id", f"rId{len(sheets)+2}")
    r_ss.set("Type", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings")
    r_ss.set("Target", "sharedStrings.xml")
    wb_rels_xml = ET.tostring(rels, encoding="utf-8", xml_declaration=True, short_empty_elements=True)

    # ---------- sharedStrings.xml ----------
    sst = ET.Element(_qn(NS_MAIN, "sst"))
    sst.set("count", str(len(shared_list)))
    sst.set("uniqueCount", str(len(shared_list)))
    for s in shared_list:
        si = ET.SubElement(sst, _qn(NS_MAIN, "si"))
        t = ET.SubElement(si, _qn(NS_MAIN, "t"))
        # preserve leading/trailing spaces if any
        if s.startswith(" ") or s.endswith(" "):
            t.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
        t.text = s
    sst_xml = ET.tostring(sst, encoding="utf-8", xml_declaration=True, short_empty_elements=True)

    # ---------- worksheets ----------
    ws_xmls: list[bytes] = []
    for sh in sheets:
        keys = sh.keys or []
        labels = sh.labels or keys
        req = sh.required_keys or set()
        rows = sh.rows or []

        ws = ET.Element(_qn(NS_MAIN, "worksheet"))
        sheet_data = ET.SubElement(ws, _qn(NS_MAIN, "sheetData"))

        # Row 1: labels (styled)
        r1 = ET.SubElement(sheet_data, _qn(NS_MAIN, "row"))
        r1.set("r", "1")
        for c0, key in enumerate(keys):
            label = labels[c0] if c0 < len(labels) else key
            is_req = key in req
            c = ET.SubElement(r1, _qn(NS_MAIN, "c"))
            c.set("r", _cell_ref(c0, 1))
            c.set("t", "s")
            c.set("s", "2" if is_req else "1")  # style index
            v = ET.SubElement(c, _qn(NS_MAIN, "v"))
            v.text = str(_ss(label))

        if not keys and labels:
            # ad-hoc sheet: treat labels as columns
            for c0, label in enumerate(labels):
                c = ET.SubElement(r1, _qn(NS_MAIN, "c"))
                c.set("r", _cell_ref(c0, 1))
                c.set("t", "s")
                c.set("s", "1")
                v = ET.SubElement(c, _qn(NS_MAIN, "v"))
                v.text = str(_ss(label))

        start_row = 2
        if sh.include_key_row and keys:
            r2 = ET.SubElement(sheet_data, _qn(NS_MAIN, "row"))
            r2.set("r", "2")
            r2.set("hidden", "1")
            for c0, key in enumerate(keys):
                c = ET.SubElement(r2, _qn(NS_MAIN, "c"))
                c.set("r", _cell_ref(c0, 2))
                c.set("t", "s")
                v = ET.SubElement(c, _qn(NS_MAIN, "v"))
                v.text = str(_ss(key))
            start_row = 3

        # Data rows
        row_num = start_row
        for r in rows:
            rr = ET.SubElement(sheet_data, _qn(NS_MAIN, "row"))
            rr.set("r", str(row_num))
            if keys:
                for c0, key in enumerate(keys):
                    raw = r.get(key)
                    if raw is None or raw == "":
                        continue
                    c = ET.SubElement(rr, _qn(NS_MAIN, "c"))
                    c.set("r", _cell_ref(c0, row_num))
                    if _is_number_like(raw):
                        v = ET.SubElement(c, _qn(NS_MAIN, "v"))
                        v.text = str(raw)
                    else:
                        c.set("t", "s")
                        v = ET.SubElement(c, _qn(NS_MAIN, "v"))
                        v.text = str(_ss(str(raw)))
            else:
                # ad-hoc: dict insertion order
                for c0, (_, raw) in enumerate(r.items()):
                    if raw is None or raw == "":
                        continue
                    c = ET.SubElement(rr, _qn(NS_MAIN, "c"))
                    c.set("r", _cell_ref(c0, row_num))
                    if _is_number_like(raw):
                        v = ET.SubElement(c, _qn(NS_MAIN, "v"))
                        v.text = str(raw)
                    else:
                        c.set("t", "s")
                        v = ET.SubElement(c, _qn(NS_MAIN, "v"))
                        v.text = str(_ss(str(raw)))
            row_num += 1

        ws_xmls.append(ET.tostring(ws, encoding="utf-8", xml_declaration=True, short_empty_elements=True))

    # ---------- root rels + content types ----------
    root_rels = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="{NS_PKG_REL}">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>
"""
    ct_parts = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
        '  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
        '  <Default Extension="xml" ContentType="application/xml"/>',
        '  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
        '  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
        '  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>',
    ]
    for idx in range(1, len(sheets) + 1):
        ct_parts.append(
            f'  <Override PartName="/xl/worksheets/sheet{idx}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        )
    ct_parts.append("</Types>")
    content_types = "\n".join(ct_parts) + "\n"

    # ---------- zip ----------
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", content_types)
        z.writestr("_rels/.rels", root_rels)
        z.writestr("xl/workbook.xml", wb_xml)
        z.writestr("xl/_rels/workbook.xml.rels", wb_rels_xml)
        z.writestr("xl/styles.xml", style_xml)
        z.writestr("xl/sharedStrings.xml", sst_xml)
        for idx, ws_xml in enumerate(ws_xmls, start=1):
            z.writestr(f"xl/worksheets/sheet{idx}.xml", ws_xml)

    return buf.getvalue()


def parse_xlsx(xlsx_bytes: bytes) -> dict[str, list[dict[str, str | None]]]:
    """
    Parse an .xlsx into: sheet_name -> list[row_dict]
    Uses:
    - row2 as header if present and looks like machine keys (underscore/lowercase)
    - else row1 as header
    """
    ET.register_namespace("", NS_MAIN)

    wb: dict[str, list[dict[str, str | None]]] = {}
    with zipfile.ZipFile(io.BytesIO(xlsx_bytes)) as z:
        # shared strings
        shared: list[str] = []
        try:
            sst_xml = z.read("xl/sharedStrings.xml")
            sst = ET.fromstring(sst_xml)
            for si in sst.findall(f".//{{{NS_MAIN}}}si"):
                t = si.find(f".//{{{NS_MAIN}}}t")
                shared.append(t.text if t is not None and t.text is not None else "")
        except KeyError:
            shared = []

        # workbook + rels: name -> worksheet path
        wb_xml = ET.fromstring(z.read("xl/workbook.xml"))
        rels_xml = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        rel_map: dict[str, str] = {}
        for rel in rels_xml.findall(f".//{{{NS_PKG_REL}}}Relationship"):
            rid = rel.attrib.get("Id")
            tgt = rel.attrib.get("Target")
            if rid and tgt:
                rel_map[rid] = "xl/" + tgt.lstrip("/")

        sheets = wb_xml.findall(f".//{{{NS_MAIN}}}sheet")
        for sh in sheets:
            name = sh.attrib.get("name") or "Sheet"
            rid = sh.attrib.get(f"{{{NS_REL}}}id")
            path = rel_map.get(rid or "")
            if not path:
                continue

            ws = ET.fromstring(z.read(path))
            rows = ws.findall(f".//{{{NS_MAIN}}}sheetData/{{{NS_MAIN}}}row")
            # build dense rows
            dense: list[tuple[int, list[str | None]]] = []
            max_cols = 0
            for row_el in rows:
                rnum = int(row_el.attrib.get("r") or "0")
                vals: dict[int, str | None] = {}
                for c in row_el.findall(f"{{{NS_MAIN}}}c"):
                    ref = c.attrib.get("r") or ""
                    col_letters = "".join(ch for ch in ref if ch.isalpha())
                    if not col_letters:
                        continue
                    c0 = _col_index(col_letters)
                    t = c.attrib.get("t") or ""
                    v_el = c.find(f"{{{NS_MAIN}}}v")
                    if t == "s":
                        if v_el is None or v_el.text is None:
                            vals[c0] = None
                        else:
                            try:
                                idx = int(v_el.text)
                                vals[c0] = shared[idx] if 0 <= idx < len(shared) else v_el.text
                            except Exception:
                                vals[c0] = v_el.text
                    elif t == "inlineStr":
                        t_el = c.find(f".//{{{NS_MAIN}}}t")
                        vals[c0] = t_el.text if t_el is not None else None
                    else:
                        vals[c0] = v_el.text if v_el is not None else None

                if not vals:
                    continue
                max_cols = max(max_cols, max(vals.keys()) + 1)
                row_vals: list[str | None] = [None] * (max(vals.keys()) + 1)
                for c0, vv in vals.items():
                    if c0 >= 0:
                        if c0 >= len(row_vals):
                            row_vals.extend([None] * (c0 + 1 - len(row_vals)))
                        row_vals[c0] = (vv.strip() if isinstance(vv, str) else vv) or None
                dense.append((rnum, row_vals))

            dense.sort(key=lambda x: x[0])
            if not dense:
                wb[name] = []
                continue

            # header pick: prefer row2 if it looks like keys
            header_rnum, header_vals = dense[0]
            start_idx = 1
            if len(dense) >= 2 and dense[1][0] == header_rnum + 1:
                r2_vals = dense[1][1]
                tokens = [((v or "").strip()) for v in r2_vals]
                keyish = sum(1 for t in tokens if t and (t.islower() or "_" in t))
                if keyish >= max(1, len(tokens) // 3):
                    header_rnum, header_vals = dense[1]
                    start_idx = 2

            headers: list[str] = []
            for v in header_vals:
                h = (v or "").replace("*", "").strip()
                headers.append(h)
            # normalize header length
            if max_cols and len(headers) < max_cols:
                headers.extend([""] * (max_cols - len(headers)))

            out_rows: list[dict[str, str | None]] = []
            for rnum, rv in dense[start_idx:]:
                # expand
                if max_cols and len(rv) < max_cols:
                    rv = rv + [None] * (max_cols - len(rv))
                if all(v is None for v in rv):
                    continue
                d: dict[str, str | None] = {}
                for i, h in enumerate(headers):
                    if not h:
                        continue
                    d[h] = rv[i] if i < len(rv) else None
                d["__rownum__"] = str(rnum)
                out_rows.append(d)

            wb[name] = out_rows

    return wb
