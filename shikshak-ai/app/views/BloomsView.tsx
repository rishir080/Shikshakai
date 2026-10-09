'use client';
import React, { useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain,
  CheckCircle2,
  AlertTriangle,
  Search,
  Sparkles,
  BookOpen,
  Layers,
  Filter,
  Copy,
  Printer,
  RotateCcw,
  FileText,
  UploadCloud,
  Check,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  Sliders,
  BarChart3,
  ArrowUpRight,
  Paperclip,
  FileUp,
} from 'lucide-react';

// ── Bloom Level Color & Theme Definitions ────────────────────────────────────
export interface BloomLevelMeta {
  level: number;
  name: string;
  color: string;
  bg: string;
  border: string;
  lightBg: string;
  category: 'LOTS' | 'HOTS';
  desc: string;
  verbs: string[];
}

export const BLOOM_LEVELS_META: Record<number, BloomLevelMeta> = {
  1: {
    level: 1,
    name: 'Remember',
    color: '#3b82f6',
    bg: 'rgba(59, 130, 246, 0.15)',
    border: 'rgba(59, 130, 246, 0.35)',
    lightBg: 'rgba(59, 130, 246, 0.08)',
    category: 'LOTS',
    desc: 'Retrieving relevant knowledge from long-term memory without manipulation.',
    verbs: ['Define', 'List', 'State', 'Identify', 'Recall', 'Name', 'Match', 'Enumerate'],
  },
  2: {
    level: 2,
    name: 'Understand',
    color: '#06b6d4',
    bg: 'rgba(6, 182, 212, 0.15)',
    border: 'rgba(6, 182, 212, 0.35)',
    lightBg: 'rgba(6, 182, 212, 0.08)',
    category: 'LOTS',
    desc: 'Constructing meaning, summarizing, interpreting, and explaining ideas in own words.',
    verbs: ['Explain', 'Describe', 'Summarize', 'Classify', 'Illustrate', 'Paraphrase', 'Discuss'],
  },
  3: {
    level: 3,
    name: 'Apply',
    color: '#10b981',
    bg: 'rgba(16, 185, 129, 0.15)',
    border: 'rgba(16, 185, 129, 0.35)',
    lightBg: 'rgba(16, 185, 129, 0.08)',
    category: 'HOTS',
    desc: 'Executing or implementing formulas, techniques, or algorithms to solve problems.',
    verbs: ['Calculate', 'Solve', 'Implement', 'Demonstrate', 'Execute', 'Apply', 'Determine'],
  },
  4: {
    level: 4,
    name: 'Analyze',
    color: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.15)',
    border: 'rgba(245, 158, 11, 0.35)',
    lightBg: 'rgba(245, 158, 11, 0.08)',
    category: 'HOTS',
    desc: 'Deconstructing complex concepts, examining causality, comparing architectures & trade-offs.',
    verbs: ['Analyze', 'Compare & Contrast', 'Differentiate', 'Deconstruct', 'Examine', 'Categorize'],
  },
  5: {
    level: 5,
    name: 'Evaluate',
    color: '#f97316',
    bg: 'rgba(249, 115, 22, 0.15)',
    border: 'rgba(249, 115, 22, 0.35)',
    lightBg: 'rgba(249, 115, 22, 0.08)',
    category: 'HOTS',
    desc: 'Making judgments based on standards, critiquing approaches, and defending decisions.',
    verbs: ['Critique', 'Evaluate', 'Judge', 'Justify', 'Defend', 'Assess', 'Appraise', 'Validate'],
  },
  6: {
    level: 6,
    name: 'Create',
    color: '#a855f7',
    bg: 'rgba(168, 85, 247, 0.15)',
    border: 'rgba(168, 85, 247, 0.35)',
    lightBg: 'rgba(168, 85, 247, 0.08)',
    category: 'HOTS',
    desc: 'Synthesizing parts into a novel whole, designing original algorithms, architectures, or models.',
    verbs: ['Design', 'Formulate', 'Develop', 'Synthesize', 'Architect', 'Propose', 'Compose'],
  },
};

const KNOWLEDGE_DIMENSION_COLORS: Record<string, { color: string; bg: string }> = {
  Factual: { color: '#60a5fa', bg: 'rgba(96, 165, 250, 0.12)' },
  Conceptual: { color: '#c084fc', bg: 'rgba(192, 132, 252, 0.12)' },
  Procedural: { color: '#34d399', bg: 'rgba(52, 211, 153, 0.12)' },
  Metacognitive: { color: '#fb923c', bg: 'rgba(251, 146, 60, 0.12)' },
};

// ── Sample Exam Papers for Instant Testing ───────────────────────────────────
const SAMPLE_PAPERS = [
  {
    title: 'Computer Science: Operating Systems & Algorithms (Balanced L1–L6)',
    subject: 'Computer Science',
    level: 'Higher Education / Engineering',
    text: `1. Define operating system and list four primary functions of a modern OS kernel. (4 Marks)
2. Explain the difference between preemptive and non-preemptive CPU scheduling algorithms with diagrams. (6 Marks)
3. Calculate the average waiting time and turnaround time for the given processes using the Shortest Job First (SJF) scheduling algorithm: P1(Burst=6), P2(Burst=8), P3(Burst=7), P4(Burst=3). (8 Marks)
4. Compare and contrast paging and segmentation memory management techniques. Analyze why segmentation leads to external fragmentation while paging leads to internal fragmentation. (10 Marks)
5. Critique the design trade-offs of using a Monolithic Kernel vs. a Microkernel architecture in a real-time autonomous vehicle safety system. Justify your architectural recommendation. (10 Marks)
6. Design an energy-efficient adaptive CPU scheduling algorithm for battery-constrained IoT sensor nodes that dynamically balances power consumption against packet processing latency. (12 Marks)`,
  },
  {
    title: 'Engineering Physics: Electromagnetism & Modern Physics',
    subject: 'Physics',
    level: 'Undergraduate Science',
    text: `1. State Gauss's Law of Electrostatics in both integral and differential forms. (3 Marks)
2. Describe the physical mechanism of dielectric polarization under an applied alternating electric field. (5 Marks)
3. Calculate the magnetic field intensity at the center of a circular loop of radius 0.15 m carrying a steady current of 4.5 A. (6 Marks)
4. Differentiate between paramagnetic, diamagnetic, and ferromagnetic materials in terms of magnetic domain theory. (8 Marks)
5. Evaluate whether high-temperature superconducting cables are technically and economically viable for high-density metropolitan underground power grids. (10 Marks)
6. Formulate a mathematical model to optimize the cross-sectional geometry of an RF waveguide to maximize signal throughput while suppressing spurious modes. (12 Marks)`,
  },
  {
    title: 'Business & Economics: Strategic Management (HOTS Heavy)',
    subject: 'Business Economics',
    level: 'Postgraduate / MBA',
    text: `1. Define price elasticity of demand and state its mathematical coefficient formula. (3 Marks)
2. Explain how monopolistic competition differs from perfect competition regarding product differentiation and barriers to entry. (5 Marks)
3. Using the cost function TC = 200 + 5Q + 0.5Q^2, calculate the profit-maximizing output level and total profit when market price is $25. (7 Marks)
4. Deconstruct the competitive advantages of Apple Inc. using Porter's Five Forces framework and analyze the durability of its ecosystem lock-in. (10 Marks)
5. Critically assess whether the Federal Reserve should prioritize aggressive interest rate hikes over employment stability during stagflation. Defend your policy stance with empirical evidence. (12 Marks)
6. Develop a comprehensive go-to-market strategy for an AI enterprise startup entering an overcrowded SaaS market, detailing positioning, pricing model, and risk mitigation. (15 Marks)`,
  },
  {
    title: 'Cell Biology & Genetics: Foundations (LOTS Skewed)',
    subject: 'Biology',
    level: 'Grade 11-12 High School',
    text: `1. Name the four nitrogenous bases found in a double-stranded DNA molecule. (2 Marks)
2. What is mitosis? List its primary stages in chronological order. (4 Marks)
3. Explain the semi-conservative model of DNA replication demonstrated by the Meselson-Stahl experiment. (6 Marks)
4. In pea plants, purple flowers (P) are dominant to white (p). Calculate the phenotypic and genotypic ratios of a cross between two heterozygous plants (Pp x Pp). (6 Marks)
5. Contrast the evolutionary mechanisms of natural selection and genetic drift, identifying the conditions under which drift dominates. (8 Marks)
6. Design a CRISPR-Cas9 gene editing experiment to knock out a specific herbicide-resistance gene in an invasive weed species without harming non-target crops. (12 Marks)`,
  },
];

