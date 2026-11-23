import { useEffect, useState, type ReactNode } from 'react';
import { ExternalLink, Play, Radio, Tv } from 'lucide-react';
import type { HighlightClip, MatchDetail, MatchListItem } from '../types/sports';
import { isSafeHttpUrl, translateLeagueName } from '../utils/arabicSports';
import { TacticalRadar } from './TacticalRadar';

interface WatchFreeViewProps {
  matches: MatchListItem[];
  activeMatch: MatchDetail | null;
  onSelectMatch: (id: string) => void;
  bottomAd?: ReactNode;
}

const FREE_OPEN_CHANNELS = [
  {
    name: 'أون تايم سبورتس 1 & 2',
    region: 'مصر · مجانية مفتوحة',
    coverage: 'الدوري المصري الممتاز، كأس مصر، ومباريات المنتخبات والأندية المصرية قارياً (البث الأرضي)',
    satellite: 'نايل سات · 11861 V · 27500',
    officialUrl: 'https://www.youtube.com/@ONTimeSports',
  },
  {
    name: 'SSC الرياضية المفتوحة',
    region: 'السعودية · مجانية (SD)',
    coverage: 'دوري روشن السعودي، كأس خادم الحرمين الشريفين، ومنافسات الكرة السعودية',
    satellite: 'عرب سات · 12418 H · 27500',
    officialUrl: 'https://shahid.mbc.net/ar/widgets/live',
  },
  {
    name: 'قنوات الكأس المفتوحة',
    region: 'قطر · مجانية مفتوحة',
    coverage: 'دوري نجوم قطر، البطولات الآسيوية والخليجية، وبرامج التحليل المباشر',
    satellite: 'نايل سات · 11919 H · 27500',
    officialUrl: 'https://www.alkass.net/alkass/live.aspx',
  },
  {
    name: 'أبوظبي الرياضية المفتوحة 1 & 2',
    region: 'الإمارات · مجانية مفتوحة',
    coverage: 'الدوري الإماراتي، البطولات العربية والآسيوية، واستوديوهات التحليل',
    satellite: 'نايل سات · 11411 H · 30000',
    officialUrl: 'https://adsports.ae/live',
  },
  {
    name: 'الرياضية المغربية TNT',
    region: 'المغرب · مجانية مفتوحة',
    coverage: 'البطولة الاحترافية المغربية ومباريات الأندية والمنتخبات المغربية',
    satellite: 'نايل سات · 11476 V · 27500',
    officialUrl: 'https://arryadia.snrt.ma/',
  },
  {
    name: 'بي إن سبورتس الإخبارية',
    region: 'دولية · مجانية مفتوحة',
    coverage: 'تغطية مباشرة لأهم المباريات الأوروبية، المؤتمرات الصحفية، واستوديوهات قبل وبعد المباريات',
    satellite: 'نايل سات · 12604 H · 27500',
    officialUrl: 'https://www.beinsports.com/ar-mena',
  },
];

