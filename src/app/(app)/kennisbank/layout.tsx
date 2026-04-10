import { PageTabs } from '@/components/layout/page-tabs';

const tabs = [
  { label: 'Atlas', href: '/kennisbank' },
  { label: 'Actueel', href: '/kennisbank/ziekten-plagen' },
  { label: 'Encyclopedie', href: '/kennisbank/encyclopedie' },
];

export default function KennisbankLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative -m-4 lg:-m-6">
      <div className="px-4 pt-4 lg:px-6 lg:pt-6">
        <PageTabs tabs={tabs} />
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}