// ── Types ────────────────────────────────────────────────────────────────────
interface BloomQuestion {
  id: string;
  question_number: string;
  text: string;
  marks: number;
  bloom_level: number;
  bloom_name: string;
  action_verb: string;
  knowledge_dimension: string;
  difficulty: string;
  confidence: number;
  rationale: string;
  level_up_suggestion: string;
  // Humanization / ambiguity / spectrum fields
  is_ambiguous?: boolean;
  alternative_level?: number | null;
  ambiguity_note?: string | null;
  educator_spectrum?: string;
  spectrum_lower?: number | null;
  spectrum_higher?: number | null;
  lower_perspective_rationale?: string;
  higher_perspective_rationale?: string;
  contextual_factors?: string[];
  humanized_notes?: string;
  is_user_calibrated?: boolean;
}

interface BloomDistributionItem {
  count: number;
  percentage: number;
  name: string;
}

interface BloomSummary {
  total_questions: number;
  total_marks: number;
  lots_percentage: number;
  hots_percentage: number;
  lots_count: number;
  hots_count: number;
  distribution: Record<string, BloomDistributionItem>;
  dominant_level: string;
  balance_rating: string;
  pedagogical_critique: string;
  recommendations: string[];
  subject_detected: string;
  ambiguous_count?: number;
  humanized_perception_note?: string;
  calibration_count?: number;
}

interface BloomAnalysisResult {
  status: string;
  questions: BloomQuestion[];
  summary: BloomSummary;
  extracted_text?: string;
  filename?: string;
}

