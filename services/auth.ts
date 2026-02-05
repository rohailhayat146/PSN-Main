
import { User } from '../types';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';

// ------------------------------------------------------------------
// CONFIGURATION
// ------------------------------------------------------------------

// Explicit configuration to prevent "auth/configuration-not-found"
const firebaseConfig = {
  apiKey: "AIzaSyDiOvJOXrHGA6kOWyl3Hw7RfvIKncvc4HM",
  authDomain: "psn-network.firebaseapp.com",
  projectId: "psn-network",
  storageBucket: "psn-network.firebasestorage.app",
  messagingSenderId: "655713305273",
  appId: "1:655713305273:web:23fde8d6696855e97b5168",
  measurementId: "G-QL171SGDNY"
};

let auth: any;
let db: any;
let isBackendReady = false;

// Robust check: Firebase Auth requires apiKey, authDomain, and projectId at minimum.
const isConfigValid = 
  !!firebaseConfig.apiKey && 
  firebaseConfig.apiKey !== 'YOUR_API_KEY' &&
  !!firebaseConfig.authDomain &&
  !!firebaseConfig.projectId;

if (isConfigValid) {
  try {
    const app = initializeApp(firebaseConfig);
    // Explicitly pass the app instance to getAuth to ensure context binding
    auth = getAuth(app);
    db = getFirestore(app);
    isBackendReady = true;
    console.log("✅ PSN Backend: Connected to Firebase (Live Mode)");
  } catch (error) {
    console.warn("⚠️ PSN Backend: Firebase initialization failed. Falling back to Mock Mode.", error);
    isBackendReady = false;
  }
} else {
  console.log("⚠️ PSN Backend: Missing required Firebase config. Running in LocalStorage Simulation Mode.");
}

// ------------------------------------------------------------------
// INTERFACE DEFINITION
// ------------------------------------------------------------------

export interface AuthService {
  login(email: string, password: string): Promise<User>;
  register(email: string, password: string): Promise<User>;
  loginAsGuest(): Promise<User>;
  logout(): Promise<void>;
  updateUser(user: User): Promise<void>;
  onAuthStateChange(callback: (user: User | null) => void): () => void;
}

// ------------------------------------------------------------------
// REAL BACKEND IMPLEMENTATION (Firebase)
// ------------------------------------------------------------------

const firebaseService: AuthService = {
  async login(email: string, password: string): Promise<User> {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const firebaseUser = userCredential.user;

    // Default User Object (Fallback)
    const defaultUser: User = {
      id: firebaseUser.uid,
      email: email,
      name: firebaseUser.displayName || '',
      username: email.split('@')[0],
      isPremium: false,
      avatar: firebaseUser.photoURL || '',
      isOnboarded: false,
      isAuthenticated: true,
      history: [],
      skills: []
    };

    // Try to fetch extra profile data from Firestore
    try {
      const docRef = doc(db, "users", firebaseUser.uid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const userData = docSnap.data() as User;
        return { ...userData, isAuthenticated: true };
      }
    } catch (error: any) {
      console.warn("Firestore Read Error (Login): Permission denied or network issue. Using basic auth profile.", error.code);
    }

    return defaultUser;
  },

  async register(email: string, password: string): Promise<User> {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const firebaseUser = userCredential.user;

    const newUser: User = {
      id: firebaseUser.uid,
      email: email,
      name: '',
      username: email.split('@')[0],
      isPremium: false,
      avatar: '',
      isOnboarded: false,
      history: [],
      skills: []
    };

    try {
      // Store profile in Firestore
      await setDoc(doc(db, "users", firebaseUser.uid), newUser);
    } catch (error: any) {
       console.warn("Firestore Write Error (Register): Profile creation failed, but Auth succeeded.", error.code);
    }
    
    return { ...newUser, isAuthenticated: true };
  },

  async loginAsGuest(): Promise<User> {
    try {
        const userCredential = await signInAnonymously(auth);
        const firebaseUser = userCredential.user;
        
        const guestUser: User = {
            id: firebaseUser.uid,
            name: 'Guest Explorer',
            username: `guest_${firebaseUser.uid.substring(0,6)}`,
            email: '',
            isPremium: false,
            avatar: '',
            isOnboarded: true,
            isAuthenticated: true,
            history: [],
            skills: ['Explorer'],
            bio: 'Just exploring the platform.'
        };
        
        // Try to save guest profile so other parts of the app can read it (optional)
        try {
            await setDoc(doc(db, "users", firebaseUser.uid), guestUser);
        } catch (e) {
            console.warn("Could not save guest profile to DB (likely permissions), continuing with Auth only.");
        }
        
        return guestUser;
    } catch (error: any) {
        console.error("Guest Login Failed:", error);
        throw new Error("Could not sign in as guest.");
    }
  },

  async logout(): Promise<void> {
    await signOut(auth);
  },

  async updateUser(user: User): Promise<void> {
    if (!user.id) return;
    try {
      const userRef = doc(db, "users", user.id);
      // Use setDoc with merge: true to ensure we don't error if doc is missing
      await setDoc(userRef, { ...user }, { merge: true });
    } catch (error: any) {
      console.warn("Firestore Write Error (Update): Could not save profile updates.", error.code);
    }
  },

  onAuthStateChange(callback: (user: User | null) => void): () => void {
    if (!auth) return () => {};
    
    return onAuthStateChanged(auth, async (firebaseUser: any) => {
      if (firebaseUser) {
        try {
          const docRef = doc(db, "users", firebaseUser.uid);
          const docSnap = await getDoc(docRef);
          
          if (docSnap.exists()) {
            callback({ ...docSnap.data(), isAuthenticated: true } as User);
          } else {
             // Fallback for anonymous users or missing profiles
             callback({
                id: firebaseUser.uid,
                email: firebaseUser.email || '',
                name: firebaseUser.displayName || 'Guest',
                username: (firebaseUser.email || '').split('@')[0] || 'guest',
                isPremium: false,
                avatar: firebaseUser.photoURL || '',
                isOnboarded: !firebaseUser.isAnonymous ? false : true, // Guests skip onboarding
                isAuthenticated: true,
                history: []
              } as User);
          }
        } catch (error) {
          console.warn("Firestore Read Error (AuthChange): Using fallback auth user.", error);
          callback({
            id: firebaseUser.uid,
            email: firebaseUser.email || '',
            name: firebaseUser.displayName || 'Guest',
            username: (firebaseUser.email || '').split('@')[0] || 'guest',
            isPremium: false,
            avatar: firebaseUser.photoURL || '',
            isOnboarded: true,
            isAuthenticated: true,
            history: []
          } as User);
        }
      } else {
        callback(null);
      }
    });
  }
};

