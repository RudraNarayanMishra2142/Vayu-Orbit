import io
import os
import re
import logging
from xml.sax.saxutils import escape as xml_escape
from typing import Dict, Any, Optional

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.graphics.shapes import Drawing, Rect, String, Line, Circle, Group

logger = logging.getLogger("vayu_orbit_report")

# ─────────────────────────────────────────────────────────────────
# PALETTE & DESIGN SYSTEM TOKENS
# ─────────────────────────────────────────────────────────────────
C_NAVY = colors.HexColor('#0B1F3A')
C_STEEL = colors.HexColor('#3F5B78')
C_BLUE_GREY = colors.HexColor('#6B7F95')
C_RULES = colors.HexColor('#CBD5E1')
C_PANEL_FILL = colors.HexColor('#F8FAFC')
C_BODY_TEXT = colors.HexColor('#0F172A')
C_EST_BG = colors.HexColor('#FFFBEB')
C_EST_TEXT = colors.HexColor('#B45309')
C_UNAVAILABLE_BG = colors.HexColor('#F1F5F9')
C_ALERT_BG = colors.HexColor('#FEF2F2')
C_ALERT_BORDER = colors.HexColor('#FCA5A5')
C_ALERT_TEXT = colors.HexColor('#B91C1C')
C_OK_BG = colors.HexColor('#F0FDF4')
C_OK_BORDER = colors.HexColor('#86EFAC')
C_OK_TEXT = colors.HexColor('#15803D')
C_BLUE_ACCENT = colors.HexColor('#2563EB')
C_TARGET_LINE = colors.HexColor('#D97706')
C_WHITE = colors.white

PAGE_WIDTH, PAGE_HEIGHT = A4
MARGIN_LEFT = 18 * mm
MARGIN_RIGHT = 18 * mm
MARGIN_BOTTOM = 18 * mm
MARGIN_TOP = 22 * mm
USABLE_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT  # 174 mm

# ─────────────────────────────────────────────────────────────────
# RESOLVE LOGO PATH SAFELY
# ─────────────────────────────────────────────────────────────────
def get_default_logo_path() -> str:
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(backend_dir)
    return os.path.join(project_root, 'frontend', 'vayu.png')

# ─────────────────────────────────────────────────────────────────
# TWO-PASS NUMBERED CANVAS (PAGINATION & RUNNING HEADERS)
# ─────────────────────────────────────────────────────────────────
class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, total_pages: int):
        page_num = self._pageNumber
        meta = getattr(self, '_report_meta', {})
        logo_path = getattr(self, '_logo_path', None)

        self.saveState()

        if page_num > 1:
            # ── Interior Running Header (Pages 2+) ──
            self.setFont("Helvetica-Bold", 8.5)
            self.setFillColor(C_NAVY)
            self.drawString(MARGIN_LEFT, PAGE_HEIGHT - 13 * mm, "VAYU ORBIT · CONVOY MISSION DEBRIEF")

            self.setFont("Courier-Bold", 8)
            self.setFillColor(C_STEEL)
            jid = meta.get("journey_id", "VAYU-ORBIT")
            if len(jid) > 30:
                jid = jid[:27] + "..."
            self.drawString(MARGIN_LEFT, PAGE_HEIGHT - 17 * mm, f"REF: {jid}")

            # Right: Brand Badge
            badge_w = 18 * mm
            badge_h = 13 * mm
            badge_x = PAGE_WIDTH - MARGIN_RIGHT - badge_w
            badge_y = PAGE_HEIGHT - 18 * mm

            self.setFillColor(C_NAVY)
            self.roundRect(badge_x, badge_y, badge_w, badge_h, 3, fill=1, stroke=0)

            drawn_logo = False
            if logo_path and os.path.exists(logo_path):
                try:
                    img_size = 11 * mm
                    img_x = badge_x + (badge_w - img_size) / 2
                    img_y = badge_y + (badge_h - img_size) / 2
                    self.drawImage(logo_path, img_x, img_y, width=img_size, height=img_size, mask='auto', preserveAspectRatio=True)
                    drawn_logo = True
                except Exception as e:
                    logger.warning(f"Failed to draw logo on canvas: {e}")

            if not drawn_logo:
                self.setFont("Helvetica-Bold", 7)
                self.setFillColor(C_WHITE)
                self.drawCentredString(badge_x + badge_w / 2, badge_y + badge_h / 2 - 2, "VAYU")

            # Divider below header
            self.setStrokeColor(C_RULES)
            self.setLineWidth(0.6)
            divider_y = PAGE_HEIGHT - 19.5 * mm
            self.line(MARGIN_LEFT, divider_y, PAGE_WIDTH - MARGIN_RIGHT, divider_y)

        # ── Running Footer on ALL pages ──
        footer_y = 11 * mm
        self.setStrokeColor(C_RULES)
        self.setLineWidth(0.6)
        self.line(MARGIN_LEFT, footer_y + 3.5 * mm, PAGE_WIDTH - MARGIN_RIGHT, footer_y + 3.5 * mm)

        self.setFont("Helvetica-Bold", 7)
        self.setFillColor(C_BLUE_GREY)
        gen_time = meta.get("generated_at_ist", "")
        footer_left = f"VAYU ORBIT DECISION SUPPORT · Compiled: {gen_time}" if gen_time else "VAYU ORBIT DECISION SUPPORT PROTOTYPE"
        self.drawString(MARGIN_LEFT, footer_y, footer_left)

        page_str = f"Page {page_num} of {total_pages}"
        self.drawRightString(PAGE_WIDTH - MARGIN_RIGHT, footer_y, page_str)

        self.restoreState()

