import { redirect } from 'next/navigation';

// Inzichten is vervangen door de nieuwe Aandachtspunten-pagina.
export default function InzichtenPage() {
  redirect('/analytics/aandachtspunten');
}
