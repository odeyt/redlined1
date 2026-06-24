from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import inch

OUT = r"C:\Users\wallyd1\REDLINE\scripts\Test_Expired_Trial_Gate.pdf"

doc = SimpleDocTemplate(OUT, pagesize=letter,
    leftMargin=0.85*inch, rightMargin=0.85*inch,
    topMargin=0.85*inch, bottomMargin=0.85*inch)

styles = getSampleStyleSheet()
RED    = colors.HexColor('#cc0000')
DARK   = colors.HexColor('#111111')
MUTED  = colors.HexColor('#555555')
GREEN  = colors.HexColor('#1a7a1a')
BGRED  = colors.HexColor('#fff0f0')
BGGREEN= colors.HexColor('#f0fff4')
BGGRAY = colors.HexColor('#f5f5f5')

title_style = ParagraphStyle('T', parent=styles['Title'],
    textColor=RED, fontSize=20, spaceAfter=4, leading=24)
sub_style   = ParagraphStyle('S', parent=styles['Normal'],
    textColor=MUTED, fontSize=10, spaceAfter=16)
h2_style    = ParagraphStyle('H2', parent=styles['Heading2'],
    textColor=DARK, fontSize=13, spaceBefore=18, spaceAfter=6,
    borderPad=0, leading=16)
body_style  = ParagraphStyle('B', parent=styles['Normal'],
    textColor=DARK, fontSize=10, leading=15, spaceAfter=5)
code_style  = ParagraphStyle('C', parent=styles['Normal'],
    fontName='Courier', fontSize=8.5, textColor=colors.HexColor('#222'),
    backColor=BGGRAY, borderPad=6, leading=13, spaceAfter=6)
check_style = ParagraphStyle('CK', parent=styles['Normal'],
    fontSize=10, leading=17, textColor=DARK)
note_style  = ParagraphStyle('N', parent=styles['Normal'],
    fontSize=9, textColor=MUTED, leading=13)

story = []

# ── Header ──────────────────────────────────────────────────────
story.append(Paragraph("Expired Trial Plan Gate", title_style))
story.append(Paragraph("Test Procedure", ParagraphStyle('TS', parent=title_style, fontSize=15, textColor=DARK, spaceAfter=2)))
story.append(Paragraph("Version 1.0 &nbsp;|&nbsp; Date: 2026-06-17 &nbsp;|&nbsp; Product: Redlined1", sub_style))
story.append(HRFlowable(width="100%", thickness=2, color=RED, spaceAfter=14))

# ── Objective ───────────────────────────────────────────────────
story.append(Paragraph("Objective", h2_style))
story.append(Paragraph(
    "Verify that after a 7-day trial expires the plan gate locks all modules except "
    "<b>Dashboard</b>, <b>Settings</b>, and <b>Plans &amp; Gates</b>. "
    "Confirm that an active trial account still has unrestricted full access.",
    body_style))

# ── Pre-flight ──────────────────────────────────────────────────
story.append(Paragraph("Pre-Flight Checklist", h2_style))
pre = [
    "You have access to the Supabase Dashboard SQL Editor",
    "You have a test email address ready (e.g. testexpired@redlined1.com)",
    "redlined1.com is deployed and accessible in a browser",
    "You are NOT logged in as your main owner account during these tests",
]
for item in pre:
    story.append(Paragraph(f"&#9744; &nbsp; {item}", check_style))
story.append(Spacer(1, 8))

# ── Step 1 ──────────────────────────────────────────────────────
story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#dddddd'), spaceAfter=0))
story.append(Paragraph("Step 1 — Create the Test Account (one-time setup)", h2_style))
story.append(Paragraph("<b>1a.</b> Go to Supabase Dashboard → Authentication → Users → <b>Invite User</b>", body_style))
story.append(Paragraph("<b>1b.</b> Enter email: <font name='Courier'>testexpired@redlined1.com</font> and a test password", body_style))
story.append(Paragraph("<b>1c.</b> Confirm the profile row exists — run in SQL Editor:", body_style))
story.append(Paragraph(
    "SELECT id, plan, trial_ends_at FROM public.profiles\n"
    "WHERE id = (SELECT id FROM auth.users\n"
    "            WHERE email = 'testexpired@redlined1.com');",
    code_style))
