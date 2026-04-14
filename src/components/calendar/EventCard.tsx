'use client';

import { cn } from '@/lib/utils';
import { EVENT_ICONS, type CalendarEvent } from './types';

interface EventCardProps {
  event: CalendarEvent;
  variant: 'compact' | 'expanded';
  onClick: () => void;
}

export function EventCard({ event, variant, onClick }: EventCardProps) {
  const Icon = EVENT_ICONS[event.type];

  if (variant === 'compact') {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        className="w-full text-left px-1.5 py-[3px] rounded text-[10px] leading-tight truncate cursor-pointer transition-all hover:brightness-125 group"
        style={{
          backgroundColor: event.color + '15',
          borderLeft: `2px solid ${event.color}`,
        }}
      >
        <span style={{ color: event.color }} className="font-medium">
          {event.title}
        </span>
      </button>
    );
  }

  // Expanded variant
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left p-3 rounded-lg transition-all cursor-pointer group',
        'bg-white/[0.03] border border-white/[0.06]',
        'hover:bg-white/[0.06] hover:border-white/[0.10]',
      )}
      style={{ borderLeftWidth: '3px', borderLeftColor: event.color }}
    >
      <div className="flex items-start gap-2.5">
        <div
          className="flex items-center justify-center w-7 h-7 rounded-md flex-shrink-0 mt-0.5"
          style={{ backgroundColor: event.color + '15' }}
        >
          <Icon className="h-3.5 w-3.5" style={{ color: event.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">{event.title}</p>
          {event.subtitle && (
            <p className="text-[11px] text-slate-400 truncate mt-0.5">{event.subtitle}</p>
          )}
          {event.parcelNames.length > 0 && (
            <div className="flex items-center gap-1 mt-1.5 flex-wrap">
              {event.parcelNames.slice(0, 3).map((name, i) => (
                <span
                  key={i}
                  className="inline-block px-1.5 py-0.5 rounded text-[9px] font-medium bg-white/[0.05] text-slate-400"
                >
                  {name}
                </span>
              ))}
              {event.parcelNames.length > 3 && (
                <span className="text-[9px] text-slate-500">
                  +{event.parcelNames.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
        {event.severity && (
          <SeverityDot severity={event.severity} />
        )}
      </div>
    </button>
  );
}

function SeverityDot({ severity }: { severity: 'low' | 'medium' | 'high' }) {
  const colors = {
    low: 'bg-yellow-400',
    medium: 'bg-orange-400',
    high: 'bg-red-400',
  };
  return (
    <span className={cn('w-2 h-2 rounded-full flex-shrink-0 mt-2', colors[severity])} />
  );
}
