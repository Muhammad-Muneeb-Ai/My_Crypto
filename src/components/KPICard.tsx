import React from 'react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

interface KPICardProps {
  title: string;
  value: string | number;
  subValue?: string;
  icon: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  className?: string;
}

export function KPICard({ title, value, subValue, icon, trend, className }: KPICardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "bg-surface border border-border p-4 rounded-xl shadow-lg",
        className
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="p-1.5 bg-surface-light rounded text-text-dim">
          {icon}
        </div>
        {trend && (
          <span className={cn(
            "text-[10px] font-bold px-2 py-0.5 rounded uppercase",
            trend === 'up' ? "bg-success/10 text-success" : 
            trend === 'down' ? "bg-danger/10 text-danger" : 
            "bg-text-dim/10 text-text-dim"
          )}>
            {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '•'}
          </span>
        )}
      </div>
      <div>
        <p className="text-text-dim text-[11px] font-semibold uppercase tracking-wider">{title}</p>
        <h3 className="text-xl font-bold text-text-main mt-1 font-mono">{value}</h3>
        {subValue && <p className={cn(
          "text-[12px] mt-1",
          trend === 'up' ? "text-success" : trend === 'down' ? "text-danger" : "text-text-dim"
        )}>{subValue}</p>}
      </div>
    </motion.div>
  );
}
