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
<title>Coding and Robotics Partnership Proposal - Rillcod Technologies & Bay-Flowers International School</title>
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
    font-size: 10.5pt;
    line-height: 1.5;
}}

h1, h2, h3, h4, h5 {{
    font-family: 'Outfit', sans-serif;
    margin-top: 0;
    margin-bottom: 4px;
    color: #0F172A;
    font-weight: 700;
}}

/* EXACT A4 PAGE FLEX WRAPPER (275mm Printable Height) */
.a4-page {{
    height: 275mm;
    width: 100%;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    page-break-after: always;
    position: relative;
    overflow: hidden;
}}

.a4-page:last-child {{
    page-break-after: avoid;
}}

/* ================= COVER PAGE STYLING ================= */
.cover-container {{
    height: 275mm;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 20px;
    border: 3px solid #0F172A;
    border-radius: 8px;
    background: linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%);
    position: relative;
}}

.cover-top {{
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 2px solid #CBD5E1;
    padding-bottom: 15px;
}}

.cover-logo {{
    height: 70px;
}}

.cover-badge-top {{
    background: #EFF6FF;
    color: #1D4ED8;
    border: 1.5px solid #BFDBFE;
    font-weight: 800;
    font-size: 9pt;
    padding: 4px 12px;
    border-radius: 20px;
    text-transform: uppercase;
    letter-spacing: 1px;
}}

.cover-hero {{
    margin-top: 30px;
    margin-bottom: 30px;
}}

.cover-tagline {{
    font-size: 11pt;
    color: #0284C7;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 2px;
    margin-bottom: 12px;
}}

.cover-title {{
    font-size: 26pt;
    font-weight: 800;
    color: #0F172A;
    line-height: 1.2;
    margin-bottom: 15px;
    letter-spacing: -0.5px;
}}

.cover-subtitle-text {{
    font-size: 13pt;
    color: #475569;
    line-height: 1.5;
    max-width: 90%;
    margin-bottom: 25px;
}}

.cover-parties-box {{
    background: #FFFFFF;
    border: 2px solid #CBD5E1;
    border-left: 8px solid #2563EB;
    border-radius: 8px;
    padding: 20px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    margin-bottom: 20px;
}}

.party-col h4 {{
    font-size: 10pt;
    color: #0284C7;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 6px;
}}

.party-col h3 {{
    font-size: 14pt;
    color: #0F172A;
    margin-bottom: 4px;
}}

.party-col p {{
    font-size: 9.5pt;
    color: #475569;
    margin: 0;
}}

.cover-footer-meta {{
    background: #0F172A;
    color: #FFFFFF;
    border-radius: 6px;
    padding: 16px 20px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 15px;
    font-size: 9pt;
    line-height: 1.5;
}}

.cover-footer-meta strong {{
    color: #38BDF8;
}}

/* RUNNING HEADERS */
.sub-header-eco {{
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 2.5px solid #0F172A;
    padding-bottom: 6px;
}}

.sub-header-logo {{
    height: 28px;
}}

.sub-header-title {{
    font-size: 9pt;
    font-weight: 800;
    color: #334155;
    text-transform: uppercase;
    letter-spacing: 0.6px;
}}

/* SECTION BANNERS */
.sec-banner-eco {{
    background: #F8FAFC;
    color: #0F172A;
    padding: 7px 12px;
    border-radius: 6px;
    font-size: 11pt;
    font-weight: 800;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border: 1.5px solid #E2E8F0;
    border-left: 5px solid #0F172A;
}}

.sec-banner-eco h2 {{
    font-size: 11pt;
    margin: 0;
    color: #0F172A;
    font-weight: 800;
}}

.sec-tag-eco {{
    font-size: 8pt;
    background: #EFF6FF;
    color: #1D4ED8;
    border: 1.5px solid #BFDBFE;
    padding: 3px 9px;
    border-radius: 6px;
    font-weight: 800;
    text-transform: uppercase;
}}

/* GRIDS & CARDS */
.grid-2 {{
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
}}

