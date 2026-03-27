'use client';

import { useState, useCallback, useEffect } from 'react';
import { X, Send, ExternalLink, Loader2, AlertTriangle, CheckCircle2, Edit2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { RegistrationGroupCard } from '@/components/registration-group-card';
import { confirmAllUnits } from '@/app/actions';
import { useParcels } from '@/hooks/use-data';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import type { AnalysisResult } from '@/lib/spray-pipeline';
import type { SprayRegistrationGroup } from '@/lib/types';

interface TransferModalProps {
  noteId: string;
  content: string;
  onClose: () => void;
  onTransferred: () => void;
}

type Phase = 'loading' | 'result' | 'error' | 'saving' | 'done';

export function TransferModal({ noteId, content, onClose, onTransferred }: TransferModalProps) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [editedContent, setEditedContent] = useState(content);
  const [isEditing, setIsEditing] = useState(false);
  const { data: parcels = [] } = useParcels();
  const queryClient = useQueryClient();

  const runPipeline = useCallback(async (text: string) => {
    setPhase('loading');
    setErrorMessage('');
    try {
      const res = await fetch('/api/field-notes/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Pipeline fout');

      const analysisResult: AnalysisResult = json.data;

      if (!analysisResult.registration) {
        setErrorMessage(
          analysisResult.humanSummary ||
          'Kon de registratie niet herkennen. Probeer de notitie specifieker te maken.'
        );
        setPhase('error');
        return;
      }

      setResult(analysisResult);
      setPhase('result');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Onbekende fout');
      setPhase('error');
    }
  }, []);

  // Run pipeline on mount
  useEffect(() => {
    runPipeline(content);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!result?.registration) return;
    setPhase('saving');

    try {
      const saveResult = await confirmAllUnits(result.registration as SprayRegistrationGroup);

      if (saveResult.success) {
        // Mark note as transferred
        await fetch(`/api/field-notes/${noteId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'transferred' }),
        });

        // Invalidate field-notes and spuitschrift caches
        queryClient.invalidateQueries({ queryKey: ['field-notes'] });
        queryClient.invalidateQueries({ queryKey: ['spuitschrift'] });
        queryClient.invalidateQueries({ queryKey: ['logbook'] });
        queryClient.invalidateQueries({ queryKey: ['parcel-history'] });

        setPhase('done');
        setTimeout(() => {
          onTransferred();
          onClose();
        }, 1200);
      } else {
        setErrorMessage(saveResult.message || 'Opslaan mislukt');
        setPhase('error');
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Opslaan mislukt');
      setPhase('error');
    }
  }, [result, noteId, queryClient, onTransferred, onClose]);

  const handleRetryWithEdit = useCallback(() => {
    runPipeline(editedContent);
    setIsEditing(false);
  }, [editedContent, runPipeline]);

  const allParcels = parcels.map(p => ({
    id: p.id,
    name: p.name,
    area: p.area,
    crop: p.crop,
    variety: p.variety,
  }));

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
        onClick={onClose}
      />

      {/* Modal (desktop center / mobile bottom sheet) */}
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.98 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className={cn(
          "fixed z-50 bg-[#0a1628] border border-white/[0.08] shadow-2xl",
          "md:rounded-2xl md:top-1/2 md:-translate-y-1/2 md:left-1/2 md:-translate-x-1/2 md:w-full md:max-w-2xl md:max-h-[90vh] md:overflow-y-auto",
          "max-md:rounded-t-2xl max-md:bottom-0 max-md:left-0 max-md:right-0 max-md:max-h-[90vh] max-md:overflow-y-auto"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] sticky top-0 bg-[#0a1628] z-10">
          <div className="flex items-center gap-2.5">
            <Send className="h-4 w-4 text-emerald-400" />
            <h2 className="text-sm font-semibold text-white/90">Verwerken via Slimme Invoer</h2>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-white/40 hover:text-white/70 hover:bg-white/5 transition-all"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Original note */}
        <div className="px-5 pt-4 pb-0">
          <p className="text-[10px] font-semibold text-white/25 uppercase tracking-widest mb-1.5">
            Originele notitie
          </p>
          {isEditing ? (
            <div className="space-y-2">
              <textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                rows={3}
                className="w-full bg-white/[0.04] border border-emerald-500/30 rounded-xl px-3 py-2.5 text-sm text-white/90 resize-none outline-none focus:shadow-[0_0_12px_rgba(16,185,129,0.1)]"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleRetryWithEdit}
                  className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-500/25 text-xs"
                >
                  Opnieuw analyseren
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setIsEditing(false); setEditedContent(content); }}
                  className="text-white/40 hover:text-white/70 text-xs"
                >
                  Annuleren
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm text-white/60 italic bg-white/[0.02] rounded-xl px-3 py-2.5 flex-1 border border-white/[0.05]">
                {editedContent}
              </p>
              {(phase === 'result' || phase === 'error') && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex-shrink-0 h-8 w-8 flex items-center justify-center rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-all mt-0.5"
                  title="Notitietekst aanpassen"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Content area */}
        <div className="px-5 py-4">
          <AnimatePresence mode="wait">
            {phase === 'loading' && (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center py-10 gap-3"
              >
                <Loader2 className="h-8 w-8 text-emerald-400 animate-spin" />
                <p className="text-sm text-white/40">Analyseren via Slimme Invoer...</p>
              </motion.div>
            )}

            {phase === 'error' && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5"
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-white/80 mb-1">
                      Registratie niet herkend
                    </p>
                    <p className="text-sm text-white/50 mb-4">{errorMessage}</p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setIsEditing(true)}
                        className="text-white/60 border border-white/10 hover:bg-white/5 text-xs"
                      >
                        <Edit2 className="h-3 w-3 mr-1.5" />
                        Notitie aanpassen
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        asChild
                        className="text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/10 text-xs"
                      >
                        <a href="/slimme-invoer">
                          <ExternalLink className="h-3 w-3 mr-1.5" />
                          Open Slimme Invoer
                        </a>
                      </Button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {phase === 'result' && result?.registration && (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                <p className="text-[10px] font-semibold text-white/25 uppercase tracking-widest">
                  Herkende registratie
                </p>
                <RegistrationGroupCard
                  group={result.registration as SprayRegistrationGroup}
                  allParcels={allParcels}
                  onConfirmUnit={() => {}}
                  onConfirmAll={handleConfirm}
                  onEditUnit={() => {}}
                  onRemoveUnit={() => {}}
                  onCancelAll={onClose}
                />
              </motion.div>
            )}

            {phase === 'saving' && (
              <motion.div
                key="saving"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center py-10 gap-3"
              >
                <Loader2 className="h-8 w-8 text-emerald-400 animate-spin" />
                <p className="text-sm text-white/40">Registratie opslaan...</p>
              </motion.div>
            )}

            {phase === 'done' && (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center py-10 gap-3"
              >
                <div className="h-14 w-14 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircle2 className="h-7 w-7 text-emerald-400" />
                </div>
                <p className="text-sm font-medium text-white/80">Registratie opgeslagen</p>
                <p className="text-xs text-white/35">Notitie gemarkeerd als verwerkt</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        {phase === 'result' && (
          <div className="px-5 py-4 border-t border-white/[0.06] flex gap-3 justify-end">
            <Button
              variant="ghost"
              onClick={onClose}
              className="text-white/40 hover:text-white/70"
            >
              Annuleren
            </Button>
            <Button
              onClick={handleConfirm}
              className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-500/25"
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Bevestigen &amp; opslaan
            </Button>
          </div>
        )}
      </motion.div>
    </>
  );
}
