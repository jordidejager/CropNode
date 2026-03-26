import { PageTabs } from '@/components/layout/page-tabs';

const tabs = [
    { label: 'Registratie', href: '/oogst' },
    { label: 'Koelcelbeheer', href: '/oogst/koelcel' },
    { label: 'Sortering', href: '/oogst/sortering' },
    { label: 'Afleveroverzicht', href: '/oogst/aflevering' },
];

export default function OogstLayout({ children }: { children: React.ReactNode }) {
    return (
        <div>
            <PageTabs tabs={tabs} />
            <div className="mt-4">{children}</div>
        </div>
    );
}
