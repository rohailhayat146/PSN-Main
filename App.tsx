
import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { User, SkillDomain, TrialSession } from './types';
import { Dashboard } from './pages/Dashboard';
import { TrialRoom } from './pages/TrialRoom';
import { InterviewRoom } from './pages/InterviewRoom';
import { ChallengeArena } from './pages/ChallengeArena';
import { Pricing } from './pages/Pricing';
import { Leaderboard } from './pages/Leaderboard';
import { ProfileSetup } from './pages/ProfileSetup';
import { ProfileView } from './pages/ProfileView';
import { TalentSearch } from './pages/TalentSearch';
import { ExamRoom } from './pages/ExamRoom';
import { Login } from './pages/Login';
import { UserMenu } from './components/UserMenu';
import { authService } from './services/auth';
import { Layout, CreditCard, Hexagon, Menu, X, LogIn, Loader2, Zap, Trophy, Search } from 'lucide-react';

// Initialize as a Guest User
const GuestUser: User = {
  id: 'guest',
  name: '',
  isPremium: false,
  avatar: '',
  email: '',
  isOnboarded: false,
  isAuthenticated: false,
  history: [],
  monthlyUsage: {
    trialsUsed: 0,
    interviewsUsed: 0,
    lastResetDate: Date.now()
  }
};

const NavBar: React.FC<{ user: User; onLogout: () => void }> = ({ user, onLogout }) => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const isSetup = location.pathname === '/setup';
  const isLogin = location.pathname === '/login';
  const isExam = location.pathname === '/exam';

  // Hide Nav in Exam Mode
  if (isExam) return null;

  const navClass = (path: string) => 
    `flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
      location.pathname === path ? 'bg-slate-800 text-cyan-400 font-medium' : 'text-slate-400 hover:text-white'
    }`;
  
  const raceNavClass = (path: string) => 
    `flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
      location.pathname === path ? 'bg-purple-900/40 text-purple-400 font-medium border border-purple-500/30' : 'text-slate-400 hover:text-purple-300'
    }`;

  if (isLogin) {
    return (
      <nav className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50">
         <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
           <Link to="/" className="flex items-center gap-2 text-white font-bold text-xl tracking-tight">
            <Hexagon className="text-cyan-500 fill-cyan-500/20" size={28} />
            <span>PSN</span>
          </Link>
         </div>
      </nav>
    );
  }

  if (isSetup) {
    return (
      <nav className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
           <div className="flex items-center gap-2 text-white font-bold text-xl tracking-tight opacity-50">
              <Hexagon className="text-slate-500" size={28} />
              <span>PSN <span className="text-slate-600 font-normal">| Setup</span></span>
           </div>
        </div>
      </nav>
    );
  }

  return (
    <nav className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-white font-bold text-xl tracking-tight">
          <Hexagon className="text-cyan-500 fill-cyan-500/20" size={28} />
          <span>PSN <span className="text-slate-500 font-normal hidden sm:inline">| Proof-of-Skill</span></span>
        </Link>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-4">
          {user.isAuthenticated ? (
            <>
              <Link to="/arena" className={raceNavClass('/arena')}>
                <Zap size={18} /> Live Arena
              </Link>
              <Link to="/" className={navClass('/')}>
                <Layout size={18} /> Dashboard
              </Link>
              <Link to="/leaderboard" className={navClass('/leaderboard')}>
                <Trophy size={18} /> Rankings
              </Link>
               <Link to="/talent" className={navClass('/talent')}>
                <Search size={18} /> Recruiters
              </Link>
              <Link to="/pricing" className={navClass('/pricing')}>
                <CreditCard size={18} /> Membership
              </Link>
              <div className="h-6 w-px bg-slate-800 mx-1"></div>
              <UserMenu user={user} onLogout={onLogout} />
            </>
          ) : (
            <Link to="/login" className="flex items-center gap-2 px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors border border-slate-700">
               <LogIn size={18} /> Login
            </Link>
          )}
        </div>

        {/* Mobile Toggle */}
        <div className="flex md:hidden items-center gap-4">
          {user.isAuthenticated && <UserMenu user={user} onLogout={onLogout} />}
          <button onClick={() => setIsOpen(!isOpen)} className="text-slate-300">
            {isOpen ? <X /> : <Menu />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <div className="md:hidden bg-slate-900 border-b border-slate-800 p-4 space-y-4">
           {user.isAuthenticated ? (
             <>
               <Link to="/arena" onClick={() => setIsOpen(false)} className="block text-purple-400 py-2 font-bold">Live Arena</Link>
               <Link to="/" onClick={() => setIsOpen(false)} className="block text-slate-300 py-2">Dashboard</Link>
               <Link to="/leaderboard" onClick={() => setIsOpen(false)} className="block text-slate-300 py-2">Rankings</Link>
               <Link to="/talent" onClick={() => setIsOpen(false)} className="block text-slate-300 py-2">Talent Search</Link>
               <Link to="/pricing" onClick={() => setIsOpen(false)} className="block text-slate-300 py-2">Pricing</Link>
               <Link to="/profile" onClick={() => setIsOpen(false)} className="block text-slate-300 py-2">My Profile</Link>
             </>
           ) : (
             <Link to="/login" onClick={() => setIsOpen(false)} className="block text-cyan-400 py-2 font-bold">Login / Sign Up</Link>
           )}
        </div>
      )}
    </nav>
  );
};

