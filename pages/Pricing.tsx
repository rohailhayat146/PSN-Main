
import React, { useState } from 'react';
import { Check, Shield, Zap, Globe, Lock, Star, Trophy, Search } from 'lucide-react';
import { paymentService } from '../services/payment';
import { User } from '../types';

interface Props {
  user: User;
}

export const Pricing: React.FC<Props> = ({ user }) => {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [loading, setLoading] = useState(false);

  const handleSubscribe = async (plan: 'monthly' | 'yearly') => {
    if (!user || !user.id || user.id === 'guest') {
      alert("Please login to subscribe.");
      return;
    }
    
    setLoading(true);
    try {
      await paymentService.processSubscription(user.id, plan, user.email);
    } catch (error) {
      alert("Payment redirection failed. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-12 px-4 animate-fade-in">
      <div className="text-center mb-16 space-y-4">
        <h1 className="text-4xl md:text-5xl font-bold text-white">Get Verified. Get Hired.</h1>
        <p className="text-xl text-slate-400 max-w-2xl mx-auto">
          Upgrade to <span className="text-cyan-400 font-bold">PSN Pro</span> to unlock unlimited trials, AI interviews, and the prestigious Verified Badge.
        </p>
        
        <div className="flex items-center justify-center gap-4 mt-8 bg-slate-800/50 p-1.5 rounded-full w-fit mx-auto border border-slate-700">
          <button 
            onClick={() => setBillingCycle('monthly')}
            className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${billingCycle === 'monthly' ? 'bg-cyan-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
          >
            Monthly
          </button>
          <button 
            onClick={() => setBillingCycle('yearly')}
            className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${billingCycle === 'yearly' ? 'bg-cyan-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
          >
            Yearly <span className="text-xs ml-1 bg-white/20 px-1.5 py-0.5 rounded text-white">Save 15%</span>
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        
        {/* Free Tier */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-8 flex flex-col order-2 md:order-1">
          <div className="mb-6">
            <h3 className="text-xl font-bold text-white">Basic</h3>
            <div className="mt-4 flex items-baseline">
              <span className="text-4xl font-bold text-white">$0</span>
              <span className="text-slate-500 ml-2">/forever</span>
            </div>
            <p className="mt-4 text-slate-400 text-sm">For developers just starting to benchmark their skills.</p>
          </div>
          <ul className="space-y-4 mb-8 flex-1">
            <li className="flex items-start gap-3 text-slate-300 text-sm"><Check size={16} className="text-slate-500 mt-1"/> 5 Skill Trials per month</li>
            <li className="flex items-start gap-3 text-slate-300 text-sm"><Check size={16} className="text-slate-500 mt-1"/> 5 AI Interviews per month</li>
            <li className="flex items-start gap-3 text-slate-300 text-sm"><Check size={16} className="text-slate-500 mt-1"/> Basic Score (0-100)</li>
          </ul>
          <button className="w-full py-3 bg-slate-700/50 text-slate-400 font-medium rounded-xl cursor-default border border-slate-700">
            Current Plan
          </button>
        </div>

        {/* Pro Tier (Featured) */}
        <div className="bg-gradient-to-b from-slate-800 to-slate-900 border-2 border-cyan-500 rounded-2xl p-8 flex flex-col relative transform md:-translate-y-4 shadow-2xl shadow-cyan-900/20 order-1 md:order-2">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-cyan-500 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide shadow-lg flex items-center gap-1">
            <Star size={12} fill="currentColor" /> Most Popular
          </div>
          <div className="mb-6">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <Zap size={20} className="text-cyan-400 fill-cyan-400" /> PSN Verified
            </h3>
            <div className="mt-4 flex items-baseline">
              <span className="text-5xl font-bold text-white">${billingCycle === 'monthly' ? '29' : '300'}</span>
              <span className="text-slate-400 ml-2">/{billingCycle === 'monthly' ? 'mo' : 'yr'}</span>
            </div>
            <p className="mt-4 text-cyan-100/80 text-sm">Everything you need to prove your skills to the world.</p>
          </div>
          
          <div className="space-y-4 mb-8 flex-1">
            <div className="p-3 bg-cyan-900/20 rounded-lg border border-cyan-500/30 flex items-start gap-3">
               <div className="mt-1 bg-cyan-500 rounded-full p-0.5"><Check size={12} className="text-white"/></div>
               <div>
                 <strong className="text-white text-sm block">Verified Badge</strong>
                 <p className="text-xs text-cyan-200/70">Blue checkmark on your profile visible worldwide.</p>
               </div>
            </div>
            <div className="p-3 bg-cyan-900/20 rounded-lg border border-cyan-500/30 flex items-start gap-3">
               <div className="mt-1 bg-cyan-500 rounded-full p-0.5"><Search size={12} className="text-white"/></div>
               <div>
                 <strong className="text-white text-sm block">Top of Recruiter Search</strong>
                 <p className="text-xs text-cyan-200/70">Appear first in talent searches.</p>
               </div>
            </div>
            
            <ul className="space-y-3 pt-2">
               <li className="flex items-center gap-3 text-white text-sm"><Check size={16} className="text-cyan-400"/> <strong>Unlimited</strong> Skill Trials</li>
               <li className="flex items-center gap-3 text-white text-sm"><Check size={16} className="text-cyan-400"/> <strong>Unlimited</strong> AI Interviews</li>
               <li className="flex items-center gap-3 text-white text-sm"><Check size={16} className="text-cyan-400"/> Full Skill DNA™ Analysis</li>
            </ul>
          </div>

          <button 
            onClick={() => handleSubscribe(billingCycle)}
            disabled={loading}
            className="w-full py-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-cyan-500/25 disabled:opacity-70 disabled:cursor-wait"
          >
            {loading ? 'Processing...' : 'Get Verified Now'}
          </button>
        </div>

        {/* Business Tier */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-8 flex flex-col order-3">
          <div className="mb-6">
            <h3 className="text-xl font-bold text-white flex items-center gap-2"><Globe size={20} className="text-purple-400" /> Enterprise</h3>
            <div className="mt-4 flex items-baseline">
              <span className="text-4xl font-bold text-white">Custom</span>
            </div>
            <p className="mt-4 text-slate-400 text-sm">For hiring teams to verify candidates at scale.</p>
          </div>
          <ul className="space-y-4 mb-8 flex-1">
            <li className="flex items-start gap-3 text-slate-300 text-sm"><Check size={16} className="text-purple-400 mt-1"/> Bulk Verified Unlocks</li>
            <li className="flex items-start gap-3 text-slate-300 text-sm"><Check size={16} className="text-purple-400 mt-1"/> Custom Domain Trials</li>
            <li className="flex items-start gap-3 text-slate-300 text-sm"><Check size={16} className="text-purple-400 mt-1"/> ATS Integration</li>
            <li className="flex items-start gap-3 text-slate-300 text-sm"><Check size={16} className="text-purple-400 mt-1"/> Team Analytics</li>
          </ul>
          <button 
             className="w-full py-3 bg-slate-700 hover:bg-slate-600 hover:text-purple-300 text-white font-medium rounded-xl transition-colors border border-transparent hover:border-purple-500/50"
          >
            Contact Sales
          </button>
        </div>

      </div>

      <div className="mt-16 text-center border-t border-slate-800 pt-8">
        <div className="flex justify-center items-center gap-2 text-slate-500 mb-4">
          <Lock size={16} />
          <span className="text-sm">Payments processed securely by Stripe. Cancel anytime.</span>
        </div>
      </div>
    </div>
  );
};