# ─────────────────────────────────────────────────────────────────
# STYLES BUILDER
# ─────────────────────────────────────────────────────────────────
def get_report_styles():
    styles = getSampleStyleSheet()

    styles.add(ParagraphStyle(
        name='CoverBrandTitle',
        fontName='Helvetica-Bold',
        fontSize=14,
        leading=17,
        textColor=C_WHITE
    ))
    styles.add(ParagraphStyle(
        name='CoverDocTitle',
        fontName='Helvetica-Bold',
        fontSize=20,
        leading=24,
        textColor=C_NAVY,
        spaceAfter=2
    ))
    styles.add(ParagraphStyle(
        name='CoverRouteHeader',
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=17,
        textColor=C_BLUE_ACCENT,
        spaceAfter=10
    ))
    styles.add(ParagraphStyle(
        name='SectionHeader',
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=14,
        textColor=C_NAVY,
        spaceBefore=8,
        spaceAfter=3,
        keepWithNext=True
    ))
    styles.add(ParagraphStyle(
        name='SubSectionHeader',
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=12,
        textColor=C_STEEL,
        spaceBefore=5,
        spaceAfter=3,
        keepWithNext=True
    ))
    styles.add(ParagraphStyle(
        name='ReportBody',
        fontName='Helvetica',
        fontSize=8,
        leading=11.5,
        textColor=C_BODY_TEXT,
        spaceAfter=3
    ))
    styles.add(ParagraphStyle(
        name='ReportBodyMuted',
        fontName='Helvetica-Oblique',
        fontSize=7.5,
        leading=10.5,
        textColor=C_BLUE_GREY,
        spaceAfter=3
    ))
    styles.add(ParagraphStyle(
        name='TableText',
        fontName='Helvetica',
        fontSize=7.5,
        leading=9.5,
        textColor=C_BODY_TEXT
    ))
    styles.add(ParagraphStyle(
        name='TableTextBold',
        fontName='Helvetica-Bold',
        fontSize=7.5,
        leading=9.5,
        textColor=C_BODY_TEXT
    ))
    styles.add(ParagraphStyle(
        name='TableMono',
        fontName='Courier',
        fontSize=7,
        leading=9,
        textColor=C_BODY_TEXT
    ))
    styles.add(ParagraphStyle(
        name='TableHdr',
        fontName='Helvetica-Bold',
        fontSize=7.5,
        leading=9.5,
        textColor=C_NAVY
    ))
    styles.add(ParagraphStyle(
        name='NoticeBox',
        fontName='Helvetica',
        fontSize=7.5,
        leading=10.5,
        textColor=C_BODY_TEXT
    ))
    styles.add(ParagraphStyle(
        name='DisclaimerText',
        fontName='Helvetica-Oblique',
        fontSize=7,
        leading=10,
        textColor=C_ALERT_TEXT
    ))
    styles.add(ParagraphStyle(
        name='ProvenanceTag',
        fontName='Helvetica-Bold',
        fontSize=6.5,
        leading=8,
        alignment=1
    ))
    styles.add(ParagraphStyle(
        name='KpiLabel',
        fontName='Helvetica-Bold',
        fontSize=7,
        leading=8.5,
        textColor=C_BLUE_GREY,
        alignment=0
    ))
    styles.add(ParagraphStyle(
        name='KpiValue',
        fontName='Helvetica-Bold',
        fontSize=14,
        leading=17,
        textColor=C_NAVY,
        alignment=0
    ))
    styles.add(ParagraphStyle(
        name='KpiSub',
        fontName='Helvetica',
        fontSize=6.5,
        leading=8,
        textColor=C_BLUE_GREY,
        alignment=0
    ))
    return styles

def make_prov_badge(tag: str, styles) -> Paragraph:
    """Formats a visual provenance badge without awkward wrapping."""
    fg = "#4A6170"
    if tag in ("PLANNED", "RECORDED"):
        fg = "#15803D"
    elif tag in ("DERIVED", "ESTIMATE"):
        fg = "#B45309"
    elif tag == "THEORETICAL":
        fg = "#0369A1"
    elif tag in ("UNVERIFIED", "UNAVAILABLE"):
        fg = "#B91C1C"

    html = f'<font color="{fg}"><b>{xml_escape(tag)}</b></font>'
    return Paragraph(html, styles['ProvenanceTag'])

# ─────────────────────────────────────────────────────────────────
# WAYPOINT SCHEMATIC DRAWING (PDF ROUTE MAP ADAPTATION)
# ─────────────────────────────────────────────────────────────────
def make_waypoint_schematic_drawing(waypoints: list, width: float = USABLE_WIDTH) -> Drawing:
    """Renders a clean static schematic node rail of corridor waypoints."""
    if not waypoints:
        return None

    count = len(waypoints)
    drawing_h = 42
    d = Drawing(width, drawing_h)

    # Background panel
    d.add(Rect(0, 0, width, drawing_h, fillColor=C_PANEL_FILL, strokeColor=C_RULES, strokeWidth=0.5, rx=3, ry=3))

    # Cap to max 6 nodes visually; if more, summarize intermediate
    display_nodes = waypoints if count <= 6 else [
        waypoints[0],
        waypoints[1],
        {'name': f'+{count - 3} Nodes', 'is_summary': True},
        waypoints[-2],
        waypoints[-1]
    ]
    num_disp = len(display_nodes)

    pad_x = 24
    step_x = (width - 2 * pad_x) / max(1, num_disp - 1)
    center_y = 20

    # Connecting rail
    d.add(Line(pad_x, center_y, width - pad_x, center_y, strokeColor=colors.HexColor('#CBD5E1'), strokeWidth=2))

    for idx, node in enumerate(display_nodes):
        x = pad_x + idx * step_x
        is_first = idx == 0
        is_last = idx == num_disp - 1
        is_sum = node.get('is_summary', False)

        # Node dot
        dot_c = colors.HexColor('#16A34A') if is_first else (colors.HexColor('#2563EB') if is_last else colors.HexColor('#64748B'))
        dot_r = 5 if not is_sum else 4
        d.add(Circle(x, center_y, dot_r, fillColor=dot_c, strokeColor=colors.white, strokeWidth=1.5))

        # Label above dot
        lbl = node.get('name', f'Node {idx+1}')
        if len(lbl) > 16:
            lbl = lbl[:14] + '..'
        align = 'start' if is_first else ('end' if is_last else 'middle')
        offset_x = x if not (is_first or is_last) else (x - 2 if is_first else x + 2)
        d.add(String(offset_x, center_y + 8, lbl, fontName='Helvetica-Bold', fontSize=6.5, fillColor=C_BODY_TEXT, textAnchor=align))

        # Sub-label below dot
        sub = 'ORIGIN' if is_first else ('TERMINUS' if is_last else (f'Waypoint {idx+1}' if not is_sum else 'Corridor'))
        d.add(String(offset_x, center_y - 11, sub, fontName='Helvetica', fontSize=5.5, fillColor=C_BLUE_GREY, textAnchor=align))

    return d

