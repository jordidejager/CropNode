import { PageTabs } from '@/components/layout/page-tabs';

const tabs = [
    { label: 'Overzicht', href: '/afzetstromen' },
    { label: 'Sortering', href: '/afzetstromen/sortering' },
    { label: 'Afzet', href: '/afzetstromen/afzet' },
    { label: 'Inbox', href: '/afzetstromen/inbox' },
];

export default function AfzetstromenLayout({ children }: { children: React.ReactNode }) {
    return (
        <div>
            <PageTabs tabs={tabs} />
            <div className="mt-4">{children}</div>
        </div>
    );
}
