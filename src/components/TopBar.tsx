import { RefreshCw } from 'lucide-react';

export type TopSection = 'match' | 'watch' | 'news' | 'standings' | 'alerts';

interface TopBarProps {
  activeSection: TopSection;
  onSelectSection: (section: TopSection) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  unreadAlertsCount: number;
}

export function TopBar({
  activeSection,
  onSelectSection,
  onRefresh,
  isRefreshing,
  unreadAlertsCount,
}: TopBarProps) {
  const navItems: { id: TopSection; label: string }[] = [
    { id: 'match', label: 'الرادار المباشر' },
    { id: 'watch', label: 'مشاهدة مجاناً' },
    { id: 'news', label: 'الأخبار الرياضية' },
    { id: 'standings', label: 'جداول الترتيب' },
    {
      id: 'alerts',
      label: unreadAlertsCount > 0 ? `الإشعارات (${unreadAlertsCount})` : 'إشعارات الأهداف',
    },
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-slate-800/90 bg-[#0B0F17]/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between gap-8 px-4 sm:px-6">
        {/* Zone 1: Single-element brand wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            onSelectSection('match');
          }}
          className="font-['Outfit',sans-serif] text-xl font-extrabold tracking-tight text-white whitespace-nowrap shrink-0"
          dir="ltr"
        >
          SNOX SPORT
        </a>

        {/* Zone 2: Concise single-line navigation links */}
        <nav className="hidden lg:flex items-center gap-7 text-sm font-medium">
          {navItems.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectSection(item.id)}
                className={`relative py-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded ${
                  isActive ? 'text-emerald-400 font-semibold' : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                {item.label}
                {isActive && (
                  <span className="absolute inset-x-0 -bottom-[17px] h-0.5 bg-emerald-500" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Primary action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>تحديث مباشر</span>
          </button>
        </div>
      </div>
    </header>
  );
}
