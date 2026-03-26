import { PageTabs } from '@/components/layout/page-tabs';

const tabs = [
    { label: 'Overzicht', href: '/dashboard' },
    { label: 'Tijdlijn', href: '/dashboard/tijdlijn' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    return (
        <div>
            <PageTabs tabs={tabs} />
            <div className="mt-4">{children}</div>
        </div>
    );
}
