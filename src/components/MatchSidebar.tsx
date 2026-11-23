import type { ReactNode } from 'react';
import { Search, Star, X } from 'lucide-react';
import type { MatchListItem } from '../types/sports';
import {
  LEAGUE_OPTIONS,
  formatMatchTimeArabic,
  translateLeagueName,
  translateStatusText,
} from '../utils/arabicSports';

interface MatchSidebarProps {
  matches: MatchListItem[];
  selectedMatchId: string | null;
  onSelectMatch: (id: string) => void;
  selectedLeague: string;
  onSelectLeague: (slug: string) => void;
  dateOffset: number;
  onChangeDateOffset: (offset: number) => void;
  statusFilter: 'all' | 'in' | 'post' | 'pre' | 'fav';
  onChangeStatusFilter: (filter: 'all' | 'in' | 'post' | 'pre' | 'fav') => void;
  searchQuery: string;
  onChangeSearchQuery: (q: string) => void;
  favoriteIds: string[];
  onToggleFavorite: (id: string) => void;
  loading: boolean;
  error: string | null;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
  sidebarAd?: ReactNode;
}

export function TeamCrest({
  logo,
  name,
  color,
  size = 24,
}: {
  logo: string;
  name: string;
  color: string;
  size?: number;
}) {
  if (!logo) {
    return (
      <span
        style={{ width: size, height: size, backgroundColor: color || '#1E293B' }}
        className="inline-flex items-center justify-center rounded-full text-[10px] font-bold text-white shrink-0"
      >
        {name.slice(0, 2).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      src={logo}
      alt={name}
      referrerPolicy="no-referrer"
      style={{ width: size, height: size }}
      className="object-contain shrink-0"
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.display = 'none';
      }}
    />
  );
}

