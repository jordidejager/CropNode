import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { wegwijzerSections, searchWegwijzerSections, getWegwijzerSection } from '@/lib/wegwijzer-content';

export async function GET(request: Request) {
  // Auth check: require authentication
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const sectionId = searchParams.get('section');
  const query = searchParams.get('q');

  // Return a specific section
  if (sectionId) {
    const section = getWegwijzerSection(sectionId);
    if (!section) {
      return NextResponse.json({ error: 'Section not found' }, { status: 404 });
    }
    return NextResponse.json({
      success: true,
      data: formatSectionForAI(section),
    });
  }

  // Search sections by keyword
  if (query) {
    const results = searchWegwijzerSections(query);
    return NextResponse.json({
      success: true,
      data: results.map(formatSectionForAI),
      count: results.length,
    });
  }

  // Return all sections (overview)
  return NextResponse.json({
    success: true,
    data: wegwijzerSections.map(formatSectionForAI),
    count: wegwijzerSections.length,
  });
}

function formatSectionForAI(section: typeof wegwijzerSections[number]) {
  return {
    section_id: section.id,
    title: section.title,
    parent: section.parentLabel,
    short_description: section.shortDescription,
    full_content: {
      wat: section.wat,
      hoe_werkt_het: section.hoeWerktHet,
      voorbeeld: section.voorbeeld,
      tips: section.tips,
      samenhang: section.samenhang,
    },
    related_sections: section.relatedSections,
    keywords: section.keywords,
    route: section.route,
  };
}
