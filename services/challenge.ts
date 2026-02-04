
import { db } from './auth';
import { doc, setDoc, getDoc, onSnapshot, updateDoc, arrayUnion, runTransaction } from 'firebase/firestore';
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
// REAL BACKEND IMPLEMENTATION (Firestore)
// ------------------------------------------------------------------

export const challengeService = {
  
  async createSession(host: User, domain: SkillDomain): Promise<string> {
    if (!db) return "OFFLINE"; // Fallback for no-backend mode handled in UI
    
    const code = generateSessionCode();
    
    try {
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
    } catch (e) {
      console.warn("Challenge Create Failed (Permissions?):", e);
      return "OFFLINE";
    }
  },

  async joinSession(code: string, user: User): Promise<{ success: boolean; message?: string }> {
    if (!db) return { success: false, message: "Backend offline" };
    
    try {
      const sessionRef = doc(db, 'challenges', code);

      // Use Transaction to prevent race conditions on the participants array
      await runTransaction(db, async (transaction) => {
        const sessionDoc = await transaction.get(sessionRef);
        if (!sessionDoc.exists()) {
          throw "Session not found";
        }

        const data = sessionDoc.data() as ChallengeSession;
        
        // Check if user is already in (Idempotency)
        const isAlreadyIn = data.participants.some(p => p.id === user.id);
        
        if (data.status !== 'waiting' && !isAlreadyIn) {
           throw "Session is already active or finished";
        }

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
            
            // Atomic append
            const newParticipants = [...data.participants, newParticipant];
            transaction.update(sessionRef, { participants: newParticipants });
        }
      });

      return { success: true };
    } catch (e: any) {
      console.warn("Join Session Failed:", e);
      // Determine if it was a logic error (thrown string) or network/permission error
      const msg = typeof e === 'string' ? e : "Connection failed";
      return { success: false, message: msg };
    }
  },

  async leaveSession(code: string, userId: string): Promise<void> {
    if (!db) return;
    try {
      const sessionRef = doc(db, 'challenges', code);
      await runTransaction(db, async (transaction) => {
        const sessionDoc = await transaction.get(sessionRef);
        if (!sessionDoc.exists()) return;

        const data = sessionDoc.data() as ChallengeSession;
        // Filter out the user
        const newParticipants = data.participants.filter(p => p.id !== userId);
        
        // If it's the last person, we could delete, but let's just update for now
        transaction.update(sessionRef, { participants: newParticipants });
      });
    } catch (e) {
      console.warn("Leave session failed:", e);
    }
  },

  async startSession(code: string, taskDescription: string, checkpoints: ChallengeCheckpoint[]): Promise<void> {
    if (!db) return;
    try {
      const sessionRef = doc(db, 'challenges', code);
      await updateDoc(sessionRef, {
        status: 'active',
        startTime: Date.now(),
        taskDescription,
        checkpoints
      });
    } catch (e) {
      console.warn("Start Session Failed:", e);
    }
  },

  async updateProgress(code: string, userId: string, progress: number, status: 'coding' | 'validating' | 'finished'): Promise<void> {
    if (!db) return;
    try {
      const sessionRef = doc(db, 'challenges', code);
      
      // Transaction ensures we don't overwrite other users' concurrent updates
      await runTransaction(db, async (transaction) => {
         const sessionDoc = await transaction.get(sessionRef);
         if (!sessionDoc.exists()) return;
         
         const data = sessionDoc.data() as ChallengeSession;
         const updatedParticipants = data.participants.map(p => {
             if (p.id === userId) {
                 return { ...p, progress, status };
             }
             return p;
         });
         
         transaction.update(sessionRef, { participants: updatedParticipants });
      });
    } catch (e) {
      // Silent fail for progress updates to avoid console spam
    }
  },

  subscribeToSession(code: string, callback: (data: ChallengeSession | null) => void): () => void {
    if (!db) {
      callback(null);
      return () => {};
    }
    
    try {
      const sessionRef = doc(db, 'challenges', code);
      // onSnapshot automatically handles real-time updates and local caching
      return onSnapshot(sessionRef, (doc) => {
        if (doc.exists()) {
          callback(doc.data() as ChallengeSession);
        } else {
          callback(null);
        }
      }, (error) => {
        console.warn("Session subscription error:", error);
        callback(null);
      });
    } catch (e) {
      console.warn("Subscribe setup failed:", e);
      return () => {};
    }
  }
};
