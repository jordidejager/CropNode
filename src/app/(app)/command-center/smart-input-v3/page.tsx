'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { useSearchParams, useRouter } from 'next/navigation';
import { AutocompleteInput } from '@/components/v3/autocomplete-input';
import { QuickChips } from '@/components/v3/quick-chips';
import { ChatFeedV3 } from '@/components/v3/chat-feed-v3';
import { WizardFallback } from '@/components/v3/wizard-fallback';
import { RegistrationGroupCard } from '@/components/registration-group-card';
import { type SprayableParcel } from '@/lib/supabase-store';
import { confirmAllUnits, confirmSingleUnit, saveConversationAsDraft, loadConversation, updateConversationStatus, type ConversationData } from '@/app/actions';
import type {
    ConversationMessage,
    StreamMessageV2,
    SmartInputV2Response,
    SmartInputUserContext,
    CtgbProductSlim,
    ParcelHistorySlim,
} from '@/lib/types-v2';
import type { SprayRegistrationGroup, SprayRegistrationUnit, ProductEntry } from '@/lib/types';
import { cn } from '@/lib/utils';
import { COMMON_FERTILIZERS_CACHE } from '@/lib/fertilizer-lookup';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useInvalidateQueries } from '@/hooks/use-data';
import {
    ClipboardList,
    Check,
    X,
    Undo2,
    Loader2,
    Sparkles,
    Zap,
    Shield,
    Brain,
    Wand2,
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

interface V3State {
    messages: ConversationMessage[];
    draft: SprayRegistrationGroup | null;
    phase: 'idle' | 'processing' | 'complete' | 'error';
    draftHistory: SprayRegistrationGroup[];
    clarificationCount: number;
    showWizard: boolean;
}

// ============================================================================
// EMPTY STATUS PANEL
// ============================================================================

function EmptyStatusPanel() {
    return (
        <div className="flex flex-col items-center justify-center h-full text-center p-8 min-h-[300px]">
            <div className="relative mb-6">
                <motion.div
                    animate={{ scale: [1, 1.2, 1], opacity: [0.2, 0.1, 0.2] }}
                    transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                    className="absolute -inset-6 rounded-full border border-emerald-500/10"
                />
                <div className="relative h-14 w-14 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/20 flex items-center justify-center shadow-lg shadow-emerald-500/5">
                    <ClipboardList className="h-7 w-7 text-emerald-400" />
                </div>
            </div>
            <p className="text-sm font-medium text-white/50 mb-1.5">Geen actieve registratie</p>
            <p className="text-xs text-white/25 max-w-[220px] leading-relaxed">
                Typ je registratie en het wordt automatisch verwerkt
            </p>
            <div className="flex flex-wrap justify-center gap-2 mt-6">
                {[
                    { icon: Zap, label: 'Instant' },
                    { icon: Shield, label: 'CTGB Check' },
                    { icon: Brain, label: 'AI Backup' },
                ].map(({ icon: Icon, label }) => (
                    <div key={label} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.03] border border-white/[0.06] text-white/30 text-[10px]">
                        <Icon className="h-3 w-3" />
                        {label}
                    </div>
                ))}
            </div>
        </div>
    );
}

// ============================================================================
// PAGE COMPONENT
// ============================================================================

