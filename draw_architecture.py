import matplotlib.pyplot as plt
import matplotlib.patches as patches

fig, ax = plt.subplots(figsize=(12, 14))
ax.axis('off')

def draw_box(ax, x, y, width, height, text, bg_color='#f0f4f8', border_color='#2c3e50', font_size=11, font_weight='normal'):
    rect = patches.FancyBboxPatch((x, y), width, height, boxstyle="round,pad=0.05,rounding_size=0.1", 
                                  linewidth=1.5, edgecolor=border_color, facecolor=bg_color)
    ax.add_patch(rect)
    ax.text(x + width / 2, y + height / 2, text, ha='center', va='center', 
            fontsize=font_size, fontweight=font_weight, color='#1a1a1a', wrap=True)
    return x + width / 2, y, x + width / 2, y + height, x, y + height / 2, x + width, y + height / 2

def draw_arrow(ax, x1, y1, x2, y2, text=""):
    ax.annotate(text, xy=(x2, y2), xytext=(x1, y1),
                arrowprops=dict(arrowstyle="->", color='#34495e', lw=2),
                fontsize=9, color='#34495e', ha='center', va='center',
                bbox=dict(boxstyle="round,pad=0.2", fc="white", ec="none", alpha=0.8) if text else None)

# Define positions
width = 5
height = 1
center_x = 3.5

# 1. Data Ingestion
_, b1, _, t1, _, _, _, _ = draw_box(ax, center_x - width/2, 12, width, height, "Data Ingestion Module\n(PDF/Image Parallel Processing)", '#e2e8f0', '#475569', 12, 'bold')

# 2. Preprocessing
_, b2, _, t2, _, _, _, _ = draw_box(ax, center_x - width/2, 10, width, height*1.5, "Intelligent Preprocessing\n\n• Resolution Upscaling\n• Adaptive Gaussian Thresholding\n• Non-Local Means Denoising\n• Hough Transform Deskewing", '#e0f2fe', '#0284c7', 11)

# 3. Layout Analysis
_, b3, _, t3, _, _, _, _ = draw_box(ax, center_x - width/2, 8, width, height*1.2, "Layout & Segmentation\n\n• Horizontal Projection Profile (HPP)\n• Line-level ROI Extraction", '#dcfce7', '#16a34a', 11)

# 4. Multi-Engine OCR
_, b4, _, t4, _, _, _, _ = draw_box(ax, center_x - width/2, 5.5, width, height*1.5, "Multi-Engine Recognition Core\n\n• Primary: TrOCR (Vision-Encoder-Decoder)\n• Dynamic Quantization & True Batching\n• Secondary Fallbacks: PaddleOCR / EasyOCR\n• Hallucination Filtration", '#fef3c7', '#d97706', 11)

# 5. LLM Evaluation
_, b5, _, t5, _, _, _, _ = draw_box(ax, center_x - width/2, 3, width, height*1.5, "LLM Assessment & Analytics\n\n• Multi-Model Routing (Groq/Anthropic/Gemini)\n• Bloom's Taxonomy Cognitive Categorization\n• Levenshtein Fuzzy Spatial Mapping", '#f3e8ff', '#9333ea', 11)

# 6. Output
_, b6, _, t6, _, _, _, _ = draw_box(ax, center_x - width/2, 1, width, height*1.2, "Output Generation\n\n• Structured JSON Telemetry\n• Visual 'Pro Reports' (PDF Overlay)", '#ffe4e6', '#e11d48', 11, 'bold')

# Draw Arrows
draw_arrow(ax, center_x, b1, center_x, t2)
draw_arrow(ax, center_x, b2, center_x, t3)
draw_arrow(ax, center_x, b3, center_x, t4)
draw_arrow(ax, center_x, b4, center_x, t5)
draw_arrow(ax, center_x, b5, center_x, t6)

plt.title("Proposed OCR & Academic Assessment Pipeline", fontsize=16, fontweight='bold', pad=20)
plt.xlim(0, 7)
plt.ylim(0, 14)

# Save as High-Res PNG and Vector PDF (Standard for papers)
plt.savefig("ShikshakAI_Architecture_Diagram.png", dpi=600, bbox_inches='tight')
plt.savefig("ShikshakAI_Architecture_Diagram.pdf", format='pdf', bbox_inches='tight')
print("Successfully generated ShikshakAI_Architecture_Diagram.png and ShikshakAI_Architecture_Diagram.pdf")
