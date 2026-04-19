import { redirect } from 'next/navigation';

// De oude seizoensdashboard is vervangen door de nieuwe Analytics-structuur.
// /analytics stuurt door naar de nieuwe landingspagina: Aandachtspunten.
export default function AnalyticsRootPage() {
  redirect('/analytics/aandachtspunten');
}
