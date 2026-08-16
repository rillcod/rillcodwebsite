import base64
import os
import subprocess
from pypdf import PdfReader

# Paths
desktop_dir = r"C:\Users\USER\Desktop"
scratch_dir = r"C:\Users\USER\.gemini\antigravity-ide\scratch"
logo_path = os.path.join(desktop_dir, "Logo 03 PNG.png")
sig_path = os.path.join(desktop_dir, "signature (1).png")

# Load images to Base64
with open(logo_path, "rb") as f:
    logo_b64 = base64.b64encode(f.read()).decode("utf-8")
logo_data_url = f"data:image/png;base64,{logo_b64}"

with open(sig_path, "rb") as f:
    sig_b64 = base64.b64encode(f.read()).decode("utf-8")
sig_data_url = f"data:image/png;base64,{sig_b64}"

html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Memorandum of Understanding (MoU) - Rillcod Technologies & Bay-Flowers International School (100% Equal 4-Page Fill)</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Outfit:wght@500;600;700;800&display=swap');

@page {{
    size: A4 portrait;
    margin: 8mm 10mm 10mm 10mm;
}}

* {{
    box-sizing: border-box;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
}}

body {{
    font-family: 'Plus Jakarta Sans', sans-serif;
    color: #0F172A;
    background-color: #FFFFFF;
    margin: 0;
    padding: 0;
    font-size: 8.6pt;
    line-height: 1.4;
}}

h1, h2, h3, h4, h5 {{
    font-family: 'Outfit', sans-serif;
    margin-top: 0;
    margin-bottom: 4px;
    color: #0F172A;
    font-weight: 700;
}}

.page-break {{
    page-break-before: always;
}}

/* TOP BRAND HEADER */
.mou-header-eco {{
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #FFFFFF;
    color: #0F172A;
    padding: 7px 11px;
    border-radius: 6px;
    margin-bottom: 8px;
    border: 1.5px solid #CBD5E1;
    border-left: 6px solid #2563EB;
}}

.mou-header-left {{
    display: flex;
    align-items: center;
    gap: 12px;
}}

.mou-header-logo {{
    height: 40px;
}}

.mou-title-main {{
    font-size: 13pt;
    font-weight: 800;
    letter-spacing: -0.3px;
    color: #0F172A;
    line-height: 1.15;
}}

.mou-subtitle {{
    font-size: 7.8pt;
    color: #0284C7;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
}}

.mou-header-right {{
    text-align: right;
    font-size: 7.5pt;
    color: #475569;
}}

.mou-header-right strong {{
    color: #0F172A;
    font-size: 8.5pt;
}}

/* RUNNING HEADER FOR PAGES 2, 3 & 4 */
.sub-header-eco {{
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 2px solid #0F172A;
    padding-bottom: 4px;
    margin-bottom: 8px;
}}

.sub-header-logo {{
    height: 24px;
}}

.sub-header-title {{
    font-size: 7.8pt;
    font-weight: 700;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: 0.6px;
}}

/* SECTION BANNERS */
.sec-banner-eco {{
    background: #F8FAFC;
    color: #0F172A;
    padding: 5px 9px;
    border-radius: 5px;
    font-size: 9.2pt;
    font-weight: 700;
    margin-top: 6px;
    margin-bottom: 6px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border: 1px solid #E2E8F0;
    border-left: 4px solid #0F172A;
}}

.sec-banner-eco h2 {{
    font-size: 9.2pt;
    margin: 0;
    color: #0F172A;
}}

.sec-tag-eco {{
    font-size: 6.8pt;
    background: #EFF6FF;
    color: #1D4ED8;
    border: 1px solid #BFDBFE;
    padding: 2px 7px;
    border-radius: 6px;
    font-weight: 700;
    text-transform: uppercase;
}}

/* GRIDS & CARDS */
.grid-2 {{
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
}}

.grid-4 {{
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
}}

.compact-card {{
    background: #FFFFFF;
    border: 1px solid #CBD5E1;
    border-radius: 6px;
    padding: 8px 10px;
    margin-bottom: 6px;
    break-inside: avoid;
}}

