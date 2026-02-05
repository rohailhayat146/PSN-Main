
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { SkillDomain, SkillDNAScore, AntiCheatLog, ExamMCQ, ExamTheory, ExamPractical, ChallengeCheckpoint } from '../types';

// Lazy initialize client to prevent runtime crash on module load if env vars are missing
let aiClient: GoogleGenAI | null = null;

const getAiClient = () => {
  if (!aiClient) {
    const key = process.env.API_KEY || 'PLACEHOLDER_KEY'; 
    aiClient = new GoogleGenAI({ apiKey: key });
  }
  return aiClient;
};

// MODEL CONFIGURATION - HIGH DETERMINISM
const GENERATION_MODEL = 'gemini-3-flash-preview';
const REASONING_MODEL = 'gemini-3-pro-preview';

async function withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) throw error;
    await new Promise(r => setTimeout(r, delay));
    return withRetry(fn, retries - 1, delay * 2);
  }
}

const cleanJson = (text: string | undefined): string => {
  if (!text) return "{}";
  let clean = text.replace(/```json/g, "").replace(/```/g, "");
  return clean.trim();
};

const parseResponse = (text: string | undefined) => {
  try {
    return JSON.parse(cleanJson(text));
  } catch (e) {
    console.error("Failed to parse AI response:", text);
    return {};
  }
};

// --- ROBOTIC PROCTORING SUITE ---

export const analyzeEnvironmentSnapshot = async (
  imageBase64: string
): Promise<{ lighting: boolean; singlePerson: boolean; noDevices: boolean; feedback: string }> => {
  try {
    const ai = getAiClient();
    const prompt = `
      Role: Autonomous Technical Interview Proctor (Security Class).
      Task: Perform deep-scan analysis of the visual telemetry to identify security and integrity violations.
      
      VIOLATION PROTOCOLS:
      1. Lighting & Visibility: FAIL if face is obscured.
      2. Identity & Presence: FAIL if human count != 1.
      3. Electronic Devices: FAIL if smartphones/tablets/monitors detected.
      4. Communication Tools: FAIL if non-standard headsets detected.
      
      OUTPUT: Valid JSON. Justify feedback technically.
    `;

    const base64Data = imageBase64.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");

    const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
      model: GENERATION_MODEL,
      contents: {
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: base64Data } },
          { text: prompt }
        ]
      },
      config: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
             lighting: { type: Type.BOOLEAN },
             singlePerson: { type: Type.BOOLEAN },
             noDevices: { type: Type.BOOLEAN },
             feedback: { type: Type.STRING }
          },
          required: ["lighting", "singlePerson", "noDevices", "feedback"]
        }
      }
    }), 1, 3000);
    
    return parseResponse(response.text);

  } catch (error) {
    console.error("Proctoring Check Failed:", error);
    return {
      lighting: false,
      singlePerson: false,
      noDevices: false,
      feedback: "Security analysis engine error."
    };
  }
};

// --- SKILL TRIAL ---

export const generateSkillTrial = async (domain: SkillDomain): Promise<{ questions: {id: number, text: string}[], constraints: string[] }> => {
    const ai = getAiClient();
    const prompt = `Generate exactly 10 high-difficulty interview questions for ${domain}. Level: Senior/Principal.`;
    
    const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
        model: REASONING_MODEL,
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    questions: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                id: { type: Type.INTEGER },
                                text: { type: Type.STRING }
                            },
                            required: ["id", "text"]
                        }
                    },
                    constraints: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING }
                    }
                },
                required: ["questions", "constraints"]
            }
        }
    }));
    return parseResponse(response.text);
};

export const evaluatePerformance = async (
    domain: SkillDomain,
    taskSummary: string,
    solutionSummary: string,
    userReasoning: string,
    timeSpent: number,
    antiCheat: AntiCheatLog
): Promise<{ score: SkillDNAScore; feedback: string }> => {
    const ai = getAiClient();
    const prompt = `Evaluate execution for ${domain}. Strictness: Production Grade. 
    Task: ${taskSummary}
    Solution: ${solutionSummary}
    Reasoning: ${userReasoning}`;

    const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
        model: REASONING_MODEL,
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    score: {
                        type: Type.OBJECT,
                        properties: {
                            problemSolving: { type: Type.NUMBER },
                            executionSpeed: { type: Type.NUMBER },
                            conceptualDepth: { type: Type.NUMBER },
                            aiLeverage: { type: Type.NUMBER },
                            riskAwareness: { type: Type.NUMBER },
                            average: { type: Type.NUMBER }
                        },
                        required: ["problemSolving", "executionSpeed", "conceptualDepth", "aiLeverage", "riskAwareness", "average"]
                    },
                    feedback: { type: Type.STRING }
                },
                required: ["score", "feedback"]
            }
        }
    }));
    return parseResponse(response.text);
};

// --- COMPETITIVE EXAM GENERATION (ULTRA-RIGOROUS) ---

export const generateExamMCQs = async (domain: SkillDomain): Promise<ExamMCQ[]> => {
    const ai = getAiClient();
    const prompt = `Generate exactly 20 Multiple Choice Questions (MCQs) for a Competitive Certification Exam in ${domain}.
    Difficulty Level: Staff/Principal Engineer.
    Rules:
    - Questions must cover obscure edge cases, low-level optimizations, and complex protocol internals.
    - Options must include highly plausible distractors that penalize surface-level knowledge.
    - Format: Deterministic JSON.`;
    
    const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
        model: REASONING_MODEL,
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    questions: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                id: { type: Type.INTEGER },
                                question: { type: Type.STRING },
                                options: { 
                                    type: Type.ARRAY,
                                    items: { type: Type.STRING }
                                },
                                correctIndex: { type: Type.INTEGER }
                            },
                            required: ["id", "question", "options", "correctIndex"]
                        }
                    }
                },
                required: ["questions"]
            }
        }
    }));
    const parsed = parseResponse(response.text);
    return (parsed.questions || []).slice(0, 20);
};

