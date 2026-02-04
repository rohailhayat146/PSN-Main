
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { SkillDomain } from '../types';
import { generateInterviewQuestion, evaluateInterviewResponse, analyzeEnvironmentSnapshot } from '../services/gemini';
import { Video, VideoOff, Timer, ShieldAlert, CheckCircle, ChevronRight, BarChart2, Cpu, Mic, Sun, User as UserIcon, Smartphone, Loader2, XCircle } from 'lucide-react';

interface Props {
  onComplete: (data: any) => void;
}

const QUESTIONS_COUNT = 20;

export const InterviewRoom: React.FC<Props> = ({ onComplete }) => {
  const navigate = useNavigate();
  
  // Setup State
  const [domain, setDomain] = useState<SkillDomain>(SkillDomain.ALGORITHMS);
  const [hasPermissions, setHasPermissions] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<'setup' | 'intro' | 'active' | 'evaluating' | 'summary'>('setup');
  
  // Environment Check State
  const [isAnalyzingEnv, setIsAnalyzingEnv] = useState(false);
  const [envCheck, setEnvCheck] = useState<{lighting: boolean; singlePerson: boolean; noDevices: boolean; feedback: string} | null>(null);
  const [currentRoundViolations, setCurrentRoundViolations] = useState<string[]>([]);

  // AI State
  const [aiState, setAiState] = useState<'idle' | 'speaking_question' | 'listening' | 'processing' | 'speaking_feedback'>('idle');
  
  // Interview State
  const [round, setRound] = useState(0); 
  const [currentQuestionText, setCurrentQuestionText] = useState<string>(""); // Kept for logic, not display
  const [timeLeft, setTimeLeft] = useState(0);
  const [maxTime, setMaxTime] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [recognition, setRecognition] = useState<any>(null);
  
  // Data State
  const [history, setHistory] = useState<any[]>([]);
  const [lastScore, setLastScore] = useState(0); 
  
  // Voice State
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const recognitionRef = useRef<any>(null);

  // --- UTILS: Text To Speech ---
  useEffect(() => {
    const loadVoices = () => {
      const vs = window.speechSynthesis.getVoices();
      setVoices(vs);
    };
    
    // Voices might load asynchronously
    window.speechSynthesis.onvoiceschanged = loadVoices;
    loadVoices();
    
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  const speak = (text: string, onEnd?: () => void) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel(); // Stop any previous speech
      const utterance = new SpeechSynthesisUtterance(text);
      
      // Attempt to select a high-quality voice
      const preferredVoice = 
        voices.find(v => v.name.includes("Google US English")) || 
        voices.find(v => v.name.includes("Samantha")) || 
        voices.find(v => v.lang.startsWith("en-"));
      
      if (preferredVoice) {
         utterance.voice = preferredVoice;
      }

      // Slightly slower rate for clarity
      utterance.rate = 0.95; 
      utterance.pitch = 1.0;
      
      utterance.onend = () => {
        if (onEnd) onEnd();
      };
      
      utterance.onerror = (e) => {
        console.error("TTS Error", e);
        if (onEnd) onEnd(); // Fail gracefully
      };
      
      window.speechSynthesis.speak(utterance);
    } else {
      console.warn("TTS not supported");
      if (onEnd) onEnd();
    }
  };

  // 1. SETUP & PERMISSIONS
  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setStream(mediaStream);
      setHasPermissions(true);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      alert("Camera and Microphone permissions are required.");
    }
  };

  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, status]);

  // Environment Check (Initial)
  const analyzeEnvironment = async () => {
    if (!videoRef.current || !hasPermissions) return;
    
    setIsAnalyzingEnv(true);
    setEnvCheck(null);

    try {
       const canvas = document.createElement('canvas');
       canvas.width = videoRef.current.videoWidth;
       canvas.height = videoRef.current.videoHeight;
       const ctx = canvas.getContext('2d');
       if (ctx) {
         ctx.drawImage(videoRef.current, 0, 0);
         const base64 = canvas.toDataURL('image/jpeg', 0.9); // High quality for initial check
         
         const result = await analyzeEnvironmentSnapshot(base64);
         setEnvCheck(result);
       }
    } catch (e) {
       console.error("Snapshot error", e);
       setEnvCheck({
         lighting: false,
         singlePerson: false,
         noDevices: false,
         feedback: "System error during analysis. Please retry."
       });
    } finally {
       setIsAnalyzingEnv(false);
    }
  };

  // 1.5 CONTINUOUS MONITORING (Anti-Cheat)
  useEffect(() => {
    let monitorInterval: any;

    const performCheck = async () => {
      // Monitor continuously while the session is active (both speaking and listening)
      if (status !== 'active' && status !== 'evaluating') return;
      if (!videoRef.current) return;

      try {
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(videoRef.current, 0, 0);
          // Use good quality for monitoring to ensure detection reliability
          const base64 = canvas.toDataURL('image/jpeg', 0.7); 
          
          // Run analysis in background
          analyzeEnvironmentSnapshot(base64).then(result => {
             const violations: string[] = [];
             if (!result.lighting) violations.push("Poor Lighting / Face Obscured");
             if (!result.singlePerson) violations.push("Presence Check Failed (Must be 1 person)");
             if (!result.noDevices) violations.push("Prohibited Device Detected");

             if (violations.length > 0) {
                 // Accumulate violations for the current round/session
                 setCurrentRoundViolations(prev => {
                    const set = new Set([...prev, ...violations]);
                    return Array.from(set);
                 });
             }
          }).catch(e => console.warn("Background proctor check skipped:", e));
        }
      } catch (e) {
        console.warn("Monitor check failed", e);
      }
    };

    if (status === 'active' || status === 'evaluating') {
       // Extensive monitoring: Check every 4 seconds
       monitorInterval = setInterval(performCheck, 4000);
    }

    return () => clearInterval(monitorInterval);
  }, [status]);

  // Enforce Anti-Cheat (Global Listeners)
  useEffect(() => {
    const handleContext = (e: Event) => e.preventDefault();
    const handleCopyPaste = (e: ClipboardEvent) => e.preventDefault();
    const handleVisibility = () => {
      if (document.hidden && status === 'active') {
         speak("Warning. Please keep the tab open.");
         setCurrentRoundViolations(prev => [...prev, "Tab Switch"]);
      }
    };

    if (status !== 'setup' && status !== 'summary') {
      document.addEventListener('contextmenu', handleContext);
      document.addEventListener('copy', handleCopyPaste);
      document.addEventListener('paste', handleCopyPaste);
      document.addEventListener('visibilitychange', handleVisibility);
    }

    return () => {
      document.removeEventListener('contextmenu', handleContext);
      document.removeEventListener('copy', handleCopyPaste);
      document.removeEventListener('paste', handleCopyPaste);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [status]);

  // 2. SPEECH RECOGNITION SETUP
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recog = new SpeechRecognition();
      recog.continuous = true;
      recog.interimResults = true;
      recog.lang = 'en-US';

      recog.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        setTranscript(prev => finalTranscript || prev);
      };
      
      recog.onerror = (event: any) => {
        if (event.error === 'no-speech') {
          return; 
        }
        console.error("Speech error", event.error);
      };

      recognitionRef.current = recog;
      setRecognition(recog);
    } else {
      alert("Browser not supported. Use Chrome.");
    }
  }, []);

  // 3. GAME FLOW
  const startInterview = async () => {
    setStatus('intro');
    speak(`Welcome to the ${domain} interview. I will ask you ${QUESTIONS_COUNT} questions. Please answer clearly. Let's begin.`, () => {
       nextQuestion(1);
    });
  };

  const nextQuestion = async (roundNum: number) => {
    setCurrentRoundViolations([]); // Reset violations for new round
    if (roundNum > QUESTIONS_COUNT) {
      finishInterview();
      return;
    }

    setTranscript(""); 
    setRound(roundNum);
    setAiState('processing'); // Visual loader

    // Generate
    const qData = await generateInterviewQuestion(domain, lastScore, roundNum);
    setCurrentQuestionText(qData.text);
    setMaxTime(qData.timeLimit);
    setTimeLeft(qData.timeLimit);
    
    // AI Speaks Question
    setStatus('active');
    setAiState('speaking_question');
    
    speak(qData.text, () => {
      // Start Listening AFTER speech ends
      startListeningPhase();
    });
  };

  const startListeningPhase = () => {
    setAiState('listening');
    setIsRecording(true);
    try {
      recognitionRef.current?.start();
    } catch(e) {
      // Already started? Ignore.
    }
  };

  const stopListeningPhase = () => {
    setIsRecording(false);
    try {
      recognitionRef.current?.stop();
    } catch(e) {}
  };

  const submitAnswer = async () => {
    stopListeningPhase();
    setAiState('processing');
    
    const finalTranscript = transcript.trim() || "(No audio detected)";
    let result = await evaluateInterviewResponse(domain, currentQuestionText, finalTranscript);
    
    // STRICT PENALTY LOGIC
    if (currentRoundViolations.length > 0) {
       result = {
          score: 0,
          feedback: `VIOLATION DETECTED: ${currentRoundViolations.join(", ")}. The integrity of this answer could not be verified.`,
          spokenFeedback: "I detected an environment violation during your answer. This question receives zero points."
       };
    }
    
    const newHistory = [...history, {
        round,
        question: currentQuestionText,
        answer: finalTranscript,
        score: result.score,
        feedback: result.feedback
    }];
    setHistory(newHistory);
    setLastScore(result.score); 

    // Speak Feedback
    setAiState('speaking_feedback');
    speak(result.spokenFeedback || "Okay, moving on.", () => {
       setTimeout(() => {
          nextQuestion(round + 1);
       }, 500);
    });
  };

  const finishInterview = () => {
    setStatus('summary');
    setAiState('idle');
    speak("Interview complete. Generating your report now.");
  };

  const handleReturn = () => {
     const avgScore = Math.round(history.reduce((a, b) => a + b.score, 0) / Math.max(history.length, 1));
     onComplete({
        domain,
        score: avgScore,
        history
     });
  };

  // Timer
  useEffect(() => {
    if (aiState !== 'listening') return;
    const interval = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          submitAnswer();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [aiState]);


  // --- VISUALIZERS ---
  const AudioVisualizer = ({ active, color }: { active: boolean, color: string }) => (
     <div className={`flex items-center justify-center gap-1 h-12 ${active ? '' : 'opacity-20'}`}>
        {[...Array(8)].map((_, i) => (
           <div 
             key={i} 
             className={`w-2 rounded-full ${color}`}
             style={{
               height: active ? `${Math.max(20, Math.random() * 100)}%` : '20%',
               animation: active ? `pulse 0.5s infinite ease-in-out ${i * 0.1}s` : 'none'
             }}
           ></div>
        ))}
     </div>
  );


  // --- RENDER ---

  if (status === 'setup') {
    // Check if checks passed
    const isReady = hasPermissions && envCheck?.lighting && envCheck?.singlePerson && envCheck?.noDevices;

    return (
      <div className="max-w-4xl mx-auto py-12 animate-fade-in">
        <h1 className="text-3xl font-bold text-white mb-8 text-center">AI Voice Interview Setup</h1>
        
        <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700">
               <h3 className="text-xl font-bold text-white mb-4">1. Select Domain</h3>
               <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                  {Object.values(SkillDomain).map(d => (
                    <button 
                       key={d} 
                       onClick={() => setDomain(d)}
                       className={`w-full text-left px-4 py-3 rounded-xl transition-all ${domain === d ? 'bg-cyan-900/40 border border-cyan-500 text-cyan-400' : 'bg-slate-700/50 hover:bg-slate-700 text-slate-300'}`}
                    >
                        {d}
                    </button>
                  ))}
               </div>
            </div>

            <div className="space-y-6">
                <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 flex flex-col items-center">
                    <h3 className="text-xl font-bold text-white mb-4">2. Environment Check</h3>
                    <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden mb-4 border border-slate-600 shadow-inner group">
                        <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover transform scale-x-[-1]" />
                        {!hasPermissions && (
                            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm">
                                <span className="text-slate-400 text-sm flex items-center gap-2">
                                  <VideoOff size={16} /> Camera Access Needed
                                </span>
                            </div>
                        )}
                        <div className="absolute top-2 right-2 flex gap-2">
                             {hasPermissions ? (
                               <div className="bg-green-500/20 text-green-400 px-2 py-1 rounded text-xs font-bold border border-green-500/50 flex items-center gap-1">
                                 <CheckCircle size={10} /> REC
                               </div>
                             ) : null}
                        </div>
                    </div>
                    
                    {!hasPermissions ? (
                        <button 
                           onClick={startCamera}
                           className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
                        >
                            <Video size={18} /> Enable Camera & Mic
                        </button>
                    ) : (
                      <div className="w-full space-y-4">
                         
                         {/* Environment Checklist */}
                         <div className="grid grid-cols-3 gap-2">
                            {/* Lighting Check */}
                            <div className={`p-2 rounded-lg border flex flex-col items-center text-center gap-1 transition-colors
                                ${isAnalyzingEnv ? 'bg-yellow-900/10 border-yellow-500/50 text-yellow-500' : 
                                  envCheck?.lighting ? 'bg-green-900/20 border-green-500 text-green-400' : 
                                  envCheck === null ? 'bg-slate-700/50 border-slate-600 text-slate-400' : 
                                  'bg-red-900/20 border-red-500 text-red-400'
                                }`}>
                               <Sun size={20} className={isAnalyzingEnv ? "animate-pulse" : ""} />
                               <span className="text-xs font-bold">Lighting</span>
                               {isAnalyzingEnv ? <Loader2 size={12} className="animate-spin"/> : 
                                envCheck ? (envCheck.lighting ? <CheckCircle size={12}/> : <XCircle size={12}/>) : 
                                <div className="w-3 h-3 rounded-full bg-slate-600"/>}
                            </div>
                            
                            {/* Alone Check */}
                            <div className={`p-2 rounded-lg border flex flex-col items-center text-center gap-1 transition-colors
                                ${isAnalyzingEnv ? 'bg-yellow-900/10 border-yellow-500/50 text-yellow-500' : 
                                  envCheck?.singlePerson ? 'bg-green-900/20 border-green-500 text-green-400' : 
                                  envCheck === null ? 'bg-slate-700/50 border-slate-600 text-slate-400' : 
                                  'bg-red-900/20 border-red-500 text-red-400'
                                }`}>
                               <UserIcon size={20} className={isAnalyzingEnv ? "animate-pulse" : ""} />
                               <span className="text-xs font-bold">Alone</span>
                               {isAnalyzingEnv ? <Loader2 size={12} className="animate-spin"/> : 
                                envCheck ? (envCheck.singlePerson ? <CheckCircle size={12}/> : <XCircle size={12}/>) : 
                                <div className="w-3 h-3 rounded-full bg-slate-600"/>}
                            </div>
                            
                            {/* No Devices Check */}
                            <div className={`p-2 rounded-lg border flex flex-col items-center text-center gap-1 transition-colors
                                ${isAnalyzingEnv ? 'bg-yellow-900/10 border-yellow-500/50 text-yellow-500' : 
                                  envCheck?.noDevices ? 'bg-green-900/20 border-green-500 text-green-400' : 
                                  envCheck === null ? 'bg-slate-700/50 border-slate-600 text-slate-400' : 
                                  'bg-red-900/20 border-red-500 text-red-400'
                                }`}>
                               <Smartphone size={20} className={isAnalyzingEnv ? "animate-pulse" : ""} />
                               <span className="text-xs font-bold">No Devices</span>
                               {isAnalyzingEnv ? <Loader2 size={12} className="animate-spin"/> : 
                                envCheck ? (envCheck.noDevices ? <CheckCircle size={12}/> : <XCircle size={12}/>) : 
                                <div className="w-3 h-3 rounded-full bg-slate-600"/>}
                            </div>
                         </div>
                         
                         {envCheck && !isReady && (
                            <div className="bg-red-900/20 text-red-400 text-xs p-3 rounded-lg border border-red-900/50">
                               {envCheck.feedback || "Environment check failed. Please adjust and retry."}
                            </div>
                         )}

                         {!isReady && (
                            <button 
                              onClick={analyzeEnvironment}
                              disabled={isAnalyzingEnv}
                              className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2 border border-slate-600"
                            >
                              {isAnalyzingEnv ? <Loader2 size={18} className="animate-spin" /> : <ShieldAlert size={18} />}
                              {envCheck ? "Retry Verification" : "Verify Environment"}
                            </button>
                         )}
                      </div>
                    )}
                </div>

                <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700 text-sm text-slate-400">
                    <p className="flex items-start gap-2 mb-2"><ShieldAlert size={16} className="shrink-0 mt-0.5 text-cyan-500" /> <strong>Strict Mode:</strong> No text questions. Audio only.</p>
                    <p className="flex items-start gap-2"><Cpu size={16} className="shrink-0 mt-0.5 text-cyan-500" /> <strong>AI Scoring:</strong> Clarity, Depth, Accuracy.</p>
                </div>

                <button 
                   disabled={!isReady}
                   onClick={startInterview}
                   className="w-full py-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold rounded-xl shadow-lg shadow-cyan-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                    Start Voice Interview ({QUESTIONS_COUNT} Questions)
                </button>
            </div>
        </div>
      </div>
    );
  }

  if (status === 'intro') {
      return (
          <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-6 animate-fade-in">
              <div className="w-32 h-32 rounded-full bg-cyan-900/20 border-2 border-cyan-500 flex items-center justify-center relative">
                  <Mic size={48} className="text-cyan-400" />
                  <div className="absolute inset-0 border-4 border-cyan-500 rounded-full animate-ping opacity-20"></div>
              </div>
              <h2 className="text-3xl font-bold text-white">Initializing AI...</h2>
              <p className="text-slate-400 max-w-md">Listen carefully. The AI will speak shortly.</p>
          </div>
      );
  }

  if (status === 'active' || status === 'evaluating') {
    return (
      <div className="h-[calc(100vh-90px)] flex flex-col gap-4 animate-fade-in max-w-6xl mx-auto w-full px-4">
         {/* Top Bar */}
         <div className="flex items-center justify-between bg-slate-800 p-4 rounded-xl border border-slate-700 shrink-0">
             <div className="flex items-center gap-3">
                 <span className="text-sm font-bold text-slate-400">Question {round} / {QUESTIONS_COUNT}</span>
                 <span className="px-2 py-0.5 bg-slate-700 rounded text-xs text-slate-300 font-mono">{domain}</span>
             </div>
             <div className="flex-1 mx-8 relative h-2 bg-slate-700 rounded-full overflow-hidden">
                <div 
                   className={`absolute top-0 bottom-0 left-0 transition-all duration-1000 ${timeLeft < 10 ? 'bg-red-500' : 'bg-cyan-500'}`}
                   style={{ width: `${(timeLeft / (maxTime || 60)) * 100}%` }}
                ></div>
             </div>
             <div className={`flex items-center gap-2 font-mono text-2xl font-bold ${timeLeft < 15 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
                 <Timer size={24} />
                 0:{timeLeft < 10 ? '0' : ''}{timeLeft}
             </div>
         </div>

         {/* Main Content */}
         <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 min-h-0 pb-4">
             
             {/* Left: AI Avatar & Audio Visualizer */}
             <div className="bg-slate-800 rounded-2xl border border-slate-700 flex flex-col overflow-hidden relative h-full">
                 <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 to-blue-500"></div>
                 
                 <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                     
                     {/* AI Avatar */}
                     <div className={`w-32 h-32 rounded-full mb-8 flex items-center justify-center shadow-2xl border-4 transition-all duration-500
                        ${aiState === 'speaking_question' || aiState === 'speaking_feedback' 
                          ? 'border-cyan-400 bg-cyan-900/20 scale-110 shadow-cyan-500/50' 
                          : aiState === 'processing' 
                            ? 'border-purple-500 bg-purple-900/20 animate-pulse' 
                            : 'border-slate-600 bg-slate-700'
                        }`}>
                         <Cpu size={64} className={`
                           ${aiState === 'processing' ? 'text-purple-400 animate-spin' : 
                             aiState === 'listening' ? 'text-slate-500' : 'text-cyan-400'}
                         `} />
                     </div>

                     {/* Status Text */}
                     <h2 className="text-2xl font-bold text-white mb-2">
                        {aiState === 'speaking_question' && "AI Speaking..."}
                        {aiState === 'listening' && "Your Turn"}
                        {aiState === 'processing' && "Thinking..."}
                        {aiState === 'speaking_feedback' && "AI Feedback"}
                     </h2>
                     
                     {/* Visualizers */}
                     <div className="mt-8 h-16 w-full flex justify-center">
                        {aiState === 'speaking_question' || aiState === 'speaking_feedback' ? (
                           <AudioVisualizer active={true} color="bg-cyan-400" />
                        ) : aiState === 'listening' ? (
                           <div className="text-green-400 animate-pulse font-mono flex flex-col items-center gap-2">
                              <Mic size={32} />
                              LISTENING
                           </div>
                        ) : null}
                     </div>

                 </div>
             </div>

             {/* Right: Camera Feed & Controls */}
             <div className="flex flex-col gap-4 h-full">
                 <div className="flex-1 bg-black rounded-2xl overflow-hidden border border-slate-700 relative shadow-2xl group">
                     <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover transform scale-x-[-1]" />
                     
                     {/* Violation Overlay */}
                     {currentRoundViolations.length > 0 && (
                        <div className="absolute top-4 right-4 bg-red-600/90 text-white px-3 py-2 rounded shadow-lg border border-red-400 animate-pulse z-10 flex items-center gap-2">
                            <ShieldAlert size={16} />
                            <div className="text-xs font-bold">
                                VIOLATION DETECTED
                                <div className="text-[10px] font-normal opacity-90">{currentRoundViolations[0]}</div>
                            </div>
                        </div>
                     )}

                     {/* User Audio Visualizer Overlay */}
                     {aiState === 'listening' && (
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1 items-end h-16 pointer-events-none">
                           {[...Array(8)].map((_,i) => (
                             <div key={i} className="w-2 bg-green-500 rounded-full animate-bounce" style={{ height: `${Math.random() * 80 + 20}%`, animationDuration: `${Math.random() * 0.5 + 0.2}s` }}></div>
                           ))}
                        </div>
                     )}

                     <div className="absolute top-4 left-4 bg-black/60 backdrop-blur px-3 py-1 rounded text-xs text-slate-300 font-mono">
                        CAM: ACTIVE
                     </div>
                 </div>

                 <button 
                    onClick={submitAnswer}
                    disabled={aiState !== 'listening'}
                    className={`w-full py-6 rounded-xl font-bold text-xl shadow-lg transition-all flex items-center justify-center gap-3 shrink-0
                      ${aiState === 'listening' 
                        ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-900/30 cursor-pointer' 
                        : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                      }`}
                 >
                    {aiState === 'listening' ? (
                      <>
                        <div className="w-4 h-4 rounded-full bg-white animate-pulse"></div> DONE SPEAKING
                      </>
                    ) : 'WAITING FOR AI...'}
                 </button>
             </div>
         </div>
      </div>
    );
  }

  if (status === 'summary') {
      const avgScore = Math.round(history.reduce((a, b) => a + b.score, 0) / Math.max(history.length, 1));
      return (
        <div className="max-w-3xl mx-auto py-12 animate-fade-in">
            <div className="text-center mb-12">
                <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-green-900/30 border border-green-500 mb-6 text-green-400 shadow-xl shadow-green-900/20">
                    <BarChart2 size={48} />
                </div>
                <h1 className="text-4xl font-bold text-white mb-2">Interview Complete</h1>
                <div className="flex items-center justify-center gap-2 mb-4">
                   <span className="text-6xl font-bold text-white">{avgScore}</span>
                   <span className="text-xl text-slate-500 self-end mb-2">/100</span>
                </div>
                <p className="text-slate-400">Your AI-Verified Voice Assessment Report</p>
            </div>

            <div className="space-y-6 mb-8">
                {history.map((h, i) => (
                    <div key={i} className={`bg-slate-800 p-6 rounded-xl border shadow-lg ${h.score === 0 ? 'border-red-500/50' : 'border-slate-700'}`}>
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="text-white font-bold text-lg w-3/4">Question {i+1} (Hidden Audio)</h3>
                            <span className={`px-3 py-1 rounded text-sm font-bold border ${h.score >= 70 ? 'bg-green-900/30 text-green-400 border-green-500/50' : h.score === 0 ? 'bg-red-900/30 text-red-400 border-red-500/50' : 'bg-orange-900/30 text-orange-400 border-orange-500/50'}`}>
                                Score: {h.score}
                            </span>
                        </div>
                        <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700/50 mb-4">
                           <p className="text-xs text-slate-500 uppercase font-bold mb-1">Feedback</p>
                           <p className="text-slate-300 italic">"{h.feedback}"</p>
                        </div>
                    </div>
                ))}
            </div>

            <button 
              onClick={handleReturn}
              className="w-full py-4 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl shadow-lg transition-colors flex items-center justify-center gap-2"
            >
               Save Results to Profile <ChevronRight size={20} />
            </button>
        </div>
      );
  }

  return null;
};