story.append(Paragraph("<b>Expected:</b> row exists with plan = 'trial' and trial_ends_at ~7 days from signup.", note_style))

# ── Step 2 ──────────────────────────────────────────────────────
story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#dddddd'), spaceAfter=0))
story.append(Paragraph("Step 2 — Expire the Trial", h2_style))
story.append(Paragraph("Run this SQL in Supabase → SQL Editor:", body_style))
story.append(Paragraph(
    "UPDATE public.profiles\n"
    "SET plan = 'trial',\n"
    "    trial_ends_at = now() - INTERVAL '1 day'\n"
    "WHERE id = (\n"
    "  SELECT id FROM auth.users\n"
    "  WHERE email = 'testexpired@redlined1.com'\n"
    ");",
    code_style))
story.append(Paragraph("Then verify the change:", body_style))
story.append(Paragraph(
    "SELECT u.email, p.plan, p.trial_ends_at\n"
    "FROM auth.users u\n"
    "JOIN public.profiles p ON p.id = u.id\n"
    "WHERE u.email = 'testexpired@redlined1.com';",
    code_style))
story.append(Paragraph("<b>Expected:</b> trial_ends_at is in the past (yesterday).", note_style))

# ── Step 3 ──────────────────────────────────────────────────────
story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#dddddd'), spaceAfter=0))
story.append(Paragraph("Step 3 — Log In as the Expired Test Account", h2_style))
story.append(Paragraph("<b>3a.</b> Open a <b>private / incognito</b> browser window", body_style))
story.append(Paragraph("<b>3b.</b> Navigate to <font name='Courier'>redlined1.com</font> → Sign In", body_style))
story.append(Paragraph("<b>3c.</b> Enter credentials for <font name='Courier'>testexpired@redlined1.com</font>", body_style))

# ── Step 4 ──────────────────────────────────────────────────────
story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#dddddd'), spaceAfter=0))
story.append(Paragraph("Step 4 — Verify Module Lock-Down", h2_style))
story.append(Paragraph("Click every sidebar item and mark the result below.", body_style))
story.append(Spacer(1, 6))

# Accessible table
story.append(Paragraph("SHOULD BE ACCESSIBLE (3 modules):", ParagraphStyle('GL', parent=body_style, textColor=GREEN, fontName='Helvetica-Bold', spaceAfter=4)))
ok_rows = [
    ["Module", "Expected Result", "Pass?"],
    ["Dashboard",    "Opens normally — data is visible",        "[ ]"],
    ["Settings",     "Opens normally — can edit branding",      "[ ]"],
    ["Plans & Gates","Opens upgrade / subscription page",       "[ ]"],
]
ok_table = Table(ok_rows, colWidths=[1.7*inch, 3.8*inch, 0.7*inch])
ok_table.setStyle(TableStyle([
    ('BACKGROUND',  (0,0), (-1,0), GREEN),
    ('TEXTCOLOR',   (0,0), (-1,0), colors.white),
    ('FONTNAME',    (0,0), (-1,0), 'Helvetica-Bold'),
    ('FONTSIZE',    (0,0), (-1,-1), 9),
    ('ROWBACKGROUNDS', (0,1), (-1,-1), [BGGREEN, colors.white]),
    ('GRID',        (0,0), (-1,-1), 0.5, colors.HexColor('#cccccc')),
    ('PADDING',     (0,0), (-1,-1), 5),
    ('ALIGN',       (2,0), (2,-1), 'CENTER'),
]))
story.append(ok_table)
story.append(Spacer(1, 10))

