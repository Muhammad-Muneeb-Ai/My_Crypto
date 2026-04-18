import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Send, Loader2, Bot } from 'lucide-react';
import { analyzeMarket } from '../services/gemini';
import { MarketData } from '../types';

interface AIAnalystProps {
  marketData: MarketData[];
}

export function AIAnalyst({ marketData }: AIAnalystProps) {
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || loading) return;

    setLoading(true);
    const result = await analyzeMarket(marketData, query);
    setResponse(result);
    setLoading(false);
  };

  return (
    <div className="bg-surface-light border border-border rounded-xl overflow-hidden flex flex-col h-full">
      <div className="p-4 border-b border-border bg-accent/10 flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-accent" />
        <h3 className="font-bold text-text-main text-[13px] uppercase tracking-tight">AI Analyst (Gemini Pro)</h3>
      </div>

      <div className="flex-1 p-4 overflow-y-auto space-y-4 min-h-[300px]">
        <AnimatePresence mode="wait">
          {!response && !loading ? (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="h-full flex flex-col items-center justify-center text-center space-y-2 opacity-30"
            >
              <Bot className="w-10 h-10" />
              <p className="text-xs">Ask about market trends...</p>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-surface p-3 rounded-lg border border-border text-text-main text-[13px] leading-relaxed whitespace-pre-wrap"
            >
              {loading ? (
                <div className="flex items-center gap-2 text-accent">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Analyzing market data...</span>
                </div>
              ) : (
                response
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <form onSubmit={handleAsk} className="p-3 bg-surface border-t border-border">
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask about market trends..."
            className="flex-1 bg-bg border border-border rounded-md py-2 px-3 text-text-main text-xs focus:outline-none focus:border-accent transition-all"
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="p-2 bg-accent text-bg rounded-md hover:opacity-90 disabled:opacity-50 transition-all"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
