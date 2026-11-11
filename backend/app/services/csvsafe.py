"""Neutralize spreadsheet formulas in exported CSV cells.

Excel, LibreOffice and Google Sheets evaluate any cell that begins with one of
these characters as a formula, so a title like `=HYPERLINK(...)` typed by one
communicator would run in the spreadsheet of whoever opens the export. A
leading apostrophe makes the cell plain text (the standard OWASP mitigation).
"""
from typing import Any

_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def safe_cell(value: Any) -> Any:
    if isinstance(value, str) and value.startswith(_FORMULA_PREFIXES):
        return "'" + value
    return value


def safe_row(values: list[Any]) -> list[Any]:
    return [safe_cell(v) for v in values]