# ─────────────────────────────────────────────────────────────────
# STATIC FUEL RANGE BAR CHART DRAWING
# ─────────────────────────────────────────────────────────────────
def make_fuel_chart_drawing(fuel_vehicles: list, req_dist: float, width: float = USABLE_WIDTH) -> Drawing:
    """Renders a static ReportLab Drawing horizontal bar chart of convoy usable fuel range vs corridor distance."""
    if not fuel_vehicles:
        return None

    row_h = 22
    chart_h = max(46, len(fuel_vehicles) * row_h + 26)
    d = Drawing(width, chart_h)

    # Background panel
    d.add(Rect(0, 0, width, chart_h, fillColor=C_PANEL_FILL, strokeColor=C_RULES, strokeWidth=0.5, rx=3, ry=3))

    max_range = max(req_dist * 1.25, max([v.get('raw_usable_range_km', 0) for v in fuel_vehicles] + [req_dist, 100.0]))
    bar_x = 130
    bar_max_w = width - bar_x - 65

    for idx, v in enumerate(fuel_vehicles):
        y = chart_h - 22 - (idx * row_h)
        vid = v.get('vehicle_id', f'V-{idx+1}')
        model = v.get('model_name', 'Vehicle')
        usable = float(v.get('raw_usable_range_km', 0))
        is_suff = usable >= req_dist and req_dist > 0

        # Vehicle label
        lbl = f"{vid} ({model[:18]})"
        d.add(String(10, y + 3, lbl, fontName='Helvetica-Bold', fontSize=7, fillColor=C_NAVY))

        # Track background
        d.add(Rect(bar_x, y, bar_max_w, 10, fillColor=colors.HexColor('#E2E8F0'), strokeColor=None, rx=2, ry=2))

        # Usable fill
        bar_w = min(bar_max_w, max(2.0, (usable / max_range) * bar_max_w))
        fill_c = colors.HexColor('#2563EB') if is_suff else colors.HexColor('#DC2626')
        d.add(Rect(bar_x, y, bar_w, 10, fillColor=fill_c, strokeColor=None, rx=2, ry=2))

        # Value text
        val_txt = f"{usable:.0f} km usable"
        d.add(String(bar_x + bar_max_w + 6, y + 2, val_txt, fontName='Helvetica-Bold', fontSize=6.5, fillColor=C_NAVY))

    # Corridor target line
    if req_dist > 0:
        target_x = bar_x + (req_dist / max_range) * bar_max_w
        d.add(Line(target_x, 15, target_x, chart_h - 8, strokeColor=C_TARGET_LINE, strokeWidth=1.5))
        d.add(String(target_x - 16, 5, f"Req: {req_dist:.0f} km", fontName='Helvetica-Bold', fontSize=6, fillColor=C_TARGET_LINE))

    # Legend
    d.add(Rect(10, 5, 8, 7, fillColor=colors.HexColor('#2563EB'), strokeColor=None))
    d.add(String(22, 6, "Usable Range", fontName='Helvetica', fontSize=6, fillColor=C_BLUE_GREY))

    d.add(Line(76, 8, 88, 8, strokeColor=C_TARGET_LINE, strokeWidth=1.5))
    d.add(String(92, 6, f"Corridor Distance ({req_dist:.0f} km)", fontName='Helvetica', fontSize=6, fillColor=C_BLUE_GREY))

    return d

def from_reportlab_image(path: str, width: float, height: float):
    from reportlab.platypus import Image as RLImage
    return RLImage(path, width=width, height=height)

