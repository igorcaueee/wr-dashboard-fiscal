import { cn } from '@/lib/utils';

export default function SummaryCard({ title, value, icon: Icon, color, subtitle }) {
  const colorMap = {
    teal: 'bg-teal-50 border-teal-200',
    orange: 'bg-orange-50 border-orange-200',
    purple: 'bg-purple-50 border-purple-200',
    green: 'bg-green-50 border-green-200',
  };

  return (
    <div className={cn('rounded-xl border p-4', colorMap[color] || colorMap.teal)}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</span>
        {Icon && <Icon className="w-4 h-4 text-muted-foreground" />}
      </div>
      <div className="text-xl font-bold">{value}</div>
      {subtitle && <div className="text-xs text-muted-foreground mt-1">{subtitle}</div>}
    </div>
  );
}