export const generateExamTheory = async (domain: SkillDomain): Promise<ExamTheory[]> => {
     const ai = getAiClient();
     const prompt = `Generate exactly 30 Deep Theory/Architecture questions for a Competitive Exam in ${domain}.
     Focus: Distributed systems trade-offs, scalability bottlenecks, security vector analysis, and complex data consistency models.
     Format: Deterministic JSON.`;
     
     const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
        model: REASONING_MODEL,
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    questions: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                id: { type: Type.INTEGER },
                                question: { type: Type.STRING }
                            },
                            required: ["id", "question"]
                        }
                    }
                },
                required: ["questions"]
            }
        }
    }));
    const parsed = parseResponse(response.text);
    return (parsed.questions || []).slice(0, 30);
};

export const generateExamPractical = async (domain: SkillDomain): Promise<ExamPractical[]> => {
    const ai = getAiClient();
    const prompt = `Generate exactly 10 Practical Coding/System tasks for ${domain}.
    Level: Expert. Constraints must involve high-concurrency, memory-efficiency, and strict API compliance.`;
    
    const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
        model: REASONING_MODEL,
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    tasks: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                id: { type: Type.INTEGER },
                                task: { type: Type.STRING },
                                constraints: { 
                                    type: Type.ARRAY,
                                    items: { type: Type.STRING }
                                }
                            },
                            required: ["id", "task", "constraints"]
                        }
                    }
                },
                required: ["tasks"]
            }
        }
    }));
    const parsed = parseResponse(response.text);
    return (parsed.tasks || []).slice(0, 10);
};

export const gradeExamSections = async (domain: SkillDomain, theory: ExamTheory[], practical: ExamPractical[]): Promise<{ theoryScore: number, practicalScore: number, feedback: string }> => {
    const ai = getAiClient();
    const prompt = `ACT AS A SENIOR CERTIFICATION BOARD. Grade the following ${domain} Exam with extreme rigor. 
    
    THEORY INPUT: ${JSON.stringify(theory)}
    PRACTICAL INPUT: ${JSON.stringify(practical)}
    
    GRADING PROTOCOL:
    - Zero tolerance for hand-wavy architecture answers.
    - Code must solve the primary constraint to receive > 50%.
    - Penalize solutions with known security vulnerabilities (OWASP top 10).
    - Ensure feedback is precise, robotic, and highlights exactly why points were deducted.`;

    const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
        model: REASONING_MODEL,
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            thinkingConfig: { thinkingBudget: 16384 },
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    theoryScore: { type: Type.INTEGER },
                    practicalScore: { type: Type.INTEGER },
                    feedback: { type: Type.STRING }
                },
                required: ["theoryScore", "practicalScore", "feedback"]
            }
        }
    }));
    return parseResponse(response.text);
};

// --- INTERVIEW (DYNAMIC) ---

export const generateInterviewQuestion = async (domain: SkillDomain, lastScore: number, roundNum: number): Promise<{ text: string, timeLimit: number }> => {
     const ai = getAiClient();
     const prompt = `Generate Question #${roundNum}/20 for ${domain}. Difficulty based on score ${lastScore}.`;
     
     const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
        model: GENERATION_MODEL,
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    text: { type: Type.STRING },
                    timeLimit: { type: Type.INTEGER }
                },
                required: ["text", "timeLimit"]
            }
        }
    }));
    return parseResponse(response.text);
};

export const evaluateInterviewResponse = async (domain: SkillDomain, question: string, answer: string): Promise<{ score: number, feedback: string, spokenFeedback: string }> => {
    const ai = getAiClient();
    const prompt = `Evaluate Spoken Response for ${domain}. Q: ${question} A: ${answer}`;
    
    const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
        model: GENERATION_MODEL,
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    score: { type: Type.INTEGER },
                    feedback: { type: Type.STRING },
                    spokenFeedback: { type: Type.STRING }
                },
                required: ["score", "feedback", "spokenFeedback"]
            }
        }
    }));
    return parseResponse(response.text);
};

// --- CHALLENGE SCENARIO ---

export const generateChallengeScenario = async (domain: SkillDomain): Promise<{ taskDescription: string, checkpoints: ChallengeCheckpoint[] }> => {
    const ai = getAiClient();
    const prompt = `Create a deterministic coding challenge for ${domain}.`;
    const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
        model: REASONING_MODEL,
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    taskDescription: { type: Type.STRING },
                    checkpoints: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                id: { type: Type.INTEGER },
                                title: { type: Type.STRING },
                                description: { type: Type.STRING },
                                completed: { type: Type.BOOLEAN }
                            },
                            required: ["id", "title", "description", "completed"]
                        }
                    }
                },
                required: ["taskDescription", "checkpoints"]
            }
        }
    }));
    return parseResponse(response.text);
};

export const validateChallengeStep = async (domain: SkillDomain, stepTitle: string, code: string): Promise<{ success: boolean, score: number, feedback: string }> => {
    const ai = getAiClient();
    const prompt = `Validate code against checkpoint "${stepTitle}" in ${domain}. Code: ${code}`;
    
    const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
        model: GENERATION_MODEL,
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    success: { type: Type.BOOLEAN },
                    score: { type: Type.INTEGER },
                    feedback: { type: Type.STRING }
                },
                required: ["success", "score", "feedback"]
            }
        }
    }));
    return parseResponse(response.text);
};
