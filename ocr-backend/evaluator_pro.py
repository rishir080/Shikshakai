import io
import os
import copy
from typing import List, Dict, Any
from PIL import Image, ImageDraw, ImageFont

# Raise PIL decompression bomb limit to handle large exam scan images safely
Image.MAX_IMAGE_PIXELS = 500_000_000

import Levenshtein
from fpdf import FPDF
import base64

def _s(text) -> str:
    """Encode any string to Latin-1 safely for FPDF (replaces unrepresentable chars with '?')."""
    return str(text or "").encode("latin-1", "replace").decode("latin-1")


class ProEvaluator:
    def __init__(self):
        # We can load a font if available, otherwise use default
        # Standard TTF paths for Windows (for better drawing than default bitmap font)
        self.font_path = "C:\\Windows\\Fonts\\arial.ttf"
        
    def _get_font(self, size=20, bold=False):
        try:
            path = "C:\\Windows\\Fonts\\arialbd.ttf" if bold else self.font_path
            return ImageFont.truetype(path, size)
        except IOError:
            return ImageFont.load_default()

    def find_text_bbox(self, ocr_detections: List[Dict], target_text: str, img_w: int, img_h: int) -> tuple:
        """
        Fuzzy match target_text within the OCR detections.
        ocr_detections: [{"text": str, "box": [top%, left%, w%, h%]}, ...]
        Returns (x, y, w, h) in pixels or None.
        """
        if not target_text or not ocr_detections:
            return None
            
        target = target_text.lower().strip()
        best_match = None
        best_ratio = 0.0
        
        # Simple word matching heuristic
        # If the target is long, we might need to match multiple lines, 
        # but for simplicity we match the line with the highest overlap.
        for det in ocr_detections:
            det_text = det.get("text", "").lower().strip()
            if not det_text:
                continue
                
            # If target is a substring of the detection, or vice versa
            if target in det_text or det_text in target:
                ratio = 1.0
            else:
                # Fuzzy ratio
                dist = Levenshtein.distance(target, det_text)
                max_len = max(len(target), len(det_text))
                ratio = 1.0 - (dist / max_len) if max_len > 0 else 0
                
            if ratio > best_ratio and ratio > 0.6:  # 60% similarity threshold
                best_ratio = ratio
                best_match = det
                
        if best_match:
            box_pct = best_match["box"]
            # box_pct is [top%, left%, width%, height%]
            top_px = int((box_pct[0] / 100.0) * img_h)
            left_px = int((box_pct[1] / 100.0) * img_w)
            w_px = int((box_pct[2] / 100.0) * img_w)
            h_px = int((box_pct[3] / 100.0) * img_h)
            return (left_px, top_px, w_px, h_px)
            
        return None

    def annotate_page(self, img_pil: Image.Image, page_eval: Dict, ocr_detections: List[Dict]) -> Image.Image:
        """
        Draws red pen marks on the image for a specific page.
        Images are downscaled first if they are too large to prevent memory errors.
        """
        # Safety: downscale very large images before annotation to prevent memory errors
        MAX_ANNOTATE_PIXELS = 15_000_000  # 15 MP
        w, h = img_pil.size
        if w * h > MAX_ANNOTATE_PIXELS:
            scale = (MAX_ANNOTATE_PIXELS / (w * h)) ** 0.5
            img_pil = img_pil.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

        img = img_pil.copy()
        
        # Convert to RGBA for semi-transparent highlights
        if img.mode != "RGBA":
            img = img.convert("RGBA")
            
        overlay = Image.new("RGBA", img.size, (255, 255, 255, 0))
        draw = ImageDraw.Draw(overlay)
        text_draw = ImageDraw.Draw(img)  # Draw text directly on image for sharpness
        
        img_w, img_h = img.size
        
        font_main = self._get_font(size=max(20, int(img_h * 0.015)))
        font_small = self._get_font(size=max(16, int(img_h * 0.012)))
        font_bold = self._get_font(size=max(24, int(img_h * 0.02)), bold=True)
        
        # Color palette
        COLOR_MISTAKE = (255, 0, 0, 80)      # Transparent Red
        COLOR_CORRECT = (0, 255, 0, 60)      # Transparent Green
        COLOR_WARNING = (255, 200, 0, 80)    # Transparent Yellow
        
        COLOR_TEXT_MISTAKE = (220, 0, 0, 255)
        COLOR_TEXT_CORRECT = (0, 180, 0, 255)
        
        y_cursor = 50 # For page-level comments
        
        questions = page_eval.get("questions", [])
        for q in questions:
            # Draw Question overall marks at top left
            text_draw.text((30, y_cursor), f"Q{q.get('question_no')}: {q.get('marks_awarded')}/{q.get('marks_total')}", font=font_bold, fill=COLOR_TEXT_MISTAKE)
            y_cursor += int(img_h * 0.03)
            
            # Highlight mistakes
            for mistake in q.get("mistakes", []):
                bbox = self.find_text_bbox(ocr_detections, mistake.get("text", ""), img_w, img_h)
                if bbox:
                    x, y, w, h = bbox
                    # Draw highlight rectangle
                    draw.rectangle([x, y, x + w, y + h], fill=COLOR_MISTAKE)
                    # Strike-through line
                    draw.line([x, y + h//2, x + w, y + h//2], fill=(255, 0, 0, 180), width=3)
                    
                    # Draw annotation text nearby
                    annotation = f"[-{mistake.get('marks_deducted')}] {mistake.get('comment')}"
                    text_draw.text((x + w + 10, y - h//2), annotation, font=font_small, fill=COLOR_TEXT_MISTAKE)
                    
            # Highlight correct parts
            for correct in q.get("correct_parts", []):
                bbox = self.find_text_bbox(ocr_detections, correct.get("text", ""), img_w, img_h)
                if bbox:
                    x, y, w, h = bbox
                    draw.rectangle([x, y, x + w, y + h], fill=COLOR_CORRECT)
                    
                    annotation = f"[+{correct.get('marks_awarded')}]"
                    text_draw.text((x + w + 10, y - h//2), annotation, font=font_small, fill=COLOR_TEXT_CORRECT)
                    
            # Question level comments
            comment = q.get("red_pen_comment", "")
            if comment:
                text_draw.text((30, y_cursor), f"Note: {comment}", font=font_main, fill=COLOR_TEXT_MISTAKE)
                y_cursor += int(img_h * 0.02)
                
        # Merge overlay
        final_img = Image.alpha_composite(img, overlay)
        return final_img.convert("RGB")


    def generate_professional_report(self, annotated_images: List[Image.Image], evaluation_data: Dict) -> str:
        """
        Generates a PDF containing a professional school-style report card and annotated answer sheets.
        Returns the path to the PDF.
        """
        from datetime import datetime
        pdf = FPDF()
        pdf.set_auto_page_break(auto=True, margin=15)
        
        total_awarded = evaluation_data.get("total_awarded", 0)
        total_possible = evaluation_data.get("total_possible", 0)
        percentage = evaluation_data.get("percentage", 0)
        grade = evaluation_data.get("grade", "N/A")
        overall_feedback = evaluation_data.get("overall_feedback", "")
        questions = evaluation_data.get("questions", [])
        now_str = datetime.now().strftime("%d %B %Y")
        
        # ─────────────────────────────────────────
        # PAGE 1: OFFICIAL REPORT CARD
        # ─────────────────────────────────────────
        pdf.add_page()
        
        # ── TOP HEADER BAR ──
        pdf.set_fill_color(25, 40, 90)   # Dark navy
        pdf.rect(0, 0, 210, 38, 'F')
        pdf.set_text_color(255, 255, 255)
        pdf.set_font("Arial", "B", 18)
        pdf.set_xy(15, 7)
        pdf.cell(0, 10, _s("EXAMINATION RESULT SHEET"), ln=False)
        pdf.set_font("Arial", "", 9)
        pdf.set_xy(15, 20)
        pdf.cell(0, 7, _s("ShikshakAI Evaluation System  ·  Official Academic Record"), ln=True)
        
        pdf.set_text_color(0, 0, 0)
        pdf.set_xy(15, 45)
        
        # ── STUDENT / EXAM INFO BOX ──
        pdf.set_fill_color(245, 246, 250)
        pdf.set_draw_color(200, 205, 220)
        pdf.rect(15, 42, 180, 32, 'FD')
        
        pdf.set_font("Arial", "B", 9)
        pdf.set_text_color(80, 80, 120)
        pdf.set_xy(20, 46)
        pdf.cell(55, 6, _s("Date of Evaluation:"), ln=False)
        pdf.set_font("Arial", "", 9)
        pdf.set_text_color(30, 30, 30)
        pdf.cell(65, 6, _s(now_str), ln=False)
        
        pdf.set_font("Arial", "B", 9)
        pdf.set_text_color(80, 80, 120)
        pdf.cell(35, 6, _s("Total Pages:"), ln=False)
        pdf.set_font("Arial", "", 9)
        pdf.set_text_color(30, 30, 30)
        pdf.cell(0, 6, _s(str(len(annotated_images))), ln=True)
        
        pdf.set_font("Arial", "B", 9)
        pdf.set_text_color(80, 80, 120)
        pdf.set_x(20)
        pdf.cell(55, 6, _s("Questions Evaluated:"), ln=False)
        pdf.set_font("Arial", "", 9)
        pdf.set_text_color(30, 30, 30)
        counted = [q for q in questions if q.get("is_counted", True)]
        pdf.cell(65, 6, _s(str(len(counted))), ln=False)
        
        pdf.set_font("Arial", "B", 9)
        pdf.set_text_color(80, 80, 120)
        pdf.cell(35, 6, _s("Evaluation Mode:"), ln=False)
        pdf.set_font("Arial", "", 9)
        pdf.set_text_color(30, 30, 30)
        pdf.cell(0, 6, _s("AI-Assisted Academic Grading"), ln=True)
        
        pdf.set_font("Arial", "B", 9)
        pdf.set_text_color(80, 80, 120)
        pdf.set_x(20)
        pdf.cell(55, 6, _s("Examiner:"), ln=False)
        pdf.set_font("Arial", "", 9)
        pdf.set_text_color(30, 30, 30)
        pdf.cell(0, 6, _s("ShikshakAI Autonomous Evaluator"), ln=True)
        
        pdf.set_xy(15, 80)
        
        # ── SCORE SUMMARY BOX ──
        # Determine color based on grade
        if percentage >= 75:
            box_r, box_g, box_b = 0, 150, 100   # Green
        elif percentage >= 50:
            box_r, box_g, box_b = 200, 140, 0   # Amber
        else:
            box_r, box_g, box_b = 190, 30, 60   # Red
        
        pdf.set_fill_color(box_r, box_g, box_b)
        pdf.rect(15, 80, 180, 30, 'F')
        pdf.set_text_color(255, 255, 255)
        pdf.set_font("Arial", "B", 22)
        pdf.set_xy(20, 84)
        pdf.cell(80, 14, _s(f"{total_awarded} / {total_possible}"), ln=False)
        
        pdf.set_font("Arial", "B", 14)
        pdf.set_xy(100, 84)
        pdf.cell(40, 14, _s(f"{percentage}%"), ln=False)
        
        pdf.set_font("Arial", "B", 18)
        pdf.set_xy(145, 82)
        pdf.cell(30, 18, _s(f"Grade: {grade}"), ln=False)
        
        pdf.set_font("Arial", "", 9)
        pdf.set_xy(20, 98)
        # Performance band
        band = "Distinction" if percentage >= 75 else "First Class" if percentage >= 60 else "Second Class" if percentage >= 50 else "Fail"
        pdf.cell(0, 6, _s(f"Performance Band: {band}"), ln=True)
        
        pdf.set_text_color(0, 0, 0)
        pdf.set_xy(15, 118)
        
        # ── QUESTION-WISE MARKS TABLE ──
        pdf.set_font("Arial", "B", 11)
        pdf.set_text_color(25, 40, 90)
        pdf.cell(0, 8, _s("Question-wise Marks Breakdown"), ln=True)
        pdf.ln(2)
        
        # Table header
        pdf.set_fill_color(25, 40, 90)
        pdf.set_text_color(255, 255, 255)
        pdf.set_font("Arial", "B", 9)
        col_w = [16, 30, 22, 25, 22, 75]
        hdrs = ["Q.No", "Section", "Marks", "Max", "Status", "Examiner Remarks"]
        for i, h in enumerate(hdrs):
            pdf.cell(col_w[i], 8, _s(h), border=1, align="C", fill=True)
        pdf.ln()
        
        pdf.set_font("Arial", "", 8)
        for q in questions:
            awarded_q = float(q.get("marks_awarded", 0))
            total_q = float(q.get("marks_total", 0))
            is_counted = q.get("is_counted", True)
            status = str(q.get("status", "")).lower()
            
            if not is_counted or status == "optional_skipped":
                pdf.set_fill_color(235, 235, 245)
                pdf.set_text_color(140, 140, 160)
            elif awarded_q >= total_q:
                pdf.set_fill_color(220, 245, 230)  # Light green
                pdf.set_text_color(0, 100, 50)
            elif awarded_q == 0 or status in ("zero", "not_attempted"):
                pdf.set_fill_color(250, 220, 225)  # Light red
                pdf.set_text_color(160, 30, 50)
            else:
                pdf.set_fill_color(255, 248, 215)  # Light amber
                pdf.set_text_color(120, 80, 0)
            
            status_label = "Full" if awarded_q >= total_q else ("Not Attempted" if status == "not_attempted" else ("Skipped" if not is_counted else "Partial"))
            feedback_short = str(q.get("feedback", q.get("red_pen_comment", "") or ""))[:90]
            
            row_data = [
                str(q.get("question_no", "")),
                str(q.get("section", "—"))[:18],
                str(awarded_q),
                str(total_q),
                status_label,
                feedback_short
            ]
            for i, cell_val in enumerate(row_data):
                pdf.cell(col_w[i], 7, _s(cell_val), border=1, align="C" if i < 5 else "L", fill=True)
            pdf.ln()
        
        pdf.set_text_color(0, 0, 0)
        pdf.set_fill_color(255, 255, 255)
        pdf.ln(6)
        
        # ── MARK LOSS ANALYSIS ──
        losses = evaluation_data.get("mark_loss_analysis", [])
        if losses:
            pdf.set_font("Arial", "B", 10)
            pdf.set_text_color(160, 30, 50)
            pdf.cell(0, 8, _s("Areas Where Marks Were Lost:"), ln=True)
            pdf.set_font("Arial", "", 9)
            pdf.set_text_color(60, 60, 60)
            for loss in losses[:8]:  # Cap at 8 items
                pdf.cell(5, 6, _s(""), ln=False)  # indent
                pdf.cell(0, 6, _s(f"• {loss}"), ln=True)
            pdf.ln(4)
        
        # ── EXAMINER'S OVERALL REMARKS ──
        pdf.set_font("Arial", "B", 10)
        pdf.set_text_color(25, 40, 90)
        pdf.cell(0, 8, _s("Examiner's Overall Assessment:"), ln=True)
        
        pdf.set_fill_color(248, 249, 255)
        pdf.set_draw_color(180, 190, 220)
        x_before = pdf.get_x()
        y_before = pdf.get_y()
        pdf.set_font("Arial", "", 9)
        pdf.set_text_color(40, 40, 60)
        pdf.multi_cell(180, 6, _s(overall_feedback or "Student's paper has been evaluated thoroughly."), border=1, fill=True)
        pdf.ln(6)
        
        # ── SIGNATURE / ATTESTATION BLOCK ──
        y_sig = pdf.get_y()
        if y_sig > 250:  # Not enough room — add page
            pdf.add_page()
            y_sig = 20
        
        pdf.set_draw_color(180, 190, 220)
        pdf.set_fill_color(248, 249, 255)
        pdf.rect(15, y_sig, 180, 30, 'FD')
        
        pdf.set_font("Arial", "B", 8)
        pdf.set_text_color(80, 80, 120)
        pdf.set_xy(20, y_sig + 4)
        pdf.cell(80, 5, _s("Evaluated on:"), ln=False)
        pdf.set_font("Arial", "", 8)
        pdf.set_text_color(30, 30, 30)
        pdf.cell(0, 5, _s(now_str), ln=True)
        
        pdf.set_font("Arial", "B", 8)
        pdf.set_text_color(80, 80, 120)
        pdf.set_xy(20, y_sig + 12)
        pdf.cell(80, 5, _s("Evaluator:"), ln=False)
        pdf.set_font("Arial", "", 8)
        pdf.set_text_color(30, 30, 30)
        pdf.cell(0, 5, _s("ShikshakAI Evaluation System"), ln=True)
        
        pdf.set_font("Arial", "B", 8)
        pdf.set_text_color(80, 80, 120)
        pdf.set_xy(20, y_sig + 20)
        pdf.cell(80, 5, _s("Teacher Signature / Stamp:"), ln=False)
        pdf.set_font("Arial", "", 8)
        pdf.set_text_color(170, 170, 190)
        pdf.cell(0, 5, _s("_________________________"), ln=True)
        
        # ── FOOTER ──
        pdf.set_y(-15)
        pdf.set_font("Arial", "I", 7)
        pdf.set_text_color(160, 160, 180)
        pdf.cell(0, 5, _s(f"ShikshakAI · Evaluation Report · {now_str} · This is an official evaluation record."), align="C")
        
        # ─────────────────────────────────────────
        # SUBSEQUENT PAGES: ANNOTATED ANSWER SHEETS
        # ─────────────────────────────────────────
        temp_files = []
        for i, img in enumerate(annotated_images):
            pdf.add_page()
            
            # Mini header on each page
            pdf.set_fill_color(25, 40, 90)
            pdf.rect(0, 0, 210, 14, 'F')
            pdf.set_text_color(255, 255, 255)
            pdf.set_font("Arial", "B", 9)
            pdf.set_xy(15, 4)
            pdf.cell(100, 6, _s(f"Answer Sheet — Page {i+1} of {len(annotated_images)}"), ln=False)
            pdf.set_font("Arial", "", 8)
            pdf.set_xy(140, 4)
            pdf.cell(0, 6, _s(f"Score: {total_awarded}/{total_possible}  Grade: {grade}"), ln=True)
            
            pdf.set_text_color(0, 0, 0)
            
            tmp_path = f"temp_annotated_{i}.jpg"
            if img.mode != "RGB":
                img = img.convert("RGB")
            MAX_PDF_PIXELS = 8_000_000
            if img.width * img.height > MAX_PDF_PIXELS:
                scale = (MAX_PDF_PIXELS / (img.width * img.height)) ** 0.5
                img = img.resize((int(img.width * scale), int(img.height * scale)), Image.LANCZOS)
            img.save(tmp_path, "JPEG", quality=80)
            temp_files.append(tmp_path)
            
            # Image starts below header
            pdf.image(tmp_path, x=15, y=18, w=180)
            
            # Page footer
            pdf.set_y(-12)
            pdf.set_font("Arial", "I", 7)
            pdf.set_text_color(160, 160, 180)
            pdf.cell(0, 5, _s(f"ShikshakAI · Answer Sheet Page {i+1}"), align="C")
        
        output_path = "professional_evaluation_report.pdf"
        pdf.output(output_path)
        
        for f in temp_files:
            if os.path.exists(f):
                os.remove(f)
        
        return output_path
