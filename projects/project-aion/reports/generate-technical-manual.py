#!/usr/bin/env python3
"""
Project Aion Technical Manual — PDF Generator
Reads the markdown content file and produces a formatted multi-page PDF.
Uses reportlab Platypus for flow-based document layout.
"""
import os
import re
import sys
from datetime import datetime

from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor, black, white
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    Preformatted, KeepTogether, HRFlowable
)
from reportlab.lib import colors


# --- Configuration ---
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "project-aion-technical-manual.pdf")
CONTENT_PATH = os.path.join(os.path.dirname(__file__), "technical-manual-content.md")

# Colors
AION_BLUE = HexColor("#1a5276")
AION_DARK = HexColor("#2c3e50")
AION_ACCENT = HexColor("#2980b9")
AION_LIGHT = HexColor("#ecf0f1")
CODE_BG = HexColor("#f8f9fa")
TABLE_HEADER_BG = HexColor("#2c3e50")
TABLE_ALT_BG = HexColor("#f2f3f4")


def build_styles():
    styles = getSampleStyleSheet()

    styles.add(ParagraphStyle(
        "ManualTitle", parent=styles["Title"],
        fontSize=28, leading=34, textColor=AION_BLUE,
        spaceAfter=6, alignment=TA_CENTER
    ))
    styles.add(ParagraphStyle(
        "ManualSubtitle", parent=styles["Normal"],
        fontSize=14, leading=18, textColor=AION_DARK,
        spaceAfter=24, alignment=TA_CENTER
    ))
    styles.add(ParagraphStyle(
        "ChapterTitle", parent=styles["Heading1"],
        fontSize=22, leading=26, textColor=AION_BLUE,
        spaceBefore=24, spaceAfter=12,
        borderWidth=1, borderColor=AION_BLUE, borderPadding=4
    ))
    styles.add(ParagraphStyle(
        "SectionTitle", parent=styles["Heading2"],
        fontSize=16, leading=20, textColor=AION_DARK,
        spaceBefore=16, spaceAfter=8
    ))
    styles.add(ParagraphStyle(
        "SubSection", parent=styles["Heading3"],
        fontSize=13, leading=16, textColor=AION_ACCENT,
        spaceBefore=12, spaceAfter=6
    ))
    styles["BodyText"].fontSize = 10
    styles["BodyText"].leading = 14
    styles["BodyText"].alignment = TA_JUSTIFY
    styles["BodyText"].spaceAfter = 6
    styles.add(ParagraphStyle(
        "BulletItem", parent=styles["Normal"],
        fontSize=10, leading=14, leftIndent=20,
        bulletIndent=10, spaceAfter=3
    ))
    styles.add(ParagraphStyle(
        "CodeBlock", parent=styles["Code"],
        fontSize=8, leading=10, leftIndent=12,
        backColor=CODE_BG, borderWidth=0.5,
        borderColor=HexColor("#dee2e6"), borderPadding=6,
        spaceAfter=8
    ))
    styles.add(ParagraphStyle(
        "TableCell", parent=styles["Normal"],
        fontSize=9, leading=11
    ))
    styles.add(ParagraphStyle(
        "TableHeader", parent=styles["Normal"],
        fontSize=9, leading=11, textColor=white, fontName="Helvetica-Bold"
    ))
    styles.add(ParagraphStyle(
        "Footer", parent=styles["Normal"],
        fontSize=8, textColor=HexColor("#7f8c8d"), alignment=TA_CENTER
    ))
    return styles


