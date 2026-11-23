import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, Check, ListFilter, Newspaper, Radar, Share2, Star, Table2, Tv } from 'lucide-react';
import { TopBar, type TopSection } from './components/TopBar';
import { MatchSidebar, TeamCrest } from './components/MatchSidebar';
import { TacticalRadar } from './components/TacticalRadar';
import { ShotAndHeatmapView } from './components/ShotAndHeatmapView';
import { LineupsView } from './components/LineupsView';
import { StatsAndFormView } from './components/StatsAndFormView';
import { StandingsView } from './components/StandingsView';
import { NewsView } from './components/NewsView';
import { WatchFreeView } from './components/WatchFreeView';
import { AlertsPanel, GoalToastBanner } from './components/AlertsPanel';
import {
  AdBannerSlot,
  MonetizationModal,
  useSiteAds,
  type ModalTab,
} from './components/AdsMonetization';
import type { GoalAlert, MatchDetail, MatchListItem } from './types/sports';
import {
  formatMatchTimeArabic,
  getDateParam,
  playGoalAlertChime,
  translateLeagueName,
  translateStatusText,
} from './utils/arabicSports';

type MatchSubTab = 'radar' | 'shots' | 'lineups' | 'stats';

const FAVORITES_STORAGE_KEY = 'snox_sport_favorites_v1';

