'use client';

import * as React from 'react';
import { FieldSignal } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Heart, Share2, ArrowRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { nl } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toggleFieldSignalLikeAction } from '@/app/actions';
import { useRouter } from 'next/navigation';

interface SignalCardProps {
    signal: FieldSignal;
    currentUserId: string;
}

export function SignalCard({ signal, currentUserId }: SignalCardProps) {
    const [isLiked, setIsLiked] = React.useState(signal.userReaction === 'like');
    const [likesCount, setLikesCount] = React.useState(signal.likesCount || 0);
    const [isLikeLoading, setIsLikeLoading] = React.useState(false);
    const router = useRouter();

    const handleLike = async () => {
        if (isLikeLoading) return;
        setIsLikeLoading(true);

        const newIsLiked = !isLiked;
        const newCount = newIsLiked ? likesCount + 1 : Math.max(0, likesCount - 1); // Optimistic

        setIsLiked(newIsLiked);
        setLikesCount(newCount);

        const result = await toggleFieldSignalLikeAction(signal.id, currentUserId, !newIsLiked); // Pass OLD state to toggle? NO, toggle action likely expects "isLiked" as "do you like it now?". 
        // Wait, check my action implementation: 
        // "if (isLiked) { delete } else { add }"
        // The action I wrote takes `isLiked` (Boolean). 
        // "if (isLiked) { // User ALREADY likes it... }"
        // So the argument to action meant "Current State".
        // The action logic: `if (isLiked) delete else add`.
        // So I should pass the OLD state.

        if (!result.success) {
            // Revert
            setIsLiked(!newIsLiked);
            setLikesCount(likesCount);
        }

        setIsLikeLoading(false);
    };

    // Correction: In toggleFieldSignalLikeAction:
    // export async function toggleFieldSignalLikeAction(signalId: string, userId: string, isLiked: boolean) {
    //  if (isLiked) { delete } else { add }
    // }
    // So "isLiked" argument is "Does the user CURRENTLY like it?".
    // I should pass !newIsLiked (which is the OLD state 'isLiked').

    const handlePlanAction = () => {
        const intent = encodeURIComponent(signal.content);
        router.push(`/?intent=${intent}`);
    };

    return (
        <div className="group bg-card/40 border border-emerald-500/10 rounded-xl p-5 hover:bg-card/60 transition-colors">
            {/* Header */}
            <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10 border border-emerald-500/20">
                        <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${signal.authorId}`} />
                        <AvatarFallback className="bg-emerald-900/50 text-emerald-400">
                            {signal.authorName ? signal.authorName[0] : 'A'}
                        </AvatarFallback>
                    </Avatar>
                    <div>
                        <div className="font-semibold text-sm text-foreground">
                            {signal.authorName || 'Adviseur'}
                        </div>
                        <div className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(signal.createdAt), { addSuffix: true, locale: nl })}
                        </div>
                    </div>
                </div>
                {/* Tags */}
                <div className="flex gap-1 flex-wrap justify-end max-w-[40%]">
                    {signal.tags.map(tag => (
                        <Badge key={tag} variant="secondary" className="bg-emerald-500/5 text-emerald-400 hover:bg-emerald-500/10 text-[10px] px-1.5 py-0.5 border-emerald-500/10">
                            #{tag}
                        </Badge>
                    ))}
                </div>
            </div>

            {/* Content */}
            <div className="mb-4 text-sm text-muted-foreground/90 whitespace-pre-wrap leading-relaxed">
                {signal.content}
            </div>

            {/* Media Placeholder - if mediaUrl exists */}
            {signal.mediaUrl && (
                <div className="mb-4 rounded-lg overflow-hidden border border-emerald-500/10 bg-black/20 h-48 flex items-center justify-center">
                    <span className="text-muted-foreground text-xs">Media Preview ({signal.mediaUrl})</span>
                </div>
            )}

            {/* Footer Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-white/5">
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleLike}
                        className={cn(
                            "h-8 px-2 text-xs gap-1.5 hover:bg-emerald-500/10",
                            isLiked ? "text-emerald-500" : "text-muted-foreground"
                        )}
                    >
                        <Heart className={cn("w-4 h-4", isLiked && "fill-current")} />
                        {likesCount > 0 && <span>{likesCount}</span>}
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs gap-1.5 text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-400"
                    >
                        <MessageSquare className="w-4 h-4" />
                        <span>Reageer</span>
                    </Button>
                </div>

                <Button
                    onClick={handlePlanAction}
                    size="sm"
                    className="bg-emerald-600/90 hover:bg-emerald-500 text-white h-8 text-xs font-medium"
                >
                    Plan Actie
                    <ArrowRight className="w-3 h-3 ml-1.5" />
                </Button>
            </div>
        </div>
    );
}