export function MatchSidebar({
  matches,
  selectedMatchId,
  onSelectMatch,
  selectedLeague,
  onSelectLeague,
  dateOffset,
  onChangeDateOffset,
  statusFilter,
  onChangeStatusFilter,
  searchQuery,
  onChangeSearchQuery,
  favoriteIds,
  onToggleFavorite,
  loading,
  error,
  isOpenMobile = false,
  onCloseMobile,
  sidebarAd,
}: MatchSidebarProps) {
  const liveCount = matches.filter((m) => m.state === 'in').length;
  const favSet = new Set(favoriteIds);

  const filtered = matches.filter((m) => {
    if (statusFilter === 'fav') {
      if (!favSet.has(m.id)) return false;
    } else if (statusFilter !== 'all' && m.state !== statusFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const hay = `${m.home.name} ${m.away.name} ${m.leagueName} ${m.venue}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return (
    <>
      {isOpenMobile && (
        <div
          onClick={onCloseMobile}
          aria-hidden="true"
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
        />
      )}
      <aside
        className={`${
          isOpenMobile ? 'fixed inset-y-0 right-0 z-50 flex w-[min(88vw,360px)] shadow-2xl' : 'hidden'
        } lg:flex lg:static lg:z-auto w-full lg:w-[340px] xl:w-[360px] shrink-0 border-l border-slate-800/80 bg-[#0E131D] flex-col h-full lg:h-[calc(100vh-64px)] lg:sticky lg:top-16`}
      >
        {onCloseMobile && (
          <div className="flex lg:hidden items-center justify-between px-4 py-3 border-b border-slate-800 bg-[#0B0F17]">
            <span className="text-sm font-bold text-white">اختر المباراة والبطولة</span>
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="إغلاق قائمة المباريات"
              className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-300 inline-flex items-center gap-1 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
              <span>إغلاق</span>
            </button>
          </div>
        )}
        <div className="p-4 space-y-3 border-b border-slate-800/80">
        {/* Date & Live Count */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 rounded-lg bg-[#0B0F17] p-1 border border-slate-800/80">
            {[
              { offset: -1, label: 'أمس' },
              { offset: 0, label: 'اليوم' },
              { offset: 1, label: 'غداً' },
            ].map((d) => (
              <button
                key={d.offset}
                type="button"
                onClick={() => onChangeDateOffset(d.offset)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  dateOffset === d.offset
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>

          <span className="text-xs text-slate-400 font-mono tabular-nums whitespace-nowrap">
            {liveCount > 0 ? `${liveCount} مباشر` : `${matches.length} مباراة`}
          </span>
        </div>

        {/* Status & Favorites Filter */}
        <div className="grid grid-cols-5 gap-1 rounded-lg bg-[#0B0F17] p-1 border border-slate-800/80">
          {[
            { id: 'all' as const, label: 'الكل' },
            { id: 'in' as const, label: 'مباشر' },
            { id: 'post' as const, label: 'انتهت' },
            { id: 'pre' as const, label: 'قادمة' },
            { id: 'fav' as const, label: 'المفضلة' },
          ].map((st) => (
            <button
              key={st.id}
              type="button"
              onClick={() => onChangeStatusFilter(st.id)}
              className={`py-1.5 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                statusFilter === st.id
                  ? st.id === 'in'
                    ? 'bg-red-500/20 text-red-300'
                    : st.id === 'fav'
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'bg-emerald-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>

        {/* League Select & Search */}
        <div className="space-y-2">
          <select
            aria-label="اختيار البطولة"
            value={selectedLeague}
            onChange={(e) => onSelectLeague(e.target.value)}
            className="w-full rounded-lg border border-slate-800 bg-[#0B0F17] px-3 py-2 text-xs font-medium text-slate-200 focus:border-emerald-500 focus:outline-none"
          >
            {LEAGUE_OPTIONS.map((lg) => (
              <option key={lg.slug} value={lg.slug}>
                {lg.label}
              </option>
            ))}
          </select>

          <div className="relative">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onChangeSearchQuery(e.target.value)}
              placeholder="ابحث عن فريق أو بطولة..."
              className="w-full rounded-lg border border-slate-800 bg-[#0B0F17] py-2 pr-9 pl-3 text-xs text-slate-200 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Matches List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
        {loading && matches.length === 0 ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="h-16 rounded-lg bg-slate-800/40 animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="p-6 text-center text-xs text-red-400">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <p className="text-sm font-medium text-slate-300">لا توجد مباريات مطابقة</p>
            <p className="text-xs text-slate-500">
              {statusFilter === 'fav'
                ? 'اضغط على نجمة أي مباراة لإضافتها لقائمة المتابعة والتنبيهات.'
                : 'جرّب تغيير البطولة أو حالة المباراة أو التاريخ.'}
            </p>
          </div>
        ) : (
          filtered.map((m) => {
            const isSelected = m.id === selectedMatchId;
            const isFav = favSet.has(m.id);
            const statusText =
              m.state === 'pre'
                ? formatMatchTimeArabic(m.date) || m.statusDetail
                : translateStatusText(m.state, m.statusDetail, m.displayClock);

            return (
              <div
                key={m.id}
                className={`relative flex items-stretch transition-colors ${
                  isSelected ? 'bg-emerald-500/10' : 'hover:bg-slate-800/35'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectMatch(m.id)}
                  className="flex-1 text-right px-4 py-3 cursor-pointer min-w-0"
                >
                  {/* Unboxed metadata row */}
                  <div className="flex items-center justify-between gap-2 text-[11px] mb-2">
                    <span className="text-slate-400 truncate">
                      {translateLeagueName(m.leagueSlug, m.leagueName)}
                    </span>
                    <span
                      className={`font-mono tabular-nums whitespace-nowrap shrink-0 ${
                        m.state === 'in'
                          ? 'text-red-400 font-semibold'
                          : m.state === 'post'
                          ? 'text-slate-400'
                          : 'text-emerald-400'
                      }`}
                    >
                      {statusText}
                    </span>
                  </div>

                  {/* Teams & Scores */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <TeamCrest logo={m.home.logo} name={m.home.name} color={m.home.color} size={18} />
                        <span
                          className={`text-xs truncate ${
                            isSelected ? 'font-bold text-white' : 'font-medium text-slate-200'
                          }`}
                        >
                          {m.home.name}
                        </span>
                      </div>
                      <span className="font-mono text-sm font-bold tabular-nums text-white shrink-0">
                        {m.state === 'pre' ? '—' : m.home.score}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <TeamCrest logo={m.away.logo} name={m.away.name} color={m.away.color} size={18} />
                        <span
                          className={`text-xs truncate ${
                            isSelected ? 'font-bold text-white' : 'font-medium text-slate-200'
                          }`}
                        >
                          {m.away.name}
                        </span>
                      </div>
                      <span className="font-mono text-sm font-bold tabular-nums text-white shrink-0">
                        {m.state === 'pre' ? '—' : m.away.score}
                      </span>
                    </div>
                  </div>
                </button>

                {/* Favorite Match Toggle */}
                <button
                  type="button"
                  aria-label={isFav ? 'إزالة من المفضلة' : 'إضافة للمفضلة وتنبيهات الأهداف'}
                  onClick={() => onToggleFavorite(m.id)}
                  className={`px-2.5 flex items-center justify-center border-r border-slate-800/40 cursor-pointer transition-colors ${
                    isFav ? 'text-amber-400' : 'text-slate-600 hover:text-slate-300'
                  }`}
                >
                  <Star className={`h-3.5 w-3.5 ${isFav ? 'fill-amber-400' : ''}`} />
                </button>
              </div>
            );
          })
        )}
      </div>
      {sidebarAd && (
        <div className="p-3 border-t border-slate-800/80 bg-[#0E131D] shrink-0">
          {sidebarAd}
        </div>
      )}
    </aside>
    </>
  );
}