function formatDuration(sec: number): string {
  if (!sec || sec <= 0) return '01:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function WatchFreeView({ matches, activeMatch, onSelectMatch, bottomAd }: WatchFreeViewProps) {
  const [highlights, setHighlights] = useState<HighlightClip[]>([]);
  const [loadingClips, setLoadingClips] = useState(true);
  const [selectedClip, setSelectedClip] = useState<HighlightClip | null>(null);
  const [mode, setMode] = useState<'highlights' | 'radar_live' | 'channels'>('highlights');

  useEffect(() => {
    let active = true;
    setLoadingClips(true);
    fetch('/api/highlights')
      .then((r) => (r.ok ? r.json() : { clips: [] }))
      .then((json) => {
        if (!active) return;
        const list: HighlightClip[] = json.clips || [];
        setHighlights(list);
        if (list.length > 0) setSelectedClip(list[0]);
      })
      .catch(() => {
        if (active) setHighlights([]);
      })
      .finally(() => {
        if (active) setLoadingClips(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Merge active match's own videos first if present
  const activeMatchVideos: HighlightClip[] = (activeMatch?.videos || []).map((v) => ({
    ...v,
    matchId: activeMatch?.id || '',
    matchName: activeMatch ? `${activeMatch.home.name} - ${activeMatch.away.name}` : '',
    leagueName: activeMatch
      ? translateLeagueName(activeMatch.leagueSlug, activeMatch.leagueName)
      : '',
    scoreline: activeMatch ? `${activeMatch.home.score} - ${activeMatch.away.score}` : '',
  }));

  const allClips = [...activeMatchVideos, ...highlights.filter((h) => !activeMatchVideos.some((av) => av.id === h.id))];
  const liveMatches = matches.filter((m) => m.state === 'in');

  return (
    <div className="space-y-6">
      {/* Header & Mode Switcher */}
      <div className="rounded-xl border border-slate-800 bg-[#111827] p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-base font-bold text-white">
            مركز المشاهدة المجانية والملخصات الرسمية
          </h2>
          <p className="text-xs text-slate-400">
            شاهد أهداف وملخصات المباريات مجاناً، أو تابع البث التفاعلي المباشر بالملعب، أو استعرض القنوات المجانية المفتوحة.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-[#0B0F17] p-1 border border-slate-800">
          {[
            { id: 'highlights' as const, label: 'مشاهدة الأهداف والملخصات' },
            { id: 'radar_live' as const, label: 'البث التفاعلي المباشر للملعب' },
            { id: 'channels' as const, label: 'القنوات المجانية المفتوحة' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setMode(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                mode === tab.id ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Mode 1: HD Highlights & Goals Video Player */}
      {mode === 'highlights' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          <div className="xl:col-span-8 rounded-xl border border-slate-800 bg-[#111827] overflow-hidden">
            {loadingClips && allClips.length === 0 ? (
              <div className="aspect-video bg-slate-900 animate-pulse" />
            ) : selectedClip && isSafeHttpUrl(selectedClip.videoUrl) ? (
              <div>
                <div className="aspect-video bg-black">
                  <video
                    key={selectedClip.id}
                    src={isSafeHttpUrl(selectedClip.videoUrl) as string}
                    poster={isSafeHttpUrl(selectedClip.thumbnail) || undefined}
                    controls
                    playsInline
                    className="h-full w-full"
                  />
                </div>
                <div className="p-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/80">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span className="font-semibold text-emerald-400">{selectedClip.leagueName}</span>
                      <span>·</span>
                      <span className="font-mono">{selectedClip.scoreline}</span>
                      <span>·</span>
                      <span className="font-mono">{formatDuration(selectedClip.duration)}</span>
                    </div>
                    <h3 className="text-sm sm:text-base font-bold text-white" dir="auto">
                      {selectedClip.headline}
                    </h3>
                  </div>

                  {selectedClip.matchId && (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectMatch(selectedClip.matchId);
                        setMode('radar_live');
                      }}
                      className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                    >
                      فتح الرادار والتحليل لهذه المباراة
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="aspect-video flex flex-col items-center justify-center p-8 text-center space-y-3 bg-[#0B0F17]">
                <Tv className="h-10 w-10 text-emerald-500/60" />
                <p className="text-sm font-bold text-white">اختر فيديو من القائمة الجانبية للمشاهدة المجانية</p>
                <p className="text-xs text-slate-400 max-w-md">
                  تتوفر ملخصات الفيديو تلقائياً فور نهاية المباريات أو تسجيل الأهداف في البطولات الكبرى.
                </p>
              </div>
            )}
          </div>

          {/* Clips Playlist */}
          <div className="xl:col-span-4 rounded-xl border border-slate-800 bg-[#111827] flex flex-col max-h-[540px]">
            <div className="px-4 py-3 border-b border-slate-800/80 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">أحدث الملخصات والأهداف</h3>
              <span className="font-mono text-xs text-slate-400 tabular-nums">
                {allClips.length} مقطع
              </span>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
              {allClips.length === 0 && !loadingClips ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  لا توجد مقاطع ملخصات منشورة حالياً. يمكنك متابعة البث التفاعلي المباشر للمباريات الجارية.
                </div>
              ) : (
                allClips.map((clip, idx) => {
                  const isCurrent = selectedClip?.id === clip.id;
                  return (
                    <button
                      key={`${clip.id}-${idx}`}
                      type="button"
                      onClick={() => setSelectedClip(clip)}
                      className={`w-full text-right p-3 flex items-center gap-3 transition-colors cursor-pointer ${
                        isCurrent ? 'bg-emerald-500/12' : 'hover:bg-slate-800/35'
                      }`}
                    >
                      <div className="relative w-24 aspect-video rounded-md overflow-hidden bg-slate-900 shrink-0">
                        {isSafeHttpUrl(clip.thumbnail) ? (
                          <img
                            src={isSafeHttpUrl(clip.thumbnail) as string}
                            alt={clip.headline}
                            referrerPolicy="no-referrer"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center bg-slate-800">
                            <Play className="h-4 w-4 text-emerald-400" />
                          </div>
                        )}
                        <span className="absolute bottom-1 left-1 rounded bg-black/80 px-1 font-mono text-[10px] text-white tabular-nums">
                          {formatDuration(clip.duration)}
                        </span>
                      </div>

                      <div className="min-w-0 space-y-1">
                        <p className="text-[11px] font-medium text-emerald-400 truncate">
                          {clip.leagueName} {clip.scoreline ? `· ${clip.scoreline}` : ''}
                        </p>
                        <p className="text-xs font-semibold text-slate-100 line-clamp-2" dir="auto">
                          {clip.headline}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mode 2: Live Interactive Pitch Broadcast + Real Match Channels */}
      {mode === 'radar_live' && (
        <div className="space-y-5">
          {liveMatches.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-red-400 inline-flex items-center gap-1.5">
                <Radio className="h-3.5 w-3.5" />
                مباريات جارية الآن:
              </span>
              {liveMatches.slice(0, 8).map((lm) => (
                <button
                  key={lm.id}
                  type="button"
                  onClick={() => onSelectMatch(lm.id)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                    activeMatch?.id === lm.id
                      ? 'border-emerald-500 bg-emerald-500/15 text-white'
                      : 'border-slate-800 bg-[#111827] text-slate-300 hover:border-slate-700'
                  }`}
                >
                  {lm.home.shortName || lm.home.name} {lm.home.score}-{lm.away.score}{' '}
                  {lm.away.shortName || lm.away.name} ·{' '}
                  <span className="font-mono text-red-400">{lm.displayClock}</span>
                </button>
              ))}
            </div>
          )}

          {activeMatch ? (
            <>
              <TacticalRadar match={activeMatch} />

              {activeMatch.broadcasts && activeMatch.broadcasts.length > 0 && (
                <div className="rounded-xl border border-slate-800 bg-[#111827] p-4 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs font-bold text-white">القنوات والمنصات الناقلة لهذه المباراة:</span>
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    {activeMatch.broadcasts.map((b, i) => (
                      <span key={`${b.channel}-${i}`} className="text-emerald-400 font-semibold">
                        {b.channel} ({b.type})
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-[#111827] p-8 text-center text-xs text-slate-400">
              اختر أي مباراة من القائمة الجانبية لفتح البث التفاعلي المباشر.
            </div>
          )}
        </div>
      )}

      {/* Mode 3: Official Free-to-Air Channels Guide */}
      {mode === 'channels' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {FREE_OPEN_CHANNELS.map((ch) => (
            <div
              key={ch.name}
              className="rounded-xl border border-slate-800 bg-[#111827] p-5 flex flex-col justify-between space-y-4"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-emerald-400">{ch.region}</span>
                  <Tv className="h-4 w-4 text-slate-500" />
                </div>
                <h3 className="text-base font-bold text-white">{ch.name}</h3>
                <p className="text-xs text-slate-300 leading-relaxed">{ch.coverage}</p>
                <p className="font-mono text-[11px] text-slate-400 pt-1" dir="ltr">
                  {ch.satellite}
                </p>
              </div>

              <a
                href={ch.officialUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors"
              >
                <span>فتح البث الرسمي المجاني</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          ))}
        </div>
      )}

      {bottomAd}
    </div>
  );
}