.compact-card {{
    background: #FFFFFF;
    border: 1.5px solid #CBD5E1;
    border-radius: 6px;
    padding: 11px 14px;
    break-inside: avoid;
}}

.card-blue {{ border-left: 5px solid #2563EB; }}
.card-teal {{ border-left: 5px solid #06B6D4; }}
.card-green {{ border-left: 5px solid #10B981; }}
.card-amber {{ border-left: 5px solid #F59E0B; }}

.compact-card-title {{
    font-weight: 800;
    font-size: 10.8pt;
    color: #0F172A;
    margin-bottom: 5px;
    display: flex;
    justify-content: space-between;
    align-items: center;
}}

.badge-micro {{
    font-size: 7.8pt;
    padding: 2px 7px;
    border-radius: 4px;
    font-weight: 800;
    text-transform: uppercase;
}}

.badge-blue {{ background: #EFF6FF; color: #1D4ED8; border: 1px solid #BFDBFE; }}
.badge-amber {{ background: #FFFBEB; color: #B45309; border: 1px solid #FDE68A; }}
.badge-green {{ background: #ECFDF5; color: #047857; border: 1px solid #A7F3D0; }}

/* TABLES */
table.dense-table {{
    width: 100%;
    border-collapse: collapse;
    font-size: 9.8pt;
}}

table.dense-table th {{
    background: #F1F5F9;
    color: #0F172A;
    padding: 9px 12px;
    text-align: left;
    font-weight: 800;
    border: 1.5px solid #CBD5E1;
}}

table.dense-table td {{
    padding: 9px 12px;
    border: 1.5px solid #CBD5E1;
    color: #1E293B;
}}

table.dense-table tr:nth-child(even) {{
    background-color: #F8FAFC;
}}

table.dense-table tr.highlight-row {{
    background-color: #EFF6FF;
    font-weight: 800;
    color: #1E40AF;
}}

/* YEAR CURRICULUM BOXES */
.year-card-dense {{
    border: 1.5px solid #CBD5E1;
    border-radius: 6px;
    background: #FFFFFF;
    break-inside: avoid;
}}

.year-head-dense {{
    background: #F8FAFC;
    color: #0F172A;
    padding: 7px 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 10.2pt;
    font-weight: 800;
    border-bottom: 1.5px solid #E2E8F0;
}}

.year-tag-dense {{
    background: #0284C7;
    color: #FFFFFF;
    font-weight: 800;
    font-size: 8pt;
    padding: 3px 8px;
    border-radius: 4px;
}}

.terms-row {{
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    padding: 8px 12px;
    background: #FFFFFF;
}}

.term-item {{
    background: #F8FAFC;
    border: 1px solid #E2E8F0;
    border-radius: 5px;
    padding: 7px 9px;
    font-size: 9.2pt;
    line-height: 1.42;
}}

.term-t {{
    font-weight: 800;
    color: #2563EB;
    font-size: 8.5pt;
    text-transform: uppercase;
    margin-bottom: 4px;
}}

.year-foot-dense {{
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    padding: 7px 12px;
    background: #F1F5F9;
    border-top: 1.5px solid #E2E8F0;
    font-size: 9.2pt;
}}

.capstone-lbl {{
    font-weight: 800;
    color: #1E40AF;
    font-size: 8.2pt;
    text-transform: uppercase;
}}

.portfolio-lbl {{
    font-weight: 800;
    color: #047857;
    font-size: 8.2pt;
    text-transform: uppercase;
}}

/* CONTACT & SIGNATURE FOOTER */
.contact-compact-eco {{
    background: #FFFFFF;
    color: #0F172A;
    border: 2px solid #0F172A;
    border-radius: 6px;
    padding: 10px 14px;
    break-inside: avoid;
}}

.contact-compact-grid {{
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
    font-size: 9.2pt;
    color: #334155;
}}

.contact-compact-grid strong {{
    color: #0F172A;
}}

/* DUAL SIGNATURE BOX FOR PROPOSAL */
.mou-sig-grid {{
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    padding-top: 8px;
    border-top: 2px solid #CBD5E1;
    break-inside: avoid;
}}

.sig-box {{
    background: #F8FAFC;
    border: 1.5px solid #CBD5E1;
    border-radius: 6px;
    padding: 10px 14px;
}}

.sig-title {{
    font-size: 9.2pt;
    font-weight: 800;
    color: #0F172A;
    margin-bottom: 5px;
    text-transform: uppercase;
}}

.sig-img-sm {{
    height: 42px;
    margin-top: 4px;
    margin-bottom: 4px;
}}

.sig-line {{
    border-bottom: 1.5px dashed #94A3B8;
    height: 35px;
    margin-bottom: 4px;
}}

</style>
</head>
<body>

<!-- ================= PAGE 1: FULL COVER PAGE ================= -->
<div class="a4-page">
    <div class="cover-container">
        <div class="cover-top">
            <img src="{logo_data_url}" class="cover-logo" alt="Rillcod Technologies Logo">
            <span class="cover-badge-top">Official Institutional Proposal</span>
        </div>

        <div class="cover-hero">
            <div class="cover-tagline">Future-Ready STEM & Educational Technology</div>
            <div class="cover-title">CODING AND ROBOTICS PARTNERSHIP PROPOSAL</div>
            <div class="cover-subtitle-text">
                Equipping young minds with practical programming, artificial intelligence, robotics, and logical problem-solving skills to build Edo State's next generation of innovators.
            </div>

            <div class="cover-parties-box">
                <div class="party-col">
                    <h4>PREPARED FOR:</h4>
                    <h3>Bay-Flowers Int'l School</h3>
                    <p>Benin City, Edo State, Nigeria<br><em>Host Partner Institution</em></p>
                </div>
                <div class="party-col">
                    <h4>PRESENTED BY:</h4>
                    <h3>Rillcod Technologies</h3>
                    <p>Subsidiary of Rillcod Technologies<br><em>Over 10 Years STEM Experience</em></p>
                </div>
            </div>
        </div>

        <div class="cover-footer-meta">
            <div>
                <strong>Headquarters Address:</strong><br>
                26 Ogiesoba Avenue, Off Airport Road, Benin City, Edo State.<br>
                <strong>Session:</strong> Academic Year 2026 / 2027
            </div>
            <div>
                <strong>Official Website:</strong> www.rillcod.com<br>
                <strong>Phone Lines:</strong> 08116600091 | 07036402679<br>
                <strong>Emails:</strong> support@rillcod.com | info@rillcod.com | rillcod@gmail.com
            </div>
        </div>
    </div>
</div>


<!-- ================= PAGE 2: SECTIONS 1 TO 4 ================= -->
<div class="a4-page">
    <div class="sub-header-eco">
        <img src="{logo_data_url}" class="sub-header-logo" alt="Rillcod Logo">
        <div class="sub-header-title">Coding & Robotics Partnership Proposal | Executive Overview & Focus</div>
    </div>

    <div class="sec-banner-eco">
        <h2>1.0 Executive Summary</h2>
        <span class="sec-tag-eco">OVERVIEW</span>
    </div>

    <p style="margin-top:0; margin-bottom:0; text-align:justify; font-size:10.2pt; line-height:1.5;">
        <strong>Rillcod Technologies</strong>, a subsidiary of Rillcod Technologies, provides future-ready, skill-based education in coding, robotics, AI, and digital technology for schools in Nigeria. With <strong>over 10 years of STEM experience</strong>, our trained facilitators deliver hands-on learning that inspires creativity, innovation, and academic excellence.<br><br>
        This partnership aims to introduce <strong>Bay-Flowers International School</strong> students to coding and robotics while positioning the school as a leading STEM-focused institution in Benin City.
    </p>

    <div class="sec-banner-eco">
        <h2>2.0 Background / Why This Matters</h2>
        <span class="sec-tag-eco">THE STEM IMPERATIVE</span>
    </div>

    <p style="margin-top:0; margin-bottom:0; text-align:justify; font-size:10.2pt; line-height:1.5;">
        With the world becoming increasingly digital, early exposure to STEM skills helps young students develop their minds, build creative and analytical thinking, and nurture innovation—preparing them for the future. Many schools globally have already integrated technology as a core part of their curriculum.<br><br>
        For <strong>Bay-Flowers International School</strong>, this presents a key opportunity to distinguish itself from other schools in Benin City by giving its students strong exposure to practical tech skills. Through structured coding and robotics education, the school can strengthen its academic offering and become a leader in modern, future-focused learning.
    </p>

    <div class="sec-banner-eco">
        <h2>3.0 Partnership Focus Areas</h2>
        <span class="sec-tag-eco">PROGRAM MODELS</span>
    </div>

    <div class="grid-2">
        <div class="compact-card card-blue">
            <div class="compact-card-title">
                <span>OPTION A: EXTRACURRICULAR PROGRAM</span>
                <span class="badge-micro badge-blue">Extracurricular Club</span>
            </div>
            <div style="font-size:9.5pt; color:#334155; line-height:1.48;">
                • <strong>Frequency:</strong> Runs once per week (min 2 hours duration).<br>
                • <strong>Target Classes:</strong> Open to students from BASIC 1 through SS 2.<br>
                • <strong>Scope:</strong> Hands-on programming, robotics, and digital creativity outside regular school hours.
            </div>
        </div>

        <div class="compact-card card-green">
            <div class="compact-card-title">
                <span>OPTION B: CURRICULUM INTEGRATION</span>
                <span class="badge-micro badge-green">Full Integration</span>
            </div>
            <div style="font-size:9.5pt; color:#334155; line-height:1.48;">
                • <strong>Frequency:</strong> Timetabled twice a week across all classes.<br>
                • <strong>Target Classes:</strong> All classes from Primary to Secondary.<br>
                • <strong>Scope:</strong> Artificial Intelligence, Web Dev, Python, Pictoblox, robotics, problem-solving & critical thinking.
            </div>
        </div>
    </div>

    <div class="sec-banner-eco">
        <h2>4.0 Implementation Plan</h2>
        <span class="sec-tag-eco">ROLES & SCHEDULE</span>
    </div>

    <div class="grid-2">
        <div class="compact-card card-blue">
            <div class="compact-card-title"><span>FOR OPTION A (EXTRACURRICULAR):</span><span class="badge-micro badge-blue">Option A</span></div>
            <div style="font-size:9pt; color:#334155; line-height:1.42;">
                • <strong>Rillcod Technologies:</strong> Provides trained facilitators, lesson notes, curriculum, robotics components, and monitoring & evaluation reports.<br>
                • <strong>Bay-Flowers School:</strong> Provides ICT lab space, electricity, student access, and management support.<br>
                • <strong>Schedule:</strong> Conducted once per week for 2 hours. Monthly progress reports shared with school.
            </div>
        </div>

        <div class="compact-card card-teal">
            <div class="compact-card-title"><span>FOR OPTION B (CURRICULUM INTEGRATION):</span><span class="badge-micro badge-teal">Option B</span></div>
            <div style="font-size:9pt; color:#334155; line-height:1.42;">
                • <strong>Rillcod Technologies:</strong> Provides trained facilitators, lesson notes, curriculum, robotics components, and termly evaluation reports.<br>
                • <strong>Bay-Flowers School:</strong> Provides ICT lab space, electricity, student access, and management support.<br>
                • <strong>Schedule:</strong> Conducted twice per week across all classes. Continuous termly evaluation.
            </div>
        </div>
    </div>
</div>


<!-- ================= PAGE 3: SECTIONS 5 TO 9 ================= -->
<div class="a4-page">
    <div class="sub-header-eco">
        <img src="{logo_data_url}" class="sub-header-logo" alt="Rillcod Logo">
        <div class="sub-header-title">Coding & Robotics Partnership Proposal | Resources, Benefits & Financials</div>
    </div>

    <div class="sec-banner-eco">
        <h2>5.0 Required Resources</h2>
        <span class="sec-tag-eco">EQUIPMENT</span>
    </div>

    <p style="margin-top:0; margin-bottom:0; font-size:10pt; text-align:justify;">
        All necessary materials and equipment, including laptops and robotics components, will be provided by <strong>Rillcod Technologies</strong>. No additional special resources are required from Bay-Flowers International School beyond what is listed in the Implementation Plan.
    </p>

    <div class="sec-banner-eco">
        <h2>6.0 Benefits to Bay-Flowers International School</h2>
        <span class="sec-tag-eco">SCHOOL VALUE</span>
    </div>

    <div class="compact-card card-green">
        <div style="font-size:9.5pt; color:#334155; line-height:1.48;">
            • <strong>Enhanced Student Engagement & Creativity:</strong> Students participate in hands-on coding and robotics activities.<br>
            • <strong>Early Exposure to Tech & STEM Skills:</strong> Prepares students for future academic and career opportunities.<br>
            • <strong>Competitive Advantage in Benin City:</strong> Positions Bay-Flowers International School as a leader in innovative, future-ready education.
        </div>
    </div>

    <div class="sec-banner-eco">
        <h2>7.0 Benefits to Rillcod Technologies</h2>
        <span class="sec-tag-eco">RILLCOD VALUE</span>
    </div>

    <div class="compact-card card-blue">
        <div style="font-size:9.5pt; color:#334155; line-height:1.48;">
            • <strong>Social Impact:</strong> Empowers students by equipping them with critical STEM skills.<br>
            • <strong>Leadership Position:</strong> Establishes Rillcod Technologies as a leading STEM education provider in Benin City and beyond.<br>
            • <strong>Wider Community Reach:</strong> Expands the Academy’s presence and influence in technology education across schools.
        </div>
    </div>

    <div class="sec-banner-eco">
        <h2>8.0 Financial Model</h2>
        <span class="sec-tag-eco">FEE STRUCTURE</span>
    </div>

    <table class="dense-table">
        <thead>
            <tr>
                <th>Program Model</th>
                <th>Target Classes & Session Frequency</th>
                <th>Termly Fee per Student</th>
            </tr>
        </thead>
        <tbody>
            <tr class="highlight-row">
                <td><strong>Option A: Extracurricular Club</strong></td>
                <td>Basic 1 through SS 2 — 1 Session / Week (2 Hours)</td>
                <td><strong>₦25,000 / ₦30,000 per student per term</strong></td>
            </tr>
            <tr>
                <td><strong>Option B1: Integration (1 class/wk)</strong></td>
                <td>All Classes (Primary to Secondary) — 1 Class / Week</td>
                <td><strong>₦10,000 per student per term</strong></td>
            </tr>
            <tr>
                <td><strong>Option B2: Integration (2 classes/wk)</strong></td>
                <td>All Classes (Primary to Secondary) — 2 Classes / Week</td>
                <td><strong>₦15,000 per student per term</strong></td>
            </tr>
        </tbody>
    </table>

    <div class="sec-banner-eco">
        <h2>9.0 Call to Action & Sign-Off Alignment</h2>
        <span class="sec-tag-eco">NEXT STEPS</span>
    </div>

    <p style="margin-top:0; margin-bottom:0; font-size:9.8pt; text-align:justify;">
        We look forward to meeting with your team to discuss the next steps and begin implementation next term. Together, we can explore the best approach that aligns with Bay-Flowers International School’s goals, ensure seamless planning, and set up a roadmap for a successful partnership that delivers tangible outcomes for students, teachers, and the school community.
    </p>

    <!-- DUAL SIGNATURE BLOCK -->
    <div class="mou-sig-grid">
        <div class="sig-box">
            <div class="sig-title">FOR: RILLCOD TECHNOLOGIES</div>
            <img src="{sig_data_url}" class="sig-img-sm" alt="Director Signature"><br>
            <strong>Authorized Signatory:</strong> Director of Educational Technology<br>
            <strong>Name:</strong> Rillcod Technologies Management<br>
            <strong>Date:</strong> 11th August 2026
        </div>

        <div class="sig-box">
            <div class="sig-title">FOR: BAY-FLOWERS INT'L SCHOOL</div>
            <div class="sig-line"></div>
            <strong>Authorized Signatory:</strong> Proprietor / School Principal<br>
            <strong>Name:</strong> ____________________________<br>
            <strong>Date:</strong> ____________________________
        </div>
    </div>
</div>


<!-- ================= PAGE 4: 12-YEAR PRIMARY CURRICULUM ================= -->
<div class="a4-page">
    <div class="sub-header-eco">
        <img src="{logo_data_url}" class="sub-header-logo" alt="Rillcod Logo">
        <div class="sub-header-title">Coding & Robotics Partnership Proposal | Primary School AI & Robotics Syllabus (Basic 1–6)</div>
    </div>

    <div class="sec-banner-eco">
        <h2>10.0 Primary School AI & Robotics Pathway (Basic 1 to Basic 6)</h2>
        <span class="sec-tag-eco">PRIMARY SYLLABUS</span>
    </div>

    <div style="display:flex; flex-direction:column; justify-content:space-between; height:100%;">
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
</div>


<!-- ================= PAGE 5: 12-YEAR SECONDARY CURRICULUM ================= -->
<div class="a4-page">
    <div class="sub-header-eco">
        <img src="{logo_data_url}" class="sub-header-logo" alt="Rillcod Logo">
        <div class="sub-header-title">Coding & Robotics Partnership Proposal | Secondary School AI & Robotics Syllabus (JSS 1–SS 3)</div>
    </div>

    <div class="sec-banner-eco">
        <h2>11.0 Secondary School AI & Robotics Pathway (JSS 1 to SS 3)</h2>
        <span class="sec-tag-eco">SECONDARY SYLLABUS</span>
    </div>

    <div style="display:flex; flex-direction:column; justify-content:space-between; height:100%;">
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

    <div class="contact-compact-eco" style="margin-top:6px;">
        <div style="font-size:9.8pt; font-weight:800; color:#0F172A;">RILLCOD TECHNOLOGIES — HEADQUARTERS & CONTACT DIRECTORY</div>
        <div class="contact-compact-grid" style="margin-top:4px;">
            <div>
                <strong>Address:</strong> 26 Ogiesoba Avenue, Off Airport Road, Benin City, Edo State, Nigeria.<br>
                <strong>Phone / WhatsApp:</strong> 08116600091 | 07036402679
            </div>
            <div>
                <strong>Official Website:</strong> www.rillcod.com<br>
                <strong>Emails:</strong> support@rillcod.com | info@rillcod.com | rillcod@gmail.com
            </div>
        </div>
    </div>

    <div style="display:flex; justify-content:space-between; align-items:center; font-size:7.8pt; color:#64748B; margin-top:4px;">
        <span>CODING & ROBOTICS PARTNERSHIP PROPOSAL — RILLCOD TECHNOLOGIES & BAY-FLOWERS INT'L SCHOOL</span>
        <span>© 2026 RILLCOD TECHNOLOGIES. All Rights Reserved.</span>
    </div>
</div>

</body>
</html>
"""

# Write HTML file
html_path = os.path.join(scratch_dir, "bay_flowers_proposal_cover_curriculum.html")
with open(html_path, "w", encoding="utf-8") as f:
    f.write(html_content)

print(f"Proposal HTML written to {html_path}")

# Run Edge Headless to generate PDF on Scratch
pdf_scratch_path = os.path.join(scratch_dir, "test_proposal_cover_curriculum.pdf")

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
desktop_pdf_proposal = os.path.join(desktop_dir, "Coding_and_Robotics_Partnership_Proposal_Bay_Flowers.pdf")

try:
    if os.path.exists(desktop_pdf_proposal):
        os.remove(desktop_pdf_proposal)
    shutil.copyfile(pdf_scratch_path, desktop_pdf_proposal)
    print("Saved Proposal PDF to Desktop:", desktop_pdf_proposal)
except Exception as e:
    print("Desktop copy error:", e)
