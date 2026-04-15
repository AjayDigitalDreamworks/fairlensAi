import { useState } from "react";
import { AlertTriangle, TrendingUp, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const BIAS_STORIES = [
  {
    title: "The Amazon Hiring Scandal",
    year: "2018",
    scenario: "Amazon's AI recruiting tool showed bias against women because it was trained on 10 years of male-dominated resumes. It penalized resumes with the word 'women\\'s'.",
    realWorldImpact: {
      peopleAffected: 50000,
      monetaryLoss: "$2M+ in legal fees + brand damage",
      legalRisk: "Sued for gender discrimination",
    },
    yourDataComparison: {
      similarity: 87,
      risk: "high",
      prevention: "Our analysis detected 'gender' as a proxy feature with 0.32 disparate impact - 3 months before deployment"
    }
  },
  {
    title: "COMPAS Recidivism Bias",
    year: "2016",
    scenario: "A criminal risk assessment tool used nationwide was found to be 77% more likely to falsely label Black defendants as high-risk compared to white defendants.",
    realWorldImpact: {
      peopleAffected: 100000,
      monetaryLoss: "Class action lawsuits",
      legalRisk: "Violated 14th Amendment Equal Protection",
    },
    yourDataComparison: {
      similarity: 62,
      risk: "medium",
      prevention: "Detected disparate false positive rates across racial demographics immediately."
    }
  },
  {
    title: "Apple Card Credit Limits",
    year: "2019",
    scenario: "Husband and wife with joint accounts applied. The algorithm gave the husband a credit limit 20x higher than his wife, despite her having a better credit score.",
    realWorldImpact: {
      peopleAffected: 250000,
      monetaryLoss: "NDFS Regulatory Investigation",
      legalRisk: "ECOA Violation Investigation",
    },
    yourDataComparison: {
      similarity: 91,
      risk: "critical",
      prevention: "Detected severe Equal Opportunity violation on 'gender' baseline."
    }
  }
];

export default function BiasStoryTimeline() {
  const [activeStory, setActiveStory] = useState(0);
  const story = BIAS_STORIES[activeStory];

  return (
    <div className="card-glow p-6 mt-8">
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-sans text-xl font-bold tracking-tight text-white">Compare to Real Cases</h3>
        <span className="text-xs uppercase tracking-wider text-muted-foreground bg-black/40 px-2 py-1 border border-white/10 rounded">Historical Analysis</span>
      </div>

      <div className="flex flex-wrap md:flex-nowrap gap-6">
        <div className="w-full md:w-1/3 space-y-3">
          {BIAS_STORIES.map((s, idx) => (
            <div 
              key={idx}
              onClick={() => setActiveStory(idx)}
              className={`p-4 rounded border cursor-pointer transition-all ${
                idx === activeStory 
                  ? 'border-[#C9A961] bg-[#C9A961]/10 border-l-4' 
                  : 'border-white/10 bg-black/30 hover:border-white/20 hover:bg-black/40'
              }`}
            >
              <div className="flex justify-between items-start mb-1">
                 <h4 className={`text-sm font-bold ${idx === activeStory ? 'text-[#C9A961]' : 'text-white'}`}>{s.title}</h4>
                 <span className="text-[10px] text-muted-foreground">{s.year}</span>
              </div>
              <p className="text-[11px] text-muted-foreground line-clamp-2">{s.scenario}</p>
            </div>
          ))}
        </div>

        <div className="w-full md:w-2/3 border border-white/5 bg-black/20 p-6 rounded relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4">
             <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Similarity to your dataset</span>
                <span className={`text-lg font-bold ${story.yourDataComparison.risk === 'critical' || story.yourDataComparison.risk === 'high' ? 'text-red-500' : 'text-amber-500'}`}>
                  {story.yourDataComparison.similarity}%
                </span>
             </div>
          </div>

          <h4 className="text-2xl font-bold text-white mb-2">{story.title}</h4>
          <p className="text-sm text-muted-foreground mb-6 max-w-xl">{story.scenario}</p>

          <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
            <div className="bg-red-500/10 border border-red-500/20 p-4 rounded">
              <span className="block text-[10px] uppercase text-red-400 mb-1 font-bold">Real World Cost</span>
              <span className="text-white">{story.realWorldImpact.monetaryLoss}</span>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded">
              <span className="block text-[10px] uppercase text-amber-500 mb-1 font-bold">Legal Risk</span>
              <span className="text-white">{story.realWorldImpact.legalRisk}</span>
            </div>
          </div>

          <div className="border border-[#C9A961]/30 bg-[#C9A961]/5 p-4 rounded flex gap-4">
             <CheckCircle className="text-[#C9A961] w-6 h-6 flex-shrink-0" />
             <div>
                <h5 className="text-xs uppercase text-[#C9A961] font-bold mb-1">How FairSight Prevents This</h5>
                <p className="text-xs text-white/80">{story.yourDataComparison.prevention}</p>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
