'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Image, Paperclip, Send, X } from 'lucide-react';
import { createFieldSignalAction } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select';

interface CreateSignalFormProps {
    currentUserId: string;
    onSuccess?: () => void;
}

const PREDEFINED_TAGS = ['Appel', 'Peer', 'Schurft', 'Kanker', 'Bemesting', 'Nieuws', 'Waarschuwing'];

export function CreateSignalForm({ currentUserId, onSuccess }: CreateSignalFormProps) {
    const [content, setContent] = React.useState('');
    const [selectedTags, setSelectedTags] = React.useState<string[]>([]);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const { toast } = useToast();

    const handleSubmit = async () => {
        if (!content.trim()) return;
        if (selectedTags.length === 0) {
            toast({
                title: "Tags vereist",
                description: "Selecteer tenminste één tag (bijv. gewas of ziekte).",
                variant: "destructive"
            });
            return;
        }

        setIsSubmitting(true);
        try {
            const result = await createFieldSignalAction(
                content,
                undefined, // mediaUrl - implementing later
                selectedTags,
                'public',
                currentUserId
            );

            if (result.success) {
                toast({
                    title: "Signaal geplaatst",
                    description: "Je veldsignaal is succesvol gedeeld met het team.",
                    className: "bg-emerald-500 border-none text-white"
                });
                setContent('');
                setSelectedTags([]);
                onSuccess?.();
            } else {
                throw new Error(result.error);
            }
        } catch (error: any) {
            toast({
                title: "Fout bij plaatsen",
                description: error.message || "Er ging iets mis.",
                variant: "destructive"
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const toggleTag = (tag: string) => {
        if (selectedTags.includes(tag)) {
            setSelectedTags(selectedTags.filter(t => t !== tag));
        } else {
            setSelectedTags([...selectedTags, tag]);
        }
    };

    return (
        <div className="bg-card/50 border border-emerald-500/10 rounded-xl p-4 space-y-4">
            <h3 className="text-sm font-semibold text-emerald-400">Nieuwe Field Signal</h3>

            <Textarea
                placeholder="Wat valt je op in het veld? Deel je observatie..."
                className="bg-background/50 border-emerald-500/10 min-h-[100px] resize-none focus-visible:ring-emerald-500/20"
                value={content}
                onChange={(e) => setContent(e.target.value)}
            />

            <div className="space-y-2">
                <span className="text-xs text-muted-foreground block">Tags:</span>
                <div className="flex flex-wrap gap-2">
                    {PREDEFINED_TAGS.map(tag => (
                        <Badge
                            key={tag}
                            variant={selectedTags.includes(tag) ? "default" : "outline"}
                            className={`cursor-pointer transition-all ${selectedTags.includes(tag)
                                ? 'bg-emerald-600 hover:bg-emerald-500 border-transparent'
                                : 'hover:border-emerald-500/50 hover:bg-emerald-500/5'
                                }`}
                            onClick={() => toggleTag(tag)}
                        >
                            {tag}
                        </Badge>
                    ))}
                </div>
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-emerald-500/10">
                <div className="flex gap-2">
                    <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-emerald-400">
                        <Image className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-emerald-400">
                        <Paperclip className="h-4 w-4" />
                    </Button>
                </div>
                <Button
                    onClick={handleSubmit}
                    disabled={isSubmitting || !content.trim()}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                    {isSubmitting ? 'Plaatsen...' : (
                        <>
                            <Send className="w-4 h-4 mr-2" />
                            Plaatsen
                        </>
                    )}
                </Button>
            </div>
        </div>
    );
}
