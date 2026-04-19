import { PageTabs } from '@/components/layout/page-tabs';

const tabs = [
    { label: 'Overzicht', href: '/ziektedruk' },
    { label: 'Appelschurft', href: '/ziektedruk/appelschurft' },
    { label: 'Zwartvruchtrot', href: '/ziektedruk/zwartvruchtrot' },
    { label: 'Meeldauw', href: '/ziektedruk/meeldauw' },
];

export default function ZiektedrukLayout({ children }: { children: React.ReactNode }) {
    return (
        <div>
            <PageTabs tabs={tabs} />
            <div className="mt-4">{children}</div>
        </div>
    );
}
