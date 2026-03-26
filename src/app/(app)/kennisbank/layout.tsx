import { PageTabs } from '@/components/layout/page-tabs';

const tabs = [
    { label: 'Ziekten & Plagen', href: '/kennisbank' },
    { label: 'Papers', href: '/kennisbank/papers' },
    { label: 'Artikelen', href: '/kennisbank/artikelen' },
];

export default function KennisbankLayout({ children }: { children: React.ReactNode }) {
    return (
        <div>
            <PageTabs tabs={tabs} />
            <div className="mt-4">{children}</div>
        </div>
    );
}
