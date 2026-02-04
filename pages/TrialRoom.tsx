
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { TrialSession, SkillDomain, AntiCheatLog } from '../types';
import { generateSkillTrial, evaluatePerformance } from '../services/gemini';
import { AlertTriangle, Clock, Eye, Send, Code, Cpu, ShieldAlert, XCircle, CheckCircle, ChevronRight, ChevronLeft, Lock } from 'lucide-react';
import { SkillRadar } from '../components/SkillRadar';

interface Props {
  domain: SkillDomain;
  onComplete: (session: TrialSession) => void;
}

const TRIAL_DURATION = 900; // 15 minutes total

// Strict thresholds for rejection
const MAX_TAB_SWITCHES = 2; // Allow small margin for system popups
const MAX_PASTES = 0; // Zero tolerance for pasting code
const MAX_FOCUS_LOST_TIME = 5000; // 5 seconds total tolerance

export const TrialRoom: React.FC<Props> = ({ domain, onComplete }) => {
  const [session, setSession] = useState<TrialSession>({
    id: crypto.randomUUID(),
    domain,
    status: 'generating',
  });
  const [timeLeft, setTimeLeft] = useState(TRIAL_DURATION);
  
  // 10-Question State
  const [questions, setQuestions] = useState<{id: number, text: string}[]>([]);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  
  // Anti-cheat state
  const [antiCheat, setAntiCheat] = useState<AntiCheatLog>({
    tabSwitchCount: 0,
    pasteCount: 0,
    focusLostTime: 0,
  });
  const blurTimeRef = useRef<number | null>(null);

  // Load Task
  useEffect(() => {
    const init = async () => {
      const data = await generateSkillTrial(domain);
      setQuestions(data.questions);
      setSession(prev => ({
        ...prev,
        status: 'active',
        startTime: Date.now(),
        taskDescription: JSON.stringify(data.questions), // Store full list as string for record
        constraints: data.constraints
      }));
    };
    init();
  }, [domain]);

  // Timer
  useEffect(() => {
    if (session.status !== 'active') return;
    const interval = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          handleSubmit();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [session.status]);

  // Anti-Cheat Listeners
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        blurTimeRef.current = Date.now();
      } else {
        if (blurTimeRef.current) {
          const lostTime = Date.now() - blurTimeRef.current;
          setAntiCheat(prev => ({
            ...prev,
            tabSwitchCount: prev.tabSwitchCount + 1,
            focusLostTime: prev.focusLostTime + lostTime
          }));
          blurTimeRef.current = null;
        }
      }
    };

    const handlePaste = (e: ClipboardEvent) => {
       e.preventDefault(); // BLOCK PASTE
       setAntiCheat(prev => ({ ...prev, pasteCount: prev.pasteCount + 1 }));
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("paste", handlePaste); 
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("paste", handlePaste);
    };
  }, []);

  const handleSubmit = useCallback(async () => {
    // 1. STRICT INTEGRITY CHECK
    const violations: string[] = [];
    if (antiCheat.pasteCount > MAX_PASTES) violations.push(`Clipboard misuse detected (${antiCheat.pasteCount} events).`);
    if (antiCheat.tabSwitchCount > MAX_TAB_SWITCHES) violations.push(`Excessive window switching detected (${antiCheat.tabSwitchCount} times).`);
    if (antiCheat.focusLostTime > MAX_FOCUS_LOST_TIME) violations.push(`Extended absence from editor (${(antiCheat.focusLostTime/1000).toFixed(1)}s).`);

    if (violations.length > 0) {
      setSession(prev => ({
        ...prev,
        status: 'completed',
        endTime: Date.now(),
        score: {
           problemSolving: 0, executionSpeed: 0, conceptualDepth: 0, aiLeverage: 0, riskAwareness: 0, average: 0
        },
        feedback: `VERIFICATION REJECTED: ${violations.join(" ")} To maintain credential integrity, this trial has been voided.`
      }));
      return;
    }

    // 2. Normal AI Evaluation
    setSession(prev => ({ ...prev, status: 'analyzing', endTime: Date.now() }));
    
    // Format all Q&A into strings
    const taskSummary = questions.map(q => `Q${q.id}: ${q.text}`).join("\n");
    const solutionSummary = questions.map(q => `A${q.id}: ${answers[q.id] || "(No Answer)"}`).join("\n");

    const result = await evaluatePerformance(
      domain,
      taskSummary,
      solutionSummary,
      "N/A", // Reasoning implicit in answers
      TRIAL_DURATION - timeLeft,
      antiCheat
    );

    setSession(prev => ({
      ...prev,
      status: 'completed',
      score: result.score,
      feedback: result.feedback
    }));

  }, [questions, answers, timeLeft, antiCheat, domain]);

  const handleAnswerChange = (text: string) => {
     setAnswers(prev => ({ ...prev, [questions[currentQuestionIdx].id]: text }));
  };

  const handleNext = () => {
    if (currentQuestionIdx < questions.length - 1) {
      setCurrentQuestionIdx(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentQuestionIdx > 0) {
      setCurrentQuestionIdx(prev => prev - 1);
    }
  };

  // Handler to prevent copying from the question area
  const preventCopy = (e: React.SyntheticEvent) => {
    e.preventDefault();
    setAntiCheat(prev => ({ ...prev, pasteCount: prev.pasteCount + 1 })); // Register as clipboard violation
  };

  if (session.status === 'generating') {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-6">
        <div className="relative">
           <div className="w-16 h-16 border-4 border-slate-700 border-t-cyan-500 rounded-full animate-spin"></div>
           <div className="absolute inset-0 flex items-center justify-center">
             <Cpu size={24} className="text-cyan-500 animate-pulse" />
           </div>
        </div>
        <h2 className="text-2xl font-bold text-white">Generating 10-Question Trial...</h2>
        <p className="text-slate-400 max-w-md">Our AI is constructing unique technical scenarios for {domain}.</p>
      </div>
    );
  }

  if (session.status === 'analyzing') {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-6">
         <div className="w-16 h-16 border-4 border-slate-700 border-t-purple-500 rounded-full animate-spin"></div>
         <h2 className="text-2xl font-bold text-white">Analyzing Skill DNA...</h2>
         <p className="text-slate-400">Evaluating logic, efficiency, and cheat signals.</p>
      </div>
    );
  }

  if (session.status === 'completed' && session.score) {
    const isRejected = session.score.average === 0;
    const isFailed = !isRejected && session.score.average < 60;

    return (
      <div className="max-w-4xl mx-auto space-y-8 animate-fade-in pb-12">
        <div className="text-center space-y-2">
           <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full mb-4 ${
             isRejected ? 'bg-red-500/10 text-red-500' : 
             isFailed ? 'bg-orange-500/10 text-orange-500' :
             'bg-green-500/10 text-green-400'
           }`}>
              {isRejected ? <ShieldAlert size={32} /> : isFailed ? <AlertTriangle size={32} /> : <CheckCircle size={32} />}
           </div>
           <h1 className="text-3xl font-bold text-white">
             {isRejected ? 'Verification Rejected' : isFailed ? 'Skill Not Verified' : 'Trial Passed'}
           </h1>
           <p className="text-slate-400">
             {isRejected ? 'Evidence of prohibited actions detected.' : 
              isFailed ? 'Score below 60% threshold. Proficiency not established.' :
              'Here is your verified performance report.'}
           </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
           <div className={`bg-slate-800 p-6 rounded-2xl border ${isRejected ? 'border-red-900/50' : isFailed ? 'border-orange-900/50' : 'border-slate-700'}`}>
              <h3 className="text-lg font-bold text-white mb-4">Skill DNA™ Result</h3>
              
              {isRejected ? (
                <div className="flex flex-col items-center justify-center h-[300px] text-center space-y-4">
                   <XCircle size={64} className="text-red-500/50" />
                   <div className="text-red-400 font-bold text-xl">VOID / 0</div>
                   <p className="text-slate-500 text-sm px-8">
                     This result cannot be certified due to integrity violations.
                   </p>
                </div>
              ) : (
                <>
                  <SkillRadar data={session.score} fullSize />
                  <div className="mt-6 text-center">
                    <span className={`text-4xl font-bold ${isFailed ? 'text-orange-400' : 'text-cyan-400'}`}>{session.score.average.toFixed(1)}</span>
                    <span className="text-sm text-slate-500 block uppercase tracking-wide mt-1">Overall Score</span>
                    {isFailed && <span className="text-xs text-orange-400 font-bold mt-2 block">BELOW 60% THRESHOLD</span>}
                  </div>
                </>
              )}
           </div>
           
           <div className="space-y-6">
              <div className={`p-6 rounded-2xl border ${
                  isRejected ? 'bg-red-950/20 border-red-900/50' : 
                  isFailed ? 'bg-orange-950/20 border-orange-900/50' : 
                  'bg-slate-800 border-slate-700'
                }`}>
                <h3 className={`text-lg font-bold mb-2 ${isRejected ? 'text-red-400' : isFailed ? 'text-orange-400' : 'text-white'}`}>
                  {isRejected ? 'Violation Report' : 'AI Feedback'}
                </h3>
                <p className={`${isRejected ? 'text-red-200' : isFailed ? 'text-orange-200' : 'text-slate-300'} leading-relaxed`}>
                  {session.feedback}
                </p>
              </div>

              <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
                 <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-widest mb-4">Behavioral Integrity Log</h3>
                 <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                       <span className="text-slate-400">Focus Lost</span>
                       <span className={antiCheat.tabSwitchCount > MAX_TAB_SWITCHES ? "text-red-400 font-bold" : "text-green-400"}>
                         {antiCheat.tabSwitchCount} times
                       </span>
                    </div>
                    <div className="flex justify-between text-sm">
                       <span className="text-slate-400">Clipboard Events</span>
                       <span className={antiCheat.pasteCount > MAX_PASTES ? "text-red-400 font-bold" : "text-green-400"}>
                         {antiCheat.pasteCount} detected
                       </span>
                    </div>
                    <div className="flex justify-between text-sm">
                       <span className="text-slate-400">Time Away</span>
                       <span className={antiCheat.focusLostTime > MAX_FOCUS_LOST_TIME ? "text-red-400 font-bold" : "text-green-400"}>
                         {(antiCheat.focusLostTime / 1000).toFixed(1)}s
                       </span>
                    </div>
                 </div>
              </div>

              <button 
                onClick={() => onComplete(session)}
                className={`w-full py-4 text-white font-bold rounded-xl transition-colors ${
                  isRejected 
                  ? 'bg-slate-700 hover:bg-slate-600' 
                  : isFailed
                    ? 'bg-orange-700 hover:bg-orange-600'
                    : 'bg-cyan-600 hover:bg-cyan-500'
                }`}
              >
                {isRejected ? 'Discard & Return' : isFailed ? 'Accept Failure & Return' : 'Save & Return to Dashboard'}
              </button>
           </div>
        </div>
      </div>
    );
  }

  // Active Trial UI
  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec < 10 ? '0' : ''}${sec}`;
  };

  const currentQ = questions[currentQuestionIdx];

  return (
    <div className="h-[calc(100vh-100px)] flex flex-col gap-4">
      {/* Top Bar */}
      <div className="flex items-center justify-between bg-slate-800 p-4 rounded-xl border border-slate-700">
        <div className="flex items-center gap-3">
           <span className="text-sm font-mono text-cyan-400 px-2 py-1 bg-cyan-950 rounded border border-cyan-900">
             {domain.toUpperCase()}
           </span>
           <span className={`text-xs flex items-center gap-1 ${antiCheat.tabSwitchCount > 0 ? 'text-yellow-400 animate-pulse' : 'text-slate-500'}`}>
             <Eye size={12} /> Monitored Session
           </span>
        </div>
        <div className={`flex items-center gap-2 font-mono text-xl font-bold ${timeLeft < 60 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
           <Clock size={20} />
           {formatTime(timeLeft)}
        </div>
        <div className="flex items-center gap-2">
           <span className="text-slate-400 text-sm mr-2">
             Question {currentQuestionIdx + 1} of {questions.length}
           </span>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0">
        
        {/* Left: Question View */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 flex flex-col overflow-hidden">
           <div className="p-4 border-b border-slate-700 bg-slate-900/50 flex justify-between items-center">
             <h2 className="text-lg font-bold text-white">Challenge #{currentQ?.id}</h2>
             <div className="flex gap-2">
                <button 
                  onClick={handlePrev}
                  disabled={currentQuestionIdx === 0}
                  className="p-1 rounded hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft />
                </button>
                <button 
                  onClick={handleNext}
                  disabled={currentQuestionIdx === questions.length - 1}
                  className="p-1 rounded hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight />
                </button>
             </div>
           </div>
           <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Added select-none and event handlers to prevent copying */}
              <div 
                className="prose prose-invert max-w-none select-none cursor-default"
                onCopy={preventCopy}
                onCut={preventCopy}
                onContextMenu={(e) => e.preventDefault()}
              >
                <p className="text-lg text-slate-200">{currentQ?.text}</p>
              </div>
              
              <div className="bg-slate-900/80 p-4 rounded-lg border border-slate-600">
                <h3 className="text-cyan-400 font-bold mb-2 flex items-center gap-2"><AlertTriangle size={16}/> Critical Constraints</h3>
                <ul className="list-disc list-inside space-y-1 text-slate-300">
                  {session.constraints?.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>

              <div className="p-4 bg-red-900/20 border border-red-500/30 rounded-lg flex items-start gap-2">
                <Lock className="text-red-400 shrink-0 mt-0.5" size={16} />
                <div className="text-xs text-red-200">
                  <strong>Strict Copy-Paste Protection:</strong> Your clipboard is disabled. Any attempt to copy the question or paste content will flag this session for rejection.
                </div>
              </div>
           </div>
        </div>

        {/* Right: Answer Editor */}
        <div className="bg-slate-900 rounded-xl border border-slate-700 flex flex-col overflow-hidden relative group">
           <div className="p-2 bg-[#1e293b] flex items-center gap-2 border-b border-slate-700">
              <div className="flex gap-1.5 px-2">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
              </div>
              <span className="text-xs text-slate-400 font-mono">answer_q{currentQ?.id}.txt</span>
           </div>
           
           <textarea 
              value={answers[currentQ?.id] || ""}
              onChange={(e) => handleAnswerChange(e.target.value)}
              className="flex-1 w-full bg-[#0f172a] text-slate-200 p-4 font-mono text-sm outline-none resize-none"
              placeholder="// Write your solution or answer here..."
              spellCheck={false}
           />

           {/* Submit Button (Only on Last Question) */}
           {currentQuestionIdx === questions.length - 1 && (
              <div className="absolute bottom-6 right-6 z-10">
                 <button 
                   onClick={handleSubmit}
                   className="bg-green-600 hover:bg-green-500 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-green-900/30 flex items-center gap-2 transition-all hover:scale-105"
                 >
                   Submit All 10 Answers <Send size={18} />
                 </button>
              </div>
           )}

           {antiCheat.tabSwitchCount > 0 && (
             <div className="absolute top-12 right-4 bg-red-500/10 border border-red-500/50 text-red-400 px-3 py-1 rounded text-xs animate-pulse font-bold flex items-center gap-2 pointer-events-none">
               <AlertTriangle size={12} /> Focus Lost ({antiCheat.tabSwitchCount})
             </div>
           )}
           {antiCheat.pasteCount > 0 && (
             <div className="absolute top-24 right-4 bg-red-500/10 border border-red-500/50 text-red-400 px-3 py-1 rounded text-xs animate-pulse font-bold flex items-center gap-2 pointer-events-none">
               <AlertTriangle size={12} /> Clipboard Violation ({antiCheat.pasteCount})
             </div>
           )}
        </div>

      </div>
    </div>
  );
};
