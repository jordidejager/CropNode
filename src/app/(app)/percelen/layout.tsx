import { PageTabs } from '@/components/layout/page-tabs';

const tabs = [
    { label: 'Lijstweergave', href: '/percelen' },
    { label: 'Kaartweergave', href: '/percelen/kaart' },
    { label: 'Rijen (beta)', href: '/percelen/rijen' },
];

export default function PercelenLayout({ children }: { children: React.ReactNode }) {
    return (
        <div>
            {/* w-0 min-w-full: de tabbalk telt niet mee voor de minimale breedte van de pagina, zodat drie
                tabs op de iPhone binnen de tabbalk scrollen in plaats van de hele pagina breder te maken */}
            <div className="w-0 min-w-full">
                <PageTabs tabs={tabs} />
            </div>
            <div className="mt-4">{children}</div>
        </div>
    );
}
