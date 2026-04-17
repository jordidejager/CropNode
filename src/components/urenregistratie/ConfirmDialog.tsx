'use client'

import * as React from 'react'
import { AlertTriangle } from 'lucide-react'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'

/**
 * Duidelijke bevestigings-dialog voor onomkeerbare acties.
 * Vervangt native `window.confirm()`.
 *
 * Ontworpen voor oudere gebruikers:
 *  - Grote tekst (geen 10px labels)
 *  - Waarschuwings-icoon voor destructieve acties
 *  - Annuleren rechts dikker dan bevestigen (= veiligste default)
 *  - 44px+ tap targets
 */

interface ConfirmDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    title: string
    description?: string
    confirmLabel?: string
    cancelLabel?: string
    destructive?: boolean
    onConfirm: () => void
}

export function ConfirmDialog({
    open,
    onOpenChange,
    title,
    description,
    confirmLabel = 'Bevestigen',
    cancelLabel = 'Annuleren',
    destructive = false,
    onConfirm,
}: ConfirmDialogProps) {
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent className="bg-slate-900 border-white/10 max-w-md">
                <AlertDialogHeader>
                    <div className="flex items-start gap-3">
                        {destructive && (
                            <div className="shrink-0 w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center">
                                <AlertTriangle className="h-5 w-5 text-red-400" />
                            </div>
                        )}
                        <div className="flex-1 min-w-0">
                            <AlertDialogTitle className="text-white text-lg leading-tight">
                                {title}
                            </AlertDialogTitle>
                            {description && (
                                <AlertDialogDescription className="text-white/70 text-base mt-2 leading-relaxed">
                                    {description}
                                </AlertDialogDescription>
                            )}
                        </div>
                    </div>
                </AlertDialogHeader>
                <AlertDialogFooter className="gap-2 pt-2">
                    <AlertDialogCancel className="min-h-[48px] text-base font-semibold bg-white/5 border-white/15 text-white hover:bg-white/10 hover:text-white">
                        {cancelLabel}
                    </AlertDialogCancel>
                    <AlertDialogAction
                        onClick={onConfirm}
                        className={cn(
                            'min-h-[48px] text-base font-bold text-white',
                            destructive
                                ? 'bg-red-500 hover:bg-red-600'
                                : 'bg-primary hover:bg-primary/90',
                        )}
                    >
                        {confirmLabel}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
