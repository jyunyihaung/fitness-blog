#!/usr/bin/env python3
"""Read ONLY the Block1 training grid from an .xlsx into typed row JSON.

Standard-library-only helper for scripts/normalize-coach-plan.mjs.
No upload, Google credentials, patient profile, or workbook mutation.
"""
import argparse
from datetime import datetime, timedelta
import json
from pathlib import Path, PurePosixPath
import re
import sys
import zipfile
from xml.etree import ElementTree as ET

N = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
PR = "{http://schemas.openxmlformats.org/package/2006/relationships}"
EXCEL_DATE_STYLES = set(range(14, 23)) | {45, 46, 47}
CELL = re.compile(r"^([A-Z]+)([1-9][0-9]*)$")
MAX_BYTES = 15 * 1024 * 1024
MAX_CELLS = 100000


def read_xml(book, name):
    if name not in book.namelist():
        return None
    info = book.getinfo(name)
    if info.file_size > MAX_BYTES:
        raise ValueError("Worksheet part is too large")
    return ET.fromstring(book.read(name))


def text_from_runs(node):
    return "".join(e.text or "" for e in node.iter(N + "t"))


def shared_strings(book):
    root = read_xml(book, "xl/sharedStrings.xml")
    if root is None:
        return []
    return [text_from_runs(si) for si in root.findall(N + "si")]


def date_styles(book):
    root = read_xml(book, "xl/styles.xml")
    if root is None:
        return set()
    custom = {int(x.attrib["numFmtId"]): x.attrib.get("formatCode", "")
              for x in root.findall(f"{N}numFmts/{N}numFmt")}
    styles = []
    for xf in root.findall(f"{N}cellXfs/{N}xf"):
        num_fmt = int(xf.attrib.get("numFmtId", "0"))
        fmt = custom.get(num_fmt, "")
        # Strip escaped literals and quoted strings before recognizing date tokens.
        cleaned = re.sub(r'"[^"]*"|\[[^]]*]|\\.', "", fmt.lower())
        styles.append(num_fmt in EXCEL_DATE_STYLES
                      or (bool(re.search(r"[ymdh]", cleaned)) and not bool(re.search(r"0\.0+", cleaned))))
    return {index for index, is_date in enumerate(styles) if is_date}


def excel_date(value, date1904=False):
    try:
        days = float(value)
        base = datetime(1904, 1, 1) if date1904 else datetime(1899, 12, 30)
        return (base + timedelta(days=days)).strftime("%Y-%m-%d")
    except (ValueError, OverflowError):
        return value


def worksheet_path(book, sheet_name):
    root = read_xml(book, "xl/workbook.xml")
    rels = read_xml(book, "xl/_rels/workbook.xml.rels")
    if root is None or rels is None:
        raise ValueError("Workbook metadata is missing")
    mapping = {node.attrib["Id"]: node.attrib["Target"] for node in rels.findall(PR + "Relationship")}
    for sheet in root.findall(f"{N}sheets/{N}sheet"):
        if sheet.attrib.get("name") != sheet_name:
            continue
        rel_id = sheet.attrib.get(REL + "id")
        target = mapping.get(rel_id, "")
        if target.startswith("/"):
            path = target.lstrip("/")
        else:
            path = str(PurePosixPath("xl") / target)
        # Normalize common parent traversals in relationship targets.
        import posixpath
        path = posixpath.normpath(path)
        if not path.startswith("xl/"):
            raise ValueError("Unexpected sheet path")
        props = root.find(N + "workbookPr")
        date1904 = props is not None and props.attrib.get("date1904") in ("1", "true")
        return path, date1904
    raise ValueError(f"Worksheet {sheet_name!r} was not found")


def as_cell(cell, strings, date_indexes, date1904):
    cell_type = cell.attrib.get("t")
    value_node = cell.find(N + "v")
    value = value_node.text if value_node is not None else ""
    if cell_type == "inlineStr":
        return text_from_runs(cell.find(N + "is") or cell)
    if cell_type == "s":
        index = int(value)
        if index < 0 or index >= len(strings):
            raise ValueError("Invalid shared string reference")
        return strings[index]
    if cell_type in ("str", "e", "d"):
        if cell_type == "d":
            return {"raw": value, "kind": "date-formatted"}
        return value
    if cell_type == "b":
        return value == "1"
    if value == "":
        return ""
    if int(cell.attrib.get("s", "0")) in date_indexes:
        return {"raw": excel_date(value, date1904), "kind": "date_serial",
                "excelSerial": value}
    try:
        num = float(value)
        return int(num) if num.is_integer() else num
    except ValueError:
        return value


def read_sheet(path):
    if path.stat().st_size > MAX_BYTES:
        raise ValueError("Excel file exceeds 15 MB safety limit")
    with zipfile.ZipFile(path) as book:
        if sum(info.file_size for info in book.infolist()) > 80 * MAX_BYTES:
            raise ValueError("Uncompressed workbook is too large")
        part, date1904 = worksheet_path(book, "Block1")
        root = read_xml(book, part)
        if root is None:
            raise ValueError("Block1 worksheet is missing")
        strings = shared_strings(book)
        dates = date_styles(book)
        result = []
        count = 0
        for row in root.findall(f"{N}sheetData/{N}row"):
            row_index = int(row.attrib.get("r", "0"))
            if row_index < 1 or row_index > 5000:
                raise ValueError("Unexpected worksheet row index")
            while len(result) < row_index:
                result.append([])
            values = result[row_index - 1]
            for c in row.findall(N + "c"):
                count += 1
                if count > MAX_CELLS:
                    raise ValueError("Too many worksheet cells")
                match = CELL.fullmatch(c.attrib.get("r", ""))
                if not match:
                    raise ValueError("Invalid worksheet cell reference")
                col = 0
                for letter in match[1]:
                    col = col * 26 + ord(letter) - 64
                if col > 100:
                    raise ValueError("Unexpected worksheet width")
                while len(values) < col:
                    values.append("")
                values[col - 1] = as_cell(c, strings, dates, date1904)
        return result


def main():
    parser = argparse.ArgumentParser(description="Extract Block1 cells without copying private workbook metadata")
    parser.add_argument("workbook", type=Path, help="Local coach .xlsx file")
    args = parser.parse_args()
    try:
        rows = read_sheet(args.workbook)
        json.dump({"sourceSheet": "Block1", "rows": rows}, sys.stdout, ensure_ascii=False,
                  separators=(",", ":"))
        sys.stdout.write("\n")
    except (ValueError, OSError, ET.ParseError, zipfile.BadZipFile) as exc:
        print("Failed to read Block1: " + str(exc), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
