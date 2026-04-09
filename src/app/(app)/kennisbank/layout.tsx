/**
 * Kennisbank layout — the Teeltkennis Atlas is a single-page experience,
 * so we skip the old PageTabs and let the children fill the viewport.
 *
 * The sub-routes (papers, artikelen, [id], ziekten-plagen) still exist for
 * backwards compatibility but are no longer linked from the main nav.
 */

export default function KennisbankLayout({ children }: { children: React.ReactNode }) {
  return <div className="relative -m-4 lg:-m-6">{children}</div>;
}
