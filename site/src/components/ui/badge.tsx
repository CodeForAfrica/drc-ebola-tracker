/* shadcn/ui Badge variant set for epidemiological states */
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold leading-5', {
  variants: {
    tone: {
      active: 'border-st-active/40 bg-st-active/10 text-st-active',
      over: 'border-st-over/50 bg-st-over/10 text-ink-2',
      neutral: 'border-rule bg-paper-2 text-ink-2',
      observed: 'border-accent/30 bg-accent-soft text-accent',
      reading: 'border-warn/40 bg-warn/10 text-warn',
      pending: 'border-dashed border-ink-3/50 text-ink-3',
    },
  },
  defaultVariants: { tone: 'neutral' },
});
export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
