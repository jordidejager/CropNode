'use client';

import { format, parseISO } from 'date-fns';
import { nl } from 'date-fns/locale';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import {
  EVENT_COLORS, EVENT_LABELS, EVENT_ICONS,
  type CalendarEvent,
} from './types';

interface EventDetailProps {
  event: CalendarEvent | null;
  onClose: () => void;
}

export function EventDetail({ event, onClose }: EventDetailProps) {
  if (!event) return null;

  const Icon = EVENT_ICONS[event.type];
  const color = EVENT_COLORS[event.type];

  return (
    <Sheet open={!!event} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="sm:max-w-md overflow-y-auto">
        <SheetHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center w-10 h-10 rounded-xl"
              style={{ backgroundColor: color + '15' }}
            >
              <Icon className="h-5 w-5" style={{ color }} />
            </div>
            <div className="flex-1">
              <Badge
                variant="outline"
                className="mb-1 text-[10px]"
                style={{ borderColor: color + '40', color }}
              >
                {EVENT_LABELS[event.type]}
              </Badge>
              <SheetTitle className="text-lg">{event.title}</SheetTitle>
            </div>
          </div>
          <SheetDescription className="text-sm text-slate-400">
            {formatEventDate(event)}
          </SheetDescription>
        </SheetHeader>

        {/* Parcel Names */}
        {event.parcelNames.length > 0 && (
          <Section title="Percelen">
            <div className="flex flex-wrap gap-1.5">
              {event.parcelNames.map((name, i) => (
                <Badge key={i} variant="secondary" className="text-xs">
                  {name}
                </Badge>
              ))}
            </div>
          </Section>
        )}

        {/* Type-specific content */}
        {event.type === 'spray' && <SprayDetail metadata={event.metadata} />}
        {event.type === 'harvest' && <HarvestDetail metadata={event.metadata} />}
        {event.type === 'task' && <TaskDetail metadata={event.metadata} />}
        {event.type === 'disease' && <DiseaseDetail metadata={event.metadata} />}
        {event.type === 'phenology' && <PhenologyDetail metadata={event.metadata} />}
        {event.type === 'weather_alert' && <WeatherAlertDetail metadata={event.metadata} />}
        {event.type === 'field_note' && <FieldNoteDetail metadata={event.metadata} />}
      </SheetContent>
    </Sheet>
  );
}

// ============================================================================
// Shared Components
// ============================================================================

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-3 border-t border-white/[0.06]">
      <h4 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
        {title}
      </h4>
      {children}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-sm text-white font-medium">{value}</span>
    </div>
  );
}

function formatEventDate(event: CalendarEvent): string {
  try {
    const date = parseISO(event.date);
    const formatted = format(date, 'EEEE d MMMM yyyy', { locale: nl });
    if (event.endDate && event.endDate !== event.date) {
      const endDate = parseISO(event.endDate);
      return `${formatted} – ${format(endDate, 'd MMMM yyyy', { locale: nl })}`;
    }
    return formatted;
  } catch {
    return event.date;
  }
}

// ============================================================================
// Type-Specific Detail Components
// ============================================================================

function SprayDetail({ metadata }: { metadata: Record<string, unknown> }) {
  const products = (metadata.products || []) as any[];
  const regType = metadata.registrationType as string;

  return (
    <>
      <Section title="Middelen">
        <div className="space-y-2">
          {products.map((p: any, i: number) => (
            <div
              key={i}
              className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02] border border-white/[0.04]"
            >
              <div>
                <p className="text-sm text-white font-medium">{p.product || p.name}</p>
                {p.doelorganisme && (
                  <p className="text-[11px] text-slate-500 mt-0.5">Doel: {p.doelorganisme}</p>
                )}
              </div>
              <span className="text-sm text-slate-300 font-mono">
                {p.dosage} {p.unit}
              </span>
            </div>
          ))}
        </div>
      </Section>
      {regType && (
        <Section title="Type">
          <DetailRow
            label="Registratietype"
            value={regType === 'spraying' ? 'Bespuiting' : 'Strooien'}
          />
        </Section>
      )}
    </>
  );
}

function HarvestDetail({ metadata }: { metadata: Record<string, unknown> }) {
  return (
    <Section title="Oogstdetails">
      <DetailRow label="Ras" value={String(metadata.variety ?? '')} />
      <DetailRow label="Pluknummer" value={`Pluk ${metadata.pickNumber}`} />
      <DetailRow label="Kisten" value={String(metadata.totalCrates ?? 0)} />
      {!!metadata.qualityClass && (
        <DetailRow label="Kwaliteitsklasse" value={String(metadata.qualityClass)} />
      )}
      {!!metadata.weightPerCrate && (
        <DetailRow label="Gewicht per kist" value={`${metadata.weightPerCrate} kg`} />
      )}
    </Section>
  );
}

