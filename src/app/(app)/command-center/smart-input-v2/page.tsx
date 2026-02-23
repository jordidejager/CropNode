'use client';

import * as React from 'react';
import { CommandBar } from '@/components/command-bar';
import { SmartInvoerFeedV2 } from '@/components/v2/smart-invoer-feed-v2';
import { ClarificationOptions } from '@/components/v2/clarification-options';
import { RegistrationGroupCard } from '@/components/registration-group-card';
import { type SprayableParcel } from '@/lib/supabase-store';
import { confirmAllUnits, confirmSingleUnit } from '@/app/actions';
import type { InputMode } from '@/components/mode-selector';
import type {
    SmartInputV2State,
    SmartInputV2Response,
    ConversationMessage,
    StreamMessageV2,
    ClarificationRequest,
    SmartInputUserContext,
} from '@/lib/types-v2';
import type { SprayRegistrationGroup, SprayRegistrationUnit } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
    MessageSquare,
    ClipboardList,
    Bot,
    Check,
    X,
    Undo2,
    Loader2,
} from 'lucide-react';

// ============================================================================
// EMPTY STATUS PANEL - Shown when no active registration
// ============================================================================

function EmptyStatusPanel() {
    return (
        <div className="flex flex-col items-center justify-center h-full text-center p-6 min-h-[300px]">
            <div className="h-12 w-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4">
                <ClipboardList className="h-6 w-6 text-emerald-400" />
            </div>
            <p className="text-sm text-white/40 mb-1">Geen actieve registratie</p>
            <p className="text-xs text-white/20 max-w-[200px]">
                Typ je registratie in de chat om te beginnen
            </p>
        </div>
    );
}

// ============================================================================
// PAGE COMPONENT
// ============================================================================