# ─────────────────────────────────────────────────────────────────
# PRIMARY GENERATOR FUNCTION
# ─────────────────────────────────────────────────────────────────
def generate_journey_debrief_pdf(
    model: Dict[str, Any],
    logo_path: Optional[str] = None
) -> bytes:
    """
    Renders a multi-page A4 Journey Debrief PDF using ReportLab Platypus.
    Supports variable-length reports with zero blank pages and optimal content density.
    Returns binary PDF bytes.
    """
    if not logo_path:
        logo_path = get_default_logo_path()

    logo_available = os.path.exists(logo_path)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=MARGIN_LEFT,
        rightMargin=MARGIN_RIGHT,
        topMargin=MARGIN_TOP,
        bottomMargin=MARGIN_BOTTOM
    )

    styles = get_report_styles()
    story = []

    # ─────────────────────────────────────────────────────────────
    # PAGE 1: EXECUTIVE COVER & HIGH-LEVEL OVERVIEW
    # ─────────────────────────────────────────────────────────────
    # Brand Plate Banner
    if logo_available:
        try:
            img_h = 14 * mm
            img_w = 14 * mm
            logo_cell = Table([[
                Paragraph('<font color="#FFFFFF"><b>VAYU ORBIT</b></font><br/><font color="#93B2D2">INTELLIGENT CONVOY MOVEMENT PLANNING AND DYNAMIC ROUTE OPTIMIZATION</font>', styles['CoverBrandTitle']),
                Table([[from_reportlab_image(logo_path, img_w, img_h)]], colWidths=[18 * mm], rowHeights=[16 * mm], style=[
                    ('BACKGROUND', (0,0), (-1,-1), C_NAVY),
                    ('ALIGN', (0,0), (-1,-1), 'RIGHT'),
                    ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
                    ('LEFTPADDING', (0,0), (-1,-1), 0),
                    ('RIGHTPADDING', (0,0), (-1,-1), 0),
                    ('TOPPADDING', (0,0), (-1,-1), 0),
                    ('BOTTOMPADDING', (0,0), (-1,-1), 0),
                ])
            ]], colWidths=[USABLE_WIDTH - 22 * mm, 22 * mm])
            logo_cell.setStyle(TableStyle([
                ('BACKGROUND', (0,0), (-1,-1), C_NAVY),
                ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
                ('LEFTPADDING', (0,0), (-1,-1), 8),
                ('RIGHTPADDING', (0,0), (-1,-1), 6),
                ('TOPPADDING', (0,0), (-1,-1), 6),
                ('BOTTOMPADDING', (0,0), (-1,-1), 6),
            ]))
        except Exception:
            logo_cell = Paragraph('<font color="#FFFFFF"><b>VAYU ORBIT</b></font><br/><font color="#93B2D2">INTELLIGENT CONVOY MOVEMENT PLANNING AND DYNAMIC ROUTE OPTIMIZATION</font>', styles['CoverBrandTitle'])
    else:
        logo_cell = Paragraph('<font color="#FFFFFF"><b>VAYU ORBIT</b></font><br/><font color="#93B2D2">INTELLIGENT CONVOY MOVEMENT PLANNING AND DYNAMIC ROUTE OPTIMIZATION</font>', styles['CoverBrandTitle'])

    story.append(logo_cell)
    story.append(Spacer(1, 5 * mm))

    # Title & Route
    story.append(Paragraph("CONVOY MISSION DEBRIEF REPORT", styles['CoverDocTitle']))

    origin_dest_html = (
        f"{xml_escape(model.get('origin_name', ''))} -&gt; {xml_escape(model.get('dest_name', ''))} "
        f"&nbsp;&nbsp;<font color='#3F5B78'>[{xml_escape(model.get('journey_id', ''))}]</font>"
    )
    story.append(Paragraph(origin_dest_html, styles['CoverRouteHeader']))

    # ── 6-KPI Summary Cards Grid (2 rows x 3 columns) ──
    kpi_col_w = USABLE_WIDTH / 3.0
    status_str = model.get('status', 'UNKNOWN')
    inc_count = model.get('incidents_count', 0)
    inc_fg = "#B91C1C" if inc_count > 0 else "#15803D"

    kpi_card_data = [
        [
            # Row 1, Card 1: Planned Distance
            Table([
                [Paragraph("PLANNED DISTANCE", styles['KpiLabel'])],
                [Paragraph(xml_escape(model.get('distance_km', 'N/A')), styles['KpiValue'])],
                [Paragraph("Calculated Corridor", styles['KpiSub'])]
            ], colWidths=[kpi_col_w - 4 * mm]),
            # Row 1, Card 2: Estimated Transit
            Table([
                [Paragraph("ESTIMATED TRANSIT", styles['KpiLabel'])],
                [Paragraph(xml_escape(model.get('eta_hours', 'N/A')), styles['KpiValue'])],
                [Paragraph("Tactical Speed Model", styles['KpiSub'])]
            ], colWidths=[kpi_col_w - 4 * mm]),
            # Row 1, Card 3: Convoy Complement
            Table([
                [Paragraph("CONVOY COMPLEMENT", styles['KpiLabel'])],
                [Paragraph(f"{model.get('convoy_size', 0)} Units", styles['KpiValue'])],
                [Paragraph("Committed Manifest", styles['KpiSub'])]
            ], colWidths=[kpi_col_w - 4 * mm])
        ],
        [
            # Row 2, Card 1: Recorded Status
            Table([
                [Paragraph("RECORDED STATUS", styles['KpiLabel'])],
                [Paragraph(f"<b>{xml_escape(status_str)}</b>", styles['KpiValue'])],
                [Paragraph("Mission Lifecycle State", styles['KpiSub'])]
            ], colWidths=[kpi_col_w - 4 * mm]),
            # Row 2, Card 2: Logged Incidents
            Table([
                [Paragraph("LOGGED INCIDENTS", styles['KpiLabel'])],
                [Paragraph(f"<font color='{inc_fg}'><b>{inc_count} Logged</b></font>", styles['KpiValue'])],
                [Paragraph("Safety Register Audit", styles['KpiSub'])]
            ], colWidths=[kpi_col_w - 4 * mm]),
            # Row 2, Card 3: Fuel Feasibility
            Table([
                [Paragraph("FUEL FEASIBILITY", styles['KpiLabel'])],
                [Paragraph(xml_escape(model.get('fuel_status', 'UNVERIFIED')), ParagraphStyle('KpiFuel', fontName='Helvetica-Bold', fontSize=10, leading=12, textColor=C_NAVY))],
                [Paragraph(f"Limiting: {xml_escape(model.get('limiting_usable_range', 'N/A'))}", styles['KpiSub'])]
            ], colWidths=[kpi_col_w - 4 * mm])
        ]
    ]

    t_kpi_grid = Table(kpi_card_data, colWidths=[kpi_col_w, kpi_col_w, kpi_col_w])
    t_kpi_grid.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), C_PANEL_FILL),
        ('BOX', (0,0), (0,0), 0.75, C_RULES),
        ('BOX', (1,0), (1,0), 0.75, C_RULES),
        ('BOX', (2,0), (2,0), 0.75, C_RULES),
        ('BOX', (0,1), (0,1), 0.75, C_RULES),
        ('BOX', (1,1), (1,1), 0.75, C_RULES),
        ('BOX', (2,1), (2,1), 0.75, C_RULES),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(t_kpi_grid)
    story.append(Spacer(1, 5 * mm))

    # Mission Parameters Metadata Strip
    meta_strip_data = [
        [
            Paragraph("<b>Origin Node:</b>", styles['TableText']),
            Paragraph(f"{xml_escape(model.get('origin_name', ''))} [{xml_escape(model.get('origin_id', ''))}]", styles['TableTextBold']),
            Paragraph("<b>Planned Departure:</b>", styles['TableText']),
            Paragraph(f"{xml_escape(model.get('planned_date', ''))} {xml_escape(model.get('planned_time', ''))}", styles['TableText'])
        ],
        [
            Paragraph("<b>Destination Node:</b>", styles['TableText']),
            Paragraph(f"{xml_escape(model.get('dest_name', ''))} [{xml_escape(model.get('dest_id', ''))}]", styles['TableTextBold']),
            Paragraph("<b>Debrief Compiled:</b>", styles['TableText']),
            Paragraph(xml_escape(model.get('generated_at_ist', '')), styles['TableText'])
        ],
        [
            Paragraph("<b>Tactical Corridor:</b>", styles['TableText']),
            Paragraph(xml_escape(model.get('corridor_name', '')), styles['TableText']),
            Paragraph("<b>Corridor Waypoints:</b>", styles['TableText']),
            Paragraph(f"{model.get('waypoints_count', 0)} sequenced nodes", styles['TableText'])
        ]
    ]
    t_meta = Table(meta_strip_data, colWidths=[36*mm, 52*mm, 36*mm, 50*mm])
    t_meta.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), C_PANEL_FILL),
        ('BOX', (0,0), (-1,-1), 0.75, C_RULES),
        ('INNERGRID', (0,0), (-1,-1), 0.5, C_RULES),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(t_meta)
    story.append(Spacer(1, 4 * mm))

    # Executive Overview Bullets
    exec_bullets = [
        f"<b>Tactical Corridor:</b> Mission <code>{xml_escape(model.get('journey_id', ''))}</code> routed between <b>{xml_escape(model.get('origin_name', ''))}</b> and <b>{xml_escape(model.get('dest_name', ''))}</b> ({xml_escape(model.get('distance_km', ''))}, est. {xml_escape(model.get('eta_hours', ''))} transit).",
        f"<b>Operational Lifecycle:</b> Recorded database state is <b>{xml_escape(status_str)}</b>. Timestamps represent server event transitions rather than transponder sweeps.",
        f"<b>Convoy Manifest:</b> Committed formation comprises <b>{model.get('convoy_size', 0)} vehicle asset(s)</b>.",
        f"<b>Theoretical Fuel Feasibility:</b> Simulation status evaluated as <b>{xml_escape(model.get('fuel_status', ''))}</b> with limiting vehicle range of {xml_escape(model.get('limiting_usable_range', 'N/A'))}.",
        f"<b>Operational Safety Register:</b> <b>{inc_count} operational exception(s)</b> were entered in the mission incident register."
    ]
    story.append(Paragraph("<b>Operational Findings Summary:</b>", styles['SubSectionHeader']))
    for b in exec_bullets:
        story.append(Paragraph(f"• {b}", styles['ReportBody']))

    story.append(Spacer(1, 4 * mm))

    # Prototype Technical Disclaimer Box
    disclaimer_text = (
        "<b>PROJECT TECHNICAL REPORT — LOGISTICS DECISION SUPPORT PROTOTYPE</b><br/>"
        "This debrief is synthesized from records available in the VAYU ORBIT database. "
        "It is non-operational, unclassified, and does not constitute official military clearance. "
        "Actual physical movement, live GPS transponder breadcrumbs, and CAN bus in-transit fuel burn were not recorded."
    )
    t_disc = Table([[Paragraph(disclaimer_text, styles['DisclaimerText'])]], colWidths=[USABLE_WIDTH])
    t_disc.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), C_ALERT_BG),
        ('BOX', (0,0), (-1,-1), 0.75, C_ALERT_BORDER),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(t_disc)

    # Clean page transition to detailed operational sections
    story.append(PageBreak())

    # ─────────────────────────────────────────────────────────────
    # SECTION 1: TACTICAL ROUTE CORRIDOR & WAYPOINTS
    # ─────────────────────────────────────────────────────────────
    story.append(Paragraph("1. TACTICAL ROUTE CORRIDOR & WAYPOINTS", styles['SectionHeader']))
    story.append(Paragraph(
        "<i>Planned tactical routing corridor computed by graph engine. Coordinate vectors reflect scheduled routing nodes, not actual GPS transponder traces.</i>",
        styles['ReportBodyMuted']
    ))

    # Route schematic visual drawing
    waypoints = model.get('waypoints', [])
    if waypoints:
        schematic_drawing = make_waypoint_schematic_drawing(waypoints, width=USABLE_WIDTH)
        if schematic_drawing:
            story.append(schematic_drawing)
            story.append(Spacer(1, 3 * mm))

    # Corridor Specs
    corridor_data = [
        [
            Paragraph("<b>Corridor Designation:</b>", styles['TableText']),
            Paragraph(xml_escape(model.get('corridor_name', '')), styles['TableTextBold']),
            Paragraph("<b>Route Type:</b>", styles['TableText']),
            Paragraph(xml_escape(model.get('route_type', 'PRIMARY')), styles['TableText'])
        ],
        [
            Paragraph("<b>Axle Ceiling Limit:</b>", styles['TableText']),
            Paragraph(f"{model.get('vehicle_limit_tons')} Tons Max" if model.get('vehicle_limit_tons') else "Standard Axle Limit", styles['TableText']),
            Paragraph("<b>Corridor Risk Score:</b>", styles['TableText']),
            Paragraph(f"{model.get('risk_score', 'N/A')} / 10", styles['TableTextBold'])
        ]
    ]
    t_corr = Table(corridor_data, colWidths=[38*mm, 52*mm, 38*mm, 46*mm])
    t_corr.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), C_PANEL_FILL),
        ('BOX', (0,0), (-1,-1), 0.75, C_RULES),
        ('INNERGRID', (0,0), (-1,-1), 0.5, C_RULES),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(t_corr)
    story.append(Spacer(1, 3 * mm))

    # Sequenced Waypoints Table (with wide Provenance column)
    if waypoints:
        wp_rows = [
            [
                Paragraph("Seq", styles['TableHdr']),
                Paragraph("Node ID", styles['TableHdr']),
                Paragraph("Installation / Military Station", styles['TableHdr']),
                Paragraph("Role in Corridor", styles['TableHdr']),
                Paragraph("Provenance", styles['TableHdr'])
            ]
        ]
        total_wps = len(waypoints)
        for idx, wp in enumerate(waypoints):
            role = "ORIGIN" if idx == 0 else ("TERMINUS" if idx == total_wps - 1 else "Tactical Waypoint")
            wp_rows.append([
                Paragraph(str(wp.get('seq', idx + 1)), styles['TableText']),
                Paragraph(xml_escape(str(wp.get('node_id', ''))), styles['TableMono']),
                Paragraph(xml_escape(str(wp.get('name', ''))), styles['TableTextBold'] if role != "Tactical Waypoint" else styles['TableText']),
                Paragraph(role, styles['TableTextBold'] if role != "Tactical Waypoint" else styles['TableText']),
                make_prov_badge(wp.get("provenance", "PLANNED"), styles)
            ])
        t_wp = Table(wp_rows, colWidths=[12*mm, 30*mm, 80*mm, 30*mm, 22*mm], repeatRows=1)
        t_wp.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), C_PANEL_FILL),
            ('BOX', (0,0), (-1,-1), 0.75, C_RULES),
            ('INNERGRID', (0,0), (-1,-1), 0.5, C_RULES),
            ('TOPPADDING', (0,0), (-1,-1), 2.5),
            ('BOTTOMPADDING', (0,0), (-1,-1), 2.5),
            ('LEFTPADDING', (0,0), (-1,-1), 4),
            ('RIGHTPADDING', (0,0), (-1,-1), 4),
        ]))
        story.append(t_wp)

    story.append(Spacer(1, 4 * mm))

    # ─────────────────────────────────────────────────────────────
    # SECTION 2: COMMITTED CONVOY MANIFEST
    # ─────────────────────────────────────────────────────────────
    story.append(Paragraph("2. COMMITTED CONVOY MANIFEST", styles['SectionHeader']))
    story.append(Paragraph(
        "<i>Historical convoy manifest captured at journey authorization. Values are preserved from saved records.</i>",
        styles['ReportBodyMuted']
    ))

    convoy_list = model.get('convoy', [])
    if convoy_list:
        convoy_table_data = [
            [
                Paragraph("Pos", styles['TableHdr']),
                Paragraph("Vehicle ID", styles['TableHdr']),
                Paragraph("Callsign / Unit", styles['TableHdr']),
                Paragraph("Model Specification", styles['TableHdr']),
                Paragraph("Role", styles['TableHdr']),
                Paragraph("Fuel Spec", styles['TableHdr']),
                Paragraph("Payload / Pax", styles['TableHdr'])
            ]
        ]
        for v in convoy_list:
            callsign_val = v.get('callsign') or 'NOT RECORDED'
            unit_val = v.get('unit_id') or 'NOT RECORDED'
            callsign_display = xml_escape(str(callsign_val)) if callsign_val != "NOT RECORDED" else (xml_escape(str(unit_val)) if unit_val != "NOT RECORDED" else "—")
            occupants_val = v.get('occupants')
            cargo_weight_val = v.get('cargo_weight') or 'NOT RECORDED'
            pax_payload = f"{occupants_val} pax" if (occupants_val and occupants_val != "NOT RECORDED") else cargo_weight_val
            fuel_spec = f"{v.get('fuel_type', 'DIESEL')}" + (f" ({v.get('rated_range')})" if v.get('rated_range') and v.get('rated_range') != "NOT RECORDED" else "")

            convoy_table_data.append([
                Paragraph(str(v.get('position', '')), styles['TableText']),
                Paragraph(xml_escape(str(v.get('vehicle_id', ''))), styles['TableMono']),
                Paragraph(callsign_display, styles['TableText']),
                Paragraph(xml_escape(str(v.get('model_name', ''))), styles['TableTextBold']),
                Paragraph(xml_escape(str(v.get('vehicle_role', 'Transport'))), styles['TableText']),
                Paragraph(xml_escape(fuel_spec), styles['TableText']),
                Paragraph(xml_escape(str(pax_payload)), styles['TableText'])
            ])
        t_convoy = Table(convoy_table_data, colWidths=[10*mm, 26*mm, 26*mm, 42*mm, 26*mm, 24*mm, 20*mm], repeatRows=1)
        t_convoy.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), C_PANEL_FILL),
            ('BOX', (0,0), (-1,-1), 0.75, C_RULES),
            ('INNERGRID', (0,0), (-1,-1), 0.5, C_RULES),
            ('TOPPADDING', (0,0), (-1,-1), 2.5),
            ('BOTTOMPADDING', (0,0), (-1,-1), 2.5),
            ('LEFTPADDING', (0,0), (-1,-1), 4),
            ('RIGHTPADDING', (0,0), (-1,-1), 4),
        ]))
        story.append(t_convoy)
    else:
        story.append(Paragraph("No convoy vehicles recorded in committed manifest.", styles['ReportBody']))

    story.append(Spacer(1, 4 * mm))

    # ─────────────────────────────────────────────────────────────
    # SECTION 3: FUEL INTELLIGENCE & PERFORMANCE VISUALIZATIONS
    # ─────────────────────────────────────────────────────────────
    # Keep Section 3 grouped together to avoid splitting chart and metrics
    sec3_elements = []
    sec3_elements.append(Paragraph("3. FUEL INTELLIGENCE & PERFORMANCE VISUALIZATIONS", styles['SectionHeader']))

    # Recalculation notice
    recalc_notice = (
        "<b>SIMULATED / THEORETICAL EVALUATION:</b> Fuel range metrics are deterministic mathematical simulations based on "
        "catalog consumption rates and operator dip levels. In-transit fuel flow sensor telemetry was unrecorded."
    )
    t_recalc = Table([[Paragraph(recalc_notice, styles['NoticeBox'])]], colWidths=[USABLE_WIDTH])
    t_recalc.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), C_EST_BG),
        ('BOX', (0,0), (-1,-1), 0.75, colors.HexColor('#F59E0B')),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    sec3_elements.append(t_recalc)
    sec3_elements.append(Spacer(1, 2.5 * mm))

    # Fuel metrics grid
    fuel_grid_data = [
        [
            Paragraph("<b>Convoy Feasibility Status:</b>", styles['TableText']),
            Paragraph(f"<b>{xml_escape(model.get('fuel_status', ''))}</b>", styles['TableTextBold']),
            Paragraph("<b>Reserve Policy:</b>", styles['TableText']),
            Paragraph(xml_escape(model.get('reserve_percent', '20.0%')), styles['TableText'])
        ],
        [
            Paragraph("<b>Limiting Vehicle:</b>", styles['TableText']),
            Paragraph(xml_escape(model.get('limiting_vehicle_name', 'None')), styles['TableText']),
            Paragraph("<b>Limiting Usable Range:</b>", styles['TableText']),
            Paragraph(xml_escape(model.get('limiting_usable_range', 'N/A')), styles['TableTextBold'])
        ]
    ]
    t_fuel_grid = Table(fuel_grid_data, colWidths=[42*mm, 48*mm, 42*mm, 42*mm])
    t_fuel_grid.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), C_PANEL_FILL),
        ('BOX', (0,0), (-1,-1), 0.75, C_RULES),
        ('INNERGRID', (0,0), (-1,-1), 0.5, C_RULES),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    sec3_elements.append(t_fuel_grid)
    sec3_elements.append(Spacer(1, 3 * mm))

    # Static Fuel Range Bar Chart
    req_d = float(model.get('raw_distance_km', 0.0))
    fuel_vehs = model.get('fuel_vehicles', [])
    if fuel_vehs:
        sec3_elements.append(Paragraph("<b>Convoy Fuel Range & Reserve Analysis (Usable Range vs. Corridor Distance)</b>", styles['SubSectionHeader']))
        chart_drawing = make_fuel_chart_drawing(fuel_vehs, req_d, width=USABLE_WIDTH)
        if chart_drawing:
            sec3_elements.append(chart_drawing)
            sec3_elements.append(Spacer(1, 2.5 * mm))

    # Fleet Composition Breakdown
    comp_list = model.get('vehicle_composition', [])
    if comp_list:
        comp_cells = [Paragraph(f"<b>{xml_escape(c['model'])}:</b> {c['count']} unit(s)", styles['TableText']) for c in comp_list]
        comp_rows = []
        for i in range(0, len(comp_cells), 2):
            row = [comp_cells[i]]
            row.append(comp_cells[i+1] if i + 1 < len(comp_cells) else Paragraph("", styles['TableText']))
            comp_rows.append(row)
        t_comp = Table(comp_rows, colWidths=[USABLE_WIDTH/2, USABLE_WIDTH/2])
        t_comp.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), C_PANEL_FILL),
            ('BOX', (0,0), (-1,-1), 0.5, C_RULES),
            ('TOPPADDING', (0,0), (-1,-1), 2.5),
            ('BOTTOMPADDING', (0,0), (-1,-1), 2.5),
            ('LEFTPADDING', (0,0), (-1,-1), 6),
            ('RIGHTPADDING', (0,0), (-1,-1), 6),
        ]))
        sec3_elements.append(Paragraph("<b>Committed Convoy Fleet Composition:</b>", styles['SubSectionHeader']))
        sec3_elements.append(t_comp)

    story.append(KeepTogether(sec3_elements))
    story.append(Spacer(1, 4 * mm))

    # ─────────────────────────────────────────────────────────────
    # SECTION 4: RECORDED OPERATIONAL TIMELINE
    # ─────────────────────────────────────────────────────────────
    story.append(Paragraph("4. RECORDED OPERATIONAL TIMELINE", styles['SectionHeader']))
    story.append(Paragraph(
        "<i>Timestamps reflect server-side event creation times converted to IST (UTC+05:30). Absence of events between logged timestamps does not imply continuous physical transit.</i>",
        styles['ReportBodyMuted']
    ))

    # Derived timestamps card
    derived_data = [
        [
            Paragraph("<b>Actual Departure Time (IST):</b>", styles['TableText']),
            Paragraph(xml_escape(model.get('actual_departure_ist', 'Unavailable')), styles['TableTextBold']),
            Paragraph("<b>Source Event:</b>", styles['TableText']),
            Paragraph(xml_escape(model.get('departure_source_event', 'None')), styles['TableMono'])
        ],
        [
            Paragraph("<b>Actual Completion Time (IST):</b>", styles['TableText']),
            Paragraph(xml_escape(model.get('actual_completion_ist', 'Unavailable')), styles['TableTextBold']),
            Paragraph("<b>Source Event:</b>", styles['TableText']),
            Paragraph(xml_escape(model.get('completion_source_event', 'None')), styles['TableMono'])
        ],
        [
            Paragraph("<b>Checkpoint Passage Records:</b>", styles['TableText']),
            Paragraph("<font color='#D97706'><b>UNAVAILABLE</b></font>", styles['TableTextBold']),
            Paragraph("<b>Transponder Status:</b>", styles['TableText']),
            Paragraph("Automated RFID sweeps unrecorded.", styles['TableText'])
        ]
    ]
    t_der = Table(derived_data, colWidths=[44*mm, 46*mm, 36*mm, 48*mm])
    t_der.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), C_PANEL_FILL),
        ('BOX', (0,0), (-1,-1), 0.75, C_RULES),
        ('INNERGRID', (0,0), (-1,-1), 0.5, C_RULES),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(t_der)
    story.append(Spacer(1, 3 * mm))

    # Events table (with wide Provenance column so RECORDED never wraps)
    if model.get('events'):
        ev_rows = [
            [
                Paragraph("Recorded Time (IST)", styles['TableHdr']),
                Paragraph("Event Type", styles['TableHdr']),
                Paragraph("Operational Description", styles['TableHdr']),
                Paragraph("Provenance", styles['TableHdr'])
            ]
        ]
        for ev in model.get('events', []):
            ev_rows.append([
                Paragraph(xml_escape(str(ev.get('timestamp_ist', ''))), styles['TableMono']),
                Paragraph(xml_escape(str(ev.get('event_type', ''))), styles['TableTextBold']),
                Paragraph(xml_escape(str(ev.get('message', ''))), styles['TableText']),
                make_prov_badge(ev.get("provenance", "RECORDED"), styles)
            ])
        t_events = Table(ev_rows, colWidths=[42*mm, 28*mm, 84*mm, 20*mm], repeatRows=1)
        t_events.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), C_PANEL_FILL),
            ('BOX', (0,0), (-1,-1), 0.75, C_RULES),
            ('INNERGRID', (0,0), (-1,-1), 0.5, C_RULES),
            ('TOPPADDING', (0,0), (-1,-1), 2.5),
            ('BOTTOMPADDING', (0,0), (-1,-1), 2.5),
            ('LEFTPADDING', (0,0), (-1,-1), 4),
            ('RIGHTPADDING', (0,0), (-1,-1), 4),
        ]))
        story.append(t_events)
    else:
        story.append(Paragraph("No operational lifecycle events recorded in database for this journey.", styles['ReportBody']))

    story.append(Spacer(1, 4 * mm))

    # ─────────────────────────────────────────────────────────────
    # SECTION 5: INCIDENTS AND SAFETY OBSERVATIONS
    # ─────────────────────────────────────────────────────────────
    story.append(Paragraph("5. OPERATIONAL EXCEPTIONS & SAFETY INCIDENTS", styles['SectionHeader']))

    if not model.get('incidents') or model.get('incidents_count', 0) == 0:
        no_inc_text = (
            "<b>No exceptions recorded in the available journey data.</b><br/>"
            "<i>Important Compliance Note: The absence of incident records does not certify absence of field disruptions "
            "or operational hazards. It signifies solely that zero incidents were entered into the incident register.</i>"
        )
        t_no_inc = Table([[Paragraph(no_inc_text, styles['NoticeBox'])]], colWidths=[USABLE_WIDTH])
        t_no_inc.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), C_OK_BG),
            ('BOX', (0,0), (-1,-1), 0.75, C_OK_BORDER),
            ('TOPPADDING', (0,0), (-1,-1), 4),
            ('BOTTOMPADDING', (0,0), (-1,-1), 4),
            ('LEFTPADDING', (0,0), (-1,-1), 6),
            ('RIGHTPADDING', (0,0), (-1,-1), 6),
        ]))
        story.append(t_no_inc)
    else:
        inc_rows = [
            [
                Paragraph("Incident ID", styles['TableHdr']),
                Paragraph("Observation (IST)", styles['TableHdr']),
                Paragraph("Rule / Violation", styles['TableHdr']),
                Paragraph("Severity", styles['TableHdr']),
                Paragraph("Handling", styles['TableHdr']),
                Paragraph("Details / Resolution", styles['TableHdr'])
            ]
        ]
        for inc in model.get('incidents', []):
            inc_rows.append([
                Paragraph(xml_escape(str(inc.get('id', ''))), styles['TableMono']),
                Paragraph(xml_escape(str(inc.get('observation_time_ist', ''))), styles['TableMono']),
                Paragraph(f"{xml_escape(str(inc.get('rule_type', '')))}<br/><font color='#6B7F95'>{xml_escape(str(inc.get('violation_type', '')))}</font>", styles['TableText']),
                Paragraph(xml_escape(str(inc.get('severity', 'MEDIUM'))), styles['TableTextBold']),
                Paragraph(f"<b>{xml_escape(str(inc.get('handling_state', '')))}</b>", styles['TableTextBold']),
                Paragraph(f"{xml_escape(str(inc.get('message', '')))}<br/><font color='#15803D'>{xml_escape(str(inc.get('resolution_summary', '')))}</font>", styles['TableText'])
            ])
        t_inc = Table(inc_rows, colWidths=[22*mm, 32*mm, 34*mm, 18*mm, 18*mm, 50*mm], repeatRows=1)
        t_inc.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), C_PANEL_FILL),
            ('BOX', (0,0), (-1,-1), 0.75, C_RULES),
            ('INNERGRID', (0,0), (-1,-1), 0.5, C_RULES),
            ('TOPPADDING', (0,0), (-1,-1), 2.5),
            ('BOTTOMPADDING', (0,0), (-1,-1), 2.5),
            ('LEFTPADDING', (0,0), (-1,-1), 4),
            ('RIGHTPADDING', (0,0), (-1,-1), 4),
        ]))
        story.append(t_inc)

    story.append(Spacer(1, 4 * mm))

    # ─────────────────────────────────────────────────────────────
    # SECTION 6: ELEVATION PROFILE
    # ─────────────────────────────────────────────────────────────
    story.append(Paragraph("6. ELEVATION PROFILE", styles['SectionHeader']))
    elev_text = (
        "<b>Elevation data unavailable for this route.</b><br/>"
        "<font color='#6B7F95'>Route elevation samples were not computed or stored for this corridor record.</font>"
    )
    t_elev = Table([[Paragraph(elev_text, styles['NoticeBox'])]], colWidths=[USABLE_WIDTH])
    t_elev.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), C_PANEL_FILL),
        ('BOX', (0,0), (-1,-1), 0.75, C_RULES),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(t_elev)
    story.append(Spacer(1, 4 * mm))

    # ─────────────────────────────────────────────────────────────
    # SECTION 7: EVIDENCE PROVENANCE & TECHNICAL AUDIT DISCLOSURES
    # ─────────────────────────────────────────────────────────────
    sec7_elements = []
    sec7_elements.append(Paragraph("7. EVIDENCE PROVENANCE & TECHNICAL AUDIT DISCLOSURES", styles['SectionHeader']))

    disclosures = [
        ("1. GPS Telemetry Status", "No live GPS telemetry recorded. Real-time satellite coordinates and dynamic breadcrumb tracks were not captured."),
        ("2. Actual Travelled Route Verification", "Not verified without recorded GPS tracking coordinates or waypoint transponder sweeps."),
        ("3. In-Transit Fuel Consumption", "Actual measured in-transit fuel burn is unavailable. Reported values are deterministic simulations based on catalog ratings."),
        ("4. Checkpoint Passage Logs", "Based solely on manual operator-logged incidents and status events; missing automated transponder sweeps remain unverified."),
        ("5. Timing & Event Derivations", "Planned departure/ETA are pre-mission calculations; actual timestamps represent server-side event creation times converted to IST."),
        ("6. Debrief Legal & Operational Integrity", "Synthesizes persisted database records for logistics decision-support. Not an official operational military certification.")
    ]
    disc_table_data = [
        [Paragraph("Operational Dimension", styles['TableHdr']), Paragraph("Data Limitation & Verification Boundary", styles['TableHdr'])]
    ]
    for title, desc in disclosures:
        disc_table_data.append([
            Paragraph(f"<b>{xml_escape(title)}</b>", styles['TableTextBold']),
            Paragraph(xml_escape(desc), styles['TableText'])
        ])
    t_disclosures = Table(disc_table_data, colWidths=[52*mm, 122*mm])
    t_disclosures.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), C_PANEL_FILL),
        ('BOX', (0,0), (-1,-1), 0.75, C_RULES),
        ('INNERGRID', (0,0), (-1,-1), 0.5, C_RULES),
        ('TOPPADDING', (0,0), (-1,-1), 2.5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2.5),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    sec7_elements.append(t_disclosures)
    sec7_elements.append(Spacer(1, 3 * mm))

    # Final Notice
    final_disc_text = (
        "<b>SYSTEM NOTICE:</b> VAYU ORBIT Convoy Movement Planning & Logistics Decision Support System — "
        "Confidential Prototype Debrief Report. Generated from verified database records."
    )
    t_fin_disc = Table([[Paragraph(final_disc_text, styles['DisclaimerText'])]], colWidths=[USABLE_WIDTH])
    t_fin_disc.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), C_PANEL_FILL),
        ('BOX', (0,0), (-1,-1), 0.5, C_RULES),
        ('TOPPADDING', (0,0), (-1,-1), 3.5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3.5),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    sec7_elements.append(t_fin_disc)

    story.append(KeepTogether(sec7_elements))

    # ─────────────────────────────────────────────────────────────
    # BUILD DOCUMENT
    # ─────────────────────────────────────────────────────────────
    doc.title = f"VAYU ORBIT — Convoy Mission Debrief ({model.get('journey_id', '')})"
    doc.author = "VAYU ORBIT Decision Support System"
    doc.subject = "Military Logistics Decision Support Mission Debrief"

    def canvas_factory(*args, **kwargs):
        c = NumberedCanvas(*args, **kwargs)
        c._report_meta = {
            "journey_id": model.get("journey_id", ""),
            "generated_at_ist": model.get("generated_at_ist", "")
        }
        c._logo_path = logo_path
        return c

    doc.build(story, canvasmaker=canvas_factory)
    return buf.getvalue()
