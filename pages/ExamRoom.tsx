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

const MAX_VIOLATIONS = 5; // Tolerance threshold

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
  
  // Ref for event dampening (prevent spamming violations)
  const lastViolationRef = useRef<number>(0);

  // --- ACCESS CHECK & STRIPE RETURN HANDLING ---
  useEffect(() => {
    // 1. If already paid, go to setup
    if (user?.hasExamAccess) {
      setStatus('setup');
      return;
    }

    // 2. Check URL for Stripe return params
    const searchParams = new URLSearchParams(location.search);
    const success = searchParams.get('payment_success');
    const canceled = searchParams.get('payment_canceled');

    if (success === 'true' && user && onUpdateUser) {
       // Payment successful - Unlock feature
       onUpdateUser({ ...user, hasExamAccess: true });
       setStatus('setup');
       // Clean URL
       navigate('/exam', { replace: true });
    } else if (canceled === 'true') {
       setPaymentError("Payment was canceled. Please try again.");
       setStatus('payment');
    } else {
       // Default state
       setStatus('payment');
    }
  }, [user, location.search, navigate, onUpdateUser]);


  // --- PAYMENT LOGIC ---
  const handlePayment = async () => {
    if (!user) return;
    
    setIsProcessingPayment(true);
    setPaymentError(null);

    try {
      // This will redirect the browser window away to Stripe
      await paymentService.processExamPayment(user.id, user.email);
    } catch (err: any) {
      setPaymentError(err.message || "Could not connect to payment server. Ensure backend is running.");
      setIsProcessingPayment(false);
    }
  };

  // --- SETUP & PROCTORING ---

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

  // Continuous Monitoring
  useEffect(() => {
    if (!['mcq', 'theory', 'practical'].includes(status)) return;

    // 1. STRICT FOCUS TRACKING (Instant Detection)
    const handleFocusLoss = () => {
       addViolation("Focus Lost: Clicked outside exam window");
    };

    const handleVisibility = () => {
      if (document.hidden) addViolation("Tab Hidden / Minimized");
    };
    
    // 2. Prevent Copy/Paste
    const preventCopy = (e: any) => { e.preventDefault(); addViolation("Copy Attempt Detected"); };
    const preventPaste = (e: any) => { e.preventDefault(); addViolation("Paste Attempt Detected"); };
    
    // 3. Active Camera Check Loop (Every 5 seconds for "Active" monitoring)
    const camInterval = setInterval(async () => {
      if (videoRef.current && videoRef.current.readyState === 4) {
         try {
           const canvas = document.createElement('canvas');
           canvas.width = videoRef.current.videoWidth;
           canvas.height = videoRef.current.videoHeight;
           const ctx = canvas.getContext('2d');
           if (ctx && canvas.width > 0 && canvas.height > 0) {
             ctx.drawImage(videoRef.current, 0, 0);
             // Use slightly lower quality for frequent checks
             const base64 = canvas.toDataURL('image/jpeg', 0.5); 
             
             // Run check in background
             analyzeEnvironmentSnapshot(base64).then(result => {
                if (!result.lighting) addViolation("Poor Lighting Detected");
                if (!result.singlePerson) addViolation("Identity Check Failed: 0 or >1 Persons");
                if (!result.noDevices) addViolation("Prohibited Device Detected (Phone/Tablet)");
             });
           }
         } catch(e) { console.warn("Cam check fail", e); }
      }
    }, 5000); // 5s Interval

    window.addEventListener("blur", handleFocusLoss); // Catches clicking second monitor immediately
    document.addEventListener("visibilitychange", handleVisibility); // Catches minimizing
    document.addEventListener("copy", preventCopy);
    document.addEventListener("paste", preventPaste);
    document.addEventListener("contextmenu", preventCopy);

    return () => {
      window.removeEventListener("blur", handleFocusLoss);
      document.removeEventListener("visibilitychange", handleVisibility);
      document.removeEventListener("copy", preventCopy);
      document.removeEventListener("paste", preventPaste);
      document.removeEventListener("contextmenu", preventCopy);
      clearInterval(camInterval);
    };
  }, [status]);

  const addViolation = (msg: string) => {
    const now = Date.now();
    // Dampening: Prevent spamming violations for the same event (e.g. rapid focus toggles) within 2 seconds
    if (now - lastViolationRef.current < 2000) return;
    
    lastViolationRef.current = now;
    setViolations(prev => {
       const newV = [...prev, msg];
       if (newV.length > MAX_VIOLATIONS) {
         setStatus('failed');
       }
       return newV;
    });
  };

  // --- FLOW CONTROL ---

  const startExam = async () => {
     if (!domain) return;
     setStatus('loading');
     
     // 1. Generate MCQ 
     const mcqData = await generateExamMCQs(domain);
     setMcqs(mcqData);
     
     setStatus('mcq');
     setTimeLeft(MCQ_TIME);
     
     // Prefetch others in background
     generateExamTheory(domain).then(setTheory);
     generateExamPractical(domain).then(setPractical);
  };

  // Timer Tick
  useEffect(() => {
    if (!['mcq', 'theory', 'practical'].includes(status)) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
           handleSectionSubmit(); // Auto submit
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
     
     // Grade MCQs Locally
     let mcqScore = 0;
     mcqs.forEach(q => { if (q.userAnswer === q.correctIndex) mcqScore++; });
     const mcqPerc = Math.round((mcqScore / mcqs.length) * 100);

     // Grade Theory & Practical via AI
     const result = await gradeExamSections(domain!, theory, practical);

     const total = Math.round((mcqPerc + result.theoryScore + result.practicalScore) / 3);

     setFinalScore({
        mcq: mcqPerc,
        theory: result.theoryScore,
        practical: result.practicalScore,
        total: total,
        feedback: result.feedback
     });
     
     // AWARD BADGE IF PASSED
     if (total >= 60 && user && onUpdateUser) {
        // Update user profile globally
        onUpdateUser({
           ...user,
           isCertified: true,
           stats: {
              ...user.stats,
              examsPassed: (user.stats?.examsPassed || 0) + 1,
              // Required props
              trialsCompleted: user.stats?.trialsCompleted || 0,
              arenaWins: user.stats?.arenaWins || 0,
              globalRank: user.stats?.globalRank || 0,
              topPercentile: user.stats?.topPercentile || 0
           }
        });
     }

     setStatus('results');
  };

  // --- RENDERERS ---

  if (status === 'payment') {
    return (
      <div className="max-w-md mx-auto py-20 animate-fade-in">
         <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-yellow-500 to-orange-500"></div>
            
            <div className="text-center mb-8">
               <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-slate-900 border border-slate-600 mb-6">
                  <Lock size={32} className="text-slate-400" />
               </div>
               <h1 className="text-3xl font-bold text-white mb-2">Exam Hall Access</h1>
               <p className="text-slate-400 text-sm">Purchase a seat for the Verified Certification Exam.</p>
            </div>

            <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700 mb-8 flex justify-between items-center">
               <div className="flex items-center gap-3">
                  <Award className="text-yellow-500" size={24} />
                  <div className="text-left">
                     <div className="text-white font-bold text-sm">Certification Fee</div>
                     <div className="text-slate-500 text-xs">One-time entry</div>
                  </div>
               </div>
               <div className="text-xl font-bold text-white">$50.00</div>
            </div>

            {paymentError && (
               <div className="mb-6 bg-red-900/20 border border-red-500/50 text-red-400 px-4 py-3 rounded-xl text-sm flex items-start gap-2">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  {paymentError}
               </div>
            )}

            <button 
               onClick={handlePayment}
               disabled={isProcessingPayment}
               className="w-full py-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold rounded-xl shadow-lg shadow-cyan-900/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
               {isProcessingPayment ? (
                  <>
                     <Loader2 size={20} className="animate-spin" /> Redirecting to Stripe...
                  </>
               ) : (
                  <>
                     <CreditCard size={20} /> Pay with Stripe
                  </>
               )}
            </button>
            
            <div className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-500">
               <ShieldCheck size={12} />
               <span>Payments secured by Stripe SSL</span>
            </div>
         </div>
         <button onClick={() => navigate('/')} className="w-full mt-6 text-slate-500 hover:text-white text-sm">Cancel and Return to Dashboard</button>
      </div>
    );
  }

  if (status === 'setup') {
    return (
      <div className="max-w-4xl mx-auto py-12 animate-fade-in">
         <h1 className="text-3xl font-bold text-white mb-6">Certification Exam Hall</h1>
         
         <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-6">
                <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700">
                   <label className="block text-slate-400 text-sm font-bold mb-2">SELECT CERTIFICATION DOMAIN</label>
                   <select 
                     className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white focus:border-yellow-500 outline-none"
                     onChange={(e) => setDomain(e.target.value as SkillDomain)}
                     value={domain || ""}
                   >
                     <option value="" disabled>Choose Domain...</option>
                     {Object.values(SkillDomain).map(d => <option key={d} value={d}>{d}</option>)}
                   </select>
                </div>

                <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700">
                    <h3 className="font-bold text-white mb-4">Exam Structure</h3>
                    <div className="space-y-4">
                       <div className="flex justify-between items-center text-sm border-b border-slate-700 pb-2">
                          <span className="text-slate-300">Part 1: Multiple Choice</span>
                          <span className="font-mono text-white">30 Mins</span>
                       </div>
                       <div className="flex justify-between items-center text-sm border-b border-slate-700 pb-2">
                          <span className="text-slate-300">Part 2: Theory & Architecture</span>
                          <span className="font-mono text-white">90 Mins</span>
                       </div>
                       <div className="flex justify-between items-center text-sm border-b border-slate-700 pb-2">
                          <span className="text-slate-300">Part 3: Practical Execution</span>
                          <span className="font-mono text-white">60 Mins</span>
                       </div>
                       <div className="flex justify-between items-center text-sm pt-2">
                          <span className="text-yellow-400 font-bold">Total Duration</span>
                          <span className="font-mono text-yellow-400 font-bold">3 Hours</span>
                       </div>
                    </div>
                </div>
            </div>

            <div className="flex flex-col gap-4">
               <div className="bg-black rounded-xl overflow-hidden aspect-video relative border border-slate-600 shadow-inner group">
                   <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover transform scale-x-[-1]" />
                   {!hasPermissions && (
                      <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80">
                         <span className="text-slate-500 flex flex-col items-center gap-2">
                           <Lock size={24} /> Proctoring Feed Inactive
                         </span>
                      </div>
                   )}
                   <div className="absolute top-2 left-2 bg-red-600/20 text-red-500 px-2 py-1 rounded text-xs font-bold border border-red-500/30 flex items-center gap-1">
                      <Eye size={10} /> AI PROCTOR
                   </div>
               </div>
               
               {!hasPermissions ? (
                  <button 
                    onClick={startCamera} 
                    className="py-3 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                     <Video size={18} /> Enable Monitoring
                  </button>
               ) : (
                  <button 
                     disabled={!domain}
                     onClick={startExam}
                     className="py-4 bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                     Begin Exam <CheckCircle size={18} />
                  </button>
               )}
               
               <div className="text-xs text-slate-500 text-center">
                  By starting, you agree to continuous audio/video monitoring.
               </div>
            </div>
         </div>
      </div>
    );
  }

  if (status === 'loading' || status === 'grading') {
     return (
        <div className="flex flex-col items-center justify-center h-[60vh] space-y-6">
           <Loader2 size={64} className="text-yellow-500 animate-spin" />
           <h2 className="text-2xl font-bold text-white">
              {status === 'loading' ? "Decrypting Exam Modules..." : "AI Grading in Progress..."}
           </h2>
           <p className="text-slate-400">Please do not refresh the page.</p>
        </div>
     );
  }

  if (status === 'failed') {
     return (
        <div className="max-w-2xl mx-auto py-20 text-center animate-fade-in">
           <ShieldAlert size={80} className="text-red-500 mx-auto mb-6" />
           <h1 className="text-4xl font-bold text-white mb-4">Exam Terminated</h1>
           <div className="bg-red-900/20 border border-red-900/50 p-6 rounded-2xl mb-8">
              <h3 className="text-red-400 font-bold mb-4 uppercase tracking-widest">Integrity Violations Detected</h3>
              <ul className="text-left space-y-2 text-red-200">
                 {violations.map((v, i) => (
                    <li key={i} className="flex items-center gap-2"><AlertTriangle size={14} /> {v}</li>
                 ))}
              </ul>
           </div>
           <button onClick={() => navigate('/')} className="bg-slate-700 hover:bg-slate-600 text-white px-8 py-3 rounded-xl font-bold">
              Return to Dashboard
           </button>
        </div>
     );
  }

  if (status === 'results') {
     // CHANGED: Threshold lowered to 60%
     const passed = finalScore.total >= 60;
     
     return (
        <div className="max-w-3xl mx-auto py-12 animate-fade-in">
           <div className="text-center mb-12">
              <div className={`inline-flex items-center justify-center w-24 h-24 rounded-full mb-6 ${passed ? 'bg-green-500/20 text-green-400 border border-green-500' : 'bg-red-500/20 text-red-400 border border-red-500'}`}>
                 {passed ? <Award size={48} className="text-yellow-400 fill-yellow-400/20" /> : <XCircle size={48} />}
              </div>
              <h1 className="text-4xl font-bold text-white mb-2">{passed ? "Certification Granted" : "Certification Failed"}</h1>
              {passed && <div className="text-yellow-400 font-bold animate-pulse mb-2">YELLOW BADGE UNLOCKED</div>}
              <p className="text-slate-400">{domain}</p>
           </div>
           
           <div className="grid grid-cols-3 gap-4 mb-8">
              <ScoreCard label="MCQ" score={finalScore.mcq} />
              <ScoreCard label="Theory" score={finalScore.theory} />
              <ScoreCard label="Practical" score={finalScore.practical} />
           </div>

           <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 mb-8">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-2">AI Proctor Feedback</h3>
              <p className="text-slate-200 italic">"{finalScore.feedback}"</p>
           </div>

           <button onClick={() => navigate('/')} className="w-full py-4 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-xl">
              Return Home
           </button>
        </div>
     );
  }

  // --- ACTIVE EXAM UI ---

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec < 10 ? '0' : ''}${sec}`;
  };

  return (
     <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
        {/* Top Bar */}
        <div className="h-16 bg-slate-800 border-b border-slate-700 flex items-center justify-between px-6 shrink-0">
           <div className="flex items-center gap-4">
              <span className="text-yellow-500 font-bold border border-yellow-500/30 px-2 py-1 rounded bg-yellow-900/20 text-xs tracking-wider">
                 EXAM SESSION
              </span>
              <span className="font-bold text-white hidden sm:block">{domain}</span>
           </div>
           
           <div className="flex items-center gap-6">
               <div className="text-sm text-slate-400 flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${status === 'mcq' ? 'bg-blue-500 animate-pulse' : status === 'theory' || status === 'practical' ? 'bg-green-500' : 'bg-slate-600'}`}></div> MCQ
                  <div className="w-4 h-px bg-slate-600"></div>
                  <div className={`w-2 h-2 rounded-full ${status === 'theory' ? 'bg-blue-500 animate-pulse' : status === 'practical' ? 'bg-green-500' : 'bg-slate-600'}`}></div> Theory
                  <div className="w-4 h-px bg-slate-600"></div>
                  <div className={`w-2 h-2 rounded-full ${status === 'practical' ? 'bg-blue-500 animate-pulse' : 'bg-slate-600'}`}></div> Practical
               </div>

               <div className={`flex items-center gap-2 font-mono text-xl font-bold ${timeLeft < 300 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
                  <Clock size={20} /> {formatTime(timeLeft)}
               </div>
           </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex overflow-hidden">
           
           {/* Left: Questions/Tasks */}
           <div className="flex-1 overflow-y-auto p-6 md:p-10">
              {status === 'mcq' && <MCQSection questions={mcqs} setQuestions={setMcqs} />}
              {status === 'theory' && <TheorySection questions={theory} setQuestions={setTheory} />}
              {status === 'practical' && <PracticalSection tasks={practical} setTasks={setPractical} />}
           </div>

           {/* Right: Proctor Sidebar */}
           <div className="w-64 bg-black border-l border-slate-700 flex flex-col">
              <div className="aspect-video bg-slate-900 relative border-b border-slate-700">
                  <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover transform scale-x-[-1]" />
                  <div className="absolute top-2 left-2 flex gap-1">
                     <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                     <span className="text-[10px] text-red-500 font-bold">REC</span>
                  </div>
              </div>
              
              <div className="p-4 flex-1">
                 <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Proctor Log</h3>
                 <div className="space-y-2">
                    {violations.length === 0 && (
                       <div className="text-xs text-green-500 flex items-center gap-1">
                          <CheckCircle size={12} /> Environment Secure
                       </div>
                    )}
                    {violations.map((v, i) => (
                       <div key={i} className="text-xs text-red-400 bg-red-900/20 p-2 rounded border border-red-900/30 flex items-start gap-2">
                          <AlertTriangle size={12} className="shrink-0 mt-0.5" /> {v}
                       </div>
                    ))}
                 </div>
              </div>

              <div className="p-4 border-t border-slate-800">
                 <button 
                   onClick={handleSectionSubmit}
                   className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition-colors text-sm"
                 >
                    Submit Section
                 </button>
              </div>
           </div>

        </div>
     </div>
  );
};

// Sub-components for Exam Sections

const MCQSection = ({ questions, setQuestions }: { questions: ExamMCQ[], setQuestions: any }) => {
   return (
      <div className="max-w-3xl mx-auto space-y-8">
         <div className="mb-6">
            <h2 className="text-2xl font-bold text-white mb-2">Part 1: Multiple Choice</h2>
            <p className="text-slate-400">Select the best answer for each question.</p>
         </div>
         {questions.map((q, i) => (
            <div key={q.id} className="bg-slate-800 p-6 rounded-xl border border-slate-700">
               <h3 className="text-lg font-medium text-white mb-4"><span className="text-slate-500 mr-2">{i+1}.</span> {q.question}</h3>
               <div className="space-y-2">
                  {q.options.map((opt, idx) => (
                     <label key={idx} className={`flex items-center p-3 rounded-lg border cursor-pointer transition-all ${q.userAnswer === idx ? 'bg-blue-900/30 border-blue-500' : 'bg-slate-900/50 border-slate-700 hover:bg-slate-700'}`}>
                        <input 
                           type="radio" 
                           name={`mcq-${q.id}`} 
                           className="mr-3 accent-blue-500 w-4 h-4"
                           checked={q.userAnswer === idx}
                           onChange={() => {
                              const newQ = [...questions];
                              newQ[i].userAnswer = idx;
                              setQuestions(newQ);
                           }}
                        />
                        <span className={q.userAnswer === idx ? 'text-blue-200' : 'text-slate-300'}>{opt}</span>
                     </label>
                  ))}
               </div>
            </div>
         ))}
      </div>
   );
};

const TheorySection = ({ questions, setQuestions }: { questions: ExamTheory[], setQuestions: any }) => {
   return (
      <div className="max-w-3xl mx-auto space-y-8">
         <div className="mb-6">
            <h2 className="text-2xl font-bold text-white mb-2">Part 2: Theory & Architecture</h2>
            <p className="text-slate-400">Provide concise, technical explanations (2-4 sentences).</p>
         </div>
         {questions.map((q, i) => (
            <div key={q.id} className="bg-slate-800 p-6 rounded-xl border border-slate-700">
               <h3 className="text-lg font-medium text-white mb-4"><span className="text-slate-500 mr-2">{i+1}.</span> {q.question}</h3>
               <textarea 
                  className="w-full h-32 bg-slate-900 border border-slate-600 rounded-lg p-3 text-white focus:border-blue-500 outline-none resize-none"
                  placeholder="Enter your technical explanation..."
                  value={q.userAnswer || ""}
                  onChange={(e) => {
                     const newQ = [...questions];
                     newQ[i].userAnswer = e.target.value;
                     setQuestions(newQ);
                  }}
               />
            </div>
         ))}
      </div>
   );
};

const PracticalSection = ({ tasks, setTasks }: { tasks: ExamPractical[], setTasks: any }) => {
   return (
      <div className="max-w-4xl mx-auto space-y-8">
         <div className="mb-6">
            <h2 className="text-2xl font-bold text-white mb-2">Part 3: Practical Execution</h2>
            <p className="text-slate-400">Write optimized code solutions for the following scenarios.</p>
         </div>
         {tasks.map((t, i) => (
            <div key={t.id} className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
               <div className="p-4 bg-slate-900/50 border-b border-slate-700">
                  <h3 className="text-lg font-medium text-white"><span className="text-slate-500 mr-2">{i+1}.</span> {t.task}</h3>
                  <div className="mt-2 flex gap-2">
                     {t.constraints.map((c, idx) => (
                        <span key={idx} className="text-xs bg-red-900/20 text-red-300 px-2 py-1 rounded border border-red-900/30">{c}</span>
                     ))}
                  </div>
               </div>
               <div className="p-0">
                  <textarea 
                     className="w-full h-64 bg-[#0f172a] text-slate-300 font-mono text-sm p-4 outline-none resize-y"
                     placeholder="// Write your solution code here..."
                     spellCheck={false}
                     value={t.userAnswer || ""}
                     onChange={(e) => {
                        const newT = [...tasks];
                        newT[i].userAnswer = e.target.value;
                        setTasks(newT);
                     }}
                  />
               </div>
            </div>
         ))}
      </div>
   );
};

const ScoreCard = ({ label, score }: { label: string, score: number }) => (
   <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 text-center">
      <div className="text-3xl font-bold text-white mb-1">{score}%</div>
      <div className="text-xs text-slate-500 uppercase font-bold">{label}</div>
   </div>
);