export default function SmartInputV2Page() {
    // State
    const [state, setState] = React.useState<SmartInputV2State>({
        messages: [],
        draft: null,
        phase: 'idle',
        isAgentMode: false,
        draftHistory: [],
    });

    const [commandInput, setCommandInput] = React.useState('');
    const [activeMode, setActiveMode] = React.useState<InputMode>('registration');
    const [currentPhaseLabel, setCurrentPhaseLabel] = React.useState<string>('');
    const [toolsCalling, setToolsCalling] = React.useState<string[]>([]);
    const [toolsDone, setToolsDone] = React.useState<string[]>([]);
    const [parcels, setParcels] = React.useState<SprayableParcel[]>([]);
    const [pendingClarification, setPendingClarification] = React.useState<ClarificationRequest | null>(null);
    const [savingUnitId, setSavingUnitId] = React.useState<string | null>(null);

    // User context: loaded once on mount, sent with each request
    const [userContext, setUserContext] = React.useState<SmartInputUserContext | null>(null);
    const [contextLoading, setContextLoading] = React.useState(true);
    const [contextError, setContextError] = React.useState<string | null>(null);

    const { toast } = useToast();

    // Refs
    const abortControllerRef = React.useRef<AbortController | null>(null);

    // Load user context on mount (parcels, products, history - all in one call)
    React.useEffect(() => {
        async function loadContext() {
            try {
                setContextLoading(true);
                setContextError(null);

                const response = await fetch('/api/smart-input-v2/context');
                if (!response.ok) {
                    throw new Error(`Failed to load context: ${response.status}`);
                }

                const context: SmartInputUserContext = await response.json();
                setUserContext(context);

                // Also set parcels for legacy use (e.g., parcel name lookup)
                if (context.parcels) {
                    setParcels(context.parcels.map(p => ({
                        id: p.id,
                        name: p.name,
                        parcelId: p.id,
                        parcelName: p.name,
                        crop: p.crop,
                        variety: p.variety,
                        area: p.area,
                    })) as SprayableParcel[]);
                }

                console.log(`[SmartInputV2] Context loaded: ${context.parcels?.length} parcels, ${context.products?.length} products`);
            } catch (error) {
                console.error('Failed to load context:', error);
                setContextError(error instanceof Error ? error.message : 'Failed to load context');
                toast({
                    variant: 'destructive',
                    title: 'Context laden mislukt',
                    description: 'Probeer de pagina te herladen.',
                });
            } finally {
                setContextLoading(false);
            }
        }
        loadContext();
    }, [toast]);

    // Derived state
    const hasDraft = state.draft !== null;
    const hasMessages = state.messages.length > 0;
    const isMobileStartScreen = !hasMessages && !hasDraft;

    // Handle sending a message
    const handleSend = React.useCallback(async (text: string, mode: InputMode) => {
        if (!text.trim() || state.phase === 'processing') return;

        // Abort any existing request
        abortControllerRef.current?.abort();
        abortControllerRef.current = new AbortController();

        // Add user message
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
        setPendingClarification(null);

        try {
            const response = await fetch('/api/smart-input-v2', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: text,
                    conversationHistory: state.messages,
                    currentDraft: state.draft ? serializeDraft(state.draft) : null,
                    userContext: userContext || undefined, // Send client-loaded context
                }),
                signal: abortControllerRef.current.signal,
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }

            // Process streaming response
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
                        console.error('Failed to parse stream message:', e);
                    }
                }
            }
        } catch (error) {
            if ((error as Error).name === 'AbortError') {
                console.log('Request aborted');
                return;
            }
            console.error('Request failed:', error);

            // Add error message
            const errorMessage: ConversationMessage = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: 'Er ging iets mis. Probeer het opnieuw.',
                timestamp: new Date(),
            };

            setState(prev => ({
                ...prev,
                messages: [...prev.messages, errorMessage],
                phase: 'error',
            }));
        }
    }, [state.messages, state.draft, state.phase, userContext]);

    // Handle stream messages
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
                const errorMessage: ConversationMessage = {
                    id: crypto.randomUUID(),
                    role: 'assistant',
                    content: message.message,
                    timestamp: new Date(),
                };
                setState(prev => ({
                    ...prev,
                    messages: [...prev.messages, errorMessage],
                    phase: 'error',
                }));
                break;
        }
    }, []);

    // Handle complete response
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
            const newState: SmartInputV2State = {
                ...prev,
                messages: [...prev.messages, assistantMessage],
                phase: 'complete',
                isAgentMode: true, // After first message, we're in agent mode
            };

            // Update draft based on action
            if (response.registration) {
                // Push current draft to history before updating
                if (prev.draft) {
                    newState.draftHistory = [
                        ...prev.draftHistory.slice(-19), // Keep max 20
                        prev.draft,
                    ];
                }
                newState.draft = response.registration;
            }

            // Handle different actions
            switch (response.action) {
                case 'confirm_and_save':
                    // Draft is saved, could clear it or mark as confirmed
                    if (newState.draft) {
                        newState.draft = {
                            ...newState.draft,
                            units: newState.draft.units.map(u => ({
                                ...u,
                                status: 'confirmed' as const,
                            })),
                        };
                    }
                    break;

                case 'cancel':
                    // Clear draft
                    newState.draft = null;
                    newState.draftHistory = [];
                    newState.isAgentMode = false;
                    break;

                case 'clarification_needed':
                    // Set pending clarification for UI
                    if (response.clarification) {
                        setPendingClarification(response.clarification);
                    }
                    break;
            }

            return newState;
        });

        setToolsCalling([]);
    }, []);

    // Handle undo
    const handleUndo = React.useCallback(() => {
        setState(prev => {
            if (prev.draftHistory.length === 0) return prev;

            const history = [...prev.draftHistory];
            const previousDraft = history.pop();

            // Add undo message
            const undoMessage: ConversationMessage = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: 'Laatste wijziging ongedaan gemaakt.',
                timestamp: new Date(),
            };

            return {
                ...prev,
                draft: previousDraft || null,
                draftHistory: history,
                messages: [...prev.messages, undoMessage],
            };
        });
    }, []);

    // Handle clarification selection
    const handleClarificationSelect = React.useCallback((option: string) => {
        if (option === '__custom__') {
            // Focus the command bar for custom input
            setPendingClarification(null);
            return;
        }

        // Send the selected option as a new message
        handleSend(option, activeMode);
        setPendingClarification(null);
    }, [handleSend, activeMode]);

    // Handle confirm single unit
    const handleConfirmUnit = React.useCallback(async (unit: SprayRegistrationUnit) => {
        if (!state.draft) return;

        setSavingUnitId(unit.id);
        try {
            // Use unit-specific date if available, otherwise use group date
            const unitDate = unit.date || state.draft.date;
            const result = await confirmSingleUnit(
                unit,
                unitDate,
                state.draft.rawInput || ''
            );

            if (result.success) {
                // Update unit status to confirmed
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
            } else {
                throw new Error(result.message || 'Failed to save');
            }
        } catch (error) {
            console.error('Error confirming unit:', error);
            toast({ variant: 'destructive', title: 'Fout', description: 'Kon niet opslaan.' });
        } finally {
            setSavingUnitId(null);
        }
    }, [state.draft, toast]);

    // Handle confirm all units
    const handleConfirmAll = React.useCallback(async () => {
        if (!state.draft) return;

        const unconfirmedUnits = state.draft.units.filter(u => u.status !== 'confirmed');
        if (unconfirmedUnits.length === 0) {
            toast({ title: 'Alles al bevestigd' });
            return;
        }

        setSavingUnitId('all');
        try {
            const result = await confirmAllUnits(state.draft);

            if (result.success) {
                // Mark all as confirmed
                setState(prev => ({
                    ...prev,
                    draft: prev.draft ? {
                        ...prev.draft,
                        units: prev.draft.units.map(u => ({ ...u, status: 'confirmed' as const })),
                    } : null,
                }));
                toast({ title: 'Opgeslagen', description: `${unconfirmedUnits.length} registratie(s) bevestigd.` });
            } else {
                throw new Error(result.message || 'Failed to save');
            }
        } catch (error) {
            console.error('Error confirming all units:', error);
            toast({ variant: 'destructive', title: 'Fout', description: 'Kon niet opslaan.' });
        } finally {
            setSavingUnitId(null);
        }
    }, [state.draft, toast]);

    // Handle cancel/clear draft
    const handleCancelDraft = React.useCallback(() => {
        setState(prev => ({
            ...prev,
            draft: null,
            draftHistory: [],
            isAgentMode: false,
        }));

        // Add cancel message
        const cancelMessage: ConversationMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: 'Registratie geannuleerd.',
            timestamp: new Date(),
        };

        setState(prev => ({
            ...prev,
            messages: [...prev.messages, cancelMessage],
        }));

        toast({ title: 'Geannuleerd' });
    }, [toast]);

    // Handle edit unit (send edit command to agent)
    const handleEditUnit = React.useCallback((unit: SprayRegistrationUnit) => {
        // Pre-fill the command bar with an edit suggestion
        const parcelCount = unit.plots.length;
        setCommandInput(`Wijzig de registratie voor ${unit.label || `${parcelCount} percelen`}`);
    }, []);

    // Handle remove unit
    const handleRemoveUnit = React.useCallback((unitId: string) => {
        setState(prev => {
            if (!prev.draft) return prev;

            const newUnits = prev.draft.units.filter(u => u.id !== unitId);

            // If no units left, clear the draft
            if (newUnits.length === 0) {
                return {
                    ...prev,
                    draft: null,
                    draftHistory: [...prev.draftHistory.slice(-19), prev.draft],
                };
            }

            return {
                ...prev,
                draft: { ...prev.draft, units: newUnits },
                draftHistory: [...prev.draftHistory.slice(-19), prev.draft],
            };
        });

        toast({ title: 'Verwijderd' });
    }, [toast]);

    // Status panel content
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
        />
    ) : (
        <EmptyStatusPanel />
    );

    // Bottom summary for mobile
    const bottomSheetSummary = state.draft ? {
        registrationCount: state.draft.units.reduce((sum, u) => sum + u.plots.length, 0),
        totalHa: state.draft.units.reduce((sum, unit) => {
            const parcelHa = unit.plots.reduce((pSum, plotId) => {
                const parcel = parcels.find(p => p.id === plotId);
                return pSum + (parcel?.area || 0);
            }, 0);
            return sum + parcelHa;
        }, 0),
        productCount: state.draft.units[0]?.products?.length || 0,
        status: state.draft.units.every(u => u.status === 'confirmed') ? 'Bevestigd' : 'Te bevestigen',
    } : undefined;

    // Mobile start suggestions
    const mobileStartSuggestions = [
        "Alle peren vandaag gespoten met",
        "Gisteren heel het bedrijf gespoten met",
        "Morgen alle peren spuiten met"
    ];

    // Show loading state while context is loading
    if (contextLoading) {
        return (
            <div className="h-[calc(100vh-64px)] flex flex-col items-center justify-center gap-4 -m-4 md:-m-6">
                <Loader2 className="h-8 w-8 text-emerald-400 animate-spin" />
                <p className="text-sm text-white/60">Context laden...</p>
            </div>
        );
    }

    // Show error state if context failed to load
    if (contextError) {
        return (
            <div className="h-[calc(100vh-64px)] flex flex-col items-center justify-center gap-4 -m-4 md:-m-6">
                <div className="h-12 w-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                    <X className="h-6 w-6 text-red-400" />
                </div>
                <p className="text-sm text-white/60">Kon context niet laden</p>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.location.reload()}
                >
                    Pagina herladen
                </Button>
            </div>
        );
    }

    return (
        <div className="h-[calc(100vh-64px)] flex flex-col md:grid md:grid-cols-12 gap-0 overflow-hidden -m-4 md:-m-6">
            {/* MOBILE START SCREEN - Clean layout with input at top */}
            {isMobileStartScreen && (
                <div className="md:hidden flex flex-col h-full bg-black/20">
                    {/* Greeting + Input Section */}
                    <div className="flex-1 flex flex-col justify-center px-4 pb-8">
                        {/* AgriBot Greeting */}
                        <div className="flex items-center gap-3 mb-6">
                            <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                                <Bot className="h-6 w-6 text-emerald-400" />
                            </div>
                            <div>
                                <h1 className="text-xl font-bold text-white">Hallo!</h1>
                                <p className="text-sm text-white/50">Slimme Invoer 2.0 - Wat kan ik vandaag voor u doen?</p>
                            </div>
                        </div>

                        {/* Input Bar */}
                        <CommandBar
                            value={commandInput}
                            onValueChange={setCommandInput}
                            onSend={handleSend}
                            isProcessing={state.phase === 'processing'}
                            activeMode={activeMode}
                            onModeChange={setActiveMode}
                        />

                        {/* Shortcut Buttons */}
                        <div className="mt-4 space-y-2">
                            {mobileStartSuggestions.map((suggestion, i) => (
                                <button
                                    key={i}
                                    onClick={() => setCommandInput(suggestion)}
                                    className="w-full text-left px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white/70 active:bg-emerald-500/20 active:border-emerald-500/40 transition-colors"
                                >
                                    {suggestion}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* MOBILE CHAT SCREEN - When conversation exists */}
            {!isMobileStartScreen && (
                <div className="md:hidden flex-1 h-full bg-black/20 overflow-hidden flex flex-col">
                    {/* Chat History - takes remaining space */}
                    <div className={cn(
                        "flex-1 overflow-y-auto",
                        hasDraft && "pb-2"
                    )}>
                        {/* Don't show registration card in feed on mobile - it's in the inline panel below */}
                        <SmartInvoerFeedV2
                            messages={state.messages}
                            draft={null}
                            phase={state.phase}
                            currentPhaseLabel={currentPhaseLabel}
                            toolsCalling={toolsCalling}
                            toolsDone={toolsDone}
                            canUndo={state.draftHistory.length > 0}
                            onUndo={handleUndo}
                            onClarificationSelect={handleClarificationSelect}
                            parcels={parcels}
                        />
                    </div>

                    {/* Active Registration Panel - Inline on mobile when active */}
                    {hasDraft && (
                        <div className="border-t border-white/10 bg-[#0A0A0A] max-h-[40vh] overflow-y-auto">
                            <div className="p-3 border-b border-white/[0.06] flex items-center justify-between sticky top-0 bg-[#0A0A0A] z-10">
                                <div className="flex items-center gap-2">
                                    <ClipboardList className="h-4 w-4 text-emerald-500" />
                                    <span className="text-sm font-medium text-white/80">Actieve Registratie</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {state.draftHistory.length > 0 && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={handleUndo}
                                            className="h-7 px-2 text-white/50 hover:text-white hover:bg-white/5"
                                        >
                                            <Undo2 className="h-3.5 w-3.5" />
                                        </Button>
                                    )}
                                    {bottomSheetSummary?.status && (
                                        <Badge className={cn(
                                            "text-[10px]",
                                            bottomSheetSummary.status === 'Bevestigd'
                                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                                : 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                                        )}>
                                            {bottomSheetSummary.status}
                                        </Badge>
                                    )}
                                </div>
                            </div>
                            <div className="max-w-full overflow-hidden">
                                {statusPanelContent}
                            </div>
                            {/* Action buttons */}
                            <div className="p-3 border-t border-white/[0.06] flex gap-2 sticky bottom-0 bg-[#0A0A0A]">
                                <Button
                                    onClick={handleCancelDraft}
                                    variant="ghost"
                                    size="sm"
                                    className="text-white/50 hover:text-white hover:bg-white/5"
                                >
                                    <X className="h-4 w-4 mr-1" />
                                    Annuleer
                                </Button>
                                <Button
                                    onClick={handleConfirmAll}
                                    size="sm"
                                    disabled={savingUnitId !== null}
                                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                                >
                                    <Check className="h-4 w-4 mr-1" />
                                    Alles Bevestigen
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Clarification panel (if pending) */}
                    {pendingClarification && (
                        <div className="flex-shrink-0 px-3 pb-2">
                            <ClarificationOptions
                                clarification={pendingClarification}
                                onSelect={handleClarificationSelect}
                            />
                        </div>
                    )}

                    {/* Input Area - Fixed at bottom */}
                    <div className="p-3 border-t border-white/[0.06] bg-black/40">
                        <CommandBar
                            value={commandInput}
                            onValueChange={setCommandInput}
                            onSend={handleSend}
                            isProcessing={state.phase === 'processing'}
                            activeMode={activeMode}
                            onModeChange={setActiveMode}
                        />
                    </div>
                </div>
            )}

            {/* DESKTOP: Left column (7 cols) - Chat */}
            <div className="hidden md:flex md:col-span-7 h-full md:border-r border-white/[0.06] bg-black/20 overflow-hidden flex-col">
                {/* Chat Header */}
                <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 text-emerald-500" />
                        <span className="text-sm font-medium text-white/80">Chat</span>
                        <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
                            2.0 beta
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        {state.isAgentMode && (
                            <span className="text-xs text-white/30">Agent actief</span>
                        )}
                        <span className="text-xs text-white/30">{state.messages.length} berichten</span>
                    </div>
                </div>

                {/* Chat History - Don't show registration card in feed on desktop, it's in the StatusPanel */}
                <div className="flex-1 overflow-y-auto">
                    <SmartInvoerFeedV2
                        messages={state.messages}
                        draft={null}
                        phase={state.phase}
                        currentPhaseLabel={currentPhaseLabel}
                        toolsCalling={toolsCalling}
                        toolsDone={toolsDone}
                        canUndo={state.draftHistory.length > 0}
                        onUndo={handleUndo}
                        onClarificationSelect={handleClarificationSelect}
                        parcels={parcels}
                    />
                </div>

                {/* Clarification panel (if pending) */}
                {pendingClarification && (
                    <div className="flex-shrink-0 px-4 pb-2 border-t border-white/[0.06]">
                        <ClarificationOptions
                            clarification={pendingClarification}
                            onSelect={handleClarificationSelect}
                        />
                    </div>
                )}

                {/* Input Area */}
                <div className="p-4 border-t border-white/[0.06] bg-black/40">
                    <CommandBar
                        value={commandInput}
                        onValueChange={setCommandInput}
                        onSend={handleSend}
                        isProcessing={state.phase === 'processing'}
                        activeMode={activeMode}
                        onModeChange={setActiveMode}
                    />
                </div>
            </div>

            {/* DESKTOP: Right column (5 cols) - Status Panel */}
            <div className="hidden md:block md:col-span-5 h-full bg-white/[0.02] overflow-y-auto">
                {/* Status Header */}
                <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between sticky top-0 bg-[#0A0A0A] z-10 backdrop-blur-sm">
                    <div className="flex items-center gap-2">
                        <ClipboardList className="h-4 w-4 text-emerald-500" />
                        <span className="text-sm font-medium text-white/80">Actieve Registratie</span>
                    </div>
                    <div className="flex items-center gap-2">
                        {state.draftHistory.length > 0 && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleUndo}
                                className="h-7 px-2 text-white/50 hover:text-white hover:bg-white/5"
                            >
                                <Undo2 className="h-3.5 w-3.5 mr-1" />
                                <span className="text-xs">Undo</span>
                            </Button>
                        )}
                        {state.draft && (
                            <Badge className={cn(
                                "text-[10px]",
                                state.draft.units.every(u => u.status === 'confirmed')
                                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                    : 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                            )}>
                                {state.draft.units.every(u => u.status === 'confirmed') ? 'Bevestigd' : 'Te bevestigen'}
                            </Badge>
                        )}
                    </div>
                </div>

                {/* Status Content */}
                <div>
                    {statusPanelContent}
                </div>
            </div>
        </div>
    );
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Serialize draft for API (convert Dates to strings)
 */
function serializeDraft(draft: SprayRegistrationGroup): any {
    return {
        groupId: draft.groupId,
        date: draft.date instanceof Date
            ? draft.date.toISOString().split('T')[0]
            : String(draft.date).split('T')[0],
        rawInput: draft.rawInput,
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