def parse_markdown(content, styles):
    """Convert markdown content to reportlab flowables."""
    elements = []
    lines = content.split("\n")
    i = 0
    in_code_block = False
    code_lines = []
    in_table = False
    table_rows = []

    while i < len(lines):
        line = lines[i]

        # Code blocks
        if line.strip().startswith("```"):
            if in_code_block:
                code_text = "\n".join(code_lines)
                if code_text.strip():
                    elements.append(Preformatted(code_text, styles["CodeBlock"]))
                code_lines = []
                in_code_block = False
            else:
                # Flush any pending table
                if in_table:
                    elements.append(build_table(table_rows, styles))
                    table_rows = []
                    in_table = False
                in_code_block = True
            i += 1
            continue

        if in_code_block:
            code_lines.append(line)
            i += 1
            continue

        # Table rows
        if "|" in line and line.strip().startswith("|"):
            stripped = line.strip()
            # Skip separator rows
            if re.match(r"^\|[\s\-:|]+\|$", stripped):
                i += 1
                continue
            cells = [c.strip() for c in stripped.split("|")[1:-1]]
            if cells:
                if not in_table:
                    in_table = True
                table_rows.append(cells)
            i += 1
            continue
        elif in_table:
            elements.append(build_table(table_rows, styles))
            table_rows = []
            in_table = False

        # Headers
        if line.startswith("# ") and not line.startswith("## "):
            text = clean_md(line[2:])
            elements.append(PageBreak())
            elements.append(Paragraph(text, styles["ChapterTitle"]))
            elements.append(HRFlowable(width="100%", thickness=1, color=AION_BLUE))
            elements.append(Spacer(1, 12))
            i += 1
            continue

        if line.startswith("## "):
            text = clean_md(line[3:])
            elements.append(Paragraph(text, styles["SectionTitle"]))
            i += 1
            continue

        if line.startswith("### "):
            text = clean_md(line[4:])
            elements.append(Paragraph(text, styles["SubSection"]))
            i += 1
            continue

        # Bullet items
        if line.strip().startswith("- ") or line.strip().startswith("* "):
            text = clean_md(line.strip()[2:])
            elements.append(Paragraph(f"• {text}", styles["BulletItem"]))
            i += 1
            continue

        # Numbered items
        m = re.match(r"^\s*(\d+)\.\s+(.*)", line)
        if m:
            text = clean_md(m.group(2))
            elements.append(Paragraph(f"{m.group(1)}. {text}", styles["BulletItem"]))
            i += 1
            continue

        # Horizontal rule
        if line.strip() in ("---", "***", "___"):
            elements.append(HRFlowable(width="80%", thickness=0.5, color=HexColor("#bdc3c7")))
            elements.append(Spacer(1, 6))
            i += 1
            continue

        # Empty line
        if not line.strip():
            elements.append(Spacer(1, 4))
            i += 1
            continue

        # Regular paragraph
        text = clean_md(line)
        if text.strip():
            elements.append(Paragraph(text, styles["BodyText"]))
        i += 1

    # Flush remaining
    if in_table and table_rows:
        elements.append(build_table(table_rows, styles))
    if in_code_block and code_lines:
        elements.append(Preformatted("\n".join(code_lines), styles["CodeBlock"]))

    return elements


def clean_md(text):
    """Convert markdown inline formatting to reportlab XML."""
    # Bold
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    # Italic
    text = re.sub(r"\*(.+?)\*", r"<i>\1</i>", text)
    # Inline code
    text = re.sub(r"`([^`]+)`", r'<font face="Courier" size="9">\1</font>', text)
    # Links — just show text
    text = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r"\1", text)
    # Escape XML entities
    text = text.replace("&", "&amp;").replace("<b>", "§B§").replace("</b>", "§/B§")
    text = text.replace("<i>", "§I§").replace("</i>", "§/I§")
    text = text.replace('<font face="Courier" size="9">', "§CODE§").replace("</font>", "§/CODE§")
    text = text.replace("<", "&lt;").replace(">", "&gt;")
    text = text.replace("§B§", "<b>").replace("§/B§", "</b>")
    text = text.replace("§I§", "<i>").replace("§/I§", "</i>")
    text = text.replace("§CODE§", '<font face="Courier" size="9">').replace("§/CODE§", "</font>")
    return text