.card-blue {{ border-left: 4px solid #2563EB; }}
.card-teal {{ border-left: 4px solid #06B6D4; }}
.card-green {{ border-left: 4px solid #10B981; }}
.card-amber {{ border-left: 4px solid #F59E0B; }}
.card-purple {{ border-left: 4px solid #8B5CF6; }}

.compact-card-title {{
    font-weight: 700;
    font-size: 8.8pt;
    color: #0F172A;
    margin-bottom: 4px;
    display: flex;
    justify-content: space-between;
    align-items: center;
}}

.badge-micro {{
    font-size: 6.8pt;
    padding: 2px 6px;
    border-radius: 4px;
    font-weight: 700;
    text-transform: uppercase;
}}

.badge-blue {{ background: #EFF6FF; color: #1D4ED8; border: 1px solid #BFDBFE; }}
.badge-amber {{ background: #FFFBEB; color: #B45309; border: 1px solid #FDE68A; }}
.badge-green {{ background: #ECFDF5; color: #047857; border: 1px solid #A7F3D0; }}

/* ALERT BOX */
.alert-compact {{
    padding: 6px 9px;
    border-radius: 5px;
    margin-top: 5px;
    margin-bottom: 6px;
    font-size: 7.8pt;
    background: #FFFBEB;
    border: 1px solid #FDE68A;
    border-left: 4px solid #F59E0B;
    color: #92400E;
}}

/* TABLES */
table.dense-table {{
    width: 100%;
    border-collapse: collapse;
    margin-top: 6px;
    margin-bottom: 8px;
    font-size: 8pt;
}}

table.dense-table th {{
    background: #F1F5F9;
    color: #0F172A;
    padding: 6px 8px;
    text-align: left;
    font-weight: 700;
    border: 1px solid #CBD5E1;
}}

table.dense-table td {{
    padding: 6px 8px;
    border: 1px solid #CBD5E1;
    color: #1E293B;
}}

table.dense-table tr:nth-child(even) {{
    background-color: #F8FAFC;
}}

table.dense-table tr.highlight-row {{
    background-color: #EFF6FF;
    font-weight: 700;
    color: #1E40AF;
}}

/* YEAR CURRICULUM BOXES */
.year-card-dense {{
    border: 1px solid #CBD5E1;
    border-radius: 5px;
    margin-bottom: 8px;
    background: #FFFFFF;
    break-inside: avoid;
}}

.year-head-dense {{
    background: #F8FAFC;
    color: #0F172A;
    padding: 5px 10px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 8.5pt;
    font-weight: 700;
    border-bottom: 1px solid #E2E8F0;
}}

.year-tag-dense {{
    background: #0284C7;
    color: #FFFFFF;
    font-weight: 800;
    font-size: 7pt;
    padding: 2px 6px;
    border-radius: 4px;
}}

.terms-row {{
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    padding: 6px 8px;
    background: #FFFFFF;
}}

.term-item {{
    background: #F8FAFC;
    border: 1px solid #E2E8F0;
    border-radius: 4px;
    padding: 5px 7px;
    font-size: 7.8pt;
    line-height: 1.35;
}}

.term-t {{
    font-weight: 700;
    color: #2563EB;
    font-size: 7.2pt;
    text-transform: uppercase;
    margin-bottom: 2px;
}}

.year-foot-dense {{
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    padding: 5px 8px;
    background: #F1F5F9;
    border-top: 1px solid #E2E8F0;
    font-size: 7.8pt;
}}

.capstone-lbl {{
    font-weight: 800;
    color: #1E40AF;
    font-size: 7pt;
    text-transform: uppercase;
}}

.portfolio-lbl {{
    font-weight: 800;
    color: #047857;
    font-size: 7pt;
    text-transform: uppercase;
}}

/* CONTACT & SIGNATURE FOOTER */
.contact-compact-eco {{
    background: #FFFFFF;
    color: #0F172A;
    border: 1.5px solid #0F172A;
    border-radius: 5px;
    padding: 8px 12px;
    margin-top: 8px;
    break-inside: avoid;
}}

.contact-compact-grid {{
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    font-size: 7.8pt;
    color: #334155;
}}

.contact-compact-grid strong {{
    color: #0F172A;
}}

/* DUAL SIGNATURE BOX FOR MOU */
.mou-sig-grid {{
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
    margin-top: 8px;
    padding-top: 6px;
    border-top: 1.5px solid #CBD5E1;
    break-inside: avoid;
}}

.sig-box {{
    background: #F8FAFC;
    border: 1px solid #CBD5E1;
    border-radius: 5px;
    padding: 8px 10px;
}}

.sig-title {{
    font-size: 8.2pt;
    font-weight: 800;
    color: #0F172A;
    margin-bottom: 4px;
    text-transform: uppercase;
}}

.sig-img-sm {{
    height: 36px;
    margin-top: 3px;
    margin-bottom: 3px;
}}

.sig-line {{
    border-bottom: 1px dashed #94A3B8;
    height: 30px;
    margin-bottom: 3px;
}}

</style>
</head>
<body>

<!-- ================= PAGE 1 ================= -->
<div class="mou-header-eco">
    <div class="mou-header-left">
        <img src="{logo_data_url}" class="mou-header-logo" alt="Rillcod Logo">
        <div>
            <div class="mou-subtitle">Official Legal Agreement & Strategic Partnership</div>
            <div class="mou-title-main">MEMORANDUM OF UNDERSTANDING (MoU)</div>
        </div>
    </div>
    <div class="mou-header-right">
        <strong>Session 2026 / 2027</strong><br>
        Coding & Robotics Partnership<br>
        Benin City, Edo State
    </div>
</div>

<div class="sec-banner-eco">
    <h2>1.0 Preamble & Parties to the Agreement</h2>
    <span class="sec-tag-eco">LEGAL BINDING</span>
</div>

<p style="margin-top:0; margin-bottom:6px; text-align:justify;">
    THIS MEMORANDUM OF UNDERSTANDING (MoU) is made and entered into this 11th day of August 2026, by and between:
</p>

<div class="grid-2">
    <div class="compact-card card-blue">
        <div class="compact-card-title">
            <span>PARTY A: RILLCOD TECHNOLOGIES</span>
            <span class="badge-micro badge-blue">STEM Provider</span>
        </div>
        <div style="font-size:8pt; color:#334155; line-height:1.35;">
            <strong>Rillcod Technologies</strong> (subsidiary of Rillcod Technologies), No. 26 Ogiesoba Avenue, Off Airport Road, Benin City, Edo State (over 10 years STEM experience).<br>
            <em>Represented by Director of Educational Technology.</em>
        </div>
    </div>

    <div class="compact-card card-teal">
        <div class="compact-card-title">
            <span>PARTY B: BAY-FLOWERS INT'L SCHOOL</span>
            <span class="badge-micro badge-teal">Host School</span>
        </div>
        <div style="font-size:8pt; color:#334155; line-height:1.35;">
            <strong>Bay-Flowers International School</strong>, located in Benin City, Edo State, committed to academic excellence and modern skill-based learning.<br>
            <em>Represented by School Management & Proprietorship.</em>
        </div>
    </div>
</div>

<div class="sec-banner-eco">
    <h2>2.0 Executive Summary & Strategic Market Rationale</h2>
    <span class="sec-tag-eco">VISION & PURPOSE</span>
</div>

<p style="margin-top:0; margin-bottom:6px; text-align:justify;">
    <strong>Rillcod Technologies</strong> provides future-ready, skill-based education in coding, robotics, AI, and digital technology for schools in Nigeria. With over a decade of STEM experience, our trained facilitators deliver hands-on learning that inspires creativity, innovation, and academic excellence. 
    This partnership aims to introduce <strong>Bay-Flowers International School</strong> students to practical coding and robotics, positioning the school as a premier STEM-focused institution in Benin City.
</p>

<div class="grid-2">
    <div class="compact-card card-amber" style="margin-bottom:0;">
        <div class="compact-card-title">
            <span>Why This Partnership Matters</span>
            <span class="badge-micro badge-amber">STEM Imperative</span>
        </div>
        <div style="font-size:7.8pt; color:#334155; line-height:1.35;">
            Early exposure to STEM skills builds creative confidence, analytical thinking, and logical problem-solving, giving Bay-Flowers International School a distinct competitive edge over peer schools in Benin City.
        </div>
    </div>

    <div class="compact-card card-blue" style="margin-bottom:0;">
        <div class="compact-card-title">
            <span>Strategic Market Rationale</span>
            <span class="badge-micro badge-blue">Market Opportunity</span>
        </div>
        <div style="font-size:7.8pt; color:#334155; line-height:1.35;">
            • <strong>₦15.7T Digital Economy:</strong> Projected West African market value by 2030.<br>
            • <strong>85% Tech Deficit:</strong> High demand for skilled AI engineers in Nigeria.<br>
            • <strong>PR & Enrollment:</strong> Position Bay-Flowers as a tech pioneer.
        </div>
    </div>
</div>

<div class="alert-compact">
    <strong>THE COST OF WAITING:</strong> Every delayed term means lost revenue and losing tech-conscious parents in Benin City to competitor schools offering AI and robotics education.
</div>

<div class="sec-banner-eco">
    <h2>3.0 12-Year Learning Progression Architecture</h2>
    <span class="sec-tag-eco">PATHWAY OVERVIEW</span>
</div>

<div class="grid-4" style="margin-bottom:6px;">
    <div class="compact-card card-blue" style="margin-bottom:0; padding:5px 7px;">
        <strong style="color:#2563EB; font-size:7.2pt;">LEVEL 1: LOWER PRIMARY</strong>
        <div style="font-weight:700; color:#0F172A; font-size:7pt;">Basic 1–4 (Ages 6–10)</div>
        <div style="font-size:6.5pt; color:#475569;">Scratch 3.0, AI voice commands, micro:bit sensors & smart toys.</div>
    </div>
    <div class="compact-card card-teal" style="margin-bottom:0; padding:5px 7px;">
        <strong style="color:#0EA5E9; font-size:7.2pt;">LEVEL 2: UPPER PRIMARY</strong>
        <div style="font-weight:700; color:#0F172A; font-size:7pt;">Basic 5–6 (Ages 10–12)</div>
        <div style="font-size:6.5pt; color:#475569;">Python (Thonny IDE), Machine Learning intro, IoT automation.</div>
    </div>
    <div class="compact-card card-green" style="margin-bottom:0; padding:5px 7px;">
        <strong style="color:#10B981; font-size:7.2pt;">LEVEL 3: JUNIOR SECONDARY</strong>
        <div style="font-weight:700; color:#0F172A; font-size:7pt;">JSS 1–3 (Ages 12–15)</div>
        <div style="font-size:6.5pt; color:#475569;">HTML5/CSS3, JS ES6+, ML5.js & Cloud AI API dashboards.</div>
    </div>
    <div class="compact-card card-purple" style="margin-bottom:0; padding:5px 7px;">
        <strong style="color:#8B5CF6; font-size:7.2pt;">LEVEL 4: SENIOR SECONDARY</strong>
        <div style="font-weight:700; color:#0F172A; font-size:7pt;">SS 1–3 (Ages 15–18)</div>
        <div style="font-size:6.5pt; color:#475569;">Figma UI/UX, Flutter Mobile Dev, Mobile ML & Startup.</div>
    </div>
</div>

<div class="sec-banner-eco">
    <h2>4.0 Engagement & Partnership Focus Options</h2>
    <span class="sec-tag-eco">PROGRAM MODELS</span>
</div>

<div class="grid-2">
    <div class="compact-card card-blue" style="margin-bottom:0;">
        <div class="compact-card-title">
            <span>OPTION A: EXTRACURRICULAR CLUB</span>
            <span class="badge-micro badge-blue">₦30,000 / Term</span>
        </div>
        <div style="font-size:8pt; color:#334155; line-height:1.35;">
            • <strong>Frequency:</strong> 1 session per week (min 2 hours duration).<br>
            • <strong>Target Classes:</strong> Basic 1 through SS 2.<br>
            • <strong>Focus:</strong> Hands-on programming, robotics & digital creativity.<br>
            • <strong>Fee Structure:</strong> Parents pay ₦30,000 per student per term.
        </div>
    </div>

    <div class="compact-card card-green" style="margin-bottom:0;">
        <div class="compact-card-title"><span>OPTION B: CURRICULUM INTEGRATION</span><span class="badge-micro badge-green">Full Integration</span></div>
        <div style="font-size:8pt; color:#334155; line-height:1.35;">
            • <strong>Frequency:</strong> Timetabled weekly (1 or 2 classes/week).<br>
            • <strong>Target Classes:</strong> All classes from Primary to Secondary.<br>
            • <strong>Focus:</strong> AI, Web Dev, Python, PictoBlox, Robotics & Logic.<br>
            • <strong>Fee Structure:</strong> ₦10,000 (1 class/wk) OR ₦15,000 (2 classes/wk).
        </div>
    </div>
</div>


<!-- ================= PAGE 2 ================= -->
<div class="page-break"></div>
<div class="sub-header-eco">
    <img src="{logo_data_url}" class="sub-header-logo" alt="Rillcod Logo">
    <div class="sub-header-title">MoU & Strategic Partnership | Primary School AI & Robotics Syllabus (Basic 1–6)</div>
</div>

<div class="sec-banner-eco">
    <h2>5.0 Primary School AI & Robotics Pathway (Basic 1 to Basic 6)</h2>
    <span class="sec-tag-eco">PRIMARY SYLLABUS</span>
</div>

<div class="grid-1" style="display:flex; flex-direction:column; gap:8px;">
    <!-- Basic 1 -->
    <div class="year-card-dense">
        <div class="year-head-dense">
            <span>YEAR 1 (BASIC 1): DIGITAL DISCOVERY + AI AWARENESS</span>
            <span class="year-tag-dense">BASIC 1</span>
        </div>
        <div class="terms-row">
            <div class="term-item"><div class="term-t">1st Term</div>Computer hardware basics, Scratch 3.0 UI & smart concepts.</div>
            <div class="term-item"><div class="term-t">2nd Term</div>Animations, sprite interaction, AI voice & toy control.</div>
            <div class="term-item"><div class="term-t">3rd Term</div>Storytelling games, intelligent responses & pattern games.</div>
        </div>
        <div class="year-foot-dense">
            <div><span class="capstone-lbl">Capstone:</span> Voice-Controlled Storytelling Robot.</div>
            <div><span class="portfolio-lbl">Portfolio:</span> 3 Scratch Games + 1 AI Story.</div>
        </div>
    </div>

    <!-- Basic 2 -->
    <div class="year-card-dense">
        <div class="year-head-dense">
            <span>YEAR 2 (BASIC 2): CREATIVE PROGRAMMING + SMART TOYS</span>
            <span class="year-tag-dense">BASIC 2</span>
        </div>
        <div class="terms-row">
            <div class="term-item"><div class="term-t">1st Term</div>Advanced Scratch animations, touch sensors & score loops.</div>
            <div class="term-item"><div class="term-t">2nd Term</div>Educational math games with adaptive difficulty logic.</div>
            <div class="term-item"><div class="term-t">3rd Term</div>Interactive presentations & smart response systems.</div>
        </div>
        <div class="year-foot-dense">
            <div><span class="capstone-lbl">Capstone:</span> Smart Classroom Helper Robot.</div>
            <div><span class="portfolio-lbl">Portfolio:</span> 3 Math Games + 1 Smart Toy.</div>
        </div>
    </div>

    <!-- Basic 3 -->
    <div class="year-card-dense">
        <div class="year-head-dense">
            <span>YEAR 3 (BASIC 3): LOGICAL THINKING + ROBOTICS BASICS</span>
            <span class="year-tag-dense">BASIC 3</span>
        </div>
        <div class="terms-row">
            <div class="term-item"><div class="term-t">1st Term</div>Scratch logic with micro:bit LED displays & tilt sensors.</div>
            <div class="term-item"><div class="term-t">2nd Term</div>Math programming, velocity & robotic wheel control.</div>
            <div class="term-item"><div class="term-t">3rd Term</div>Arcade games with intelligent NPC decision trees.</div>
        </div>
        <div class="year-foot-dense">
            <div><span class="capstone-lbl">Capstone:</span> Automated Plant Watering System.</div>
            <div><span class="portfolio-lbl">Portfolio:</span> 3 Scratch Apps + 1 Agri System.</div>
        </div>
    </div>

    <!-- Basic 4 -->
    <div class="year-card-dense">
        <div class="year-head-dense">
            <span>YEAR 4 (BASIC 4): SCRATCH EXPERTISE + MACHINE LEARNING</span>
            <span class="year-tag-dense">BASIC 4</span>
        </div>
        <div class="terms-row">
            <div class="term-item"><div class="term-t">1st Term</div>Game physics, cloning, custom blocks & ML intro.</div>
            <div class="term-item"><div class="term-t">2nd Term</div>Teachable Machine chatbot & image recognition.</div>
            <div class="term-item"><div class="term-t">3rd Term</div>Collaborative team projects using cloud AI vision.</div>
        </div>
        <div class="year-foot-dense">
            <div><span class="capstone-lbl">Capstone:</span> Classroom Facial Recognition Security System.</div>
            <div><span class="portfolio-lbl">Portfolio:</span> 3 Projects + 1 AI Security App.</div>
        </div>
    </div>

    <!-- Basic 5 -->
    <div class="year-card-dense">
        <div class="year-head-dense">
            <span>YEAR 5 (BASIC 5): PYTHON PROGRAMMING + AI FUNDAMENTALS</span>
            <span class="year-tag-dense">BASIC 5</span>
        </div>
        <div class="terms-row">
            <div class="term-item"><div class="term-t">1st Term</div>Python Thonny IDE, variables, logic & math libraries.</div>
            <div class="term-item"><div class="term-t">2nd Term</div>Data collection, lists & basic statistical machine learning.</div>
            <div class="term-item"><div class="term-t">3rd Term</div>Intelligent programs with pattern decision logic.</div>
        </div>
        <div class="year-foot-dense">
            <div><span class="capstone-lbl">Capstone:</span> Smart Traffic Light Density Controller.</div>
            <div><span class="portfolio-lbl">Portfolio:</span> 3 Python Tools + 1 Traffic App.</div>
        </div>
    </div>

    <!-- Basic 6 -->
    <div class="year-card-dense">
        <div class="year-head-dense">
            <span>YEAR 6 (BASIC 6): PYTHON + ROBOTICS IOT INTEGRATION</span>
            <span class="year-tag-dense">BASIC 6</span>
        </div>
        <div class="terms-row">
            <div class="term-item"><div class="term-t">1st Term</div>Python functions, modules, file IO & robot motor control.</div>
            <div class="term-item"><div class="term-t">2nd Term</div>Ultrasonic/IR sensors, automated obstacle navigation.</div>
            <div class="term-item"><div class="term-t">3rd Term</div>Utility software with AI algorithms & database storage.</div>
        </div>
        <div class="year-foot-dense">
            <div><span class="capstone-lbl">Capstone:</span> Automated Library RFID Tracking System.</div>
            <div><span class="portfolio-lbl">Portfolio:</span> 3 Python Apps + 1 Library System.</div>
        </div>
    </div>
</div>


<!-- ================= PAGE 3 ================= -->
<div class="page-break"></div>
<div class="sub-header-eco">
    <img src="{logo_data_url}" class="sub-header-logo" alt="Rillcod Logo">
    <div class="sub-header-title">MoU & Strategic Partnership | Secondary School AI & Robotics Syllabus (JSS 1–SS 3)</div>
</div>

<div class="sec-banner-eco">
    <h2>6.0 Secondary School AI & Robotics Pathway (JSS 1 to SS 3)</h2>
    <span class="sec-tag-eco">SECONDARY SYLLABUS</span>
</div>

<div class="grid-1" style="display:flex; flex-direction:column; gap:8px;">
    <!-- JSS 1 -->
    <div class="year-card-dense">
        <div class="year-head-dense">
            <span>YEAR 7 (JSS 1): HTML5/CSS3 + SMART VOICE INTERFACES</span>
            <span class="year-tag-dense">JSS 1</span>
        </div>
        <div class="terms-row">
            <div class="term-item"><div class="term-t">1st Term</div>HTML5 structure, CSS styling, layout & AI chatbots.</div>
            <div class="term-item"><div class="term-t">2nd Term</div>Responsive design, Flexbox & hardware monitoring.</div>
            <div class="term-item"><div class="term-t">3rd Term</div>Interactive web speech API, voice & gesture controls.</div>
        </div>
        <div class="year-foot-dense">
            <div><span class="capstone-lbl">Capstone:</span> Smart Home Control Web Dashboard.</div>
            <div><span class="portfolio-lbl">Portfolio:</span> 3 Web Sites + 1 Dashboard.</div>
        </div>
    </div>

    <!-- JSS 2 -->
    <div class="year-card-dense">
        <div class="year-head-dense">
            <span>YEAR 8 (JSS 2): ADVANCED WEB + DATA VISUALIZATION</span>
            <span class="year-tag-dense">JSS 2</span>
        </div>
        <div class="terms-row">
            <div class="term-item"><div class="term-t">1st Term</div>CSS Grid, Tailwind/Bootstrap & sensor data charts.</div>
            <div class="term-item"><div class="term-t">2nd Term</div>Mobile-first UI for agricultural sensor feedback.</div>
            <div class="term-item"><div class="term-t">3rd Term</div>Asynchronous JS data fetching & AI predictions.</div>
        </div>
        <div class="year-foot-dense">
            <div><span class="capstone-lbl">Capstone:</span> Smart Agriculture Crop Prediction System.</div>
            <div><span class="portfolio-lbl">Portfolio:</span> 3 Web Apps + 1 Agri Platform.</div>
        </div>
    </div>

    <!-- JSS 3 -->
    <div class="year-card-dense">
        <div class="year-head-dense">
            <span>YEAR 9 (JSS 3): JAVASCRIPT ES6+ + CLOUD AI APIs</span>
            <span class="year-tag-dense">JSS 3</span>
        </div>
        <div class="terms-row">
            <div class="term-item"><div class="term-t">1st Term</div>Core JavaScript ES6+, DOM events & ML5.js Machine Learning.</div>
            <div class="term-item"><div class="term-t">2nd Term</div>REST API integration with OpenAI & Cloud Vision.</div>
            <div class="term-item"><div class="term-t">3rd Term</div>Dynamic web state management & predictive analytics.</div>
        </div>
        <div class="year-foot-dense">
            <div><span class="capstone-lbl">Capstone:</span> AI Academic Performance Predictor System.</div>
            <div><span class="portfolio-lbl">Portfolio:</span> 3 JS Apps + 1 AI Analytics System.</div>
        </div>
    </div>

    <!-- SS 1 -->
    <div class="year-card-dense">
        <div class="year-head-dense">
            <span>YEAR 10 (SS 1): UI/UX FOR AI + ROBOTICS DESIGN</span>
            <span class="year-tag-dense">SS 1</span>
        </div>
        <div class="terms-row">
            <div class="term-item"><div class="term-t">1st Term</div>UI design principles, wireframing, Figma for AI systems.</div>
            <div class="term-item"><div class="term-t">2nd Term</div>UX research, voice/gesture navigation & testing.</div>
            <div class="term-item"><div class="term-t">3rd Term</div>Interactive prototyping of full AI web/mobile software.</div>
        </div>
        <div class="year-foot-dense">
            <div><span class="capstone-lbl">Capstone:</span> Smart City Traffic UI Management System.</div>
            <div><span class="portfolio-lbl">Portfolio:</span> 3 Figma Designs + 1 Prototype.</div>
        </div>
    </div>

    <!-- SS 2 -->
    <div class="year-card-dense">
        <div class="year-head-dense">
            <span>YEAR 11 (SS 2): INTEGRATED FULL-STACK + IOT</span>
            <span class="year-tag-dense">SS 2</span>
        </div>
        <div class="terms-row">
            <div class="term-item"><div class="term-t">1st Term</div>Full-stack web architecture, Node.js backend & SQL/NoSQL.</div>
            <div class="term-item"><div class="term-t">2nd Term</div>IoT device programming (ESP32/Raspberry Pi) & MQTT.</div>
            <div class="term-item"><div class="term-t">3rd Term</div>Dart & Flutter cross-platform mobile development intro.</div>
        </div>
        <div class="year-foot-dense">
            <div><span class="capstone-lbl">Capstone:</span> Smart School Biometric Management System.</div>
            <div><span class="portfolio-lbl">Portfolio:</span> 3 Full-Stack Apps + 1 School System.</div>
        </div>
    </div>

    <!-- SS 3 -->
    <div class="year-card-dense">
        <div class="year-head-dense">
            <span>YEAR 12 (SS 3): MOBILE AI + TECH ENTREPRENEURSHIP</span>
            <span class="year-tag-dense">SS 3</span>
        </div>
        <div class="terms-row">
            <div class="term-item"><div class="term-t">1st Term</div>Flutter mobile apps with TensorFlow Lite ML models.</div>
            <div class="term-item"><div class="term-t">2nd Term</div>Computer Vision, Natural Language Processing & offline AI.</div>
            <div class="term-item"><div class="term-t">3rd Term</div>Monetization, App Store publishing & pitch decks.</div>
        </div>
        <div class="year-foot-dense">
            <div><span class="capstone-lbl">Capstone:</span> Commercial African Impact Startup Mobile App.</div>
            <div><span class="portfolio-lbl">Portfolio:</span> 3 Mobile Apps + 1 Commercial Product.</div>
        </div>
    </div>
</div>


<!-- ================= PAGE 4 ================= -->
<div class="page-break"></div>
<div class="sub-header-eco">
    <img src="{logo_data_url}" class="sub-header-logo" alt="Rillcod Logo">
    <div class="sub-header-title">MoU & Strategic Partnership | Implementation, Financial Terms & Sign-Off</div>
</div>

<div class="sec-banner-eco">
    <h2>7.0 Implementation Plan & Resource Commitments</h2>
    <span class="sec-tag-eco">ROLES & RESPONSIBILITIES</span>
</div>

<div class="grid-2">
    <div class="compact-card card-blue">
        <div class="compact-card-title"><span>RILLCOD TECHNOLOGIES COMMITS TO:</span><span class="badge-micro badge-blue">Party A</span></div>
        <div style="font-size:8.2pt; color:#334155; line-height:1.42;">
            • Provide trained, background-checked resident STEM facilitators.<br>
            • Supply 12-Year STEM/AI Curriculum, lesson plans & cloud software.<br>
            • Provide all laptops, robotics components, sensors & micro-controllers.<br>
            • Deliver monthly student progress reports & termly evaluations.
        </div>
    </div>

    <div class="compact-card card-teal">
        <div class="compact-card-title"><span>BAY-FLOWERS INT'L SCHOOL COMMITS TO:</span><span class="badge-micro badge-teal">Party B</span></div>
        <div style="font-size:8.2pt; color:#334155; line-height:1.42;">
            • Provide functional ICT computer lab space & stable power supply.<br>
            • Timetable access to students according to agreed schedule.<br>
            • Facilitate fee collection and administrative cooperation.<br>
            • Designate a liaison officer for smooth program operations.
        </div>
    </div>
</div>

<div class="sec-banner-eco">
    <h2>8.0 Financial Framework & Revenue Share Agreement</h2>
    <span class="sec-tag-eco">FINANCIAL TERMS</span>
</div>

<table class="dense-table">
    <thead>
        <tr>
            <th>Program Model</th>
            <th>Termly Fee per Student</th>
            <th>School Profit Share (30%)</th>
            <th>Rillcod Operations (70%)</th>
            <th>Settlement Schedule</th>
        </tr>
    </thead>
    <tbody>
        <tr class="highlight-row">
            <td><strong>Option A: Extracurricular Club</strong></td>
            <td><strong>₦30,000 / term</strong></td>
            <td><strong>₦9,000 / student / term</strong></td>
            <td><strong>₦21,000 / student / term</strong></td>
            <td>Bi-weekly upon collection</td>
        </tr>
        <tr>
            <td><strong>Option B1: Integration (1 class/wk)</strong></td>
            <td>₦10,000 / term</td>
            <td>₦3,000 / student / term</td>
            <td>₦7,000 / student / term</td>
            <td>Termly within 30 days</td>
        </tr>
        <tr>
            <td><strong>Option B2: Integration (2 classes/wk)</strong></td>
            <td>₦15,000 / term</td>
            <td>₦4,500 / student / term</td>
            <td>₦10,500 / student / term</td>
            <td>Termly within 30 days</td>
        </tr>
    </tbody>
</table>

<div class="sec-banner-eco">
    <h2>9.0 Term, Duration, Governing Law & Sign-Off Execution</h2>
    <span class="sec-tag-eco">SIGN-OFF EXECUTION</span>
</div>

<p style="margin-top:0; margin-bottom:8px; font-size:8.5pt; text-align:justify;">
    This Memorandum of Understanding shall take effect on the date of execution and remain valid for an initial period of **one (1) academic year (3 terms)**, renewable automatically upon mutual written consent. Either party may terminate this agreement by giving thirty (30) days advance written notice. This agreement shall be governed by the laws of the Federal Republic of Nigeria.
</p>

<!-- DUAL SIGNATURE BLOCK -->
<div class="mou-sig-grid">
    <div class="sig-box">
        <div class="sig-title">FOR: RILLCOD TECHNOLOGIES (PARTY A)</div>
        <img src="{sig_data_url}" class="sig-img-sm" alt="Director Signature"><br>
        <strong>Authorized Signatory:</strong> Director of Educational Technology<br>
        <strong>Name:</strong> Rillcod Technologies Management<br>
        <strong>Date:</strong> 11th August 2026<br>
        <span style="font-size:7.2pt; color:#2563EB;">Official Stamp & Seal Affixed</span>
    </div>

    <div class="sig-box">
        <div class="sig-title">FOR: BAY-FLOWERS INT'L SCHOOL (PARTY B)</div>
        <div class="sig-line"></div>
        <strong>Authorized Signatory:</strong> Proprietor / School Principal<br>
        <strong>Name:</strong> ____________________________<br>
        <strong>Date:</strong> ____________________________<br>
        <span style="font-size:7.2pt; color:#047857;">Official School Stamp & Seal Affixed</span>
    </div>
</div>

<div class="contact-compact-eco">
    <div style="font-size:9.5pt; font-weight:800; color:#0F172A;">RILLCOD TECHNOLOGIES — HEADQUARTERS & CONTACT DIRECTORY</div>
    <div class="contact-compact-grid" style="margin-top:4px;">
        <div>
            <strong>Address:</strong> No. 26 Ogiesoba Avenue, Off Airport Road, Benin City, Edo State, Nigeria.<br>
            <strong>Phone / WhatsApp:</strong> 08116600091 | 07036402679
        </div>
        <div>
            <strong>Official Website:</strong> www.rillcod.com<br>
            <strong>Emails:</strong> support@rillcod.com | info@rillcod.com | rillcod@gmail.com
        </div>
    </div>
</div>

<div style="display:flex; justify-content:space-between; align-items:center; font-size:7.5pt; color:#64748B; margin-top:6px;">
    <span>MEMORANDUM OF UNDERSTANDING (MoU) — RILLCOD TECHNOLOGIES & BAY-FLOWERS INTERNATIONAL SCHOOL</span>
    <span>© 2026 RILLCOD TECHNOLOGIES. All Rights Reserved.</span>
</div>

</body>
</html>
"""

# Write HTML file
html_path = os.path.join(scratch_dir, "bay_flowers_mou_master_4page.html")
with open(html_path, "w", encoding="utf-8") as f:
    f.write(html_content)

print(f"Master 4-Page MoU HTML written to {html_path}")

# Run Edge Headless to generate PDF on Scratch
pdf_scratch_path = os.path.join(scratch_dir, "test_mou_master_4page.pdf")

edge_path = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

cmd = [
    edge_path,
    "--headless",
    "--disable-gpu",
    "--no-pdf-header-footer",
    f"--print-to-pdf={pdf_scratch_path}",
    f"file:///{html_path.replace('\\', '/')}"
]
res = subprocess.run(cmd, capture_output=True, text=True)
print("Exit code:", res.returncode)

# Check page count with pypdf
reader = PdfReader(pdf_scratch_path)
print(f"Total PDF pages generated: {len(reader.pages)}")
for i, page in enumerate(reader.pages):
    txt = page.extract_text()
    print(f"Page {i+1} has {len(txt)} characters")

# Save to Desktop
import shutil
desktop_pdf_mou_master = os.path.join(desktop_dir, "MoU_Rillcod_Academy_Bay_Flowers_International_School_Master.pdf")
desktop_pdf_mou_final = os.path.join(desktop_dir, "MoU_Rillcod_Academy_Bay_Flowers_International_School_Final.pdf")

try:
    shutil.copyfile(pdf_scratch_path, desktop_pdf_mou_master)
    print("Saved Master 4Page MoU PDF to Desktop:", desktop_pdf_mou_master)
    try:
        if os.path.exists(desktop_pdf_mou_final):
            os.remove(desktop_pdf_mou_final)
        shutil.copyfile(pdf_scratch_path, desktop_pdf_mou_final)
        print("Updated Final MoU PDF:", desktop_pdf_mou_final)
    except Exception as e:
        print("Final copy error:", e)
except Exception as e:
    print("Desktop copy error:", e)