export default function App() {
  const [matches, setMatches] = useState<MatchListItem[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(true);
  const [matchesError, setMatchesError] = useState<string | null>(null);

  const [selectedLeague, setSelectedLeague] = useState('all');
  const [dateOffset, setDateOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState<'all' | 'in' | 'post' | 'pre' | 'fav'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(FAVORITES_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('match');
    return fromUrl && /^\d{4,12}$/.test(fromUrl) ? fromUrl : null;
  });

  const [matchDetail, setMatchDetail] = useState<MatchDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [topSection, setTopSection] = useState<TopSection>('match');
  const [matchSubTab, setMatchSubTab] = useState<MatchSubTab>('radar');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [mobileMatchesOpen, setMobileMatchesOpen] = useState(false);

  // Site-Wide Ads & Monetization State (Firestore + Owner Google Auth)
  const {
    config: adConfig,
    user: adUser,
    isOwner: isAdOwner,
    saving: adSaving,
    saveSiteSettings,
    createCampaign,
    toggleCampaignActive,
    removeCampaign,
    signInOwner,
    signOutOwner,
  } = useSiteAds();
  const [adModalOpen, setAdModalOpen] = useState(false);
  const [adModalTab, setAdModalTab] = useState<ModalTab>('ads');

  const openMonetizationModal = (tab: ModalTab) => {
    setAdModalTab(tab);
    setAdModalOpen(true);
  };

  // Real-time Goal Notifications State
  const [alerts, setAlerts] = useState<GoalAlert[]>([]);
  const [activeToast, setActiveToast] = useState<GoalAlert | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [favoritesOnlyAlerts, setFavoritesOnlyAlerts] = useState(false);
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    typeof window !== 'undefined' && 'Notification' in window
      ? window.Notification.permission
      : 'unsupported'
  );

  // Keep previous match scores to detect genuine live goals across polling cycles
  const prevScoresRef = useRef<Map<string, { home: number; away: number; state: string }>>(new Map());
  const toastTimerRef = useRef<number | null>(null);

  const pushGoalAlert = useCallback(
    (alert: GoalAlert) => {
      setAlerts((prev) => [alert, ...prev].slice(0, 50));
      setActiveToast(alert);
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = window.setTimeout(() => setActiveToast(null), 8000);

      if (soundEnabled) {
        playGoalAlertChime();
      }

      if (
        typeof window !== 'undefined' &&
        'Notification' in window &&
        window.Notification.permission === 'granted'
      ) {
        try {
          new window.Notification(`${alert.message} · ${alert.clock}`, {
            body: `${alert.homeName} ${alert.homeScore} - ${alert.awayScore} ${alert.awayName}`,
            icon: alert.scoringTeam === 'away' ? alert.awayLogo : alert.homeLogo,
          });
        } catch {
          // Ignore notification constructor error in restricted iframes
        }
      }
    },
    [soundEnabled]
  );

  const toggleFavorite = useCallback((id: string) => {
    setFavoriteIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage quota errors
      }
      return next;
    });
  }, []);

  const favoriteIdsRef = useRef(favoriteIds);
  favoriteIdsRef.current = favoriteIds;
  const favoritesOnlyAlertsRef = useRef(favoritesOnlyAlerts);
  favoritesOnlyAlertsRef.current = favoritesOnlyAlerts;
  const pushGoalAlertRef = useRef(pushGoalAlert);
  pushGoalAlertRef.current = pushGoalAlert;

  const fetchMatches = useCallback(
    async (silent = false) => {
      if (!silent) setMatchesLoading(true);
      setMatchesError(null);
      try {
        const dateParam = dateOffset === 0 ? '' : getDateParam(dateOffset);
        const params = new URLSearchParams({ league: selectedLeague });
        if (dateParam) params.set('date', dateParam);

        const res = await fetch(`/api/matches?${params.toString()}`);
        if (!res.ok) throw new Error('تعذر جلب قائمة المباريات الحية');
        const json = await res.json();
        const list: MatchListItem[] = json.matches || [];

        // Detect live goals or kickoffs by comparing against previous snapshot
        const prevMap = prevScoresRef.current;
        const favSet = new Set(favoriteIdsRef.current);

        if (prevMap.size > 0) {
          for (const m of list) {
            if (favoritesOnlyAlertsRef.current && !favSet.has(m.id)) continue;
            const prev = prevMap.get(m.id);
            if (!prev) continue;

            if (m.home.score > prev.home) {
              pushGoalAlertRef.current({
                id: `${m.id}-h-${m.home.score}-${Date.now()}`,
                matchId: m.id,
                leagueName: translateLeagueName(m.leagueSlug, m.leagueName),
                homeName: m.home.name,
                awayName: m.away.name,
                homeLogo: m.home.logo,
                awayLogo: m.away.logo,
                homeScore: m.home.score,
                awayScore: m.away.score,
                scoringTeam: 'home',
                clock: m.displayClock || 'مباشر',
                message: `هدف لصالح ${m.home.name}`,
                timestamp: new Date().toISOString(),
                read: false,
              });
            } else if (m.away.score > prev.away) {
              pushGoalAlertRef.current({
                id: `${m.id}-a-${m.away.score}-${Date.now()}`,
                matchId: m.id,
                leagueName: translateLeagueName(m.leagueSlug, m.leagueName),
                homeName: m.home.name,
                awayName: m.away.name,
                homeLogo: m.home.logo,
                awayLogo: m.away.logo,
                homeScore: m.home.score,
                awayScore: m.away.score,
                scoringTeam: 'away',
                clock: m.displayClock || 'مباشر',
                message: `هدف لصالح ${m.away.name}`,
                timestamp: new Date().toISOString(),
                read: false,
              });
            } else if (prev.state === 'pre' && m.state === 'in') {
              pushGoalAlertRef.current({
                id: `${m.id}-kickoff-${Date.now()}`,
                matchId: m.id,
                leagueName: translateLeagueName(m.leagueSlug, m.leagueName),
                homeName: m.home.name,
                awayName: m.away.name,
                homeLogo: m.home.logo,
                awayLogo: m.away.logo,
                homeScore: m.home.score,
                awayScore: m.away.score,
                scoringTeam: 'status',
                clock: "1'",
                message: 'انطلاق المباراة الآن',
                timestamp: new Date().toISOString(),
                read: false,
              });
            }
          }
        }

        // Update snapshot
        const nextMap = new Map<string, { home: number; away: number; state: string }>();
        for (const m of list) {
          nextMap.set(m.id, { home: m.home.score, away: m.away.score, state: m.state });
        }
        prevScoresRef.current = nextMap;

        setMatches(list);
        setSelectedMatchId((prev) => {
          if (prev && list.some((m) => m.id === prev)) return prev;
          return list[0]?.id || null;
        });
      } catch (err) {
        setMatchesError(err instanceof Error ? err.message : 'خطأ في الاتصال بالخادم');
      } finally {
        setMatchesLoading(false);
      }
    },
    [selectedLeague, dateOffset]
  );

  const fetchMatchDetail = useCallback(async (id: string, silent = false) => {
    if (!silent) setDetailLoading(true);
    setDetailError(null);
    try {
      const res = await fetch(`/api/match/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error('تعذر جلب تفاصيل وإحصائيات المباراة');
      const json: MatchDetail = await res.json();
      setMatchDetail(json);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'خطأ في تحميل بيانات المباراة');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMatches(false);
  }, [fetchMatches]);

  useEffect(() => {
    if (selectedMatchId) {
      fetchMatchDetail(selectedMatchId, false);
      const url = new URL(window.location.href);
      url.searchParams.set('match', selectedMatchId);
      window.history.replaceState({}, '', url.toString());
    } else {
      setMatchDetail(null);
    }
  }, [selectedMatchId, fetchMatchDetail]);

  // Mark alerts read when viewing alerts section
  useEffect(() => {
    if (topSection === 'alerts') {
      setAlerts((prev) => prev.map((a) => (a.read ? a : { ...a, read: true })));
    }
  }, [topSection]);

  // Silent background polling every 12 seconds when live matches are active
  const hasLiveMatches = matches.some((m) => m.state === 'in') || matchDetail?.state === 'in';
  const isDetailLiveRef = useRef(false);
  isDetailLiveRef.current = matchDetail?.state === 'in';

  useEffect(() => {
    if (!hasLiveMatches) return;
    const timer = window.setInterval(() => {
      fetchMatches(true);
      if (selectedMatchId && isDetailLiveRef.current) {
        fetchMatchDetail(selectedMatchId, true);
      }
    }, 12000);
    return () => window.clearInterval(timer);
  }, [hasLiveMatches, selectedMatchId, fetchMatches, fetchMatchDetail]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([
      fetchMatches(true),
      selectedMatchId ? fetchMatchDetail(selectedMatchId, true) : Promise.resolve(),
    ]);
    setIsRefreshing(false);
  };

  const handleTopSectionChange = (section: TopSection) => {
    setTopSection(section);
  };

  const handleSelectMatchFromSidebar = (id: string) => {
    setSelectedMatchId(id);
    setMobileMatchesOpen(false);
    if (topSection === 'news' || topSection === 'alerts') {
      setTopSection('match');
      setMatchSubTab('radar');
    }
  };

  const handleShareMatch = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Clipboard fallback not needed
    }
  };

  const handleRequestBrowserPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    try {
      const perm = await window.Notification.requestPermission();
      setBrowserPermission(perm);
    } catch {
      // Ignore permission rejection
    }
  };

  const handleTestGoalAlert = () => {
    const sample = matches.find((m) => m.id === selectedMatchId) || matches[0];
    pushGoalAlert({
      id: `test-${Date.now()}`,
      matchId: sample?.id || '',
      leagueName: sample ? translateLeagueName(sample.leagueSlug, sample.leagueName) : 'الدوري الإنجليزي',
      homeName: sample?.home.name || 'Arsenal',
      awayName: sample?.away.name || 'Liverpool',
      homeLogo: sample?.home.logo || '',
      awayLogo: sample?.away.logo || '',
      homeScore: (sample?.home.score ?? 1) + 1,
      awayScore: sample?.away.score ?? 1,
      scoringTeam: 'home',
      clock: sample?.displayClock || "74'",
      message: `هدف تجريبي لصالح ${sample?.home.name || 'الفريق المضيف'}`,
      timestamp: new Date().toISOString(),
      read: topSection === 'alerts',
    });
  };

  const getStatVal = (key: string) => {
    const found = matchDetail?.stats.find((s) => s.key === key);
    return found ? { home: found.homeValue, away: found.awayValue } : { home: '—', away: '—' };
  };

  const poss = getStatVal('possessionPct');
  const shots = getStatVal('totalShots');
  const onTarget = getStatVal('shotsOnTarget');
  const corners = getStatVal('wonCorners');

  const unreadAlertsCount = alerts.filter((a) => !a.read).length;
  const isSelectedFav = selectedMatchId ? favoriteIds.includes(selectedMatchId) : false;

  return (
    <div id="top" className="min-h-screen bg-[#0B0F17] text-slate-100 flex flex-col">
      <TopBar
        activeSection={topSection}
        onSelectSection={handleTopSectionChange}
        onRefresh={handleManualRefresh}
        isRefreshing={isRefreshing}
        unreadAlertsCount={unreadAlertsCount}
      />

      <div className="flex-1 flex flex-col lg:flex-row max-w-[1600px] w-full mx-auto">
        {/* Match Selector Sidebar (Sticky on Desktop, Slide-over Drawer on Mobile) */}
        <MatchSidebar
          matches={matches}
          selectedMatchId={selectedMatchId}
          onSelectMatch={handleSelectMatchFromSidebar}
          selectedLeague={selectedLeague}
          onSelectLeague={setSelectedLeague}
          dateOffset={dateOffset}
          onChangeDateOffset={setDateOffset}
          statusFilter={statusFilter}
          onChangeStatusFilter={setStatusFilter}
          searchQuery={searchQuery}
          onChangeSearchQuery={setSearchQuery}
          favoriteIds={favoriteIds}
          onToggleFavorite={toggleFavorite}
          loading={matchesLoading}
          error={matchesError}
          isOpenMobile={mobileMatchesOpen}
          onCloseMobile={() => setMobileMatchesOpen(false)}
          sidebarAd={
            <AdBannerSlot
              placement="sidebar"
              config={adConfig}
              isOwner={isAdOwner}
              onOpenAdManager={() => openMonetizationModal('ads')}
            />
          }
        />

        {/* Main Tactical, News & Analytics Workspace */}
        <main className="flex-1 min-w-0 p-3.5 sm:p-6 pb-24 lg:pb-6 space-y-4 sm:space-y-5">
          {/* Initial Signature Banner: SNOX SPORT · BY WANIS */}
          <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 border-b border-slate-800/80 pb-3">
            <div className="flex items-baseline gap-2.5 sm:gap-3">
              <h1
                className="font-['Outfit',sans-serif] text-lg sm:text-2xl font-extrabold tracking-wide text-white"
                dir="ltr"
              >
                SNOX SPORT
              </h1>
              <span
                className="font-['Outfit',sans-serif] text-[11px] sm:text-sm font-bold tracking-[0.2em] text-emerald-400"
                dir="ltr"
              >
                BY WANIS
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-400">
              رادار تكتيكي حي · أخبار الكرة العالمية · إشعارات أهداف فورية وإحصائيات شاملة
            </p>
          </div>

          {/* Mobile Quick Match Picker & Horizontal Match Strip */}
          <div className="flex lg:hidden items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
            <button
              type="button"
              onClick={() => setMobileMatchesOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ListFilter className="h-3.5 w-3.5" />
              <span>المباريات ({matches.length})</span>
            </button>

            {matches.slice(0, 12).map((m) => {
              const isSelected = m.id === selectedMatchId;
              return (
                <button
                  key={`mob-${m.id}`}
                  type="button"
                  onClick={() => handleSelectMatchFromSidebar(m.id)}
                  className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs whitespace-nowrap shrink-0 cursor-pointer ${
                    isSelected
                      ? 'border-emerald-500/60 bg-emerald-500/15 text-white font-semibold'
                      : 'border-slate-800 bg-[#111827] text-slate-300'
                  }`}
                >
                  <span className="truncate max-w-[78px]">{m.home.shortName || m.home.name}</span>
                  <span className="font-mono text-[11px] font-bold tabular-nums text-emerald-400" dir="ltr">
                    {m.state === 'pre' ? 'VS' : `${m.home.score}-${m.away.score}`}
                  </span>
                  <span className="truncate max-w-[78px]">{m.away.shortName || m.away.name}</span>
                  {m.state === 'in' && (
                    <span className="font-mono text-[10px] font-bold text-red-400 tabular-nums">
                      {m.displayClock}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Section: Watch Free, News, Alerts, Standings or Active Match */}
          {topSection === 'watch' ? (
            <WatchFreeView
              matches={matches}
              activeMatch={matchDetail}
              onSelectMatch={(id) => setSelectedMatchId(id)}
              bottomAd={
                <AdBannerSlot
                  placement="watch_banner"
                  config={adConfig}
                  isOwner={isAdOwner}
                  onOpenAdManager={() => openMonetizationModal('ads')}
                />
              }
            />
          ) : topSection === 'news' ? (
            <NewsView
              initialLeague={selectedLeague}
              inlineAd={
                <AdBannerSlot
                  placement="news_feed"
                  config={adConfig}
                  isOwner={isAdOwner}
                  onOpenAdManager={() => openMonetizationModal('ads')}
                />
              }
            />
          ) : topSection === 'alerts' ? (
            <AlertsPanel
              alerts={alerts}
              soundEnabled={soundEnabled}
              onToggleSound={() => setSoundEnabled((s) => !s)}
              favoritesOnlyAlerts={favoritesOnlyAlerts}
              onToggleFavoritesOnly={() => setFavoritesOnlyAlerts((f) => !f)}
              browserPermission={browserPermission}
              onRequestBrowserPermission={handleRequestBrowserPermission}
              onTestGoalAlert={handleTestGoalAlert}
              onClearAlerts={() => setAlerts([])}
              onSelectMatch={(id) => {
                if (id) setSelectedMatchId(id);
                setTopSection('match');
                setMatchSubTab('radar');
              }}
            />
          ) : topSection === 'standings' ? (
            <StandingsView
              initialLeagueSlug={matchDetail?.leagueSlug || selectedLeague}
              highlightHomeId={matchDetail?.home.id}
              highlightAwayId={matchDetail?.away.id}
            />
          ) : detailLoading && !matchDetail ? (
            <div className="rounded-xl border border-slate-800 bg-[#111827] p-6 space-y-4">
              <div className="h-6 w-48 rounded bg-slate-800/60 animate-pulse mx-auto" />
              <div className="h-14 rounded bg-slate-800/50 animate-pulse" />
            </div>
          ) : detailError ? (
            <div className="rounded-xl border border-slate-800 bg-[#111827] p-8 text-center text-sm text-red-400">
              {detailError}
            </div>
          ) : matchDetail ? (
            <>
              {/* Match Scoreboard Hero */}
              <section className="rounded-xl border border-slate-800 bg-[#111827] p-4 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <span className="font-medium text-slate-200">
                      {translateLeagueName(matchDetail.leagueSlug, matchDetail.leagueName)}
                    </span>
                    {matchDetail.venue && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{matchDetail.venue}</span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span
                      className={`font-mono tabular-nums font-semibold ${
                        matchDetail.state === 'in'
                          ? 'text-red-400'
                          : matchDetail.state === 'post'
                          ? 'text-slate-300'
                          : 'text-emerald-400'
                      }`}
                    >
                      {matchDetail.state === 'pre'
                        ? formatMatchTimeArabic(matchDetail.date) || matchDetail.statusDetail
                        : translateStatusText(
                            matchDetail.state,
                            matchDetail.statusDetail,
                            matchDetail.displayClock
                          )}
                    </span>
                  </div>

                  {/* Quick Match Actions: Favorite & Share */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleFavorite(matchDetail.id)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                        isSelectedFav
                          ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                          : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <Star className={`h-3.5 w-3.5 ${isSelectedFav ? 'fill-amber-400' : ''}`} />
                      <span>{isSelectedFav ? 'في المفضلة' : 'تنبيه الأهداف'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleShareMatch}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      {copiedLink ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                          <span className="text-emerald-400">تم النسخ</span>
                        </>
                      ) : (
                        <>
                          <Share2 className="h-3.5 w-3.5" />
                          <span>مشاركة</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Home vs Away Scoreline */}
                <div className="grid grid-cols-3 items-center gap-2 sm:gap-4 max-w-3xl mx-auto">
                  <div className="flex flex-col sm:flex-row items-center justify-end gap-2 sm:gap-3 text-center sm:text-left">
                    <div className="order-2 sm:order-1 min-w-0">
                      <h2 className="text-sm sm:text-xl font-bold text-white leading-tight line-clamp-2">
                        {matchDetail.home.name}
                      </h2>
                      {matchDetail.home.record && (
                        <p className="font-mono text-[10px] sm:text-[11px] text-slate-400 mt-0.5" dir="ltr">
                          {matchDetail.home.record}
                        </p>
                      )}
                    </div>
                    <div className="order-1 sm:order-2">
                      <TeamCrest
                        logo={matchDetail.home.logo}
                        name={matchDetail.home.name}
                        color={matchDetail.home.color}
                        size={42}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col items-center justify-center">
                    <div
                      className="font-mono text-2xl sm:text-5xl font-extrabold tracking-tight text-white tabular-nums"
                      dir="ltr"
                    >
                      {matchDetail.state === 'pre'
                        ? 'VS'
                        : `${matchDetail.home.score} - ${matchDetail.away.score}`}
                    </div>
                    {matchDetail.state === 'in' && (
                      <span className="mt-1 font-mono text-xs font-bold text-red-400 tabular-nums">
                        {matchDetail.displayClock}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row items-center justify-start gap-2 sm:gap-3 text-center sm:text-right">
                    <TeamCrest
                      logo={matchDetail.away.logo}
                      name={matchDetail.away.name}
                      color={matchDetail.away.color}
                      size={42}
                    />
                    <div className="min-w-0">
                      <h2 className="text-sm sm:text-xl font-bold text-white leading-tight line-clamp-2">
                        {matchDetail.away.name}
                      </h2>
                      {matchDetail.away.record && (
                        <p className="font-mono text-[10px] sm:text-[11px] text-slate-400 mt-0.5" dir="ltr">
                          {matchDetail.away.record}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* 4-Column Quick KPI Strip */}
                <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-slate-800/80 pt-4">
                  {[
                    { label: 'الاستحواذ', h: poss.home, a: poss.away },
                    { label: 'التسديدات', h: shots.home, a: shots.away },
                    { label: 'على المرمى', h: onTarget.home, a: onTarget.away },
                    { label: 'الركنيات', h: corners.home, a: corners.away },
                  ].map((kpi) => (
                    <div
                      key={kpi.label}
                      className="rounded-lg bg-[#0B0F17] border border-slate-800/70 px-3 py-2 flex items-center justify-between gap-2"
                    >
                      <span className="font-mono text-xs font-bold text-emerald-400 tabular-nums">
                        {kpi.h}
                      </span>
                      <span className="text-[11px] text-slate-400">{kpi.label}</span>
                      <span className="font-mono text-xs font-bold text-sky-400 tabular-nums">
                        {kpi.a}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Match Sub-Navigation Tabs */}
                <div className="mt-5 flex flex-wrap items-center gap-1 rounded-lg bg-[#0B0F17] p-1 border border-slate-800/80">
                  {[
                    { id: 'radar' as const, label: 'الرادار التكتيكي المباشر' },
                    { id: 'shots' as const, label: 'خريطة التسديدات والزخم' },
                    { id: 'lineups' as const, label: 'التشكيل واللاعبون' },
                    { id: 'stats' as const, label: 'الإحصائيات والفورمة' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setMatchSubTab(tab.id);
                        setTopSection('match');
                      }}
                      className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                        matchSubTab === tab.id
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </section>

              {/* Non-intrusive Monetization Ad Slot (Visible right below Match Scoreboard) */}
              <AdBannerSlot
                placement="main_banner"
                config={adConfig}
                isOwner={isAdOwner}
                onOpenAdManager={() => openMonetizationModal('ads')}
              />

              {matchSubTab === 'radar' && <TacticalRadar match={matchDetail} />}
              {matchSubTab === 'shots' && <ShotAndHeatmapView match={matchDetail} />}
              {matchSubTab === 'lineups' && <LineupsView match={matchDetail} />}
              {matchSubTab === 'stats' && <StatsAndFormView match={matchDetail} />}
            </>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-[#111827] p-12 text-center space-y-2">
              <p className="text-base font-bold text-white">اختر مباراة من القائمة الجانبية</p>
              <p className="text-xs text-slate-400">
                سيتم عرض الرادار التكتيكي المباشر والخرائط والإحصائيات فور اختيار المباراة.
              </p>
            </div>
          )}

          {/* Ad Slot on Standings & Alerts pages */}
          {(topSection === 'standings' || topSection === 'alerts') && (
            <AdBannerSlot
              placement="main_banner"
              config={adConfig}
              isOwner={isAdOwner}
              onOpenAdManager={() => openMonetizationModal('ads')}
            />
          )}

          {/* Web Development Contact & Monetization Bar */}
          <section className="rounded-xl border border-slate-800 bg-[#111827] px-5 py-4 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-['Outfit',sans-serif] text-sm font-extrabold tracking-wide text-white" dir="ltr">
                  SNOX SPORT
                </span>
                <span className="text-slate-600">·</span>
                <span className="font-['Outfit',sans-serif] text-xs font-bold tracking-widest text-emerald-400" dir="ltr">
                  BY WANIS
                </span>
              </div>
              <p className="text-xs text-slate-300">
                للتواصل وطلب إنشاء المواقع والمنصات الرقمية أو حجز مساحات إعلانية
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => openMonetizationModal('ads')}
                className="rounded-lg border border-slate-700 bg-[#0B0F17] px-3.5 py-2 text-xs font-semibold text-emerald-400 hover:border-emerald-500 transition-colors cursor-pointer whitespace-nowrap"
              >
                إدارة الإعلانات والأرباح
              </button>
              <a
                href="tel:01152567493"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-[#0B0F17] px-3.5 py-2 font-mono text-xs font-semibold text-white hover:border-emerald-500 transition-colors"
                dir="ltr"
              >
                <span>01152567493</span>
              </a>
              <a
                href="https://wa.me/201152567493"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors"
              >
                <span>تواصل عبر واتساب</span>
              </a>
            </div>
          </section>

          {/* Footer with Required Legal & Monetization Links */}
          <footer className="border-t border-slate-800/70 pt-3 pb-2 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
            <span className="font-['Outfit',sans-serif] font-semibold tracking-wider text-slate-400" dir="ltr">
              SNOX SPORT · BY WANIS · 01152567493
            </span>
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={() => openMonetizationModal('earnings')}
                className="hover:text-emerald-400 transition-colors cursor-pointer"
              >
                طرق الربح والسحب
              </button>
              <button
                type="button"
                onClick={() => openMonetizationModal('privacy')}
                className="hover:text-emerald-400 transition-colors cursor-pointer"
              >
                سياسة الخصوصية
              </button>
              <button
                type="button"
                onClick={() => openMonetizationModal('ads')}
                className="hover:text-emerald-400 transition-colors cursor-pointer"
              >
                أعلن معنا
              </button>
            </div>
          </footer>
        </main>
      </div>

      {/* Monetization, AdSense & Privacy Modal */}
      <MonetizationModal
        isOpen={adModalOpen}
        initialTab={adModalTab}
        onClose={() => setAdModalOpen(false)}
        config={adConfig}
        user={adUser}
        isOwner={isAdOwner}
        saving={adSaving}
        onSignInOwner={signInOwner}
        onSignOutOwner={signOutOwner}
        onSaveSettings={saveSiteSettings}
        onCreateCampaign={createCampaign}
        onToggleCampaign={toggleCampaignActive}
        onDeleteCampaign={removeCampaign}
      />

      {/* Floating Real-Time Goal Notification Toast */}
      <GoalToastBanner
        alert={activeToast}
        onDismiss={() => setActiveToast(null)}
        onOpenMatch={(id) => {
          setActiveToast(null);
          if (id) setSelectedMatchId(id);
          setTopSection('match');
          setMatchSubTab('radar');
        }}
      />

      {/* Sticky Mobile Bottom Navigation Bar */}
      <nav
        aria-label="التنقل السريع للموبايل"
        className="fixed bottom-0 inset-x-0 z-30 lg:hidden border-t border-slate-800/90 bg-[#0B0F17]/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
      >
        <div className="grid grid-cols-5 h-14">
          {[
            { id: 'match' as const, label: 'الرادار', icon: Radar },
            { id: 'watch' as const, label: 'مشاهدة', icon: Tv },
            { id: 'news' as const, label: 'الأخبار', icon: Newspaper },
            { id: 'standings' as const, label: 'الترتيب', icon: Table2 },
            {
              id: 'alerts' as const,
              label: unreadAlertsCount > 0 ? `(${unreadAlertsCount})` : 'التنبيهات',
              icon: Bell,
            },
          ].map((item) => {
            const Icon = item.icon;
            const isActive = topSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  handleTopSectionChange(item.id);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold cursor-pointer transition-colors ${
                  isActive ? 'text-emerald-400' : 'text-slate-400'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