# Locked table
story.append(Paragraph("SHOULD BE LOCKED (21 modules — expect upgrade prompt):", ParagraphStyle('RL', parent=body_style, textColor=RED, fontName='Helvetica-Bold', spaceAfter=4)))
locked = [
    "Customers", "Vehicles", "Appointments", "Job Cards", "Time Tracking",
    "Maintenance Schedules", "Inspections", "Estimates", "Repair Orders",
    "Technicians", "Parts", "Invoicing", "Payments", "Communication",
    "VIN Decode", "DTC Lookup", "Diagnostics", "AI Copilot",
    "Reports", "Labor Guide", "Login & Roles",
]
lock_rows = [["Module", "Expected Result", "Pass?"]]
for m in locked:
    lock_rows.append([m, "Shows upgrade gate / prompt", "[ ]"])
lock_table = Table(lock_rows, colWidths=[1.7*inch, 3.8*inch, 0.7*inch])
lock_table.setStyle(TableStyle([
    ('BACKGROUND',  (0,0), (-1,0), RED),
    ('TEXTCOLOR',   (0,0), (-1,0), colors.white),
    ('FONTNAME',    (0,0), (-1,0), 'Helvetica-Bold'),
    ('FONTSIZE',    (0,0), (-1,-1), 9),
    ('ROWBACKGROUNDS', (0,1), (-1,-1), [BGRED, colors.white]),
    ('GRID',        (0,0), (-1,-1), 0.5, colors.HexColor('#cccccc')),
    ('PADDING',     (0,0), (-1,-1), 5),
    ('ALIGN',       (2,0), (2,-1), 'CENTER'),
]))
story.append(lock_table)
story.append(Spacer(1, 6))
story.append(Paragraph("<b>Pass criteria:</b> All 21 modules show gate/upgrade prompt. Zero modules bypass the lock.", note_style))

# ── Step 5 ──────────────────────────────────────────────────────
story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#dddddd'), spaceAfter=0))
story.append(Paragraph("Step 5 — Verify Active Trial Still Has Full Access", h2_style))
story.append(Paragraph("<b>5a.</b> Open a second incognito window", body_style))
story.append(Paragraph("<b>5b.</b> Log in as your main owner account (active trial or pro)", body_style))
story.append(Paragraph("<b>5c.</b> Click every sidebar module — all should open normally", body_style))
story.append(Paragraph("<b>Pass criteria:</b> No lockouts on the active account. Every module accessible.", note_style))

# ── Step 6 ──────────────────────────────────────────────────────
story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#dddddd'), spaceAfter=0))
story.append(Paragraph("Step 6 — Reset Test Account (Cleanup)", h2_style))
story.append(Paragraph("Restore the test account to an active trial for future test runs:", body_style))
story.append(Paragraph(
    "UPDATE public.profiles\n"
    "SET trial_ends_at = now() + INTERVAL '7 days'\n"
    "WHERE id = (\n"
    "  SELECT id FROM auth.users\n"
    "  WHERE email = 'testexpired@redlined1.com'\n"
    ");",
    code_style))

# ── Sign-off ────────────────────────────────────────────────────
story.append(HRFlowable(width="100%", thickness=2, color=RED, spaceBefore=18, spaceAfter=12))
story.append(Paragraph("Pass / Fail Sign-Off", h2_style))
signoff = [
    ["Tester Name:", "___________________________________", "Date Tested:", "________________"],
    ["Result:",      "[ ] PASS     [ ] FAIL",              "",              ""],
    ["Notes:",       "___________________________________________________________________", "", ""],
]
st = Table(signoff, colWidths=[1.1*inch, 2.8*inch, 1.1*inch, 1.2*inch])
st.setStyle(TableStyle([
    ('FONTSIZE',  (0,0), (-1,-1), 10),
    ('FONTNAME',  (0,0), (0,-1), 'Helvetica-Bold'),
    ('FONTNAME',  (2,0), (2,-1), 'Helvetica-Bold'),
    ('PADDING',   (0,0), (-1,-1), 5),
    ('VALIGN',    (0,0), (-1,-1), 'MIDDLE'),
]))
story.append(st)
story.append(Spacer(1, 8))
story.append(Paragraph(
    "If FAIL — document which modules were incorrectly accessible and file a bug report.",
    ParagraphStyle('warn', parent=note_style, textColor=RED)))

doc.build(story)
print(f"PDF written to {OUT}")
