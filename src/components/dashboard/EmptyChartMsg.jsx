import { cn } from '@/lib/utils';

export default function EmptyChartMsg({ msg, small }) {
  return (
    <div className={cn('flex items-center justify-center text-muted-foreground', small ? 'py-8' : 'py-16')}>
      <p className="text-sm">{msg}</p>
    </div>
  );
}