export default function BloomsView() {
  // Input states
  const [activeTab, setActiveTab] = useState<'paper' | 'single' | 'upload'>('paper');
  const [inputText, setInputText] = useState(SAMPLE_PAPERS[0].text);
  const [singleQuestion, setSingleQuestion] = useState(
    'Compare and contrast the memory management strategies of paging and segmentation. Discuss the trade-offs regarding internal and external fragmentation. (10 Marks)'
  );
  const [subject, setSubject] = useState(SAMPLE_PAPERS[0].subject);
  const [level, setLevel] = useState(SAMPLE_PAPERS[0].level);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [singleQuestionFile, setSingleQuestionFile] = useState<File | null>(null);
  const [extractingSingleFile, setExtractingSingleFile] = useState(false);

  // Analysis / execution states
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BloomAnalysisResult | null>(null);

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLevelFilter, setSelectedLevelFilter] = useState<number | 'all' | 'lots' | 'hots'>('all');
  const [selectedDimensionFilter, setSelectedDimensionFilter] = useState<string>('all');
  const [expandedSuggestions, setExpandedSuggestions] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Educator calibration state (maps question ID to calibrated level 1..6)
  const [calibrations, setCalibrations] = useState<Record<string, number>>({});
  // Simple view mode: shows only the exact Bloom level and why (clean, minimal)
  const [simpleMode, setSimpleMode] = useState<boolean>(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const singleFileInputRef = useRef<HTMLInputElement>(null);

  // Trigger quick toast
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Calibration handlers
  const handleCalibrate = (questionId: string, targetLevel: number) => {
    setCalibrations((prev) => ({
      ...prev,
      [questionId]: targetLevel,
    }));
    const meta = BLOOM_LEVELS_META[targetLevel];
    showToast(`Calibrated question to L${targetLevel} (${meta?.name || ''}) — real-time metrics updated!`);
  };

  const handleResetCalibration = (questionId: string) => {
    setCalibrations((prev) => {
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
    showToast('Reverted question to AI baseline classification.');
  };

  const handleResetAllCalibrations = () => {
    setCalibrations({});
    showToast('All question calibrations reverted to baseline.');
  };

  // Select sample paper
  const handleSelectSample = (sample: (typeof SAMPLE_PAPERS)[0]) => {
    setInputText(sample.text);
    setSubject(sample.subject);
    setLevel(sample.level);
    setError(null);
  };

  // Run full paper analysis
  const handleAnalyzePaper = async () => {
    if (!inputText.trim()) {
      setError('Please provide questions or exam paper text to analyze.');
      return;
    }
    setLoading(true);
    setError(null);
    setCalibrations({});
    setLoadingStep('Parsing questions & extracting cognitive action verbs...');

    try {
      const timer = setTimeout(() => {
        setLoadingStep('Running precision Anderson & Krathwohl Bloom taxonomy classification...');
      }, 1200);

      const res = await fetch('/api/bloom/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: inputText,
          subject,
          level,
        }),
      });

      clearTimeout(timer);

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Bloom taxonomy classification failed.');
      }

      const data: BloomAnalysisResult = await res.json();
      if (data.status === 'error') {
        throw new Error((data as any).message || 'Analysis failed.');
      }

      setResult(data);
      setCalibrations({});
      showToast('Cognitive analysis complete! All 6 Bloom levels mapped.');
    } catch (err: any) {
      console.error('[BLOOM] Analysis error:', err);
      setError(err.message || 'Failed to complete Bloom analysis.');
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  // Run single question analysis
  const handleAnalyzeSingleQuestion = async () => {
    if (!singleQuestion.trim()) {
      setError('Please enter a question to analyze.');
      return;
    }
    setLoading(true);
    setError(null);
    setCalibrations({});
    setLoadingStep('Evaluating cognitive demand and knowledge dimension...');

    try {
      const res = await fetch('/api/bloom/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: singleQuestion,
          subject,
          level,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Question analysis failed.');
      }

      const data: BloomAnalysisResult = await res.json();
      setResult(data);
      setCalibrations({});
      showToast('Question classified successfully!');
    } catch (err: any) {
      console.error('[BLOOM] Single question error:', err);
      setError(err.message || 'Failed to classify question.');
      setLoading(false);
      setLoadingStep('');
    }
  };

  // Handle single question file upload & OCR
  const handleSingleQuestionFileUpload = async (file: File) => {
    setSingleQuestionFile(file);
    setExtractingSingleFile(true);
    setError(null);
    showToast(`Scanning question from ${file.name}...`);

    try {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const base64 = (reader.result as string).split(',')[1];
            const res = await fetch('/api/ocr', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ imageBase64: base64, mimeType: file.type }),
            });
            const data = await res.json();
            if (res.ok && data.text) {
              setSingleQuestion(data.text.trim());
              showToast('Question scanned successfully from image!');
            } else {
              throw new Error(data.detail || data.error || 'Failed to extract text from image');
            }
          } catch (e: any) {
            setError('OCR failed: ' + (e.message || 'Could not scan image'));
          } finally {
            setExtractingSingleFile(false);
          }
        };
        reader.readAsDataURL(file);
      } else {
        // PDF or TXT
        const formData = new FormData();
        formData.append('file', file);
        formData.append('subject', subject);
        formData.append('level', level);

        const res = await fetch('/api/bloom/analyze-upload', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || 'Failed to extract text from document');
        }

        const data = await res.json();
        if (data.extracted_text) {
          setSingleQuestion(data.extracted_text.trim());
          showToast('Question text extracted from document!');
        } else if (data.questions && data.questions[0]?.text) {
          setSingleQuestion(data.questions[0].text);
          showToast('Question extracted!');
        }
        setExtractingSingleFile(false);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to extract question from file');
      setExtractingSingleFile(false);
    }
  };

  // Run upload analysis
  const handleUploadAndAnalyze = async () => {
    if (!selectedFile) {
      setError('Please select a PDF or image file first.');
      return;
    }
    setLoading(true);
    setError(null);
    setCalibrations({});
    setLoadingStep(`Extracting text from ${selectedFile.name}...`);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('subject', subject);
      formData.append('level', level);

      const res = await fetch('/api/bloom/analyze-upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to process question paper upload.');
      }

      const data: BloomAnalysisResult = await res.json();
      setResult(data);
      setCalibrations({});
      if (data.extracted_text) {
        setInputText(data.extracted_text);
      }
      showToast(`Document parsed! Classified ${data.questions.length} questions.`);
    } catch (err: any) {
      console.error('[BLOOM] Upload error:', err);
      setError(err.message || 'Failed to analyze uploaded document.');
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  // Toggle level up suggestion
  const toggleSuggestion = (id: string) => {
    setExpandedSuggestions((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Copy text to clipboard
  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    showToast('Copied to clipboard!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Questions mapped with any live educator calibrations
  const effectiveQuestions = useMemo(() => {
    if (!result || !result.questions) return [];
    return result.questions.map((q) => {
      const calibrated = calibrations[q.id];
      if (calibrated && calibrated >= 1 && calibrated <= 6) {
        const meta = BLOOM_LEVELS_META[calibrated] || BLOOM_LEVELS_META[q.bloom_level];
        return {
          ...q,
          bloom_level: calibrated,
          bloom_name: meta.name,
          is_user_calibrated: true,
        };
      }
      return q;
    });
  }, [result, calibrations]);

  // Dynamically recomputed summary reflecting live teacher calibrations
  const effectiveSummary = useMemo(() => {
    if (!result || !result.summary) return null;
    const questions = effectiveQuestions;
    const totalQuestions = questions.length || 1;
    const lotsCount = questions.filter((q) => q.bloom_level <= 2).length;
    const hotsCount = totalQuestions - lotsCount;
    const lotsPercentage = Math.round((lotsCount / totalQuestions) * 100);
    const hotsPercentage = 100 - lotsPercentage;

    const dist: Record<string, BloomDistributionItem> = {};
    for (let l = 1; l <= 6; l++) {
      const count = questions.filter((q) => q.bloom_level === l).length;
      dist[String(l)] = {
        count,
        percentage: Math.round((count / totalQuestions) * 100),
        name: BLOOM_LEVELS_META[l]?.name || '',
      };
    }

    let dominantLevelNum = 1;
    let maxCount = -1;
    for (let l = 1; l <= 6; l++) {
      if (dist[String(l)].count > maxCount) {
        maxCount = dist[String(l)].count;
        dominantLevelNum = l;
      }
    }

    let balanceRating = result.summary.balance_rating;
    if (lotsPercentage >= 65) {
      balanceRating = 'Recall-Heavy (Skewed towards LOTS)';
    } else if (hotsPercentage >= 75) {
      balanceRating = 'High Cognitive Rigor (HOTS Dominant)';
    } else if (dist['3']?.percentage >= 40) {
      balanceRating = 'Application-Centric (Practical Problem Solving)';
    } else {
      balanceRating = 'Balanced (NEP 2020 Aligned)';
    }

    return {
      ...result.summary,
      lots_count: lotsCount,
      hots_count: hotsCount,
      lots_percentage: lotsPercentage,
      hots_percentage: hotsPercentage,
      distribution: dist,
      dominant_level: `L${dominantLevelNum} • ${BLOOM_LEVELS_META[dominantLevelNum]?.name || ''}`,
      balance_rating: balanceRating,
      calibration_count: Object.keys(calibrations).length,
    };
  }, [result, effectiveQuestions, calibrations]);

  // Filtered Questions List (based on effective questions)
  const filteredQuestions = useMemo(() => {
    if (!effectiveQuestions || effectiveQuestions.length === 0) return [];
    return effectiveQuestions.filter((q) => {
      // Level filter
      if (selectedLevelFilter !== 'all') {
        if (selectedLevelFilter === 'lots' && q.bloom_level > 2) return false;
        if (selectedLevelFilter === 'hots' && q.bloom_level < 3) return false;
        if (typeof selectedLevelFilter === 'number' && q.bloom_level !== selectedLevelFilter) {
          return false;
        }
      }
      // Dimension filter
      if (selectedDimensionFilter !== 'all' && q.knowledge_dimension !== selectedDimensionFilter) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesText = q.text.toLowerCase().includes(query);
        const matchesVerb = q.action_verb.toLowerCase().includes(query);
        const matchesNum = q.question_number.toLowerCase().includes(query);
        const matchesRationale = q.rationale.toLowerCase().includes(query);
        if (!matchesText && !matchesVerb && !matchesNum && !matchesRationale) {
          return false;
        }
      }
      return true;
    });
  }, [effectiveQuestions, selectedLevelFilter, selectedDimensionFilter, searchQuery]);

  return (
    <div style={{ width: '100%', paddingBottom: 60 }}>
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            style={{
              position: 'fixed',
              top: 24,
              right: 28,
              zIndex: 9999,
              background: '#0f172a',
              border: '1px solid rgba(124, 111, 255, 0.4)',
              color: '#e2e8f0',
              padding: '12px 20px',
              borderRadius: 12,
              boxShadow: '0 10px 30px rgba(0, 0, 0, 0.6)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            <Sparkles size={16} color="#818cf8" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Page Header ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, rgba(124, 111, 255, 0.2), rgba(6, 182, 212, 0.2))',
                  border: '1px solid rgba(124, 111, 255, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#818cf8',
                }}
              >
                <Brain size={24} />
              </div>
              <div>
                <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: '#f8fafc', letterSpacing: -0.5 }}>
                  Bloom&apos;s Taxonomy Alignment Engine
                </h1>
                <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>
                  Precision cognitive auditing &amp; NEP 2020 framework mapping for exams, quizzes &amp; question banks
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '3px 10px',
                  borderRadius: 20,
                  background: 'rgba(124, 111, 255, 0.12)',
                  color: '#818cf8',
                  border: '1px solid rgba(124, 111, 255, 0.3)',
                }}
              >
                Revised Bloom&apos;s (Anderson &amp; Krathwohl)
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '3px 10px',
                  borderRadius: 20,
                  background: 'rgba(16, 185, 129, 0.12)',
                  color: '#10b981',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                }}
              >
                HOTS vs LOTS Index
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '3px 10px',
                  borderRadius: 20,
                  background: 'rgba(6, 182, 212, 0.12)',
                  color: '#06b6d4',
                  border: '1px solid rgba(6, 182, 212, 0.3)',
                }}
              >
                Action Verb &amp; Knowledge Dimension
              </span>
            </div>
          </div>

          {result && (
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setResult(null)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#e2e8f0',
                  padding: '8px 14px',
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <RotateCcw size={14} />
                <span>New Paper</span>
              </button>
              <button
                onClick={() => window.print()}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'rgba(124, 111, 255, 0.15)',
                  border: '1px solid rgba(124, 111, 255, 0.35)',
                  color: '#818cf8',
                  padding: '8px 14px',
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <Printer size={14} />
                <span>Print Report</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Mode Tabs & Input Section (Always available or collapsible when results show) ── */}
      {!result ? (
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          {/* Preset Samples Pill Bar */}
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.75)',
              border: '1px solid rgba(255, 255, 255, 0.07)',
              borderRadius: 16,
              padding: '16px 20px',
              marginBottom: 20,
              backdropFilter: 'blur(10px)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Sparkles size={15} color="#818cf8" />
              <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                Load Pre-Configured Sample Assessment
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {SAMPLE_PAPERS.map((sample, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSelectSample(sample)}
                  style={{
                    fontSize: 12,
                    background:
                      subject === sample.subject ? 'rgba(124, 111, 255, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                    border:
                      subject === sample.subject
                        ? '1px solid rgba(124, 111, 255, 0.5)'
                        : '1px solid rgba(255, 255, 255, 0.08)',
                    color: subject === sample.subject ? '#818cf8' : '#94a3b8',
                    padding: '6px 14px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontWeight: 500,
                    transition: 'all 0.2s',
                  }}
                >
                  {sample.subject}
                </button>
              ))}
            </div>
          </div>

          {/* Main Input Panel */}
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.85)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 18,
              padding: 24,
              boxShadow: '0 12px 40px rgba(0, 0, 0, 0.4)',
              backdropFilter: 'blur(14px)',
            }}
          >
            {/* Tab Buttons */}
            <div
              style={{
                display: 'flex',
                gap: 6,
                padding: 4,
                background: 'rgba(0, 0, 0, 0.25)',
                borderRadius: 12,
                width: 'fit-content',
                marginBottom: 20,
              }}
            >
              <button
                onClick={() => setActiveTab('paper')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 16px',
                  borderRadius: 9,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: 'none',
                  background: activeTab === 'paper' ? 'rgba(124, 111, 255, 0.25)' : 'transparent',
                  color: activeTab === 'paper' ? '#f8fafc' : '#94a3b8',
                  transition: 'all 0.2s',
                }}
              >
                <FileText size={14} />
                <span>Full Exam Paper / Batch</span>
              </button>
              <button
                onClick={() => setActiveTab('single')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 16px',
                  borderRadius: 9,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: 'none',
                  background: activeTab === 'single' ? 'rgba(124, 111, 255, 0.25)' : 'transparent',
                  color: activeTab === 'single' ? '#f8fafc' : '#94a3b8',
                  transition: 'all 0.2s',
                }}
              >
                <Sliders size={14} />
                <span>Single Question Auditor</span>
              </button>
              <button
                onClick={() => setActiveTab('upload')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 16px',
                  borderRadius: 9,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: 'none',
                  background: activeTab === 'upload' ? 'rgba(124, 111, 255, 0.25)' : 'transparent',
                  color: activeTab === 'upload' ? '#f8fafc' : '#94a3b8',
                  transition: 'all 0.2s',
                }}
              >
                <UploadCloud size={14} />
                <span>Upload PDF / Image</span>
              </button>
            </div>

            {/* Subject and Target Level Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 20 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  Subject / Domain
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Computer Science, Physics, Economics"
                  style={{
                    width: '100%',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 10,
                    padding: '10px 14px',
                    color: '#f8fafc',
                    fontSize: 13,
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  Target Academic Level
                </label>
                <select
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#090d16',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 10,
                    padding: '10px 14px',
                    color: '#f8fafc',
                    fontSize: 13,
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value="Higher Education / Engineering">Higher Education / Engineering (Undergraduate / Postgrad)</option>
                  <option value="Senior High School (Grade 11-12)">Senior High School (Grade 11–12)</option>
                  <option value="High School (Grade 9-10)">High School (Grade 9–10)</option>
                  <option value="Middle School (Grade 6-8)">Middle School (Grade 6–8)</option>
                  <option value="Competitive Exam / Olympiad">Competitive Exam / Olympiad</option>
                </select>
              </div>
            </div>

            {/* TAB 1: FULL EXAM PAPER */}
            {activeTab === 'paper' && (
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  Question Paper Content (Numbered Questions with Marks)
                </label>
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  rows={10}
                  placeholder={`1. Define ... (5 Marks)\n2. Explain the difference between ... (5 Marks)\n3. Calculate the ... (10 Marks)\n4. Compare and contrast ... (10 Marks)`}
                  style={{
                    width: '100%',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 12,
                    padding: '14px 16px',
                    color: '#f8fafc',
                    fontSize: 13,
                    lineHeight: 1.6,
                    fontFamily: 'monospace',
                    outline: 'none',
                    resize: 'vertical',
                  }}
                />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, flexWrap: 'wrap', gap: 12 }}>
                  <span style={{ fontSize: 12, color: '#64748b' }}>
                    {inputText.split('\n').filter((l) => l.trim().length > 0).length} lines &bull; {inputText.length} characters
                  </span>

                  <button
                    onClick={handleAnalyzePaper}
                    disabled={loading}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      background: 'linear-gradient(135deg, #7c6fff 0%, #6366f1 100%)',
                      border: 'none',
                      color: '#ffffff',
                      padding: '12px 28px',
                      borderRadius: 12,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: loading ? 'not-allowed' : 'pointer',
                      boxShadow: '0 4px 20px rgba(124, 111, 255, 0.4)',
                      opacity: loading ? 0.7 : 1,
                      transition: 'all 0.2s',
                    }}
                  >
                    <Brain size={16} />
                    <span>{loading ? 'Auditing Cognitive Levels...' : "Analyze Bloom's Alignment"}</span>
                  </button>
                </div>
              </div>
            )}

            {/* TAB 2: SINGLE QUESTION AUDITOR */}
            {activeTab === 'single' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                    Enter Single Question to Audit
                  </label>
                  <div>
                    <input
                      ref={singleFileInputRef}
                      type="file"
                      accept=".png,.jpg,.jpeg,.webp,.pdf,.txt"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handleSingleQuestionFileUpload(e.target.files[0]);
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => singleFileInputRef.current?.click()}
                      disabled={extractingSingleFile || loading}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        background: 'rgba(124, 111, 255, 0.15)',
                        border: '1px solid rgba(124, 111, 255, 0.35)',
                        borderRadius: 8,
                        padding: '5px 12px',
                        fontSize: 11,
                        fontWeight: 600,
                        color: '#a5b4fc',
                        cursor: extractingSingleFile ? 'wait' : 'pointer',
                        transition: 'all 0.2s',
                      }}
                    >
                      <Paperclip size={13} />
                      <span>{extractingSingleFile ? 'Scanning Question Image/PDF...' : 'Upload/Scan Single Question (Image/PDF)'}</span>
                    </button>
                  </div>
                </div>

                {singleQuestionFile && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 10,
                      padding: '8px 12px',
                      background: 'rgba(99, 102, 241, 0.1)',
                      border: '1px solid rgba(99, 102, 241, 0.25)',
                      borderRadius: 8,
                      fontSize: 12,
                      color: '#c7d2fe',
                    }}
                  >
                    <FileUp size={14} color="#818cf8" />
                    <span>Uploaded: <strong>{singleQuestionFile.name}</strong></span>
                    {extractingSingleFile ? (
                      <span style={{ color: '#fbbf24', marginLeft: 'auto' }}>⚡ Extracting Question via OCR...</span>
                    ) : (
                      <span style={{ color: '#34d399', marginLeft: 'auto' }}>✓ Ready for Audit</span>
                    )}
                  </div>
                )}

                <textarea
                  value={singleQuestion}
                  onChange={(e) => setSingleQuestion(e.target.value)}
                  rows={4}
                  placeholder="e.g. Compare and contrast the memory management strategies of paging and segmentation. (10 Marks)"
                  style={{
                    width: '100%',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 12,
                    padding: '14px 16px',
                    color: '#f8fafc',
                    fontSize: 14,
                    lineHeight: 1.6,
                    outline: 'none',
                  }}
                />

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                  <button
                    onClick={handleAnalyzeSingleQuestion}
                    disabled={loading || extractingSingleFile}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      background: 'linear-gradient(135deg, #7c6fff 0%, #6366f1 100%)',
                      border: 'none',
                      color: '#ffffff',
                      padding: '12px 28px',
                      borderRadius: 12,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: loading ? 'not-allowed' : 'pointer',
                      boxShadow: '0 4px 20px rgba(124, 111, 255, 0.4)',
                      opacity: loading ? 0.7 : 1,
                    }}
                  >
                    <Sparkles size={16} />
                    <span>{loading ? 'Evaluating Question...' : 'Quick Audit Question'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* TAB 3: FILE UPLOAD */}
            {activeTab === 'upload' && (
              <div>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: '2px dashed rgba(124, 111, 255, 0.3)',
                    borderRadius: 16,
                    padding: '40px 20px',
                    textAlign: 'center',
                    background: 'rgba(124, 111, 255, 0.03)',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp,.txt"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setSelectedFile(e.target.files[0]);
                      }
                    }}
                  />
                  <UploadCloud size={38} color="#818cf8" style={{ margin: '0 auto 12px auto' }} />
                  <h4 style={{ margin: '0 0 6px 0', fontSize: 15, fontWeight: 600, color: '#f8fafc' }}>
                    {selectedFile ? selectedFile.name : 'Click to Upload Question Paper (PDF, Scanned Image, TXT)'}
                  </h4>
                  <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>
                    {selectedFile
                      ? `${(selectedFile.size / 1024).toFixed(1)} KB &bull; Ready for extraction`
                      : 'Supports PDF (PyMuPDF direct extraction), PNG/JPG (OCR), or TXT files'}
                  </p>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                  <button
                    onClick={handleUploadAndAnalyze}
                    disabled={!selectedFile || loading}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      background: 'linear-gradient(135deg, #7c6fff 0%, #6366f1 100%)',
                      border: 'none',
                      color: '#ffffff',
                      padding: '12px 28px',
                      borderRadius: 12,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: !selectedFile || loading ? 'not-allowed' : 'pointer',
                      boxShadow: '0 4px 20px rgba(124, 111, 255, 0.4)',
                      opacity: !selectedFile || loading ? 0.6 : 1,
                    }}
                  >
                    <Brain size={16} />
                    <span>{loading ? 'Processing Document...' : 'Extract & Analyze Document'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div
                style={{
                  marginTop: 16,
                  padding: '12px 16px',
                  borderRadius: 10,
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#f87171',
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <AlertTriangle size={16} />
                <span>{error}</span>
              </div>
            )}

            {/* Loading Indicator */}
            {loading && (
              <div
                style={{
                  marginTop: 20,
                  padding: 20,
                  borderRadius: 12,
                  background: 'rgba(124, 111, 255, 0.06)',
                  border: '1px solid rgba(124, 111, 255, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                }}
              >
                <div className="spinner" style={{ width: 24, height: 24, borderWidth: 3, borderColor: '#818cf8', borderTopColor: 'transparent' }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#f8fafc' }}>
                    Bloom&apos;s Taxonomy Analysis in Progress
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>{loadingStep || 'Evaluating questions...'}</div>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      ) : null}

      {/* ── ANALYSIS RESULTS DASHBOARD ── */}
      {result && result.summary && (() => {
        const summary = effectiveSummary || result.summary;
        return (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            {/* View Mode Toggle: Simple vs Detailed */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>Display Mode:</span>
                <div style={{ display: 'inline-flex', background: 'rgba(0, 0, 0, 0.4)', borderRadius: 10, padding: 3, border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                  <button
                    onClick={() => setSimpleMode(true)}
                    style={{
                      background: simpleMode ? 'linear-gradient(135deg, #7c6fff 0%, #6366f1 100%)' : 'transparent',
                      color: simpleMode ? '#ffffff' : '#94a3b8',
                      border: 'none',
                      borderRadius: 7,
                      padding: '5px 14px',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    ⚡ Simple Mode (Level &amp; Reason Only)
                  </button>
                  <button
                    onClick={() => setSimpleMode(false)}
                    style={{
                      background: !simpleMode ? 'linear-gradient(135deg, #7c6fff 0%, #6366f1 100%)' : 'transparent',
                      color: !simpleMode ? '#ffffff' : '#94a3b8',
                      border: 'none',
                      borderRadius: 7,
                      padding: '5px 14px',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    📊 Full Analytics &amp; Calibration
                  </button>
                </div>
              </div>

              {simpleMode && (
                <span style={{ fontSize: 11.5, color: '#94a3b8' }}>
                  Showing direct Bloom Level + Why explanation only
                </span>
              )}
            </div>

            {/* Top Metric Cards */}
            {!simpleMode && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 16,
                marginBottom: 20,
              }}
            >
              {/* Stat 1: Total Questions & Marks */}
              <div
                style={{
                  background: 'rgba(15, 23, 42, 0.8)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 16,
                  padding: '20px 22px',
                  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                    Assessment Scope
                  </span>
                  <BookOpen size={16} color="#818cf8" />
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#f8fafc' }}>
                  {summary.total_questions}{' '}
                  <span style={{ fontSize: 15, fontWeight: 500, color: '#94a3b8' }}>Questions</span>
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                  Total Allocated Marks: <strong style={{ color: '#cbd5e1' }}>{summary.total_marks} pts</strong>
                </div>
              </div>

            {/* Stat 2: LOTS vs HOTS Meter */}
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: 16,
                padding: '20px 22px',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  LOTS vs HOTS Ratio
                </span>
                <Layers size={16} color="#06b6d4" />
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 24, fontWeight: 700, color: '#06b6d4' }}>
                  {summary.lots_percentage}%
                </span>
                <span style={{ fontSize: 12, color: '#64748b' }}>LOTS</span>
                <span style={{ color: '#475569' }}>/</span>
                <span style={{ fontSize: 24, fontWeight: 700, color: '#10b981' }}>
                  {summary.hots_percentage}%
                </span>
                <span style={{ fontSize: 12, color: '#64748b' }}>HOTS</span>
              </div>
              {/* Dual Progress Bar */}
              <div
                style={{
                  height: 8,
                  width: '100%',
                  background: 'rgba(255, 255, 255, 0.06)',
                  borderRadius: 10,
                  overflow: 'hidden',
                  display: 'flex',
                }}
              >
                <div style={{ width: `${summary.lots_percentage}%`, background: '#06b6d4', transition: 'width 0.6s' }} />
                <div style={{ width: `${summary.hots_percentage}%`, background: '#10b981', transition: 'width 0.6s' }} />
              </div>
            </div>

            {/* Stat 3: Dominant Level */}
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: 16,
                padding: '20px 22px',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  Dominant Cognitive Focus
                </span>
                <BarChart3 size={16} color="#f59e0b" />
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#f59e0b' }}>
                {summary.dominant_level}
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                Subject: <strong style={{ color: '#cbd5e1' }}>{summary.subject_detected}</strong>
              </div>
            </div>

            {/* Stat 4: Alignment Balance Rating */}
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: 16,
                padding: '20px 22px',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  Curriculum Balance
                </span>
                <CheckCircle2 size={16} color="#10b981" />
              </div>
              <div
                style={{
                  display: 'inline-block',
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: '#34d399',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  padding: '4px 10px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 700,
                  marginBottom: 6,
                }}
              >
                {summary.balance_rating}
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>
                NEP 2020 &amp; Outcome Based Education
              </div>
            </div>
            {/* End Top Metric Cards */}
            </div>
            )}

            {/* ── Humanized Cognitive Perception & Calibration Banner ── */}
            {!simpleMode && (
            <div
              style={{
                background: 'linear-gradient(135deg, rgba(124, 111, 255, 0.08) 0%, rgba(6, 182, 212, 0.08) 100%)',
                border: '1px solid rgba(124, 111, 255, 0.25)',
                borderRadius: 16,
                padding: '16px 20px',
                marginBottom: 24,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 14,
              }}
            >
              <Sparkles size={22} style={{ color: '#818cf8', flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
                  <strong style={{ fontSize: 13.5, color: '#f8fafc', fontWeight: 700 }}>
                    Humanized Cognitive Spectrum &amp; Teacher Calibration
                  </strong>
                  {summary.calibration_count !== undefined && summary.calibration_count > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11.5, background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', padding: '3px 10px', borderRadius: 12, border: '1px solid rgba(245, 158, 11, 0.3)', fontWeight: 600 }}>
                        👨‍🏫 {summary.calibration_count} Question(s) Calibrated for Classroom
                      </span>
                      <button
                        onClick={handleResetAllCalibrations}
                        style={{ fontSize: 11, background: 'transparent', border: 'none', color: '#94a3b8', textDecoration: 'underline', cursor: 'pointer' }}
                      >
                        Reset All
                      </button>
                    </div>
                  )}
                </div>
                <p style={{ margin: 0, fontSize: 12.5, color: '#cbd5e1', lineHeight: 1.6 }}>
                  {summary.humanized_perception_note ||
                    "In actual classroom reality, cognitive demand shifts depending on prior exposure and scaffolding. What is 'Apply' (L3) to an unguided student behaves as 'Remember' (L1) if practiced verbatim. ShikshakAI models each question along a pedagogical spectrum with multi-perspective educator rationales and allows interactive teacher calibration."}
                </p>
              </div>
            </div>
            )}

            {/* ── Interactive 6-Level Bloom's Distribution Cards ── */}
            {!simpleMode && (
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.85)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: 18,
                padding: 24,
                marginBottom: 24,
                boxShadow: '0 10px 30px rgba(0, 0, 0, 0.35)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>
                    Bloom&apos;s Taxonomy Cognitive Breakdown (L1 – L6)
                  </h3>
                  <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#94a3b8' }}>
                    Click on any level to filter questions below
                  </p>
                </div>

                {selectedLevelFilter !== 'all' && (
                  <button
                    onClick={() => setSelectedLevelFilter('all')}
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '4px 10px',
                      borderRadius: 6,
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#e2e8f0',
                      cursor: 'pointer',
                    }}
                  >
                    Clear Filter &times;
                  </button>
                )}
              </div>

              {/* Proportional Segmented Bar */}
              <div
                style={{
                  height: 12,
                  borderRadius: 8,
                  background: 'rgba(0, 0, 0, 0.4)',
                  overflow: 'hidden',
                  display: 'flex',
                  marginBottom: 20,
                }}
              >
                {[1, 2, 3, 4, 5, 6].map((l) => {
                  const item = summary.distribution[String(l)];
                  const pct = item ? item.percentage : 0;
                  const meta = BLOOM_LEVELS_META[l];
                  if (pct <= 0) return null;
                  return (
                    <div
                      key={l}
                      title={`L${l} ${meta.name}: ${pct}%`}
                      style={{
                        width: `${pct}%`,
                        background: meta.color,
                        height: '100%',
                        transition: 'width 0.4s ease',
                      }}
                    />
                  );
                })}
              </div>

              {/* 6 Individual Cards */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                  gap: 12,
                }}
              >
                {[1, 2, 3, 4, 5, 6].map((l) => {
                  const meta = BLOOM_LEVELS_META[l];
                  const item = summary.distribution[String(l)];
                  const count = item ? item.count : 0;
                  const pct = item ? item.percentage : 0;
                  const isSelected = selectedLevelFilter === l;

                  return (
                    <div
                      key={l}
                      onClick={() => setSelectedLevelFilter(isSelected ? 'all' : l)}
                      style={{
                        background: isSelected ? meta.bg : 'rgba(255, 255, 255, 0.02)',
                        border: isSelected ? `2px solid ${meta.color}` : `1px solid ${meta.border}`,
                        borderRadius: 14,
                        padding: 14,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              color: meta.color,
                              background: meta.lightBg,
                              padding: '2px 6px',
                              borderRadius: 6,
                            }}
                          >
                            L{l} &bull; {meta.category}
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>{pct}%</span>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: meta.color, marginBottom: 2 }}>
                          {meta.name}
                        </div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>
                          {count} {count === 1 ? 'question' : 'questions'}
                        </div>
                      </div>

                      <div style={{ marginTop: 10, fontSize: 10, color: '#64748b', fontStyle: 'italic' }}>
                        {meta.verbs.slice(0, 3).join(', ')}...
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            )}

            {/* ── Pedagogical Critique & Recommendations ── */}
            {!simpleMode && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                gap: 16,
                marginBottom: 24,
              }}
            >
              {/* Pedagogical Critique Card */}
              <div
                style={{
                  background: 'rgba(15, 23, 42, 0.85)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 16,
                  padding: 22,
                  boxShadow: '0 8px 30px rgba(0, 0, 0, 0.3)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <BookOpen size={18} color="#818cf8" />
                  <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#f8fafc' }}>
                    Pedagogical Audit &amp; Cognitive Critique
                  </h4>
                </div>
                <p style={{ margin: 0, fontSize: 13, color: '#cbd5e1', lineHeight: 1.65 }}>
                  {summary.pedagogical_critique}
                </p>
              </div>

              {/* Recommendations Card */}
              <div
                style={{
                  background: 'rgba(15, 23, 42, 0.85)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 16,
                  padding: 22,
                  boxShadow: '0 8px 30px rgba(0, 0, 0, 0.3)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <Lightbulb size={18} color="#f59e0b" />
                  <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#f8fafc' }}>
                    Educator Recommendations to Elevate Balance
                  </h4>
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#cbd5e1', lineHeight: 1.65 }}>
                  {summary.recommendations.map((rec, i) => (
                    <li key={i} style={{ marginBottom: 6 }}>
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            )}

          {/* ── Questions Explorer Header & Filters ── */}
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.85)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 18,
              padding: '20px 24px',
              marginBottom: 16,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>
                  Audited Questions ({filteredQuestions.length} of {result.questions.length})
                </h3>
                <p style={{ margin: '2px 0 0 0', fontSize: 12, color: '#94a3b8' }}>
                  Each item is verified with action verb identification, knowledge dimension &amp; upgrade suggestions
                </p>
              </div>

              {/* Search Box */}
              <div style={{ position: 'relative', minWidth: 260 }}>
                <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: 12, top: 11 }} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search questions or verbs..."
                  style={{
                    width: '100%',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 10,
                    padding: '8px 12px 8px 36px',
                    color: '#f8fafc',
                    fontSize: 12,
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            {/* Filter Pills */}
            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginRight: 4 }}>
                <Filter size={12} style={{ display: 'inline', marginRight: 4 }} /> Filter:
              </span>
              <button
                onClick={() => setSelectedLevelFilter('all')}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '4px 12px',
                  borderRadius: 20,
                  background: selectedLevelFilter === 'all' ? '#7c6fff' : 'rgba(255, 255, 255, 0.04)',
                  color: selectedLevelFilter === 'all' ? '#ffffff' : '#94a3b8',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  cursor: 'pointer',
                }}
              >
                All
              </button>
              <button
                onClick={() => setSelectedLevelFilter('lots')}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '4px 12px',
                  borderRadius: 20,
                  background: selectedLevelFilter === 'lots' ? '#06b6d4' : 'rgba(255, 255, 255, 0.04)',
                  color: selectedLevelFilter === 'lots' ? '#ffffff' : '#94a3b8',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  cursor: 'pointer',
                }}
              >
                LOTS (L1–L2)
              </button>
              <button
                onClick={() => setSelectedLevelFilter('hots')}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '4px 12px',
                  borderRadius: 20,
                  background: selectedLevelFilter === 'hots' ? '#10b981' : 'rgba(255, 255, 255, 0.04)',
                  color: selectedLevelFilter === 'hots' ? '#ffffff' : '#94a3b8',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  cursor: 'pointer',
                }}
              >
                HOTS (L3–L6)
              </button>

              <div style={{ width: 1, height: 16, background: 'rgba(255, 255, 255, 0.1)', margin: '0 4px' }} />

              {/* Knowledge Dimension filter */}
              <select
                value={selectedDimensionFilter}
                onChange={(e) => setSelectedDimensionFilter(e.target.value)}
                style={{
                  fontSize: 11,
                  background: '#090d16',
                  color: '#94a3b8',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  padding: '4px 8px',
                  borderRadius: 8,
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="all">All Knowledge Dimensions</option>
                <option value="Factual">Factual</option>
                <option value="Conceptual">Conceptual</option>
                <option value="Procedural">Procedural</option>
                <option value="Metacognitive">Metacognitive</option>
              </select>
            </div>
          </div>

          {/* ── Question Cards List ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {filteredQuestions.map((q) => {
              const meta = BLOOM_LEVELS_META[q.bloom_level] || BLOOM_LEVELS_META[2];
              const dimStyle = KNOWLEDGE_DIMENSION_COLORS[q.knowledge_dimension] || {
                color: '#94a3b8',
                bg: 'rgba(255,255,255,0.06)',
              };
              const isSuggestionOpen = !!expandedSuggestions[q.id];

              return (
                <div
                  key={q.id}
                  style={{
                    background: 'rgba(15, 23, 42, 0.85)',
                    border: `1px solid ${meta.border}`,
                    borderRadius: 16,
                    padding: 20,
                    boxShadow: '0 4px 24px rgba(0, 0, 0, 0.3)',
                    transition: 'border-color 0.2s',
                  }}
                >
                  {/* Top Bar of Card */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 800,
                          color: '#f8fafc',
                          background: 'rgba(255, 255, 255, 0.08)',
                          padding: '3px 10px',
                          borderRadius: 6,
                        }}
                      >
                        {q.question_number}
                      </span>

                      {/* Bloom Level Pill */}
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          padding: '3px 12px',
                          borderRadius: 20,
                          background: meta.bg,
                          color: meta.color,
                          border: `1px solid ${meta.border}`,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 5,
                        }}
                      >
                        <span>L{q.bloom_level} &bull; {meta.name}</span>
                      </span>

                      {/* Knowledge Dimension */}
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '3px 10px',
                          borderRadius: 20,
                          background: dimStyle.bg,
                          color: dimStyle.color,
                        }}
                      >
                        {q.knowledge_dimension}
                      </span>

                      {/* Action Verb */}
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '3px 10px',
                          borderRadius: 20,
                          background: 'rgba(255, 255, 255, 0.05)',
                          color: '#e2e8f0',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                        }}
                      >
                        Verb: <strong>{q.action_verb}</strong>
                      </span>

                      {q.is_user_calibrated && (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '3px 10px',
                            borderRadius: 20,
                            background: 'rgba(245, 158, 11, 0.18)',
                            color: '#f59e0b',
                            border: '1px solid rgba(245, 158, 11, 0.45)',
                          }}
                        >
                          👨‍🏫 Calibrated
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8' }}>
                        {q.marks} {q.marks === 1 ? 'Mark' : 'Marks'}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: q.is_ambiguous ? '#f59e0b' : (q.confidence >= 85 ? '#10b981' : '#f59e0b'),
                          background: q.is_ambiguous ? 'rgba(245, 158, 11, 0.1)' : (q.confidence >= 85 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)'),
                          padding: '2px 8px',
                          borderRadius: 12,
                          border: `1px solid ${q.is_ambiguous ? 'rgba(245,158,11,0.3)' : (q.confidence >= 85 ? 'rgba(16, 185, 129, 0.25)' : 'rgba(245,158,11,0.3)')}`,
                        }}
                      >
                        {q.is_ambiguous ? '⚡ Borderline' : `${q.confidence}% Confident`}
                      </span>
                      <button
                        onClick={() => copyToClipboard(q.text, q.id)}
                        title="Copy question text"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: copiedId === q.id ? '#10b981' : '#64748b',
                          cursor: 'pointer',
                          padding: 4,
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        {copiedId === q.id ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>

                  {/* Question Text */}
                  <div
                    style={{
                      fontSize: 14.5,
                      fontWeight: 500,
                      color: '#f8fafc',
                      lineHeight: 1.6,
                      marginBottom: 14,
                    }}
                  >
                    {q.text}
                  </div>

                  {/* Human Cognitive Spectrum Continuum */}
                  {!simpleMode && (
                  <div
                    style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: 14,
                      padding: '14px 16px',
                      marginBottom: 12,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 13 }}>🌊</span>
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: 0.6 }}>
                          Human Cognitive Spectrum:
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: meta.color, background: meta.lightBg, padding: '2px 8px', borderRadius: 6, border: `1px solid ${meta.border}` }}>
                          {q.educator_spectrum || `L${Math.max(1, q.bloom_level - 1)} ↔ L${Math.min(6, q.bloom_level + 1)}`}
                        </span>
                      </div>
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>
                        Click level below to calibrate for classroom context 👇
                      </span>
                    </div>

                    {/* Interactive 6-Level Continuum Slider / Bar */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6, marginBottom: 10 }}>
                      {[1, 2, 3, 4, 5, 6].map((lvl) => {
                        const isSelected = q.bloom_level === lvl;
                        const isLower = q.spectrum_lower === lvl;
                        const isHigher = q.spectrum_higher === lvl;
                        const lvlInfo = BLOOM_LEVELS_META[lvl];
                        return (
                          <button
                            key={lvl}
                            type="button"
                            onClick={() => handleCalibrate(q.id, lvl)}
                            title={`Calibrate question as L${lvl} - ${lvlInfo.name}`}
                            style={{
                              background: isSelected
                                ? lvlInfo.color
                                : isLower || isHigher
                                ? 'rgba(255, 255, 255, 0.08)'
                                : 'rgba(255, 255, 255, 0.02)',
                              border: isSelected
                                ? '2px solid #ffffff'
                                : isLower || isHigher
                                ? `1px dashed ${lvlInfo.border}`
                                : '1px solid rgba(255, 255, 255, 0.06)',
                              color: isSelected ? '#0f172a' : isLower || isHigher ? '#f8fafc' : '#64748b',
                              padding: '7px 4px',
                              borderRadius: 8,
                              fontSize: 11,
                              fontWeight: isSelected ? 800 : 600,
                              cursor: 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              gap: 2,
                              transition: 'all 0.15s ease-in-out',
                            }}
                          >
                            <span style={{ fontSize: 10, opacity: 0.85 }}>L{lvl}</span>
                            <span style={{ fontSize: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                              {lvlInfo.name}
                            </span>
                            {isSelected && <span style={{ fontSize: 9, fontWeight: 900 }}>● Active</span>}
                            {!isSelected && (isLower || isHigher) && <span style={{ fontSize: 8, color: '#f59e0b' }}>spectrum</span>}
                          </button>
                        );
                      })}
                    </div>

                    {/* Dual Teacher Perspectives: Lower vs Higher */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10, marginBottom: 10 }}>
                      <div style={{ background: 'rgba(59, 130, 246, 0.06)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: 10, padding: '10px 12px' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#60a5fa', textTransform: 'uppercase', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span>🔻</span> Lower Perspective {q.spectrum_lower ? `(L${q.spectrum_lower})` : ''}
                        </div>
                        <div style={{ fontSize: 11.5, color: '#94a3b8', lineHeight: 1.5 }}>
                          {q.lower_perspective_rationale || 'If students were taught this standard textbook formula or definition, it acts primarily as routine procedural recall.'}
                        </div>
                      </div>

                      <div style={{ background: 'rgba(168, 85, 247, 0.06)', border: '1px solid rgba(168, 85, 247, 0.2)', borderRadius: 10, padding: '10px 12px' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#c084fc', textTransform: 'uppercase', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span>🔺</span> Higher Perspective {q.spectrum_higher ? `(L${q.spectrum_higher})` : ''}
                        </div>
                        <div style={{ fontSize: 11.5, color: '#94a3b8', lineHeight: 1.5 }}>
                          {q.higher_perspective_rationale || 'If presented in an unfamiliar scenario requiring multi-step isolation of parameters, it demands analytical deconstruction.'}
                        </div>
                      </div>
                    </div>

                    {/* Contextual factors */}
                    {Array.isArray(q.contextual_factors) && q.contextual_factors.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                        <span style={{ fontSize: 10.5, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Context Variables:</span>
                        {q.contextual_factors.map((cf: string, cfIdx: number) => (
                          <span key={cfIdx} style={{ fontSize: 10.5, color: '#a5b4fc', background: 'rgba(124, 111, 255, 0.08)', padding: '2px 8px', borderRadius: 12, border: '1px solid rgba(124, 111, 255, 0.18)' }}>
                            🏷️ {cf}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Revert Calibration */}
                    {calibrations[q.id] && (
                      <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => handleResetCalibration(q.id)}
                          style={{ background: 'transparent', border: 'none', color: '#f59e0b', fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}
                        >
                          ↺ Revert to AI Baseline Classification
                        </button>
                      </div>
                    )}
                  </div>
                  )}

                  {/* Ambiguity / Borderline Notice */}
                  {q.is_ambiguous && q.ambiguity_note && (
                    <div
                      style={{
                        background: 'rgba(245, 158, 11, 0.07)',
                        borderLeft: '3px solid #f59e0b',
                        borderRadius: '0 10px 10px 0',
                        padding: '10px 14px',
                        fontSize: 12.5,
                        color: '#fde68a',
                        lineHeight: 1.55,
                        marginBottom: 10,
                        display: 'flex',
                        gap: 8,
                        alignItems: 'flex-start',
                      }}
                    >
                      <AlertTriangle size={14} style={{ marginTop: 2, flexShrink: 0, color: '#f59e0b' }} />
                      <div>
                        <strong style={{ color: '#f59e0b', display: 'block', marginBottom: 3, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          Educator Note — Borderline Classification
                        </strong>
                        {q.ambiguity_note}
                        {q.alternative_level && BLOOM_LEVELS_META[q.alternative_level] && (
                          <span style={{ display: 'inline-block', marginTop: 6, fontSize: 11, color: '#fbbf24' }}>
                            Alternative: could also be classified as{' '}
                            <strong style={{ color: BLOOM_LEVELS_META[q.alternative_level].color }}>
                              L{q.alternative_level} – {BLOOM_LEVELS_META[q.alternative_level].name}
                            </strong>
                            {' '}depending on expected depth.
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Pedagogical Rationale Box */}
                  <div
                    style={{
                      background: meta.lightBg,
                      borderLeft: `3px solid ${meta.color}`,
                      borderRadius: '0 10px 10px 0',
                      padding: '10px 14px',
                      fontSize: 12.5,
                      color: '#cbd5e1',
                      lineHeight: 1.55,
                      marginBottom: 10,
                    }}
                  >
                    <strong style={{ color: meta.color, marginRight: 6 }}>Pedagogical Justification:</strong>
                    {q.rationale}
                  </div>

                  {/* Level-Up Suggestion Accordion */}
                  {q.level_up_suggestion && (
                    <div style={{ marginTop: 8 }}>
                      <button
                        onClick={() => toggleSuggestion(q.id)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#818cf8',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '4px 0',
                        }}
                      >
                        <Sparkles size={13} />
                        <span>View Higher-Order Level-Up Suggestion</span>
                        {isSuggestionOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </button>

                      {isSuggestionOpen && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          style={{
                            marginTop: 8,
                            padding: '12px 14px',
                            borderRadius: 10,
                            background: 'rgba(124, 111, 255, 0.08)',
                            border: '1px solid rgba(124, 111, 255, 0.25)',
                            fontSize: 12.5,
                            color: '#e0e7ff',
                            lineHeight: 1.55,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, color: '#818cf8', fontWeight: 700, fontSize: 11, textTransform: 'uppercase' }}>
                            <Lightbulb size={13} />
                            <span>Recommended Revision to Elevate Cognitive Demand:</span>
                          </div>
                          <div>{q.level_up_suggestion}</div>
                        </motion.div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {filteredQuestions.length === 0 && (
              <div
                style={{
                  textAlign: 'center',
                  padding: '40px 20px',
                  background: 'rgba(15, 23, 42, 0.6)',
                  borderRadius: 16,
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  color: '#94a3b8',
                }}
              >
                <Filter size={32} style={{ margin: '0 auto 10px auto', opacity: 0.5 }} />
                <h4 style={{ margin: '0 0 6px 0', color: '#f8fafc' }}>No questions match current filter</h4>
                <p style={{ margin: 0, fontSize: 12 }}>
                  Try selecting a different Bloom level or clearing your search query.
                </p>
                <button
                  onClick={() => {
                    setSelectedLevelFilter('all');
                    setSelectedDimensionFilter('all');
                    setSearchQuery('');
                  }}
                  style={{
                    marginTop: 14,
                    padding: '6px 14px',
                    borderRadius: 8,
                    background: 'rgba(124, 111, 255, 0.2)',
                    border: '1px solid rgba(124, 111, 255, 0.4)',
                    color: '#818cf8',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Reset Filters
                </button>
              </div>
            )}
          </div>
        </motion.div>
      );
    })()}
    </div>
  );
}
