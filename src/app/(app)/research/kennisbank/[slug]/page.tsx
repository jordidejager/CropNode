import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { KennisbankDetailClient } from './client-page';

export const revalidate = 86400; // 1 day

function DetailSkeleton() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      <div className="h-6 bg-white/5 rounded w-64" />
      <div className="h-10 bg-white/5 rounded w-48" />
      <div className="h-4 bg-white/5 rounded w-full max-w-2xl" />
      <div className="h-4 bg-white/5 rounded w-full max-w-xl" />
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mt-8">
        <div className="lg:col-span-1 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 bg-white/5 rounded" />
          ))}
        </div>
        <div className="lg:col-span-3 space-y-6">
          <div className="h-64 bg-white/5 rounded-xl" />
          <div className="h-48 bg-white/5 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

async function DetailData({ slug }: { slug: string }) {
  const supabase = await createClient();

  const { data: topic } = await supabase
    .from('kb_topics')
    .select('*')
    .eq('slug', slug)
    .single();

  if (!topic) notFound();

  const [
    { data: products },
    { data: steps },
    { data: varieties },
    { data: researchNotes },
    { data: allTopics },
  ] = await Promise.all([
    supabase.from('kb_products').select('*').eq('topic_id', topic.id),
    supabase.from('kb_strategy_steps').select('*').eq('topic_id', topic.id).order('sort_order'),
    supabase.from('kb_variety_susceptibility').select('*').eq('topic_id', topic.id),
    supabase.from('kb_research_notes').select('*').eq('topic_id', topic.id),
    supabase.from('kb_topics').select('id, slug, title, category, subcategory, phenological_phases, applies_to').neq('slug', slug),
  ]);

  return (
    <KennisbankDetailClient
      topic={topic}
      products={products || []}
      steps={steps || []}
      varieties={varieties || []}
      researchNotes={researchNotes || []}
      allTopics={allTopics || []}
    />
  );
}

export default async function KennisbankDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  return (
    <Suspense fallback={<DetailSkeleton />}>
      <DetailData slug={slug} />
    </Suspense>
  );
}