function TaskDetail({ metadata }: { metadata: Record<string, unknown> }) {
  return (
    <Section title="Taakdetails">
      <DetailRow label="Taak" value={String(metadata.taskTypeName ?? '')} />
      <DetailRow label="Dagen" value={String(metadata.days ?? 0)} />
      <DetailRow label="Personen" value={String(metadata.peopleCount ?? 0)} />
      <DetailRow label="Uren/persoon" value={`${metadata.hoursPerPerson}u`} />
      <DetailRow label="Totaal uren" value={`${metadata.totalHours}u`} />
      {!!metadata.estimatedCost && (
        <DetailRow
          label="Geschatte kosten"
          value={`€${Number(metadata.estimatedCost).toFixed(0)}`}
        />
      )}
      {!!metadata.notes && (
        <div className="mt-2">
          <p className="text-xs text-slate-500 mb-1">Notities</p>
          <p className="text-sm text-slate-300">{String(metadata.notes)}</p>
        </div>
      )}
    </Section>
  );
}

function DiseaseDetail({ metadata }: { metadata: Record<string, unknown> }) {
  const severityColors: Record<string, string> = {
    light: 'bg-yellow-500/20 text-yellow-400',
    moderate: 'bg-orange-500/20 text-orange-400',
    severe: 'bg-red-500/20 text-red-400',
  };
  const severity = metadata.severity as string;

  return (
    <Section title="Infectiedetails">
      <div className="flex items-center gap-2 mb-3">
        <Badge className={severityColors[severity] || 'bg-slate-500/20 text-slate-400'}>
          {severity === 'light' ? 'Licht' : severity === 'moderate' ? 'Matig' : 'Zwaar'}
        </Badge>
        {!!metadata.isForecast && (
          <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-400">
            Voorspelling
          </Badge>
        )}
      </div>
      <DetailRow label="Duur natperiode" value={`${metadata.durationHours}u`} />
      <DetailRow label="Gem. temperatuur" value={`${Number(metadata.avgTemperature ?? 0).toFixed(1)}°C`} />
      <DetailRow label="RIM waarde" value={String(Number(metadata.rimValue ?? 0).toFixed(0))} />
      <DetailRow label="PAM" value={`${(Number(metadata.pamAtEvent ?? 0) * 100).toFixed(1)}%`} />
      {!!metadata.expectedSymptomDate && (
        <DetailRow label="Verwachte symptomen" value={String(metadata.expectedSymptomDate)} />
      )}
    </Section>
  );
}

function PhenologyDetail({ metadata }: { metadata: Record<string, unknown> }) {
  const stageLabels: Record<string, string> = {
    F1: 'Start bloei (F1)',
    F2: 'Volle bloei (F2)',
    G: 'Einde bloei / bloembladverlies (G)',
  };
  return (
    <Section title="Fenologie">
      <DetailRow label="Stadium" value={stageLabels[String(metadata.stage)] || String(metadata.stage)} />
      <DetailRow label="Gewas" value={String(metadata.referenceCrop ?? '')} />
      <DetailRow label="Jaar" value={String(metadata.year ?? '')} />
    </Section>
  );
}

function WeatherAlertDetail({ metadata }: { metadata: Record<string, unknown> }) {
  const alertLabels: Record<string, string> = {
    frost: 'Vorstwaarschuwing',
    spray_window: 'Spuitvenster gedetecteerd',
    extreme_rain: 'Extreme neerslag verwacht',
  };
  return (
    <Section title="Waarschuwing">
      <DetailRow label="Type" value={alertLabels[String(metadata.alertType)] || String(metadata.alertType)} />
      {!!metadata.sentAt && (
        <DetailRow
          label="Verzonden"
          value={format(parseISO(String(metadata.sentAt)), 'd MMM HH:mm', { locale: nl })}
        />
      )}
    </Section>
  );
}

function FieldNoteDetail({ metadata }: { metadata: Record<string, unknown> }) {
  const tagLabels: Record<string, string> = {
    bespuiting: 'Bespuiting',
    bemesting: 'Bemesting',
    taak: 'Taak',
    waarneming: 'Waarneming',
    overig: 'Overig',
  };
  const categoryLabels: Record<string, string> = {
    insect: 'Insect',
    schimmel: 'Schimmel',
    ziekte: 'Ziekte',
    fysiologisch: 'Fysiologisch',
    overig: 'Overig',
  };

  return (
    <>
      <Section title="Notitie">
        <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
          {String(metadata.content ?? '')}
        </p>
      </Section>
      <Section title="Details">
        {!!metadata.autoTag && (
          <DetailRow label="Tag" value={tagLabels[String(metadata.autoTag)] || String(metadata.autoTag)} />
        )}
        {!!metadata.observationCategory && (
          <DetailRow
            label="Categorie"
            value={categoryLabels[String(metadata.observationCategory)] || String(metadata.observationCategory)}
          />
        )}
        {!!metadata.observationSubject && (
          <DetailRow label="Onderwerp" value={String(metadata.observationSubject)} />
        )}
        <DetailRow
          label="Bron"
          value={metadata.source === 'whatsapp' ? 'WhatsApp' : metadata.source === 'voice' ? 'Spraak' : 'Web'}
        />
        <DetailRow label="Status" value={String(metadata.status ?? 'open')} />
      </Section>
      {!!metadata.photoUrl && (
        <Section title="Foto">
          <div className="rounded-lg overflow-hidden border border-white/[0.06]">
            <img
              src={String(metadata.photoUrl)}
              alt="Veldnotitie foto"
              className="w-full h-auto"
            />
          </div>
        </Section>
      )}
    </>
  );
}
