import { cn } from '@/lib/utils';

export default function MiniCard({ label, value, highlight }) {
  return (
    <div className={cn(
      'rounded-lg p-3 border',
      highlight ? 'bg-primary/10 border-primary/20' : 'bg-white'
    )}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn('text-base font-bold mt-0.5', highlight && 'text-primary')}>{value}</p>
    </div>
  );
}