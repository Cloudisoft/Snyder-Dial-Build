import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  className?: string;
}

export function StatCard({ label, value, icon: Icon, trend, className = '' }: StatCardProps) {
  return (
    <div className={`bg-card border border-card-border rounded-lg p-6 ${className}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-muted-foreground mb-1">{label}</p>
          <p className="text-3xl font-bold font-mono tracking-tight">{value}</p>
          {trend && (
            <p className={`text-xs mt-2 font-medium ${trend.isPositive ? 'text-chart-5' : 'text-destructive'}`}>
              {trend.isPositive ? '+' : ''}{trend.value}% vs last period
            </p>
          )}
        </div>
        {Icon && (
          <div className="w-10 h-10 bg-primary/10 rounded flex items-center justify-center">
            <Icon className="w-5 h-5 text-primary" />
          </div>
        )}
      </div>
    </div>
  );
}