export default function SmartInputV3Page() {
    // State
    const [state, setState] = React.useState<V3State>({
        messages: [],
        draft: null,
        phase: 'idle',
        draftHistory: [],
        clarificationCount: 0,
        showWizard: false,
    });

    const [commandInput, setCommandInput] = React.useState('');
    const [currentPhaseLabel, setCurrentPhaseLabel] = React.useState('');
    const [toolsCalling, setToolsCalling] = React.useState<string[]>([]);
    const [toolsDone, setToolsDone] = React.useState<string[]>([]);
    const [parcels, setParcels] = React.useState<SprayableParcel[]>([]);
    const [parcelGroups, setParcelGroups] = React.useState<Array<{ name: string }>>([]);
    const [savingUnitId, setSavingUnitId] = React.useState<string | null>(null);

    // User context
    const [userContext, setUserContext] = React.useState<SmartInputUserContext | null>(null);
    const [contextLoading, setContextLoading] = React.useState(true);
    const [contextError, setContextError] = React.useState<string | null>(null);

    const { toast } = useToast();
    const { invalidateSpuitschrift, invalidateInventory, invalidateLogbook } = useInvalidateQueries();

    const abortControllerRef = React.useRef<AbortController | null>(null);
    const hasAutoSubmitted = React.useRef(false);
    const sessionIdRef = React.useRef<string | null>(null);
    const saveTimerRef = React.useRef<NodeJS.Timeout | null>(null);
    const hasLoadedSession = React.useRef(false);

    const searchParams = useSearchParams();
    const router = useRouter();
    const prefillInput = searchParams.get('input');
    const sessionParam = searchParams.get('session_id');

    // Derived
    const hasDraft = state.draft !== null;
    const hasMessages = state.messages.length > 0;

    // Fertilizers for autocomplete
    const fertilizerSuggestions = React.useMemo(() =>
        COMMON_FERTILIZERS_CACHE.map(f => ({
            name: f.name,
            category: f.type === 'bladmeststof' ? 'Bladmeststof' : 'Strooimeststof',
        })),
    []);

    // ========================================================================
    // Context Loading
    // ========================================================================

    React.useEffect(() => {
        async function loadContext() {
            try {
                setContextLoading(true);
                setContextError(null);
                const response = await fetch('/api/smart-input-v2/context');
                if (!response.ok) throw new Error(`Failed to load context: ${response.status}`);
                const context: SmartInputUserContext = await response.json();
                setUserContext(context);
                if (context.parcels) {
                    setParcels(context.parcels.map(p => ({
                        id: p.id, name: p.name, parcelId: p.id,
                        parcelName: (p as any).parcelName || (p as any).parcel_name || p.name,
                        crop: p.crop, variety: p.variety, area: p.area,
                    })) as SprayableParcel[]);
                }
                if (context.parcelGroups) {
                    setParcelGroups(context.parcelGroups.map(g => ({ name: g.name })));
                }
            } catch (error) {
                console.error('Failed to load context:', error);
                setContextError(error instanceof Error ? error.message : 'Failed to load context');
                toast({ variant: 'destructive', title: 'Context laden mislukt', description: 'Probeer de pagina te herladen.' });
            } finally {
                setContextLoading(false);
            }
        }
        loadContext();
    }, [toast]);

    // ========================================================================
    // Session Restore (load V3 draft from conversations table)
    // ========================================================================

    React.useEffect(() => {
        if (!sessionParam || hasLoadedSession.current || contextLoading) return;
        hasLoadedSession.current = true;

        async function restoreSession() {
            try {
                const result = await loadConversation(sessionParam!);
                if (!result.success || !result.data) return;

                sessionIdRef.current = sessionParam;
                const { draft_data, chat_history } = result.data;

                // Restore messages from chat history
                const restoredMessages: ConversationMessage[] = (chat_history || []).map((m: any) => ({
                    id: crypto.randomUUID(),
                    role: m.role as 'user' | 'assistant',
                    content: m.content,
                    timestamp: new Date(m.timestamp),
                }));

                // Restore full draft from V3 data
                let restoredDraft: SprayRegistrationGroup | null = null;
                if (draft_data?.fullDraft) {
                    const fd = draft_data.fullDraft;
                    restoredDraft = {
                        groupId: fd.groupId || crypto.randomUUID(),
                        date: new Date(fd.date),
                        rawInput: fd.rawInput || '',
                        registrationType: fd.registrationType,
                        units: (fd.units || []).map((u: any) => ({
                            ...u,
                            date: u.date ? new Date(u.date) : undefined,
                        })),
                    };
                }

                setState(prev => ({
                    ...prev,
                    messages: restoredMessages,
                    draft: restoredDraft,
                    phase: restoredDraft ? 'complete' : 'idle',
                }));

                // Remove session_id from URL to prevent re-loading
                router.replace('/command-center/smart-input-v3', { scroll: false });

                toast({ title: 'Concept hersteld', description: 'Je kunt verder waar je gebleven was.' });
            } catch (error) {
                console.error('[V3] Failed to restore session:', error);
            }
        }

        restoreSession();
    }, [sessionParam, contextLoading, router, toast]);

    // ========================================================================
    // Auto-Save Draft (persist V3 concepts to conversations table)
    // ========================================================================

    React.useEffect(() => {
        // Only auto-save when there's a draft and we're not processing
        if (!state.draft || state.phase === 'processing') return;
        // Don't save if all units are already confirmed (it's been saved to spuitschrift)
        if (state.draft.units.every(u => u.status === 'confirmed')) return;

        // Debounce: save 1.5 seconds after last draft change
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(async () => {
            try {
                const draft = state.draft;
                if (!draft) return;

                const allProducts = draft.units.flatMap(u => u.products);
                const allPlots = draft.units.flatMap(u => u.plots);
                const productSummary = allProducts.map(p => p.product).slice(0, 2).join(', ');
                const title = productSummary
                    ? `${productSummary} op ${allPlots.length} percelen`
                    : `${allPlots.length} percelen`;

                const data: ConversationData = {
                    id: sessionIdRef.current || undefined,
                    title,
                    draftData: {
                        version: 'v3',
                        plots: allPlots,
                        products: allProducts.map(p => ({
                            product: p.product,
                            dosage: p.dosage,
                            unit: p.unit,
                        })),
                        date: draft.date instanceof Date
                            ? draft.date.toISOString().split('T')[0]
                            : String(draft.date).split('T')[0],
                        fullDraft: serializeDraft(draft),
                    },
                    chatHistory: state.messages.map(m => ({
                        role: m.role,
                        content: m.content,
                        timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : String(m.timestamp),
                    })),
                };

                const result = await saveConversationAsDraft(data);
                if (result.success && result.id && !sessionIdRef.current) {
                    sessionIdRef.current = result.id;
                    console.log(`[V3] Auto-saved new concept: ${result.id}`);
                }
            } catch (error) {
                console.error('[V3] Auto-save failed:', error);
            }
        }, 1500);

        return () => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        };
    }, [state.draft, state.messages, state.phase]);

    // ========================================================================
    // Send Message
    // ========================================================================

    const handleSend = React.useCallback(async (text: string) => {
        if (!text.trim() || state.phase === 'processing') return;

        abortControllerRef.current?.abort();
        abortControllerRef.current = new AbortController();

        const userMessage: ConversationMessage = {
            id: crypto.randomUUID(),
            role: 'user',
            content: text,
            timestamp: new Date(),
        };

        setState(prev => ({
            ...prev,
            messages: [...prev.messages, userMessage],
            phase: 'processing',
        }));

        setCommandInput('');
        setCurrentPhaseLabel('Verwerken...');
        setToolsCalling([]);
        setToolsDone([]);

        try {
            const response = await fetch('/api/smart-input-v3', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: text,
                    conversationHistory: state.messages.map(m => ({
                        ...m,
                        timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : String(m.timestamp),
                    })),
                    currentDraft: state.draft ? serializeDraft(state.draft) : null,
                }),
                signal: abortControllerRef.current.signal,
            });

            if (!response.ok) {
                let serverError = '';
                try { serverError = await response.text(); } catch { /* ignore */ }
                console.error(`[V3 Client] API returned ${response.status}:`, serverError);
                throw new Error(`API ${response.status}: ${serverError || response.statusText}`);
            }

            const reader = response.body?.getReader();
            if (!reader) throw new Error('No response body');

            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const message: StreamMessageV2 = JSON.parse(line);
                        handleStreamMessage(message);
                    } catch (e) {
                        console.error('[V3 Client] Failed to parse stream message:', line, e);
                    }
                }
            }

            // Check if remaining buffer has content
            if (buffer.trim()) {
                try {
                    const message: StreamMessageV2 = JSON.parse(buffer);
                    handleStreamMessage(message);
                } catch (e) {
                    console.error('[V3 Client] Failed to parse final buffer:', buffer, e);
                }
            }
        } catch (error) {
            if ((error as Error).name === 'AbortError') return;
            const errMsg = error instanceof Error ? error.message : String(error);
            console.error('[V3 Client] Request failed:', errMsg);

            const errorMessage: ConversationMessage = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: `Fout: ${errMsg}`,
                timestamp: new Date(),
            };

            setState(prev => ({
                ...prev,
                messages: [...prev.messages, errorMessage],
                phase: 'error',
            }));
        }
    }, [state.messages, state.draft, state.phase]);

    // ========================================================================
    // Stream Message Handler
    // ========================================================================

    const handleStreamMessage = React.useCallback((message: StreamMessageV2) => {
        switch (message.type) {
            case 'processing':
                setCurrentPhaseLabel(message.phase);
                break;
            case 'tool_call':
                setToolsCalling(prev => [...prev, message.tool]);
                break;
            case 'tool_result':
                setToolsCalling(prev => prev.filter(t => t !== message.tool));
                setToolsDone(prev => [...prev, message.tool]);
                break;
            case 'complete':
                handleCompleteResponse(message.response);
                break;
            case 'error':
                setState(prev => ({
                    ...prev,
                    messages: [...prev.messages, {
                        id: crypto.randomUUID(),
                        role: 'assistant',
                        content: message.message,
                        timestamp: new Date(),
                    }],
                    phase: 'error',
                }));
                break;
        }
    }, []);

    // ========================================================================
    // Complete Response Handler
    // ========================================================================

    const handleCompleteResponse = React.useCallback((response: SmartInputV2Response) => {
        const assistantMessage: ConversationMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: response.humanSummary || '',
            timestamp: new Date(),
            validationFlags: response.validationFlags,
            toolsCalled: response.toolsCalled,
            clarification: response.clarification,
        };

        setState(prev => {
            const newState: V3State = {
                ...prev,
                messages: [...prev.messages, assistantMessage],
                phase: 'complete',
                clarificationCount: prev.clarificationCount,
                showWizard: prev.showWizard,
            };

            if (response.registration) {
                if (prev.draft) {
                    newState.draftHistory = [...prev.draftHistory.slice(-19), prev.draft];
                }
                newState.draft = response.registration;
            }

            switch (response.action) {
                case 'confirm_and_save':
                    if (newState.draft) {
                        newState.draft = {
                            ...newState.draft,
                            units: newState.draft.units.map(u => ({ ...u, status: 'confirmed' as const })),
                        };
                    }
                    invalidateSpuitschrift();
                    invalidateInventory();
                    invalidateLogbook();
                    break;

                case 'cancel':
                    newState.draft = null;
                    newState.draftHistory = [];
                    break;

                case 'clarification_needed':
                    newState.clarificationCount = prev.clarificationCount + 1;
                    // Offer wizard after 2 clarifications
                    if (newState.clarificationCount >= 2) {
                        newState.showWizard = true;
                    }
                    break;
            }

            return newState;
        });

        setToolsCalling([]);
    }, [invalidateSpuitschrift, invalidateInventory, invalidateLogbook]);

    // ========================================================================
    // Auto-submit from URL params
    // ========================================================================

    React.useEffect(() => {
        if (!contextLoading && prefillInput && !hasAutoSubmitted.current) {
            hasAutoSubmitted.current = true;
            setCommandInput(prefillInput);
            router.replace('/command-center/smart-input-v3', { scroll: false });
            const timer = setTimeout(() => handleSend(prefillInput), 300);
            return () => clearTimeout(timer);
        }
    }, [contextLoading, prefillInput, handleSend, router]);

    // ========================================================================
    // Action Handlers
    // ========================================================================

    const handleUndo = React.useCallback(() => {
        setState(prev => {
            if (prev.draftHistory.length === 0) return prev;
            const history = [...prev.draftHistory];
            const previousDraft = history.pop();
            return {
                ...prev,
                draft: previousDraft || null,
                draftHistory: history,
                messages: [...prev.messages, {
                    id: crypto.randomUUID(),
                    role: 'assistant',
                    content: 'Laatste wijziging ongedaan gemaakt.',
                    timestamp: new Date(),
                }],
            };
        });
    }, []);

    const handleClarificationSelect = React.useCallback((option: string) => {
        if (option === '__custom__') return;
        handleSend(option);
    }, [handleSend]);

    const handleConfirmUnit = React.useCallback(async (unit: SprayRegistrationUnit) => {
        if (!state.draft) return;
        setSavingUnitId(unit.id);
        try {
            const unitDate = unit.date || state.draft.date;
            const result = await confirmSingleUnit(unit, unitDate, state.draft.rawInput || '');
            if (result.success) {
                setState(prev => ({
                    ...prev,
                    draft: prev.draft ? {
                        ...prev.draft,
                        units: prev.draft.units.map(u =>
                            u.id === unit.id ? { ...u, status: 'confirmed' as const } : u
                        ),
                    } : null,
                }));
                toast({ title: 'Opgeslagen', description: 'Registratie bevestigd.' });
                invalidateSpuitschrift();
                invalidateInventory();
                invalidateLogbook();
            } else {
                throw new Error(result.message || 'Failed to save');
            }
        } catch (error) {
            console.error('Error confirming unit:', error);
            toast({ variant: 'destructive', title: 'Fout', description: 'Kon niet opslaan.' });
        } finally {
            setSavingUnitId(null);
        }
    }, [state.draft, toast, invalidateSpuitschrift, invalidateInventory, invalidateLogbook]);

    const handleConfirmAll = React.useCallback(async () => {
        if (!state.draft) return;
        const unconfirmedUnits = state.draft.units.filter(u => u.status !== 'confirmed');
        if (unconfirmedUnits.length === 0) { toast({ title: 'Alles al bevestigd' }); return; }

        setSavingUnitId('all');
        try {
            const result = await confirmAllUnits(state.draft);
            if (result.success) {
                setState(prev => ({
                    ...prev,
                    draft: prev.draft ? {
                        ...prev.draft,
                        units: prev.draft.units.map(u => ({ ...u, status: 'confirmed' as const })),
                    } : null,
                }));
                toast({ title: 'Opgeslagen', description: `${unconfirmedUnits.length} registratie(s) bevestigd.` });
                invalidateSpuitschrift();
                invalidateInventory();
                invalidateLogbook();
                // Mark conversation as completed
                if (sessionIdRef.current) {
                    updateConversationStatus(sessionIdRef.current, 'completed').catch(err =>
                        console.error('[V3] Failed to update conversation status:', err)
                    );
                }
            } else {
                throw new Error(result.message || 'Failed to save');
            }
        } catch (error) {
            console.error('Error confirming all units:', error);
            toast({ variant: 'destructive', title: 'Fout', description: 'Kon niet opslaan.' });
        } finally {
            setSavingUnitId(null);
        }
    }, [state.draft, toast, invalidateSpuitschrift, invalidateInventory, invalidateLogbook]);

    const handleCancelDraft = React.useCallback(() => {
        setState(prev => ({
            ...prev,
            draft: null,
            draftHistory: [],
            messages: [...prev.messages, {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: 'Registratie geannuleerd.',
                timestamp: new Date(),
            }],
        }));
        toast({ title: 'Geannuleerd' });
    }, [toast]);

    const handleEditUnit = React.useCallback((unit: SprayRegistrationUnit) => {
        const parcelCount = unit.plots.length;
        setCommandInput(`Wijzig de registratie voor ${unit.label || `${parcelCount} percelen`}`);
    }, []);

    const handleRemoveUnit = React.useCallback((unitId: string) => {
        setState(prev => {
            if (!prev.draft) return prev;
            const newUnits = prev.draft.units.filter(u => u.id !== unitId);
            if (newUnits.length === 0) {
                return { ...prev, draft: null, draftHistory: [...prev.draftHistory.slice(-19), prev.draft] };
            }
            return {
                ...prev,
                draft: { ...prev.draft, units: newUnits },
                draftHistory: [...prev.draftHistory.slice(-19), prev.draft],
            };
        });
        toast({ title: 'Verwijderd' });
    }, [toast]);

    const handleProductUpdate = React.useCallback((unitId: string, productIndex: number, update: Partial<ProductEntry>) => {
        setState(prev => {
            if (!prev.draft) return prev;
            const newUnits = prev.draft.units.map(u => {
                if (u.id !== unitId) return u;
                const newProducts = [...u.products];
                if (productIndex >= 0 && productIndex < newProducts.length) {
                    newProducts[productIndex] = { ...newProducts[productIndex], ...update };
                }
                return { ...u, products: newProducts };
            });
            return { ...prev, draft: { ...prev.draft, units: newUnits } };
        });
    }, []);

    // Wizard complete handler
    const handleWizardComplete = React.useCallback((registration: SprayRegistrationGroup) => {
        setState(prev => ({
            ...prev,
            draft: registration,
            showWizard: false,
            clarificationCount: 0,
            draftHistory: prev.draft ? [...prev.draftHistory.slice(-19), prev.draft] : prev.draftHistory,
            messages: [...prev.messages, {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: 'Registratie aangemaakt via wizard. Controleer en bevestig.',
                timestamp: new Date(),
                toolsCalled: ['wizard'],
            }],
            phase: 'complete',
        }));
    }, []);

    // Quick chip handler
    const handleQuickChipSelect = React.useCallback((text: string) => {
        handleSend(text);
    }, [handleSend]);

    // ========================================================================
    // Status Panel
    // ========================================================================

    const statusPanelContent = state.draft ? (
        <RegistrationGroupCard
            group={state.draft}
            allParcels={parcels}
            savingUnitId={savingUnitId}
            onConfirmUnit={handleConfirmUnit}
            onConfirmAll={handleConfirmAll}
            onEditUnit={handleEditUnit}
            onRemoveUnit={handleRemoveUnit}
            onCancelAll={handleCancelDraft}
            onProductUpdate={handleProductUpdate}
        />
    ) : (
        <EmptyStatusPanel />
    );

    // ========================================================================
    // Loading / Error States
    // ========================================================================

    if (contextLoading) {
        return (
            <div className="h-[calc(100vh-64px)] flex flex-col items-center justify-center gap-4 -m-4 md:-m-6 relative">
                <div className="relative">
                    <motion.div
                        animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.1, 0.3] }}
                        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                        className="absolute -inset-4 rounded-full bg-emerald-500/10 blur-lg"
                    />
                    <div className="relative h-16 w-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/20 flex items-center justify-center">
                        <Loader2 className="h-8 w-8 text-emerald-400 animate-spin" />
                    </div>
                </div>
                <div className="text-center mt-2">
                    <p className="text-sm font-medium text-white/60">Context laden...</p>
                    <p className="text-xs text-white/30 mt-1">Percelen, producten & historie</p>
                </div>
            </div>
        );
    }

    if (contextError) {
        return (
            <div className="h-[calc(100vh-64px)] flex flex-col items-center justify-center gap-4 -m-4 md:-m-6">
                <div className="h-16 w-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center shadow-lg shadow-red-500/5">
                    <X className="h-8 w-8 text-red-400" />
                </div>
                <p className="text-sm font-medium text-white/60">Kon context niet laden</p>
                <Button variant="outline" size="sm" onClick={() => window.location.reload()} className="border-white/10 hover:bg-white/5">
                    Pagina herladen
                </Button>
            </div>
        );
    }

    // ========================================================================
    // RENDER
    // ========================================================================

    const isMobileStartScreen = !hasMessages && !hasDraft && !state.showWizard;

    return (
        <div className="h-[calc(100vh-64px)] flex flex-col md:grid md:grid-cols-12 gap-0 overflow-hidden -m-4 md:-m-6 relative">
            {/* Ambient background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute inset-0 opacity-[0.015]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '48px 48px' }} />
                <div className="absolute top-1/4 -left-32 w-64 h-64 bg-emerald-500/[0.03] rounded-full blur-[100px]" />
                <div className="absolute bottom-1/3 -right-32 w-72 h-72 bg-teal-500/[0.02] rounded-full blur-[120px]" />
            </div>

            {/* MOBILE START SCREEN */}
            {isMobileStartScreen && (
                <div className="md:hidden flex flex-col h-full relative z-10">
                    <div className="flex-1 flex flex-col justify-center px-4 pb-8">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex items-center gap-3 mb-6"
                        >
                            <div className="relative">
                                <div className="absolute -inset-1 bg-emerald-500/20 rounded-2xl blur-md" />
                                <div className="relative h-12 w-12 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/25 flex items-center justify-center shrink-0">
                                    <Sparkles className="h-6 w-6 text-emerald-400" />
                                </div>
                            </div>
                            <div>
                                <h1 className="text-xl font-bold text-white">Hallo!</h1>
                                <p className="text-sm text-white/50">Slimme Invoer 3.0</p>
                            </div>
                        </motion.div>

                        {/* Quick chips */}
                        <div className="mb-4">
                            <QuickChips
                                recentHistory={userContext?.recentHistory || []}
                                onSelect={handleQuickChipSelect}
                                disabled={state.phase === 'processing'}
                            />
                        </div>

                        <AutocompleteInput
                            value={commandInput}
                            onValueChange={setCommandInput}
                            onSend={handleSend}
                            isProcessing={state.phase === 'processing'}
                            products={userContext?.products || []}
                            fertilizers={fertilizerSuggestions}
                            parcels={parcels}
                            parcelGroups={parcelGroups}
                        />
                    </div>
                </div>
            )}

            {/* MOBILE CHAT SCREEN */}
            {!isMobileStartScreen && (
                <div className="md:hidden flex-1 h-full bg-black/20 overflow-hidden flex flex-col">
                    {/* Wizard or Chat */}
                    {state.showWizard ? (
                        <div className="flex-1 overflow-y-auto p-3">
                            <WizardFallback
                                parcels={parcels}
                                products={userContext?.products || []}
                                onComplete={handleWizardComplete}
                                onCancel={() => setState(prev => ({ ...prev, showWizard: false }))}
                                onSwitchToChat={() => setState(prev => ({ ...prev, showWizard: false, clarificationCount: 0 }))}
                            />
                        </div>
                    ) : (
                        <>
                            <div className={cn("flex-1 overflow-y-auto", hasDraft && "pb-2")}>
                                <ChatFeedV3
                                    messages={state.messages}
                                    phase={state.phase}
                                    currentPhaseLabel={currentPhaseLabel}
                                    toolsCalling={toolsCalling}
                                    toolsDone={toolsDone}
                                    onClarificationSelect={handleClarificationSelect}
                                />
                            </div>

                            {/* Inline draft panel on mobile */}
                            {hasDraft && (
                                <div className="border-t border-white/10 bg-[#0A0A0A] max-h-[40vh] overflow-y-auto">
                                    <div className="p-3 border-b border-white/[0.06] flex items-center justify-between sticky top-0 bg-[#0A0A0A] z-10">
                                        <div className="flex items-center gap-2">
                                            <ClipboardList className="h-4 w-4 text-emerald-500" />
                                            <span className="text-sm font-medium text-white/80">Actieve Registratie</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {state.draftHistory.length > 0 && (
                                                <Button variant="ghost" size="sm" onClick={handleUndo} className="h-7 px-2 text-white/50 hover:text-white hover:bg-white/5">
                                                    <Undo2 className="h-3.5 w-3.5" />
                                                </Button>
                                            )}
                                            <Badge className={cn("text-[10px]",
                                                state.draft?.units.every(u => u.status === 'confirmed')
                                                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                                    : 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                                            )}>
                                                {state.draft?.units.every(u => u.status === 'confirmed') ? 'Bevestigd' : 'Te bevestigen'}
                                            </Badge>
                                        </div>
                                    </div>
                                    <div className="max-w-full overflow-hidden">
                                        {statusPanelContent}
                                    </div>
                                    <div className="p-3 border-t border-white/[0.06] flex gap-2 sticky bottom-0 bg-[#0A0A0A]">
                                        <Button onClick={handleCancelDraft} variant="ghost" size="sm" className="text-white/50 hover:text-white hover:bg-white/5">
                                            <X className="h-4 w-4 mr-1" />
                                            Annuleer
                                        </Button>
                                        <Button onClick={handleConfirmAll} size="sm" disabled={savingUnitId !== null} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white">
                                            {savingUnitId !== null ? (
                                                <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Opslaan...</>
                                            ) : (
                                                <><Check className="h-4 w-4 mr-1" />Alles Bevestigen</>
                                            )}
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {/* Wizard suggestion after 2 clarifications */}
                            {state.clarificationCount >= 2 && !state.showWizard && !hasDraft && (
                                <div className="px-3 pb-2">
                                    <button
                                        onClick={() => setState(prev => ({ ...prev, showWizard: true }))}
                                        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs hover:bg-amber-500/15 transition-colors"
                                    >
                                        <Wand2 className="h-3.5 w-3.5" />
                                        Lukt het niet? Gebruik de stapsgewijze wizard
                                    </button>
                                </div>
                            )}
                        </>
                    )}

                    {/* Input (always visible except in wizard mode) */}
                    {!state.showWizard && (
                        <div className="p-3 border-t border-white/[0.06] bg-black/40">
                            <AutocompleteInput
                                value={commandInput}
                                onValueChange={setCommandInput}
                                onSend={handleSend}
                                isProcessing={state.phase === 'processing'}
                                products={userContext?.products || []}
                                fertilizers={fertilizerSuggestions}
                                parcels={parcels}
                                parcelGroups={parcelGroups}
                            />
                        </div>
                    )}
                </div>
            )}

            {/* DESKTOP: Left column (7 cols) - Chat */}
            <div className="hidden md:flex md:col-span-7 h-full md:border-r border-white/[0.06] relative z-10 overflow-hidden flex-col">
                {/* Header */}
                <div className="px-5 py-3.5 border-b border-white/[0.06] flex items-center justify-between bg-black/30 backdrop-blur-xl">
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <div className="absolute -inset-0.5 bg-emerald-500/20 rounded-lg blur-sm" />
                            <div className="relative h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/25 flex items-center justify-center">
                                <Sparkles className="h-4 w-4 text-emerald-400" />
                            </div>
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-white/90">Slimme Invoer</span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 font-medium border border-emerald-500/20">
                                    3.0
                                </span>
                            </div>
                            <span className="text-[11px] text-white/30">Instant + AI registratie</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {state.phase === 'processing' && (
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                                <span className="relative flex h-1.5 w-1.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                                </span>
                                <span className="text-[10px] text-emerald-400 font-medium">Verwerken</span>
                            </div>
                        )}
                        <span className="text-[11px] text-white/25">{state.messages.length} berichten</span>
                    </div>
                </div>

                {/* Chat Content */}
                <div className="flex-1 overflow-y-auto">
                    {!hasMessages && !state.showWizard ? (
                        // Empty state with quick chips
                        <div className="flex flex-col items-center justify-center h-full px-6">
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="text-center mb-8"
                            >
                                <div className="relative inline-flex mb-4">
                                    <div className="absolute -inset-2 bg-emerald-500/10 rounded-2xl blur-lg" />
                                    <div className="relative h-14 w-14 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/25 flex items-center justify-center">
                                        <Sparkles className="h-7 w-7 text-emerald-400" />
                                    </div>
                                </div>
                                <h2 className="text-lg font-bold text-white mb-1">Slimme Invoer 3.0</h2>
                                <p className="text-sm text-white/40 max-w-md">
                                    Typ wat je hebt gespoten en de registratie wordt automatisch aangemaakt. De meeste invoer wordt direct verwerkt.
                                </p>
                            </motion.div>

                            <div className="w-full max-w-md">
                                <QuickChips
                                    recentHistory={userContext?.recentHistory || []}
                                    onSelect={handleQuickChipSelect}
                                    disabled={state.phase === 'processing'}
                                />
                            </div>
                        </div>
                    ) : state.showWizard ? (
                        <div className="p-4">
                            <WizardFallback
                                parcels={parcels}
                                products={userContext?.products || []}
                                onComplete={handleWizardComplete}
                                onCancel={() => setState(prev => ({ ...prev, showWizard: false }))}
                                onSwitchToChat={() => setState(prev => ({ ...prev, showWizard: false, clarificationCount: 0 }))}
                            />
                        </div>
                    ) : (
                        <ChatFeedV3
                            messages={state.messages}
                            phase={state.phase}
                            currentPhaseLabel={currentPhaseLabel}
                            toolsCalling={toolsCalling}
                            toolsDone={toolsDone}
                            onClarificationSelect={handleClarificationSelect}
                        />
                    )}
                </div>

                {/* Wizard suggestion */}
                {state.clarificationCount >= 2 && !state.showWizard && !hasDraft && (
                    <div className="px-4 pb-2">
                        <button
                            onClick={() => setState(prev => ({ ...prev, showWizard: true }))}
                            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs hover:bg-amber-500/15 transition-colors"
                        >
                            <Wand2 className="h-3.5 w-3.5" />
                            Lukt het niet? Gebruik de stapsgewijze wizard
                        </button>
                    </div>
                )}

                {/* Input Area */}
                {!state.showWizard && (
                    <div className="relative border-t border-white/[0.06]">
                        <div className="absolute inset-x-0 -top-8 h-8 bg-gradient-to-t from-[#0A0A0A]/80 to-transparent pointer-events-none" />
                        <div className="relative bg-black/50 backdrop-blur-xl">
                            <AutocompleteInput
                                value={commandInput}
                                onValueChange={setCommandInput}
                                onSend={handleSend}
                                isProcessing={state.phase === 'processing'}
                                products={userContext?.products || []}
                                fertilizers={fertilizerSuggestions}
                                parcels={parcels}
                                parcelGroups={parcelGroups}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* DESKTOP: Right column (5 cols) - Status Panel */}
            <div className="hidden md:flex md:flex-col md:col-span-5 h-full relative z-10 overflow-hidden">
                {/* Status Header */}
                <div className="px-5 py-3.5 border-b border-white/[0.06] flex items-center justify-between bg-black/30 backdrop-blur-xl">
                    <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
                            <ClipboardList className="h-4 w-4 text-emerald-400" />
                        </div>
                        <span className="text-sm font-semibold text-white/80">Actieve Registratie</span>
                    </div>
                    <div className="flex items-center gap-2">
                        {state.draftHistory.length > 0 && (
                            <Button variant="ghost" size="sm" onClick={handleUndo} className="h-7 px-2 text-white/40 hover:text-white hover:bg-white/5">
                                <Undo2 className="h-3.5 w-3.5 mr-1" />
                                <span className="text-xs">Undo</span>
                            </Button>
                        )}
                        {state.draft && (
                            <Badge className={cn("text-[10px] font-medium",
                                state.draft.units.every(u => u.status === 'confirmed')
                                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
                                    : 'bg-blue-500/15 text-blue-400 border-blue-500/25'
                            )}>
                                {state.draft.units.every(u => u.status === 'confirmed') ? 'Bevestigd' : 'Te bevestigen'}
                            </Badge>
                        )}
                    </div>
                </div>

                {/* Status Content */}
                <div className="flex-1 overflow-y-auto bg-white/[0.01]">
                    {statusPanelContent}
                </div>
            </div>
        </div>
    );
}

// ============================================================================
// HELPERS
// ============================================================================

function serializeDraft(draft: SprayRegistrationGroup): any {
    return {
        groupId: draft.groupId,
        date: draft.date instanceof Date
            ? draft.date.toISOString().split('T')[0]
            : String(draft.date).split('T')[0],
        rawInput: draft.rawInput,
        registrationType: draft.registrationType,
        units: draft.units.map(u => ({
            id: u.id,
            plots: u.plots,
            products: u.products,
            label: u.label,
            status: u.status,
            date: u.date
                ? (u.date instanceof Date ? u.date.toISOString().split('T')[0] : String(u.date).split('T')[0])
                : undefined,
        })),
    };
}
