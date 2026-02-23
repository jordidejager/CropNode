'use client';

import { motion } from 'framer-motion';
import { Thermometer, MoreVertical, Trash2, Settings, Box } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import type { StorageCellSummary } from '@/lib/types';
import { cn } from '@/lib/utils';

interface StorageCellCardProps {
  cell: StorageCellSummary;
  index: number;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const statusConfig = {
  active: { label: 'Actief', className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  inactive: { label: 'Inactief', className: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
  cooling_down: { label: 'Inkoelen', className: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
};

export function StorageCellCard({ cell, index, onClick, onEdit, onDelete }: StorageCellCardProps) {
  const status = statusConfig[cell.status] || statusConfig.active;
  const fillColor = cell.fillPercentage >= 90
    ? 'bg-red-500'
    : cell.fillPercentage >= 70
      ? 'bg-amber-500'
      : 'bg-emerald-500';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className={cn(
        'group relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-5 cursor-pointer',
        'hover:bg-white/[0.08] hover:border-emerald-500/30 hover:shadow-[0_0_30px_-10px_rgba(16,185,129,0.3)]',
        'transition-all duration-300'
      )}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
            <Thermometer className="h-5 w-5 text-emerald-500" />
          </div>
          <div>
            <h3 className="font-semibold text-white">{cell.name}</h3>
            <p className="text-xs text-muted-foreground">
              {cell.width} x {cell.depth} posities
            </p>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(); }}>
              <Settings className="h-4 w-4 mr-2" />
              Bewerken
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="text-red-400 focus:text-red-400"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Verwijderen
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Status Badge */}
      <Badge variant="outline" className={cn('mb-4', status.className)}>
        {status.label}
      </Badge>

      {/* Fill Percentage */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground">Bezetting</span>
          <span className="text-sm font-bold text-white">{cell.fillPercentage}%</span>
        </div>
        <Progress value={cell.fillPercentage} className={cn('h-2', fillColor)} />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white/5 rounded-lg p-3">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Box className="h-3.5 w-3.5" />
            <span className="text-xs">Gevuld</span>
          </div>
          <p className="text-lg font-bold text-white">
            {cell.filledPositions}
            <span className="text-xs font-normal text-muted-foreground ml-1">
              / {cell.totalPositions}
            </span>
          </p>
        </div>

        <div className="bg-white/5 rounded-lg p-3">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <span className="text-xs">Dominant ras</span>
          </div>
          <p className="text-sm font-medium text-white truncate">
            {cell.dominantVariety || '-'}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
