import { db } from './auth';
import { doc, setDoc, getDoc, onSnapshot, updateDoc, runTransaction } from 'firebase/firestore';
import { User, SkillDomain, ChallengeParticipant, ChallengeCheckpoint } from '../types';

export interface ChallengeSession {
  id: string; // The 6-digit code
  hostId: string;
  domain: SkillDomain;
  status: 'waiting' | 'active' | 'finished';
  participants: ChallengeParticipant[];
  taskDescription?: string;
  checkpoints?: ChallengeCheckpoint[];
  startTime?: number;
}

// Generate a random 6-character code
const generateSessionCode = () => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

// ------------------------------------------------------------------
// FIREBASE IMPLEMENTATION
// ------------------------------------------------------------------

const firebaseImplementation = {
  
  async createSession(host: User, domain: SkillDomain): Promise<string> {
    const code = generateSessionCode();
    try {
      if (!db) throw new Error("Database not initialized");
      const sessionRef = doc(db, 'challenges', code);
      const initialParticipant: ChallengeParticipant = {
        id: host.id,
        name: host.name,
        avatar: host.avatar || 'H',
        progress: 0,
        score: 0,
        status: 'coding',
        isBot: false
      };
      const sessionData: ChallengeSession = {
        id: code,
        hostId: host.id,
        domain,
        status: 'waiting',
        participants: [initialParticipant]
      };
      await setDoc(sessionRef, sessionData);
      return code;
    } catch (e: any) {
      console.error("Firebase createSession failed:", e);
      // Fallback: If permission denied or other error, return OFFLINE to notify UI
      return "OFFLINE"; 
    }
  },

  async joinSession(code: string, user: User): Promise<{ success: boolean; message?: string }> {
    try {
      if (!db) throw new Error("Database not initialized");
      const sessionRef = doc(db, 'challenges', code);
      await runTransaction(db, async (transaction) => {
        const sessionDoc = await transaction.get(sessionRef);
        if (!sessionDoc.exists()) throw "Session not found";

        const data = sessionDoc.data() as ChallengeSession;
        const isAlreadyIn = data.participants.some(p => p.id === user.id);
        
        if (data.status !== 'waiting' && !isAlreadyIn) throw "Session is already active or finished";

        if (!isAlreadyIn) {
            const newParticipant: ChallengeParticipant = {
                id: user.id,
                name: user.name,
                avatar: user.avatar || 'P',
                progress: 0,
                score: 0,
                status: 'coding',
                isBot: false
            };
            const newParticipants = [...data.participants, newParticipant];
            transaction.update(sessionRef, { participants: newParticipants });
        }
      });
      return { success: true };
    } catch (e: any) {
      console.error("Firebase joinSession failed:", e);
      return { success: false, message: typeof e === 'string' ? e : "Connection failed" };
    }
  },

  async leaveSession(code: string, userId: string): Promise<void> {
    try {
      if (!db) return;
      const sessionRef = doc(db, 'challenges', code);
      await runTransaction(db, async (transaction) => {
        const sessionDoc = await transaction.get(sessionRef);
        if (!sessionDoc.exists()) return;
        const data = sessionDoc.data() as ChallengeSession;
        const newParticipants = data.participants.filter(p => p.id !== userId);
        transaction.update(sessionRef, { participants: newParticipants });
      });
    } catch (e) { console.warn("Leave failed", e); }
  },

  async setSessionScenario(code: string, taskDescription: string, checkpoints: ChallengeCheckpoint[]): Promise<void> {
    try {
      if (!db) return;
      const sessionRef = doc(db, 'challenges', code);
      await updateDoc(sessionRef, {
        taskDescription,
        checkpoints
      });
    } catch (e) { console.warn("Set Scenario failed", e); }
  },

  async startSession(code: string): Promise<void> {
    try {
      if (!db) return;
      const sessionRef = doc(db, 'challenges', code);
      await updateDoc(sessionRef, {
        status: 'active',
        startTime: Date.now()
      });
    } catch (e) { console.warn("Start failed", e); }
  },

  async updateProgress(code: string, userId: string, progress: number, status: 'coding' | 'validating' | 'finished'): Promise<void> {
    try {
      if (!db) return;
      const sessionRef = doc(db, 'challenges', code);
      await runTransaction(db, async (transaction) => {
         const sessionDoc = await transaction.get(sessionRef);
         if (!sessionDoc.exists()) return;
         const data = sessionDoc.data() as ChallengeSession;
         const updatedParticipants = data.participants.map(p => {
             if (p.id === userId) return { ...p, progress, status };
             return p;
         });
         transaction.update(sessionRef, { participants: updatedParticipants });
      });
    } catch (e) {}
  },

  subscribeToSession(code: string, callback: (data: ChallengeSession | null) => void): () => void {
    try {
      if (!db) return () => {};
      const sessionRef = doc(db, 'challenges', code);
      return onSnapshot(sessionRef, (doc) => {
        if (doc.exists()) callback(doc.data() as ChallengeSession);
        else callback(null);
      }, (e) => {
         console.warn("Snapshot error", e);
         callback(null);
      });
    } catch (e) { return () => {}; }
  }
};

