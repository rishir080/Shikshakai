// app/api/bloom/analyze/route.ts
import { NextRequest, NextResponse } from "next/server";

const PYTHON_BACKEND = process.env.PYTHON_BACKEND_URL || "http://127.0.0.1:8080";
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

const GROQ_MODELS = [
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "qwen/qwen3.8-27b",
];

const BLOOM_NAMES: Record<number, string> = {
  1: "Remember",
  2: "Understand",
  3: "Apply",
  4: "Analyze",
  5: "Evaluate",
  6: "Create",
};

function normalizeBloomData(raw: any, rawText: string) {
  const rawQuestions = Array.isArray(raw?.questions) ? raw.questions : [];

  let totalMarks = 0;
  const questions = rawQuestions.map((q: any, idx: number) => {
    let levelNum = Number(q.bloom_level);
    if (isNaN(levelNum) || levelNum < 1 || levelNum > 6) {
      const name = String(q.bloom_name || "").toLowerCase();
      if (name.includes("remember")) levelNum = 1;
      else if (name.includes("understand")) levelNum = 2;
      else if (name.includes("apply")) levelNum = 3;
      else if (name.includes("analyze") || name.includes("analyse")) levelNum = 4;
      else if (name.includes("evaluate")) levelNum = 5;
      else if (name.includes("create")) levelNum = 6;
      else levelNum = 2; // sensible fallback
    }

    const marksNum = parseInt(String(q.marks || "").replace(/[^0-9]/g, ""), 10) || 5;
    totalMarks += marksNum;

    const isAmbiguous = Boolean(q.is_ambiguous);
    const altLevel = isAmbiguous && q.alternative_level ? Number(q.alternative_level) : null;
    const ambiguityNote = q.ambiguity_note || null;

    // For ambiguous questions allow lower confidence (min 50), otherwise min 70
    const minConf = isAmbiguous ? 50 : 70;

    const low = Math.max(1, levelNum - 1);
    const high = Math.min(6, levelNum + 1);
    const educatorSpectrum = q.educator_spectrum || (levelNum > 1 && levelNum < 6 ? `L${low} (${BLOOM_NAMES[low]}) ↔ L${high} (${BLOOM_NAMES[high]})` : `L${levelNum} (${BLOOM_NAMES[levelNum]})`);
    const spectrumLower = q.spectrum_lower !== undefined && q.spectrum_lower !== null ? Number(q.spectrum_lower) : (levelNum > 1 ? low : null);
    const spectrumHigher = q.spectrum_higher !== undefined && q.spectrum_higher !== null ? Number(q.spectrum_higher) : (levelNum < 6 ? high : null);
    const lowerPerspective = q.lower_perspective_rationale || `If students were trained on this standard textbook formula or definition, it functions primarily as routine procedural recall (L${low}).`;
    const higherPerspective = q.higher_perspective_rationale || `If presented as an unguided scenario requiring multi-variable deconstruction and synthesis, it demands analytical rigor (L${high}).`;
    const contextualFactors = Array.isArray(q.contextual_factors) && q.contextual_factors.length > 0 ? q.contextual_factors : ["Instructional Scaffolding", "Problem Novelty vs Textbook Routine", "Multi-Step vs Single-Step Synthesis"];

    return {
      id: q.id || `q_${idx + 1}`,
      question_number: q.question_number || `Q${idx + 1}`,
      text: q.text || `Question ${idx + 1}`,
      marks: marksNum,
      bloom_level: levelNum,
      bloom_name: BLOOM_NAMES[levelNum] || q.bloom_name || "Understand",
      action_verb: q.action_verb || "Analyze",
      knowledge_dimension: ["Factual", "Conceptual", "Procedural", "Metacognitive"].includes(q.knowledge_dimension)
        ? q.knowledge_dimension
        : "Conceptual",
      difficulty: ["Low", "Medium", "High"].includes(q.difficulty) ? q.difficulty : "Medium",
      confidence: Math.min(100, Math.max(minConf, Number(q.confidence) || 85)),
      rationale: q.rationale || "Cognitive process verified under revised Bloom's taxonomy standards.",
      level_up_suggestion: q.level_up_suggestion || "Add a real-world comparative or evaluative dimension.",
      is_ambiguous: isAmbiguous,
      alternative_level: (altLevel && altLevel >= 1 && altLevel <= 6) ? altLevel : null,
      ambiguity_note: ambiguityNote,
      educator_spectrum: educatorSpectrum,
      spectrum_lower: spectrumLower,
      spectrum_higher: spectrumHigher,
      lower_perspective_rationale: lowerPerspective,
      higher_perspective_rationale: higherPerspective,
      contextual_factors: contextualFactors,
      humanized_notes: q.humanized_notes || `Teacher Note: Cognitive load depends heavily on whether students have previously seen this specific problem pattern.`,
    };
  });

  const totalQuestions = questions.length || 1;
  const lotsCount = questions.filter((q: any) => q.bloom_level <= 2).length;
  const hotsCount = totalQuestions - lotsCount;

  const lotsPercentage = Math.round((lotsCount / totalQuestions) * 100);
  const hotsPercentage = 100 - lotsPercentage;

  const dist: Record<string, { count: number; percentage: number; name: string }> = {};
  for (let l = 1; l <= 6; l++) {
    const count = questions.filter((q: any) => q.bloom_level === l).length;
    dist[String(l)] = {
      count,
      percentage: Math.round((count / totalQuestions) * 100),
      name: BLOOM_NAMES[l],
    };
  }

  // Determine dominant level
  let dominantLevelNum = 1;
  let maxCount = -1;
  for (let l = 1; l <= 6; l++) {
    if (dist[String(l)].count > maxCount) {
      maxCount = dist[String(l)].count;
      dominantLevelNum = l;
    }
  }

  // Determine balance rating
  let balanceRating = "Balanced (NEP 2020 Aligned)";
  if (lotsPercentage >= 65) {
    balanceRating = "Recall-Heavy (Skewed towards LOTS)";
  } else if (hotsPercentage >= 75) {
    balanceRating = "High Cognitive Rigor (HOTS Dominant)";
  } else if (dist["3"].percentage >= 40) {
    balanceRating = "Application-Centric (Practical Problem Solving)";
  }

  const rawSummary = raw?.summary || {};

  const summary = {
    total_questions: totalQuestions,
    total_marks: rawSummary.total_marks || totalMarks,
    lots_percentage: lotsPercentage,
    hots_percentage: hotsPercentage,
    lots_count: lotsCount,
    hots_count: hotsCount,
    distribution: dist,
    dominant_level: `L${dominantLevelNum} • ${BLOOM_NAMES[dominantLevelNum]}`,
    balance_rating: rawSummary.balance_rating || balanceRating,
    pedagogical_critique:
      rawSummary.pedagogical_critique ||
      `Paper exhibits ${lotsPercentage}% Lower-Order Thinking Skills (LOTS) and ${hotsPercentage}% Higher-Order Thinking Skills (HOTS).`,
    recommendations:
      Array.isArray(rawSummary.recommendations) && rawSummary.recommendations.length > 0
        ? rawSummary.recommendations
        : [
            lotsPercentage > 50
              ? "Elevate definition questions into compare/contrast or problem-solving scenarios."
              : "Maintain the current balance while providing clear analytical rubrics.",
            "Include case study evaluations (L5) to assess critical judgment.",
            "Verify that mark allocations correspond accurately to cognitive complexity.",
          ],
    subject_detected: rawSummary.subject_detected || "General Academic Assessment",
    ambiguous_count: questions.filter((q: any) => q.is_ambiguous).length,
    humanized_perception_note:
      rawSummary.humanized_perception_note ||
      "Cognitive rigor is situated within teaching context; questions can shift along the spectrum based on prior classroom familiarity.",
  };

  return { questions, summary };
}

