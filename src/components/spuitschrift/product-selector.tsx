'use client';

import * as React from 'react';
import { Check, ChevronsUpDown, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { CtgbProduct } from '@/lib/types';

interface ProductSelectorProps {
    value: string;
    onChange: (productName: string, product?: CtgbProduct) => void;
    onClear?: () => void;
    disabled?: boolean;
    placeholder?: string;
    className?: string;
}

export function ProductSelector({
    value,
    onChange,
    onClear,
    disabled = false,
    placeholder = 'Zoek een middel...',
    className,
}: ProductSelectorProps) {
    const [open, setOpen] = React.useState(false);
    const [searchQuery, setSearchQuery] = React.useState('');
    const [searchResults, setSearchResults] = React.useState<CtgbProduct[]>([]);
    const [isSearching, setIsSearching] = React.useState(false);
    const debounceRef = React.useRef<NodeJS.Timeout | null>(null);

    // Search CTGB database
    const searchProducts = React.useCallback(async (query: string) => {
        if (query.length < 2) {
            setSearchResults([]);
            return;
        }

        setIsSearching(true);
        try {
            const response = await fetch(`/api/ctgb/search?query=${encodeURIComponent(query)}`);
            const data = await response.json();
            if (data.success) {
                setSearchResults(data.results || []);
            } else {
                setSearchResults([]);
            }
        } catch (error) {
            console.error('Error searching products:', error);
            setSearchResults([]);
        } finally {
            setIsSearching(false);
        }
    }, []);

    // Debounced search
    React.useEffect(() => {
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }

        debounceRef.current = setTimeout(() => {
            searchProducts(searchQuery);
        }, 300);

        return () => {
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }
        };
    }, [searchQuery, searchProducts]);

    const handleSelect = (product: CtgbProduct) => {
        onChange(product.naam, product);
        setOpen(false);
        setSearchQuery('');
    };

    const handleClear = (e: React.MouseEvent) => {
        e.stopPropagation();
        onChange('');
        onClear?.();
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    disabled={disabled}
                    className={cn(
                        'w-full justify-between font-normal',
                        !value && 'text-muted-foreground',
                        className
                    )}
                >
                    <span className="truncate">
                        {value || placeholder}
                    </span>
                    <div className="flex items-center gap-1 ml-2 shrink-0">
                        {value && onClear && (
                            <X
                                className="h-4 w-4 opacity-50 hover:opacity-100 cursor-pointer"
                                onClick={handleClear}
                            />
                        )}
                        <ChevronsUpDown className="h-4 w-4 opacity-50" />
                    </div>
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[400px] p-0" align="start">
                <Command shouldFilter={false}>
                    <CommandInput
                        placeholder="Zoek op productnaam..."
                        value={searchQuery}
                        onValueChange={setSearchQuery}
                    />
                    <CommandList>
                        {isSearching ? (
                            <div className="flex items-center justify-center py-6">
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                <span className="ml-2 text-sm text-muted-foreground">Zoeken...</span>
                            </div>
                        ) : searchQuery.length < 2 ? (
                            <CommandEmpty>Typ minimaal 2 tekens om te zoeken</CommandEmpty>
                        ) : searchResults.length === 0 ? (
                            <CommandEmpty>Geen producten gevonden</CommandEmpty>
                        ) : (
                            <CommandGroup heading={`${searchResults.length} resultaten`}>
                                {searchResults.map((product) => (
                                    <CommandItem
                                        key={product.toelatingsnummer}
                                        value={product.naam}
                                        onSelect={() => handleSelect(product)}
                                        className="flex flex-col items-start gap-1 py-3"
                                    >
                                        <div className="flex items-center gap-2 w-full">
                                            <Check
                                                className={cn(
                                                    'h-4 w-4 shrink-0',
                                                    value === product.naam ? 'opacity-100' : 'opacity-0'
                                                )}
                                            />
                                            <span className="font-medium truncate flex-1">
                                                {product.naam}
                                            </span>
                                            {product.categorie && (
                                                <Badge variant="secondary" className="text-xs shrink-0">
                                                    {product.categorie}
                                                </Badge>
                                            )}
                                        </div>
                                        {product.werkzameStoffen && product.werkzameStoffen.length > 0 && (
                                            <span className="text-xs text-muted-foreground ml-6 truncate w-full">
                                                {product.werkzameStoffen.join(', ')}
                                            </span>
                                        )}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        )}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