def build_table(rows, styles):
    """Build a reportlab table from parsed rows."""
    if not rows:
        return Spacer(1, 1)

    # Normalize column count
    max_cols = max(len(r) for r in rows)
    norm_rows = []
    for r in rows:
        while len(r) < max_cols:
            r.append("")
        norm_rows.append(r)

    # Build with Paragraphs for word wrap
    table_data = []
    for ri, row in enumerate(norm_rows):
        style = styles["TableHeader"] if ri == 0 else styles["TableCell"]
        table_data.append([Paragraph(clean_md(c), style) for c in row])

    # Calculate column widths
    avail = 6.5 * inch
    col_width = avail / max_cols

    t = Table(table_data, colWidths=[col_width] * max_cols)
    style_cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), TABLE_HEADER_BG),
        ("TEXTCOLOR", (0, 0), (-1, 0), white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.5, HexColor("#dee2e6")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]
    # Alternate row shading
    for ri in range(1, len(table_data)):
        if ri % 2 == 0:
            style_cmds.append(("BACKGROUND", (0, ri), (-1, ri), TABLE_ALT_BG))

    t.setStyle(TableStyle(style_cmds))
    return t


def add_page_number(canvas, doc):
    """Footer with page number."""
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(HexColor("#7f8c8d"))
    canvas.drawCentredString(
        letter[0] / 2, 0.5 * inch,
        f"Project Aion Technical Manual — Page {doc.page}"
    )
    canvas.restoreState()


def build_cover(styles):
    """Build cover page elements."""
    elements = []
    elements.append(Spacer(1, 2 * inch))
    elements.append(Paragraph("PROJECT AION", styles["ManualTitle"]))
    elements.append(Spacer(1, 12))
    elements.append(Paragraph("Technical Manual", ParagraphStyle(
        "CoverSub", parent=styles["ManualSubtitle"],
        fontSize=20, textColor=AION_ACCENT
    )))
    elements.append(Spacer(1, 24))
    elements.append(HRFlowable(width="60%", thickness=2, color=AION_BLUE))
    elements.append(Spacer(1, 24))
    elements.append(Paragraph(
        "Multi-Archon Autonomous Operations Platform",
        styles["ManualSubtitle"]
    ))
    elements.append(Spacer(1, 12))
    elements.append(Paragraph(
        "Jarvis (Master Archon) + AIfred-Pro (Operations Archon)",
        styles["ManualSubtitle"]
    ))
    elements.append(Spacer(1, 2 * inch))
    elements.append(Paragraph(
        f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        styles["Footer"]
    ))
    elements.append(Paragraph("Version 1.0.0", styles["Footer"]))
    elements.append(Paragraph(
        "Jarvis v5.11.0 | AIfred-Pro v3.2.0 | Pulse v1.0.0-aion",
        styles["Footer"]
    ))
    elements.append(PageBreak())
    return elements


def main():
    if not os.path.exists(CONTENT_PATH):
        print(f"Error: Content file not found at {CONTENT_PATH}")
        sys.exit(1)

    with open(CONTENT_PATH, "r") as f:
        content = f.read()

    styles = build_styles()

    doc = SimpleDocTemplate(
        OUTPUT_PATH,
        pagesize=letter,
        leftMargin=0.75 * inch,
        rightMargin=0.75 * inch,
        topMargin=0.75 * inch,
        bottomMargin=0.75 * inch,
        title="Project Aion Technical Manual",
        author="Jarvis (Master Archon)",
        subject="Multi-Archon Autonomous Operations Platform",
    )

    elements = build_cover(styles)
    elements.extend(parse_markdown(content, styles))

    doc.build(elements, onFirstPage=add_page_number, onLaterPages=add_page_number)
    print(f"PDF generated: {OUTPUT_PATH}")
    print(f"Size: {os.path.getsize(OUTPUT_PATH) / 1024:.1f} KB")


if __name__ == "__main__":
    main()
