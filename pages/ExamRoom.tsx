
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { SkillDomain, ExamSession, ExamMCQ, ExamTheory, ExamPractical, User } from '../types';
import { generateExamMCQs, generateExamTheory, generateExamPractical, gradeExamSections, analyzeEnvironmentSnapshot } from '../services/gemini';
import { paymentService } from '../services/payment';
import { Clock, ShieldAlert, CheckCircle, AlertTriangle, FileText, Code, CheckSquare, Loader2, Lock, Eye, Video, XCircle, Award, CreditCard, ShieldCheck } from 'lucide-react';

interface Props {
  user?: User;
  onUpdateUser?: (user: User) => void;
}

const MCQ_TIME = 1800; // 30m
const THEORY_TIME = 5400; // 90m
const PRACTICAL_TIME = 3600; // 60m

const MAX_VIOLATIONS = 5;

export const ExamRoom: React.FC<Props> = ({ user, onUpdateUser }) => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // State
  const [domain, setDomain] = useState<SkillDomain | null>(null);
  const [status, setStatus] = useState<'payment' | 'setup' | 'loading' | 'mcq' | 'theory' | 'practical' | 'grading' | 'results' | 'failed'>('payment');
  
  // Payment State
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Data
  const [mcqs, setMcqs] = useState<ExamMCQ[]>([]);
  const [theory, setTheory] = useState<ExamTheory[]>([]);
  const [practical, setPractical] = useState<ExamPractical[]>([]);
  
  // Timers
  const [timeLeft, setTimeLeft] = useState(0);

  // Proctoring
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [violations, setViolations] = useState<string[]>([]);
  const [hasPermissions, setHasPermissions] = useState(false);
  const lastViolationRef = useRef<number>(0);

  useEffect(() => {
    if (user?.hasExamAccess) {
      setStatus('setup');
      return;
    }
    const searchParams = new URLSearchParams(location.search);
    const success = searchParams.get('payment_success');
    const canceled = searchParams.get('payment_canceled');
    if (success === 'true' && user && onUpdateUser) {
       onUpdateUser({ ...user, hasExamAccess: true });
       setStatus('setup');
       navigate('/exam', { replace: true });
    } else if (canceled === 'true') {
       setPaymentError("Payment was canceled.");
       setStatus('payment');
    }
  }, [user, location.search, navigate, onUpdateUser]);

  const handlePayment = async () => {
    if (!user) return;
    setIsProcessingPayment(true);
    try {
      await paymentService.processExamPayment(user.id, user.email);
    } catch (err: any) {
      setPaymentError(err.message || "Payment connection failed.");
      setIsProcessingPayment(false);
    }
  };

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      setStream(mediaStream);
      setHasPermissions(true);
      if (videoRef.current) videoRef.current.srcObject = mediaStream;
    } catch (e) {
      alert("Camera required for exam proctoring.");
    }
  };

  useEffect(() => {
    if (stream && videoRef.current) videoRef.current.srcObject = stream;
  }, [stream, status]);

  useEffect(() => {
    if (!['mcq', 'theory', 'practical'].includes(status)) return;
    const handleFocusLoss = () => addViolation("Focus Lost: Outside Window Interaction");
    const handleVisibility = () => { if (document.hidden) addViolation("Tab Visibility Violation"); };
    const preventCopy = (e: any) => { e.preventDefault(); addViolation("Clipboard Violation"); };
    
    const camInterval = setInterval(async () => {
      if (videoRef.current && videoRef.current.readyState === 4) {
         try {
           const canvas = document.createElement('canvas');
           canvas.width = videoRef.current.videoWidth;
           canvas.height = videoRef.current.videoHeight;
           const ctx = canvas.getContext('2d');
           if (ctx) {
             ctx.drawImage(videoRef.current, 0, 0);
             const base64 = canvas.toDataURL('image/jpeg', 0.5); 
             analyzeEnvironmentSnapshot(base64).then(result => {
                if (!result.lighting || !result.singlePerson || !result.noDevices) {
                   addViolation(result.feedback || "Robotic Proctor: Environmental Security Violation");
                }
             });
           }
         } catch(e) {}
      }
    }, 8000);

    window.addEventListener("blur", handleFocusLoss);
    document.addEventListener("visibilitychange", handleVisibility);
    document.addEventListener("copy", preventCopy);
    document.addEventListener("paste", preventCopy);
    return () => {
      window.removeEventListener("blur", handleFocusLoss);
      document.removeEventListener("visibilitychange", handleVisibility);
      document.removeEventListener("copy", preventCopy);
      document.removeEventListener("paste", preventCopy);
      clearInterval(camInterval);
    };
  }, [status]);

  const addViolation = (msg: string) => {
    const now = Date.now();
    if (now - lastViolationRef.current < 3000) return;
    lastViolationRef.current = now;
    setViolations(prev => {
       const newV = [...prev, msg];
       if (newV.length >= MAX_VIOLATIONS) setStatus('failed');
       return newV;
    });
  };

  const startExam = async () => {
     if (!domain) return;
     setStatus('loading');
     
     // Parallel Generation for "Instant" feel between sections
     const [mcqData, theoryData, practicalData] = await Promise.all([
        generateExamMCQs(domain),
        generateExamTheory(domain),
        generateExamPractical(domain)
     ]);
     
     setMcqs(mcqData);
     setTheory(theoryData);
     setPractical(practicalData);
     
     setStatus('mcq');
     setTimeLeft(MCQ_TIME);
  };

  useEffect(() => {
    if (!['mcq', 'theory', 'practical'].includes(status)) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
           handleSectionSubmit();
           return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [status]);

  const handleSectionSubmit = () => {
     if (status === 'mcq') {
       setStatus('theory');
       setTimeLeft(THEORY_TIME);
     } else if (status === 'theory') {
       setStatus('practical');
       setTimeLeft(PRACTICAL_TIME);
     } else if (status === 'practical') {
       finishExam();
     }
  };

  const [finalScore, setFinalScore] = useState({ mcq: 0, theory: 0, practical: 0, total: 0, feedback: "" });

  const finishExam = async () => {
     setStatus('grading');
     let mcqScore = 0;
     mcqs.forEach(q => { if (q.userAnswer === q.correctIndex) mcqScore++; });
     const mcqPerc = Math.round((mcqScore / mcqs.length) * 100);

     const result = await gradeExamSections(domain!, theory, practical);
     const total = Math.round((mcqPerc + result.theoryScore + result.practicalScore) / 3);

     setFinalScore({ mcq: mcqPerc, theory: result.theoryScore, practical: result.practicalScore, total, feedback: result.feedback });
     
     if (total >= 60 && user && onUpdateUser) {
        onUpdateUser({ ...user, isCertified: true, stats: { ...user.stats, examsPassed: (user.stats?.examsPassed || 0) + 1, trialsCompleted: user.stats?.trialsCompleted || 0, arenaWins: user.stats?.arenaWins || 0, globalRank: user.stats?.globalRank || 0, topPercentile: user.stats?.topPercentile || 0 } });
     }
     setStatus('results');
  };

  if (status === 'payment') {
    return (
      <div className="max-w-md mx-auto py-20 animate-fade-in">
         <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 shadow-2xl relative overflow-hidden text-center">
            <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-yellow-500 to-orange-500"></div>
            <Award size={64} className="text-yellow-500 mx-auto mb-6" />
            <h1 className="text-3xl font-bold text-white mb-2">Exam Hall Access</h1>
            <p className="text-slate-400 mb-8">Purchase access to the High-Stakes Certification Exam.</p>
            <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700 mb-8 flex justify-between items-center">
               <span className="text-white font-bold">$50.00</span>
               <span className="text-slate-500 text-xs uppercase font-bold tracking-widest">Entry Credit</span>
            </div>
            <button onClick={handlePayment} disabled={isProcessingPayment} className="w-full py-4 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50">
               {isProcessingPayment ? <Loader2 className="animate-spin" /> : <CreditCard size={20} />} Pay with Stripe
            </button>
         </div>
      </div>
    );
  }

  if (status === 'setup') {
    return (
      <div className="max-w-4xl mx-auto py-12 animate-fade-in">
         <h1 className="text-3xl font-bold text-white mb-8 flex items-center gap-3"><Award className="text-yellow-500" /> Professional Certification</h1>
         <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-6">
                <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700">
                   <label className="block text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-3">SELECT DOMAIN</label>
                   <select className="w-full bg-slate-900 border border-slate-600 rounded-lg p-4 text-white focus:border-yellow-500 outline-none" onChange={(e) => setDomain(e.target.value as SkillDomain)} value={domain || ""}>
                     <option value="" disabled>Choose Domain...</option>
                     {Object.values(SkillDomain).map(d => <option key={d} value={d}>{d}</option>)}
                   </select>
                </div>
                <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 space-y-4">
                   <div className="flex justify-between text-sm"><span className="text-slate-400">MCQs</span> <span className="font-mono text-white">20 Questions / 30m</span></div>
                   <div className="flex justify-between text-sm"><span className="text-slate-400">Theory</span> <span className="font-mono text-white">30 Questions / 90m</span></div>
                   <div className="flex justify-between text-sm"><span className="text-slate-400">Practical</span> <span className="font-mono text-white">10 Tasks / 60m</span></div>
                </div>
            </div>
            <div className="flex flex-col gap-4">
               <div className="aspect-video bg-black rounded-xl overflow-hidden relative border border-slate-700 shadow-2xl">
                   <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover transform scale-x-[-1]" />
                   {!hasPermissions && <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 text-slate-500">Monitoring Required</div>}
               </div>
               {!hasPermissions ? <button onClick={startCamera} className="py-3 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-xl">Enable Proctoring</button> : <button disabled={!domain} onClick={startExam} className="py-5 bg-gradient-to-r from-yellow-600 to-orange-600 text-white text-lg font-bold rounded-xl shadow-xl transition-all disabled:opacity-50">BEGIN HIGH-STAKES EXAM</button>}
            </div>
         </div>
      </div>
    );
  }

  if (status === 'loading' || status === 'grading') {
     return (
        <div className="flex flex-col items-center justify-center h-[60vh] space-y-6">
           <Loader2 size={64} className="text-yellow-500 animate-spin" />
           <h2 className="text-2xl font-bold text-white">{status === 'loading' ? "Synchronizing Modules..." : "Neural Grading Active..."}</h2>
        </div>
     );
  }

  if (status === 'failed') {
     return (
        <div className="max-w-2xl mx-auto py-20 text-center animate-fade-in">
           <ShieldAlert size={80} className="text-red-500 mx-auto mb-6" />
           <h1 className="text-4xl font-bold text-white mb-4">Exam Terminated</h1>
           <div className="bg-red-900/20 border border-red-500/50 p-6 rounded-2xl mb-8 text-left">
              <h3 className="text-red-400 font-bold mb-4 uppercase text-xs tracking-widest">Integrity Violation History</h3>
              {violations.map((v, i) => <div key={i} className="text-red-200 text-sm mb-2 flex items-center gap-2"><XCircle size={14}/> {v}</div>)}
           </div>
           <button onClick={() => navigate('/')} className="bg-slate-700 text-white px-8 py-3 rounded-xl">Exit Hall</button>
        </div>
     );
  }

  if (status === 'results') {
     const passed = finalScore.total >= 60;
     return (
        <div className="max-w-3xl mx-auto py-12 animate-fade-in">
           <div className="text-center mb-12">
              <div className={`inline-flex items-center justify-center w-24 h-24 rounded-full mb-6 border-4 ${passed ? 'border-green-500 text-green-400' : 'border-red-500 text-red-400'}`}>
                 {passed ? <Award size={48} /> : <XCircle size={48} />}
              </div>
              <h1 className="text-4xl font-bold text-white">{passed ? "Credential Certified" : "Certification Failed"}</h1>
              <p className="text-slate-500 mt-2">{domain}</p>
           </div>
           <div className="grid grid-cols-3 gap-6 mb-12">
              <ScoreCard label="MCQ" score={finalScore.mcq} />
              <ScoreCard label="Theory" score={finalScore.theory} />
              <ScoreCard label="Practical" score={finalScore.practical} />
           </div>
           <div className="bg-slate-800 p-8 rounded-2xl border border-slate-700 mb-8">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Board Evaluation Feedback</h3>
              <p className="text-slate-200 leading-relaxed italic">"{finalScore.feedback}"</p>
           </div>
           <button onClick={() => navigate('/')} className="w-full py-4 bg-slate-700 text-white font-bold rounded-xl">Return to Dashboard</button>
        </div>
     );
  }

  return (
     <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
        <div className="h-16 bg-slate-800 border-b border-slate-700 flex items-center justify-between px-8 shrink-0">
           <div className="flex items-center gap-6">
              <span className="text-yellow-500 font-bold border border-yellow-500/20 px-3 py-1 bg-yellow-500/5 rounded text-xs">EXAM ACTIVE</span>
              <div className="flex items-center gap-4 text-slate-500 text-xs font-bold uppercase tracking-tighter">
                <span className={status === 'mcq' ? 'text-cyan-400' : 'text-green-500'}>PART 1</span>
                <span className={status === 'theory' ? 'text-cyan-400' : status === 'mcq' ? 'text-slate-700' : 'text-green-500'}>PART 2</span>
                <span className={status === 'practical' ? 'text-cyan-400' : 'text-slate-700'}>PART 3</span>
              </div>
           </div>
           <div className={`flex items-center gap-3 font-mono text-2xl font-bold ${timeLeft < 300 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
              <Clock size={24} /> {Math.floor(timeLeft/60)}:{(timeLeft%60).toString().padStart(2,'0')}
           </div>
        </div>
        <div className="flex-1 flex overflow-hidden">
           <div className="flex-1 overflow-y-auto p-12">
              {status === 'mcq' && <MCQSection questions={mcqs} setQuestions={setMcqs} />}
              {status === 'theory' && <TheorySection questions={theory} setQuestions={setTheory} />}
              {status === 'practical' && <PracticalSection tasks={practical} setTasks={setPractical} />}
           </div>
           <div className="w-72 bg-black border-l border-slate-800 flex flex-col">
              <div className="aspect-video relative">
                  <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover transform scale-x-[-1]" />
                  <div className="absolute top-2 left-2 flex gap-1 items-center"><div className="w-1.5 h-1.5 bg-red-600 rounded-full animate-pulse"></div><span className="text-[8px] text-red-600 font-black">SECURE FEED</span></div>
              </div>
              <div className="flex-1 p-6 overflow-y-auto">
                 <h3 className="text-[10px] font-bold text-slate-600 uppercase mb-4 tracking-widest">Integrity Dashboard</h3>
                 <div className="space-y-2">
                    {violations.length === 0 ? <div className="text-[10px] text-green-500 flex items-center gap-2"><CheckCircle size={10}/> SECURE CHANNEL</div> : violations.map((v, i) => <div key={i} className="text-[9px] text-red-400 bg-red-500/5 p-2 rounded border border-red-500/20">{v}</div>)}
                 </div>
              </div>
              <div className="p-6 bg-slate-900 border-t border-slate-800">
                 <button onClick={handleSectionSubmit} className="w-full py-4 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl text-sm transition-all shadow-lg shadow-cyan-900/20">Submit Section &rarr;</button>
              </div>
           </div>
        </div>
     </div>
  );
};

const MCQSection = ({ questions, setQuestions }: { questions: ExamMCQ[], setQuestions: any }) => (
  <div className="max-w-3xl mx-auto space-y-12">
     <div><h2 className="text-3xl font-bold text-white mb-2">Part 1: Nuance Retrieval</h2><p className="text-slate-500">20 Mixed-Domain Internals Questions.</p></div>
     {questions.map((q, i) => (
        <div key={q.id} className="bg-slate-800/40 p-8 rounded-3xl border border-slate-700/50">
           <h3 className="text-xl font-medium text-white mb-6"><span className="text-slate-600 font-mono mr-3">{i+1}.</span> {q.question}</h3>
           <div className="space-y-3">
              {q.options.map((opt, idx) => (
                 <label key={idx} className={`flex items-center p-4 rounded-xl border-2 cursor-pointer transition-all ${q.userAnswer === idx ? 'bg-cyan-900/10 border-cyan-500 text-cyan-200' : 'bg-slate-900/50 border-slate-700 hover:border-slate-500 text-slate-400'}`}>
                    <input type="radio" name={`mcq-${q.id}`} className="hidden" checked={q.userAnswer === idx} onChange={() => { const newQ = [...questions]; newQ[i].userAnswer = idx; setQuestions(newQ); }} />
                    <span className="text-sm font-medium">{opt}</span>
                 </label>
              ))}
           </div>
        </div>
     ))}
  </div>
);

const TheorySection = ({ questions, setQuestions }: { questions: ExamTheory[], setQuestions: any }) => (
  <div className="max-w-3xl mx-auto space-y-12">
     <div><h2 className="text-3xl font-bold text-white mb-2">Part 2: Architectural Defense</h2><p className="text-slate-500">30 Deep-Technical Response Prompts.</p></div>
     {questions.map((q, i) => (
        <div key={q.id} className="bg-slate-800/40 p-8 rounded-3xl border border-slate-700/50">
           <h3 className="text-lg font-medium text-white mb-6"><span className="text-slate-600 font-mono mr-3">{i+1}.</span> {q.question}</h3>
           <textarea className="w-full h-40 bg-slate-900 border border-slate-700 rounded-2xl p-4 text-white focus:border-cyan-500 outline-none resize-none font-mono text-sm" placeholder="Provide architectural reasoning..." value={q.userAnswer || ""} onChange={(e) => { const newQ = [...questions]; newQ[i].userAnswer = e.target.value; setQuestions(newQ); }} />
        </div>
     ))}
  </div>
);

const PracticalSection = ({ tasks, setTasks }: { tasks: ExamPractical[], setTasks: any }) => (
  <div className="max-w-4xl mx-auto space-y-12">
     <div><h2 className="text-3xl font-bold text-white mb-2">Part 3: Production Realism</h2><p className="text-slate-500">10 Complex System Tasks.</p></div>
     {tasks.map((t, i) => (
        <div key={t.id} className="bg-slate-800 rounded-3xl border border-slate-700 overflow-hidden shadow-2xl">
           <div className="p-6 bg-slate-900/50 border-b border-slate-700"><h3 className="text-xl font-bold text-white mb-3"><span className="text-slate-600 font-mono mr-3">{i+1}.</span> {t.task}</h3><div className="flex gap-2 flex-wrap">{t.constraints.map((c, idx) => <span key={idx} className="text-[10px] bg-red-900/20 text-red-400 px-2 py-1 rounded border border-red-500/20 uppercase font-bold">{c}</span>)}</div></div>
           <textarea className="w-full h-80 bg-[#0f172a] text-cyan-50 font-mono text-sm p-6 outline-none resize-y" placeholder="// Solve task with production standards..." spellCheck={false} value={t.userAnswer || ""} onChange={(e) => { const newT = [...tasks]; newT[i].userAnswer = e.target.value; setTasks(newT); }} />
        </div>
     ))}
  </div>
);

const ScoreCard = ({ label, score }: { label: string, score: number }) => (
   <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 text-center shadow-lg">
      <div className="text-4xl font-black text-white mb-1">{score}%</div>
      <div className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">{label} Weight</div>
   </div>
);
