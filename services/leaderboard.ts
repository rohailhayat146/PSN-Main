
import { db } from './auth';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { User, LeaderboardEntry, LeaderboardMetric, LeaderboardTimeframe, SkillDomain } from '../types';

export const leaderboardService = {
  
  async getLeaderboard(
    currentUser: User,
    metric: LeaderboardMetric = 'skill_dna',
    timeframe: LeaderboardTimeframe = 'weekly',
    domainFilter?: string
  ): Promise<LeaderboardEntry[]> {
    
    let allUsers: User[] = [];
    let fetchSuccess = false;

    // 1. FETCH REAL DATA
    if (db) {
      try {
        // Fetch all users to perform client-side filtering/sorting 
        const usersRef = collection(db, 'users');
        const q = query(usersRef, orderBy('stats.globalRank', 'asc'), limit(100)); // Limit to top 100 to save bandwidth
        
        // Fallback to simple fetch if indexes aren't built yet
        try {
            const snapshot = await getDocs(q);
            allUsers = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as User));
        } catch (e) {
            // If orderBy fails due to missing index, fetch all
            const snapshot = await getDocs(collection(db, 'users'));
            allUsers = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as User));
        }
        fetchSuccess = true;
      } catch (error) {
        console.warn("Leaderboard Fetch Failed (Permissions?):", error);
        fetchSuccess = false;
      }
    } 
    
    if (!fetchSuccess) {
      // LocalStorage Fallback (Mock Backend Mode)
      const storageKey = 'psn_users_db_v1';
      const storedData = localStorage.getItem(storageKey);
      if (storedData) {
        const parsed = JSON.parse(storedData);
        allUsers = Object.values(parsed);
      } else {
        // If purely guest mode with no data
        allUsers = [currentUser]; 
      }
    }

    // Ensure current user is in the list for comparison if they aren't saved to DB yet
    if (currentUser.id && !allUsers.find(u => u.id === currentUser.id)) {
      allUsers.push(currentUser);
    }

    // 2. PROCESS & CALCULATE SCORES
    let entries: LeaderboardEntry[] = allUsers.map(user => {
      let score = 0;
      let secondaryScore = 0;
      let relevantHistory = user.history || [];

      // Timeframe Filter (Only applies to History-based metrics)
      if (timeframe !== 'all-time') {
        const now = Date.now();
        const oneWeek = 7 * 24 * 60 * 60 * 1000;
        const oneMonth = 30 * 24 * 60 * 60 * 1000;
        const cutoff = timeframe === 'weekly' ? now - oneWeek : now - oneMonth;
        
        relevantHistory = relevantHistory.filter(h => (h.endTime || 0) > cutoff);
      }

      // Domain Filter
      if (domainFilter) {
        relevantHistory = relevantHistory.filter(h => h.domain === domainFilter);
        // If filtering by domain, and user has no history in that domain, they effectively have 0 score
        if (relevantHistory.length === 0 && metric === 'skill_dna') {
           score = 0;
        }
      }

      // Metric Calculation
      if (metric === 'skill_dna') {
        if (relevantHistory.length > 0) {
          const totalAvg = relevantHistory.reduce((sum, h) => sum + (h.score?.average || 0), 0);
          score = Math.round(totalAvg / relevantHistory.length);
        }
        secondaryScore = relevantHistory.length; // Trials count
      } else if (metric === 'arena_wins') {
        // Note: Arena wins are cumulative in User stats, currently not time-stamped in this MVP version
        score = user.stats?.arenaWins || 0;
        secondaryScore = user.stats?.trialsCompleted || 0;
      } else if (metric === 'trials_completed') {
        score = relevantHistory.length;
        secondaryScore = user.stats?.arenaWins || 0;
      }

      // Determine Domain Specialty (Most frequent domain in history)
      const domainCounts: Record<string, number> = {};
      (user.history || []).forEach(h => {
        domainCounts[h.domain] = (domainCounts[h.domain] || 0) + 1;
      });
      const topDomain = Object.entries(domainCounts).sort((a,b) => b[1] - a[1])[0];
      const domainSpecialty = topDomain ? topDomain[0] : (user.skills?.[0] || 'Generalist');

      return {
        id: user.id,
        rank: 0, // Assigned after sort
        name: user.name || user.username || 'Anonymous',
        avatar: user.avatar,
        domainSpecialty,
        score,
        secondaryScore,
        change: 0, // Real-time change tracking requires historical snapshots (out of scope for MVP)
        isCurrentUser: user.id === currentUser.id,
        isCertified: user.isCertified // Pass certification status
      };
    });

    // 3. FILTER OUT ZEROS (Optional: Keeps board clean)
    // Only show people who have actually done something
    entries = entries.filter(e => e.score > 0 || e.isCurrentUser);

    // 4. SORT
    entries.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (b.secondaryScore || 0) - (a.secondaryScore || 0); // Tie-breaker
    });

    // 5. ASSIGN RANKS
    entries = entries.map((entry, index) => ({
      ...entry,
      rank: index + 1
    }));

    return entries;
  }
};