async function callDirectLLM(text: string, subject?: string, level?: string) {
  const subjectHint = subject ? `Subject / Domain: ${subject}.` : "";
  const levelHint = level ? `Target Student Level: ${level}.` : "";

  const prompt = `You are an expert pedagogical assessment specialist, senior curriculum auditor, and authoritative Bloom's Taxonomy taxonomist specializing in the Revised Bloom's Taxonomy (Anderson & Krathwohl, 2001).

Your task is to analyze the provided question paper or questions with MAXIMUM PEDAGOGICAL PRECISION.
${subjectHint} ${levelHint}

COGNITIVE PROCESS LEVELS:
- L1 - Remember (Level 1): Retrieving relevant knowledge from long-term memory without alteration.
- L2 - Understand (Level 2): Constructing meaning; explaining concepts in own words, summarizing, comparing basic ideas.
- L3 - Apply (Level 3): Executing or implementing a procedure, algorithm, or mathematical formula in a given problem scenario.
- L4 - Analyze (Level 4): Breaking material into constituent parts, examining relationships, comparing architectural trade-offs.
- L5 - Evaluate (Level 5): Making judgments based on explicit criteria, defending decisions, critiquing approaches.
- L6 - Create (Level 6): Synthesizing elements into a novel whole, designing original algorithms, architectures, or models.

PRECISION & HUMANIZATION RULES:
1. Parse every distinct question, sub-question, or numbered problem.
2. CONTEXT over keywords: Look at the actual cognitive demand, not merely the verb.
3. HUMANIZE THE CLASSIFICATION: Real teachers view cognitive demand as a spectrum. Provide:
   - "educator_spectrum": e.g. "L2 (Understand) ↔ L4 (Analyze)"
   - "spectrum_lower": adjacent lower level number or null
   - "spectrum_higher": adjacent higher level number or null
   - "lower_perspective_rationale": why an educator might classify this lower (e.g. routine textbook problem)
   - "higher_perspective_rationale": why an educator might classify this higher (e.g. unguided multi-step synthesis)
   - "contextual_factors": 2-3 factors that shift human perception of this question
   - "is_ambiguous": true if on a cognitive borderline
4. Provide rationale, level_up_suggestion, and full paper summary metrics.

QUESTIONS TO ANALYZE:
"""
${text.slice(0, 8000)}
"""

Respond ONLY with valid JSON (no markdown fences):
{
  "questions": [
    {
      "id": "q1",
      "question_number": "Q1",
      "text": "Full question text",
      "marks": 5,
      "bloom_level": 1,
      "bloom_name": "Remember",
      "action_verb": "Define",
      "knowledge_dimension": "Factual",
      "difficulty": "Low",
      "confidence": 95,
      "is_ambiguous": false,
      "alternative_level": 2,
      "ambiguity_note": null,
      "educator_spectrum": "L1 (Remember) ↔ L2 (Understand)",
      "spectrum_lower": 1,
      "spectrum_higher": 2,
      "lower_perspective_rationale": "Requires pure recall from long-term memory without manipulation.",
      "higher_perspective_rationale": "If personal synthesis or illustration is required, could touch Level 2.",
      "contextual_factors": ["Instructional Scaffolding", "Problem Familiarity"],
      "rationale": "Requires pure recall from long-term memory.",
      "level_up_suggestion": "Elevated question formulation"
    }
  ],
  "summary": {
    "total_questions": 1,
    "total_marks": 5,
    "lots_percentage": 100,
    "hots_percentage": 0,
    "lots_count": 1,
    "hots_count": 0,
    "distribution": {
      "1": { "count": 1, "percentage": 100, "name": "Remember" },
      "2": { "count": 0, "percentage": 0, "name": "Understand" },
      "3": { "count": 0, "percentage": 0, "name": "Apply" },
      "4": { "count": 0, "percentage": 0, "name": "Analyze" },
      "5": { "count": 0, "percentage": 0, "name": "Evaluate" },
      "6": { "count": 0, "percentage": 0, "name": "Create" }
    },
    "dominant_level": "Remember (L1)",
    "balance_rating": "Recall-Heavy",
    "pedagogical_critique": "Assessment relies heavily on rote recall.",
    "recommendations": ["Add application and analytical questions."],
    "subject_detected": "General",
    "ambiguous_count": 0,
    "humanized_perception_note": "Cognitive rigor varies based on whether problems were practiced in homework."
  }
}`;

  if (GROQ_API_KEY) {
    for (const model of GROQ_MODELS) {
      try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${GROQ_API_KEY}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: "system",
                content: "You are an expert Bloom Taxonomy evaluator. Output ONLY valid JSON, no markdown fences.",
              },
              { role: "user", content: prompt },
            ],
            response_format: { type: "json_object" },
            temperature: 0.1,
            max_tokens: 4096,
          }),
          signal: AbortSignal.timeout(60_000),
        });

        if (response.ok) {
          const data = await response.json();
          let rawText = data.choices?.[0]?.message?.content || "";
          rawText = rawText.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, "").trim();
          if (rawText.startsWith("```")) {
            rawText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
          }
          const parsed = JSON.parse(rawText);
          return normalizeBloomData(parsed, text);
        }
      } catch (e) {
        console.warn(`[API/BLOOM] Groq model ${model} failed:`, e);
      }
    }
  }

  // Gemini Fallback
  if (GEMINI_API_KEY) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
        }),
        signal: AbortSignal.timeout(60_000),
      });

      if (resp.ok) {
        const data = await resp.json();
        let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        if (rawText.startsWith("```")) {
          rawText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
        }
        const parsed = JSON.parse(rawText);
        return normalizeBloomData(parsed, text);
      }
    } catch (e) {
      console.warn("[API/BLOOM] Gemini fallback failed:", e);
    }
  }

  throw new Error("All LLM providers failed for Bloom's Taxonomy analysis.");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body || !body.text || !body.text.trim()) {
      return NextResponse.json(
        { status: "error", message: "Please provide question paper text for analysis." },
        { status: 400 }
      );
    }

    const { text, subject, level } = body;

    // 1. Try Python backend first
    try {
      const pyResp = await fetch(`${PYTHON_BACKEND}/api/bloom/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, subject, level }),
        signal: AbortSignal.timeout(45_000),
      });

      if (pyResp.ok) {
        const pyData = await pyResp.json();
        if (pyData.status === "success" && pyData.questions) {
          const normalized = normalizeBloomData(pyData, text);
          return NextResponse.json({ status: "success", ...normalized });
        }
      }
    } catch (pyErr) {
      console.warn("[API/BLOOM] Python backend unreachable or failed, falling back to Next.js LLM:", pyErr);
    }

    // 2. Direct LLM fallback (Groq / Gemini)
    const result = await callDirectLLM(text, subject, level);
    return NextResponse.json({ status: "success", ...result });
  } catch (error: any) {
    console.error("[API/BLOOM/ANALYZE] Error:", error);
    return NextResponse.json(
      { status: "error", message: error.message || "Bloom's analysis failed." },
      { status: 500 }
    );
  }
}
