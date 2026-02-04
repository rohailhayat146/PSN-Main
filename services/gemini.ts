import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { SkillDomain, SkillDNAScore, AntiCheatLog, ExamMCQ, ExamTheory, ExamPractical, ChallengeCheckpoint } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
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

export const analyzeEnvironmentSnapshot = async (
  imageBase64: string
): Promise<{ lighting: boolean; singlePerson: boolean; noDevices: boolean; feedback: string }> => {
  try {
    const prompt = `
      Role: Strict Exam Proctor AI. 
      Task: Analyze this webcam snapshot for interview integrity violations.

      ANALYSIS RULES:
      1. lighting: Must be TRUE (Pass) only if a human face is clearly visible, centered, and well-lit. If the image is too dark, blurry, or the face is obscured/missing/looking away, return FALSE.
      2. singlePerson: Must be TRUE (Pass) only if exactly 1 person is visible. If 0 people or >1 person are detected, return FALSE.
      3. noDevices: Must be TRUE (Pass) only if NO mobile phones, tablets, or written notes are visible. Headsets/headphones/earbuds are PERMITTED for audio participation.

      STRICTNESS LEVEL: EXTREME. 
      Any ambiguity or potential violation must result in a FAIL (FALSE).
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
    
    const text = response.text;
    if (!text) throw new Error("No response");
    return JSON.parse(text);

  } catch (error) {
    console.error("Proctoring Check Failed:", error);
    return {
      lighting: false,
      singlePerson: false,
      noDevices: false,
      feedback: "Verification failed (Service Error). Please ensure good connection and retry."
    };
  }
};

export const generateSkillTrial = async (domain: SkillDomain): Promise<{ questions: {id: number, text: string}[], constraints: string[] }> => {
    const prompt = `Generate 10 technical interview questions for ${domain}. Return strictly JSON.`;
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
    return JSON.parse(response.text || "{}");
};

export const evaluatePerformance = async (
    domain: SkillDomain,
    taskSummary: string,
    solutionSummary: string,
    userReasoning: string,
    timeSpent: number,
    antiCheat: AntiCheatLog
): Promise<{ score: SkillDNAScore; feedback: string }> => {
    const prompt = `Evaluate the user's performance for ${domain}. 
    Task: ${taskSummary}
    Solution: ${solutionSummary}
    Reasoning: ${userReasoning}
    Time Spent: ${timeSpent}s
    AntiCheat Log: ${JSON.stringify(antiCheat)}
    `;

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
    return JSON.parse(response.text || "{}");
};

export const generateChallengeScenario = async (domain: SkillDomain): Promise<{ taskDescription: string, checkpoints: ChallengeCheckpoint[] }> => {
    const prompt = `Create a coding challenge for ${domain} with incremental checkpoints.`;
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
    return JSON.parse(response.text || "{}");
};

export const validateChallengeStep = async (domain: SkillDomain, stepTitle: string, code: string): Promise<{ success: boolean, score: number, feedback: string }> => {
    const prompt = `Validate the code for step "${stepTitle}" in ${domain}. Code: ${code}`;
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
    return JSON.parse(response.text || "{}");
};

export const generateInterviewQuestion = async (domain: SkillDomain, lastScore: number, roundNum: number): Promise<{ text: string, timeLimit: number }> => {
     const prompt = `Generate interview question #${roundNum} for ${domain}. Previous score: ${lastScore}.`;
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
    return JSON.parse(response.text || "{}");
};

export const evaluateInterviewResponse = async (domain: SkillDomain, question: string, answer: string): Promise<{ score: number, feedback: string, spokenFeedback: string }> => {
    const prompt = `Evaluate answer for ${domain}. Question: ${question}. Answer: ${answer}.`;
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
    return JSON.parse(response.text || "{}");
};

export const generateExamMCQs = async (domain: SkillDomain): Promise<ExamMCQ[]> => {
    const prompt = `Generate 20 MCQ questions for ${domain}.`;
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
    const parsed = JSON.parse(response.text || "{}");
    return parsed.questions || [];
};

export const generateExamTheory = async (domain: SkillDomain): Promise<ExamTheory[]> => {
     const prompt = `Generate 5 theory questions for ${domain}.`;
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
    const parsed = JSON.parse(response.text || "{}");
    return parsed.questions || [];
};

export const generateExamPractical = async (domain: SkillDomain): Promise<ExamPractical[]> => {
    const prompt = `Generate 2 practical coding tasks for ${domain}.`;
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
    const parsed = JSON.parse(response.text || "{}");
    return parsed.tasks || [];
};

export const gradeExamSections = async (domain: SkillDomain, theory: ExamTheory[], practical: ExamPractical[]): Promise<{ theoryScore: number, practicalScore: number, feedback: string }> => {
    const prompt = `Grade the theory and practical sections for ${domain}. Theory: ${JSON.stringify(theory)}. Practical: ${JSON.stringify(practical)}.`;
    const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
        model: REASONING_MODEL,
        contents: prompt,
        config: {
            responseMimeType: "application/json",
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
    return JSON.parse(response.text || "{}");
};
