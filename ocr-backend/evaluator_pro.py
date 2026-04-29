import io
import os
import copy
from typing import List, Dict, Any
from PIL import Image, ImageDraw, ImageFont
import Levenshtein
from fpdf import FPDF
import base64

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
        """
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
        Generates a PDF containing annotated images and a professional report card.
        Returns the path to the PDF.
        """
        pdf = FPDF()
        pdf.set_auto_page_break(auto=True, margin=15)
        
        # =========================================================
        # PAGE 1: REPORT CARD
        # =========================================================
        pdf.add_page()
        pdf.set_font("Arial", "B", 20)
        pdf.set_text_color(30, 30, 80)
        pdf.cell(0, 15, "ShikshakAI - Professional Evaluation Report", ln=True, align="C")
        pdf.ln(10)
        
        # Summary Box
        pdf.set_font("Arial", "B", 14)
        pdf.set_fill_color(240, 240, 245)
        pdf.set_text_color(0, 0, 0)
        
        total_awarded = evaluation_data.get("total_awarded", 0)
        total_possible = evaluation_data.get("total_possible", 0)
        percentage = evaluation_data.get("percentage", 0)
        grade = evaluation_data.get("grade", "N/A")
        
        pdf.cell(0, 10, f"Final Score: {total_awarded} / {total_possible}  ({percentage}%)  -  Grade: {grade}", border=1, ln=True, fill=True, align="C")
        pdf.ln(10)
        
        # Detailed Question Table
        pdf.set_font("Arial", "B", 11)
        pdf.set_fill_color(200, 200, 220)
        col_widths = [20, 25, 30, 115]
        headers = ["Q.No", "Marks", "Status", "Feedback"]
        for i, h in enumerate(headers):
            pdf.cell(col_widths[i], 10, h, border=1, fill=True, align="C")
        pdf.ln()
        
        pdf.set_font("Arial", "", 10)
        for q in evaluation_data.get("questions", []):
            marks_str = f"{q.get('marks_awarded')}/{q.get('marks_total')}"
            status = q.get("status", "evaluated").capitalize()
            feedback = q.get("red_pen_comment", "")[:80] # Trim if too long for table
            
            # Row
            pdf.cell(col_widths[0], 8, str(q.get("question_no")), border=1, align="C")
            pdf.cell(col_widths[1], 8, marks_str, border=1, align="C")
            pdf.cell(col_widths[2], 8, status, border=1, align="C")
            pdf.cell(col_widths[3], 8, feedback, border=1)
            pdf.ln()
            
        pdf.ln(10)
        
        # Mark Loss Analysis
        pdf.set_font("Arial", "B", 12)
        pdf.set_text_color(180, 0, 0)
        pdf.cell(0, 10, "Mark Loss Analysis (Where did the student lose marks?)", ln=True)
        pdf.set_font("Arial", "", 11)
        pdf.set_text_color(0, 0, 0)
        
        losses = evaluation_data.get("mark_loss_analysis", [])
        if not losses:
            pdf.cell(0, 8, "No significant marks lost.", ln=True)
        else:
            for loss in losses:
                # Handle unicode safely
                safe_loss = loss.encode("latin-1", "replace").decode("latin-1")
                pdf.cell(0, 8, f"  • {safe_loss}", ln=True)
                
        pdf.ln(10)
        
        # General Feedback
        pdf.set_font("Arial", "B", 12)
        pdf.cell(0, 10, "Overall Assessor Feedback:", ln=True)
        pdf.set_font("Arial", "", 11)
        feedback_safe = evaluation_data.get("overall_feedback", "").encode("latin-1", "replace").decode("latin-1")
        pdf.multi_cell(0, 8, feedback_safe)
        
        # =========================================================
        # SUBSEQUENT PAGES: ANNOTATED IMAGES
        # =========================================================
        # Save temp images
        temp_files = []
        for i, img in enumerate(annotated_images):
            pdf.add_page()
            pdf.set_font("Arial", "B", 12)
            pdf.cell(0, 10, f"Annotated Answer Sheet - Page {i+1}", ln=True, align="C")
            
            tmp_path = f"temp_annotated_{i}.jpg"
            # Optimize image size for PDF
            img.save(tmp_path, "JPEG", quality=75)
            temp_files.append(tmp_path)
            
            # Fit image to page width
            # A4 width is 210mm. Margins are 15mm each side. Usable width = 180mm
            pdf.image(tmp_path, x=15, w=180)
            
        # Save PDF
        output_path = "professional_evaluation_report.pdf"
        pdf.output(output_path)
        
        # Cleanup temp files
        for f in temp_files:
            if os.path.exists(f):
                os.remove(f)
                
        return output_path
