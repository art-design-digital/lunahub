import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/server/auth';
import { store } from '@/lib/store';
import { ensureScanStarted } from '@/lib/server/auto-scan';

export async function GET() {
  ensureScanStarted();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Projects with missing links
  const projectsWithMissing = store.projects
    .filter(p => p.missingLinks)
    .map(p => ({
      id: p.id,
      name: p.meta.name,
      projektnr: p.meta.projekt_nr,
      folder: p.folder,
    }));

  // Most-used images (top 20)
  const topImages = Object.entries(store.linksMap)
    .map(([name, usages]) => ({ name, count: usages.length, usages }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  // Stats
  const totalIndds = Object.keys(store.inddMap).length;
  const totalLinks = Object.values(store.inddMap).reduce((sum, e) => sum + e.links.length, 0);
  const inddsWithIssues = projectsWithMissing.length;

  return NextResponse.json({
    projectsWithMissing,
    topImages,
    stats: { totalIndds, totalLinks, inddsWithIssues },
  });
}