export default function App() {
  const [user, setUser] = useState<User>(GuestUser);
  const [activeDomain, setActiveDomain] = useState<SkillDomain | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Helper to reset monthly usage if needed
  const checkAndResetUsage = (currentUser: User): User => {
    const now = Date.now();
    const lastReset = currentUser.monthlyUsage?.lastResetDate || 0;
    const daysDiff = (now - lastReset) / (1000 * 60 * 60 * 24);

    if (daysDiff >= 30) {
      return {
        ...currentUser,
        monthlyUsage: {
          trialsUsed: 0,
          interviewsUsed: 0,
          lastResetDate: now
        }
      };
    }
    
    // Ensure monthlyUsage object exists
    if (!currentUser.monthlyUsage) {
      return {
        ...currentUser,
        monthlyUsage: {
           trialsUsed: 0,
           interviewsUsed: 0,
           lastResetDate: now
        }
      };
    }

    return currentUser;
  };

  // Restore session on mount
  useEffect(() => {
    const unsubscribe = authService.onAuthStateChange((authedUser) => {
      if (authedUser) {
        // Check for monthly reset immediately upon auth
        const updatedUser = checkAndResetUsage(authedUser);
        
        // If data changed during reset check, ensure we save it back if it's significant
        if (updatedUser.monthlyUsage?.lastResetDate !== authedUser.monthlyUsage?.lastResetDate) {
           authService.updateUser(updatedUser);
        }
        setUser(updatedUser);
      } else {
        setUser(GuestUser);
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleTrialComplete = (session: TrialSession) => {
    const updatedUser = {
      ...user,
      history: [session, ...(user.history || [])],
      stats: {
        trialsCompleted: (user.stats?.trialsCompleted || 0) + 1,
        arenaWins: user.stats?.arenaWins || 0,
        globalRank: user.stats?.globalRank || 0,
        topPercentile: user.stats?.topPercentile || 0,
        examsPassed: user.stats?.examsPassed || 0
      },
      // Increment Usage Count for Free Tier
      monthlyUsage: {
        trialsUsed: (user.monthlyUsage?.trialsUsed || 0) + 1,
        interviewsUsed: user.monthlyUsage?.interviewsUsed || 0,
        lastResetDate: user.monthlyUsage?.lastResetDate || Date.now()
      }
    };
    setUser(updatedUser);
    authService.updateUser(updatedUser); // Persist
    setActiveDomain(null);
  };

  const handleInterviewComplete = (interviewData: any) => {
     // In a real app, we would store this in a specific 'interviews' collection
     // For this MVP, we treat it as a "Voice Assessment" trial in history
     const session: TrialSession = {
        id: crypto.randomUUID(),
        domain: interviewData.domain,
        status: 'completed',
        startTime: Date.now(),
        endTime: Date.now(),
        score: {
           problemSolving: interviewData.score, 
           executionSpeed: 90, // Voice is fast
           conceptualDepth: interviewData.score, // Voice focuses on this
           aiLeverage: 0, 
           riskAwareness: 80,
           average: interviewData.score
        },
        feedback: "VOICE INTERVIEW COMPLETED. " + (interviewData.history[0]?.feedback || "")
     };
     
     // Update with Interview-specific usage increment
     const updatedUser = {
      ...user,
      history: [session, ...(user.history || [])],
      stats: {
        trialsCompleted: (user.stats?.trialsCompleted || 0) + 1,
        arenaWins: user.stats?.arenaWins || 0,
        globalRank: user.stats?.globalRank || 0,
        topPercentile: user.stats?.topPercentile || 0,
        examsPassed: user.stats?.examsPassed || 0
      },
      monthlyUsage: {
        trialsUsed: user.monthlyUsage?.trialsUsed || 0,
        interviewsUsed: (user.monthlyUsage?.interviewsUsed || 0) + 1,
        lastResetDate: user.monthlyUsage?.lastResetDate || Date.now()
      }
    };
    
    setUser(updatedUser);
    authService.updateUser(updatedUser);
  };

  const handleLogin = (loggedInUser: User) => {
    // onAuthStateChange will also fire, but we set it here for immediate feedback if needed
    const checkedUser = checkAndResetUsage(loggedInUser);
    setUser(checkedUser);
  };

  const handleProfileUpdate = (updatedUser: User) => {
    setUser(updatedUser);
    authService.updateUser(updatedUser); // Persist
  };

  const handleLogout = async () => {
    await authService.logout();
    setUser(GuestUser);
    setActiveDomain(null);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center gap-4">
        <Loader2 className="animate-spin text-cyan-500" size={40} />
        <p className="text-slate-500 animate-pulse font-mono text-sm">Synchronizing Skill DNA...</p>
      </div>
    );
  }

  return (
    <HashRouter>
      <div className="min-h-screen bg-[#0f172a] text-slate-50">
        <NavBar user={user} onLogout={handleLogout} />
        
        <main className="max-w-7xl mx-auto px-4 py-8">
          <Routes>
            {/* Public Route */}
            <Route path="/login" element={
              user.isAuthenticated ? <Navigate to="/" replace /> : <Login onLogin={handleLogin} />
            } />

            {/* Protected Routes */}
            <Route path="/" element={
              !user.isAuthenticated ? (
                <Navigate to="/login" replace />
              ) : !user.isOnboarded ? (
                <Navigate to="/setup" replace />
              ) : activeDomain ? (
                <TrialRoom 
                  domain={activeDomain} 
                  onComplete={handleTrialComplete} 
                />
              ) : (
                <Dashboard 
                  user={user} 
                  onStartTrial={(d) => setActiveDomain(d)} 
                />
              )
            } />
            
            <Route path="/arena" element={
              !user.isAuthenticated ? <Navigate to="/login" replace /> : <ChallengeArena user={user} />
            } />
            
            <Route path="/leaderboard" element={
              !user.isAuthenticated ? <Navigate to="/login" replace /> : <Leaderboard user={user} />
            } />

            <Route path="/talent" element={
              !user.isAuthenticated ? <Navigate to="/login" replace /> : <TalentSearch />
            } />

            <Route path="/interview" element={
              !user.isAuthenticated ? <Navigate to="/login" replace /> : 
              <InterviewRoom onComplete={(data) => {
                 handleInterviewComplete(data);
                 window.location.hash = "/";
              }} />
            } />

            <Route path="/exam" element={
              !user.isAuthenticated ? <Navigate to="/login" replace /> : <ExamRoom user={user} onUpdateUser={handleProfileUpdate} />
            } />

            <Route path="/pricing" element={<Pricing user={user} />} />
            
            <Route path="/setup" element={
              !user.isAuthenticated ? <Navigate to="/login" replace /> : <ProfileSetup user={user} onSave={handleProfileUpdate} />
            } />
            
            <Route path="/profile" element={
              !user.isAuthenticated ? <Navigate to="/login" replace /> : <ProfileView user={user} />
            } />
          </Routes>
        </main>

        <footer className="border-t border-slate-800 mt-12 py-8 text-center text-slate-500 text-sm">
          <p>© 2024 Proof-of-Skill Network (PSN). All rights reserved.</p>
          <p className="mt-2">Reinventing hiring with <span className="text-cyan-600">AI-Verified</span> credentials.</p>
        </footer>
      </div>
    </HashRouter>
  );
}