// ------------------------------------------------------------------
// MOCK IMPLEMENTATION (LocalStorage)
// ------------------------------------------------------------------

const STORAGE_KEY = 'psn_users_db_v1';
const SESSION_KEY = 'psn_mock_session_user';
const DELAY_MS = 800;

interface StoredUser extends User {
  passwordHash: string;
}

const mockService: AuthService = {
  async login(email: string, password: string): Promise<User> {
    await new Promise(resolve => setTimeout(resolve, DELAY_MS)); 

    const dbLocal = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const user = dbLocal[email] as StoredUser | undefined;

    if (!user) {
      throw new Error("Account not found. Please sign up.");
    }

    const hash = btoa(password);
    if (user.passwordHash !== hash) {
      throw new Error("Invalid password.");
    }

    const { passwordHash, ...safeUser } = user;
    localStorage.setItem(SESSION_KEY, email); // Persist mock session
    return { ...safeUser, isAuthenticated: true };
  },

  async register(email: string, password: string): Promise<User> {
    await new Promise(resolve => setTimeout(resolve, DELAY_MS));

    const dbLocal = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    
    if (dbLocal[email]) {
      throw new Error("User already exists with this email.");
    }

    const newUser: StoredUser = {
      id: crypto.randomUUID(),
      email,
      name: '',
      username: email.split('@')[0],
      passwordHash: btoa(password),
      isPremium: false,
      avatar: '',
      isOnboarded: false,
      history: [],
      skills: []
    };

    dbLocal[email] = newUser;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dbLocal));
    localStorage.setItem(SESSION_KEY, email); // Persist mock session

    const { passwordHash, ...safeUser } = newUser;
    return { ...safeUser, isAuthenticated: true };
  },

  async loginAsGuest(): Promise<User> {
      await new Promise(resolve => setTimeout(resolve, DELAY_MS));
      const guestId = 'guest_' + Date.now();
      const guestUser: User = {
          id: guestId,
          name: 'Guest Explorer',
          username: 'guest',
          email: '',
          isPremium: false,
          avatar: '',
          isOnboarded: true,
          isAuthenticated: true,
          history: [],
          skills: ['Explorer'],
          bio: 'Just exploring.'
      };
      localStorage.setItem(SESSION_KEY, 'GUEST_MODE');
      localStorage.setItem('psn_guest_data', JSON.stringify(guestUser));
      return guestUser;
  },

  async logout(): Promise<void> {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem('psn_guest_data');
    await new Promise(resolve => setTimeout(resolve, 200));
  },

  async updateUser(user: User): Promise<void> {
    // If it's a guest, update guest data
    if (user.id.startsWith('guest')) {
         localStorage.setItem('psn_guest_data', JSON.stringify(user));
         return;
    }
    
    if (!user.email) return;
    await new Promise(resolve => setTimeout(resolve, 500));

    const dbLocal = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const existing = dbLocal[user.email];

    if (existing) {
      const { passwordHash } = existing;
      dbLocal[user.email] = { ...user, passwordHash };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dbLocal));
    }
  },

  onAuthStateChange(callback: (user: User | null) => void): () => void {
    // Check for guest session first
    const session = localStorage.getItem(SESSION_KEY);
    if (session === 'GUEST_MODE') {
        const guestData = localStorage.getItem('psn_guest_data');
        if (guestData) {
            callback(JSON.parse(guestData));
            return () => {};
        }
    }

    if (session) {
      const dbLocal = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      const user = dbLocal[session];
      if (user) {
        const { passwordHash, ...safeUser } = user;
        callback({ ...safeUser, isAuthenticated: true });
      } else {
        callback(null);
      }
    } else {
      callback(null);
    }
    return () => {};
  }
};

// ------------------------------------------------------------------
// EXPORT (Factory)
// ------------------------------------------------------------------

// Only use Firebase Service if it successfully initialized
export const authService = isBackendReady ? firebaseService : mockService;
// Exporting DB for other services (Challenge Service)
export { db };
