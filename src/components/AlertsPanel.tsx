import { motion, AnimatePresence } from 'motion/react';
import { Bell, TrendingDown, Zap, Clock } from 'lucide-react';
import { MarketAlert } from '../types';
import { cn } from '../lib/utils';

interface AlertsPanelProps {
  alerts: MarketAlert[];
}

export function AlertsPanel({ alerts }: AlertsPanelProps) {
  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden flex flex-col h-full">
      <div className="p-4 border-b border-border bg-surface flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-accent" />
          <h3 className="font-bold text-text-main text-[13px] uppercase tracking-tight">Live Alerts</h3>
        </div>
        <span className="text-[10px] font-bold bg-accent/20 text-accent px-2 py-0.5 rounded uppercase tracking-tighter">
          Real-time
        </span>
      </div>

      <div className="flex-1 p-4 overflow-y-auto space-y-3">
        <AnimatePresence initial={false}>
          {alerts.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-20 py-10">
              <Clock className="w-8 h-8 mb-2" />
              <p className="text-xs">No recent alerts.</p>
            </div>
          ) : (
            alerts.map((alert) => (
              <motion.div
                key={alert.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={cn(
                  "p-3 rounded-lg border flex gap-3 items-start",
                  alert.type === 'PRICE_DROP' 
                    ? "bg-danger/5 border-danger/20" 
                    : "bg-accent/5 border-accent/20"
                )}
              >
                <div className={cn(
                  "p-1.5 rounded-md shrink-0",
                  alert.type === 'PRICE_DROP' ? "bg-danger/20 text-danger" : "bg-accent/20 text-accent"
                )}>
                  {alert.type === 'PRICE_DROP' ? <TrendingDown className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
                </div>
                <div>
                  <p className="text-sm text-text-main font-medium">{alert.message}</p>
                  <p className="text-[10px] text-text-dim mt-1">
                    {new Date(alert.timestamp).toLocaleTimeString()}
                  </p>
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
