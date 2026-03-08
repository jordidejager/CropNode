import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { KennisbankOverviewClient } from './client-page';

export const revalidate = 3600; // 1 hour

function KennisbankSkeleton() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      <div className="h-8 bg-white/5 rounded w-48" />
      <div className="h-12 bg-white/5 rounded w-full max-w-xl" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="h-40 bg-white/5 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

async function KennisbankData() {
  const supabase = await createClient();

  const [{ data: topics }, { data: steps }] = await Promise.all([
    supabase
      .from('kb_topics')
      .select('id, slug, title, category, subcategory, applies_to, summary, phenological_phases, article_count, coverage_quality')
      .order('category')
      .order('subcategory')
      .order('title'),
    supabase
      .from('kb_strategy_steps')
      .select('id, topic_id, phase, sort_order, action, applies_to, urgency, products, dosages, conditions')
      .order('sort_order'),
  ]);

  // Build urgency map: topicId → { phase → highest_urgency }
  const urgencyMap: Record<string, Record<string, string>> = {};
  const urgencyPriority: Record<string, number> = { time_critical: 3, seasonal: 2, background: 1 };

  steps?.forEach(step => {
    if (!urgencyMap[step.topic_id]) urgencyMap[step.topic_id] = {};
    const current = urgencyMap[step.topic_id][step.phase];
    const currentPrio = current ? urgencyPriority[current] || 0 : 0;
    const newPrio = urgencyPriority[step.urgency] || 0;
    if (newPrio > currentPrio) {
      urgencyMap[step.topic_id][step.phase] = step.urgency;
    }
  });

  return <KennisbankOverviewClient topics={topics || []} urgencyMap={urgencyMap} steps={steps || []} />;
}

export default function KennisbankPage() {
  return (
    <Suspense fallback={<KennisbankSkeleton />}>
      <KennisbankData />
    </Suspense>
  );
}