// ------------------------------------------------------------------
// MOCK IMPLEMENTATION (LocalStorage)
// ------------------------------------------------------------------

const MOCK_STORAGE_KEY = 'psn_mock_challenges';

const getMockDB = () => JSON.parse(localStorage.getItem(MOCK_STORAGE_KEY) || '{}');
const saveMockDB = (data: any) => localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(data));

const mockImplementation = {
  async createSession(host: User, domain: SkillDomain): Promise<string> {
    const code = generateSessionCode();
    const db = getMockDB();
    
    db[code] = {
      id: code,
      hostId: host.id,
      domain,
      status: 'waiting',
      participants: [{
        id: host.id,
        name: host.name,
        avatar: host.avatar || 'H',
        progress: 0,
        score: 0,
        status: 'coding',
        isBot: false
      }],
      taskDescription: '',
      checkpoints: []
    } as ChallengeSession;
    
    saveMockDB(db);
    return code;
  },

  async joinSession(code: string, user: User): Promise<{ success: boolean; message?: string }> {
    const db = getMockDB();
    const session = db[code] as ChallengeSession;
    
    if (!session) return { success: false, message: "Session not found (Mock)" };
    if (session.status !== 'waiting' && !session.participants.find(p => p.id === user.id)) {
       return { success: false, message: "Session locked" };
    }

    if (!session.participants.find(p => p.id === user.id)) {
      session.participants.push({
        id: user.id,
        name: user.name,
        avatar: user.avatar || 'P',
        progress: 0,
        score: 0,
        status: 'coding',
        isBot: false
      });
      saveMockDB(db);
    }
    return { success: true };
  },

  async leaveSession(code: string, userId: string): Promise<void> {
    const db = getMockDB();
    if (db[code]) {
      db[code].participants = db[code].participants.filter((p: any) => p.id !== userId);
      saveMockDB(db);
    }
  },

  async setSessionScenario(code: string, taskDescription: string, checkpoints: ChallengeCheckpoint[]): Promise<void> {
    const db = getMockDB();
    if (db[code]) {
      db[code].taskDescription = taskDescription;
      db[code].checkpoints = checkpoints;
      saveMockDB(db);
    }
  },

  async startSession(code: string): Promise<void> {
    const db = getMockDB();
    if (db[code]) {
      db[code].status = 'active';
      db[code].startTime = Date.now();
      saveMockDB(db);
    }
  },

  async updateProgress(code: string, userId: string, progress: number, status: 'coding' | 'validating' | 'finished'): Promise<void> {
    const db = getMockDB();
    if (db[code]) {
      db[code].participants = db[code].participants.map((p: any) => 
        p.id === userId ? { ...p, progress, status } : p
      );
      saveMockDB(db);
    }
  },

  subscribeToSession(code: string, callback: (data: ChallengeSession | null) => void): () => void {
    const check = () => {
      const db = getMockDB();
      callback(db[code] || null);
    };
    
    check(); // Initial
    const interval = setInterval(check, 1000); // Poll every second for local changes
    return () => clearInterval(interval);
  }
};

// ------------------------------------------------------------------
// DYNAMIC PROXY SERVICE
// ------------------------------------------------------------------
// This ensures that if `db` initializes late or fails, we check on every call.

const getImpl = () => {
    // If db object exists, use firebase. 
    // Note: If permissions fail, firebase impl will handle it.
    if (db) return firebaseImplementation;
    return mockImplementation;
};

export const challengeService = {
    createSession: (h: User, d: SkillDomain) => getImpl().createSession(h, d),
    joinSession: (c: string, u: User) => getImpl().joinSession(c, u),
    leaveSession: (c: string, u: string) => getImpl().leaveSession(c, u),
    setSessionScenario: (c: string, t: string, cp: ChallengeCheckpoint[]) => getImpl().setSessionScenario(c, t, cp),
    startSession: (c: string) => getImpl().startSession(c),
    updateProgress: (c: string, u: string, p: number, s: 'coding' | 'validating' | 'finished') => getImpl().updateProgress(c, u, p, s),
    subscribeToSession: (c: string, cb: (d: ChallengeSession | null) => void) => getImpl().subscribeToSession(c, cb),
};
