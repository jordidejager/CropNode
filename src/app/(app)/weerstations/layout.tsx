import { WeerstationsTabs } from '@/components/weerstations/WeerstationsTabs';

/**
 * Shared shell for the Weerstations section: a tab strip (Stations / Overzicht)
 * above the active page. Keeps both views in one max-width column.
 */
export default function WeerstationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="max-w-5xl mx-auto w-full px-2 md:px-0">
      <div className="mb-5">
        <WeerstationsTabs />
      </div>
      {children}
    </div>
  );
}
