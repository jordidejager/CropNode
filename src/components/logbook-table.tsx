import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { LogbookEntry, LogStatus } from '@/lib/types';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Timestamp } from 'firebase/firestore';

const statusVariant: Record<LogStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  'Nieuw': 'outline',
  'Analyseren...': 'secondary',
  'Te Controleren': 'secondary',
  'Akkoord': 'default', 
  'Fout': 'destructive',
};

const formatDate = (date: Date | Timestamp | undefined) => {
  if (!date) return '';
  const validDate = date instanceof Timestamp ? date.toDate() : date;
  try {
    return format(validDate, 'dd-MM-yyyy HH:mm');
  } catch (e) {
    return 'Ongeldige datum';
  }
}

export function LogbookTable({ entries }: { entries: LogbookEntry[] }) {
  if (!entries || entries.length === 0) {
    return <p className="text-center text-muted-foreground py-10">Nog geen invoer in het logboek.</p>;
  }
  return (
    <TooltipProvider>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[150px]">Datum</TableHead>
              <TableHead>Invoer</TableHead>
              <TableHead className="w-[150px] text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="text-muted-foreground text-sm">{formatDate(entry.timestamp)}</TableCell>
                <TableCell>
                  <Tooltip delayDuration={300}>
                      <TooltipTrigger asChild>
                          <p className="truncate max-w-xs md:max-w-md lg:max-w-lg font-medium">{entry.rawInput}</p>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-md">
                          <p className="font-semibold mb-2">Volledige Invoer:</p>
                          <p className='mb-2'>{entry.rawInput}</p>
                          {entry.validationMessage && <p className="mt-2 p-2 bg-secondary rounded-md text-secondary-foreground text-sm">{entry.validationMessage}</p>}
                      </TooltipContent>
                  </Tooltip>
                </TableCell>
                <TableCell className="text-right">
                  <Badge
                    variant={statusVariant[entry.status]}
                    className={cn('capitalize', entry.status === 'Analyseren...' && 'animate-pulse')}
                  >
                    {entry.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  );
}
