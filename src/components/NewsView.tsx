import { useEffect, useState, type ReactNode } from 'react';
import { ExternalLink, Newspaper } from 'lucide-react';
import type { NewsArticle } from '../types/sports';
import {
  LEAGUE_OPTIONS,
  formatRelativeArabicTime,
  isSafeHttpUrl,
} from '../utils/arabicSports';

interface NewsViewProps {
  initialLeague?: string;
  inlineAd?: ReactNode;
}

type NewsSectionFilter = 'all' | 'local' | 'africa' | 'asia' | 'world' | 'transfers';

const SECTION_TABS: { id: NewsSectionFilter; label: string }[] = [
  { id: 'all', label: 'كل الأقسام' },
  { id: 'local', label: 'مصر والمحلي' },
  { id: 'africa', label: 'أفريقيا والعرب' },
  { id: 'asia', label: 'آسيا والخليج' },
  { id: 'world', label: 'أوروبا والعالم' },
  { id: 'transfers', label: 'سوق الانتقالات' },
];

const SECTION_TITLES: Record<Exclude<NewsSectionFilter, 'all'>, string> = {
  local: 'أخبار الكرة المصرية والمحلية',
  africa: 'أخبار الكرة الأفريقية والعربية',
  asia: 'أخبار الكرة الآسيوية والخليجية',
  world: 'أخبار الكرة العالمية والبطولات الأوروبية',
  transfers: 'سوق الانتقالات والصفقات',
};

const SECTION_FALLBACK_IMAGES: Record<NewsArticle['section'], string> = {
  local: '/src/assets/images/news_egypt_stadium_1795222605678.jpg',
  africa: '/src/assets/images/news_africa_football_1795222605769.jpg',
  asia: '/src/assets/images/news_asia_pitch_1795222605473.jpg',
  world: '/src/assets/images/news_europe_night_1795222605684.jpg',
  transfers: '/src/assets/images/news_transfer_contract_1795222605103.jpg',
};

function ArticleImage({
  src,
  section,
  alt,
}: {
  src: string | null;
  section: NewsArticle['section'];
  alt: string;
}) {
  const fallbackSrc = SECTION_FALLBACK_IMAGES[section] || SECTION_FALLBACK_IMAGES.world;
  const [imgSrc, setImgSrc] = useState<string>(src || fallbackSrc);

  useEffect(() => {
    setImgSrc(src || fallbackSrc);
  }, [src, fallbackSrc]);

  return (
    <img
      src={imgSrc}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => {
        if (imgSrc !== fallbackSrc) {
          setImgSrc(fallbackSrc);
        }
      }}
      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
    />
  );
}

function ArticleCard({ art }: { art: NewsArticle }) {
  const safeUrl = isSafeHttpUrl(art.linkUrl);
  return (
    <article className="group rounded-xl border border-slate-800 bg-[#111827] overflow-hidden flex flex-col justify-between">
      <div>
        <div className="aspect-[16/9] overflow-hidden bg-slate-900">
          <ArticleImage src={art.imageUrl} section={art.section} alt={art.headline} />
        </div>
        <div className="p-4 space-y-2">
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <span className="font-semibold text-emerald-400 shrink-0">{art.leagueName}</span>
            <span aria-hidden="true">·</span>
            <span className="truncate">{art.sourceName || art.category}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono shrink-0">
              {formatRelativeArabicTime(art.published)}
            </span>
          </div>
          <h3 className="text-sm font-bold text-white leading-snug line-clamp-2" dir="auto">
            {art.headline}
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed line-clamp-2" dir="auto">
            {art.description}
          </p>
        </div>
      </div>

      {safeUrl && (
        <div className="px-4 pb-4 pt-1">
          <a
            href={safeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            <span>قراءة الخبر</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}
    </article>
  );
}

export function NewsView({ initialLeague = 'all', inlineAd }: NewsViewProps) {
  const [league, setLeague] = useState(initialLeague);
  const [sectionFilter, setSectionFilter] = useState<NewsSectionFilter>('all');
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetch(`/api/news?league=${encodeURIComponent(league)}`)
      .then((r) => {
        if (!r.ok) throw new Error('تعذر تحميل الأخبار الرياضية');
        return r.json();
      })
      .then((json) => {
        if (active) setArticles(json.articles || []);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'حدث خطأ أثناء التحميل');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [league]);

  const filtered = articles.filter((a) => {
    if (sectionFilter !== 'all' && a.section !== sectionFilter) return false;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      return `${a.headline} ${a.description} ${a.category} ${a.leagueName} ${a.sourceName}`
        .toLowerCase()
        .includes(q);
    }
    return true;
  });

  const leadArticle = filtered[0] || null;
  const remaining = filtered.slice(1);

  return (
    <div className="space-y-6">
      {/* Divided News Sections Bar + League & Search */}
      <div className="rounded-xl border border-slate-800 bg-[#111827] p-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-[#0B0F17] p-1 border border-slate-800">
            {SECTION_TABS.map((sec) => (
              <button
                key={sec.id}
                type="button"
                onClick={() => setSectionFilter(sec.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  sectionFilter === sec.id
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {sec.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <select
              aria-label="تصفية الأخبار حسب البطولة"
              value={league}
              onChange={(e) => setLeague(e.target.value)}
              className="rounded-lg border border-slate-800 bg-[#0B0F17] px-3 py-2 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
            >
              {LEAGUE_OPTIONS.map((lg) => (
                <option key={lg.slug} value={lg.slug}>
                  {lg.label}
                </option>
              ))}
            </select>

            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث في الأخبار..."
              className="flex-1 sm:w-52 rounded-lg border border-slate-800 bg-[#0B0F17] px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-64 rounded-xl bg-slate-800/40 animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-slate-800 bg-[#111827] p-8 text-center text-xs text-red-400">
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-[#111827] p-10 text-center space-y-2">
          <p className="text-sm font-semibold text-white">لا توجد أخبار مطابقة في هذا القسم</p>
          <p className="text-xs text-slate-400">جرّب اختيار «كل الأقسام» أو تغيير البطولة.</p>
        </div>
      ) : (
        <>
          {/* Lead Featured Story */}
          {leadArticle && (
            <article className="group rounded-xl border border-slate-800 bg-[#111827] overflow-hidden grid grid-cols-1 lg:grid-cols-12">
              <div className="lg:col-span-6 aspect-[16/9] lg:aspect-auto lg:min-h-[260px] overflow-hidden bg-slate-900">
                <ArticleImage src={leadArticle.imageUrl} section={leadArticle.section} alt={leadArticle.headline} />
              </div>
              <div className="lg:col-span-6 p-5 sm:p-6 flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <span className="font-semibold text-emerald-400">{leadArticle.leagueName}</span>
                    <span aria-hidden="true">·</span>
                    <span>{leadArticle.sourceName || leadArticle.category}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono text-[11px]">
                      {formatRelativeArabicTime(leadArticle.published)}
                    </span>
                  </div>
                  <h2 className="text-lg sm:text-xl font-bold text-white leading-snug" dir="auto">
                    {leadArticle.headline}
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed line-clamp-3" dir="auto">
                    {leadArticle.description}
                  </p>
                </div>

                {isSafeHttpUrl(leadArticle.linkUrl) && (
                  <div>
                    <a
                      href={isSafeHttpUrl(leadArticle.linkUrl) as string}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors"
                    >
                      <span>قراءة التقرير الكامل</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                )}
              </div>
            </article>
          )}

          {inlineAd}

          {/* Divided Sections when viewing 'all', or single grid when filtered */}
          {sectionFilter === 'all' && !query.trim() && league === 'all' ? (
            <div className="space-y-8">
              {(['local', 'africa', 'asia', 'world', 'transfers'] as const).map((secKey) => {
                const secItems = remaining.filter((a) => a.section === secKey).slice(0, 6);
                if (secItems.length === 0) return null;
                return (
                  <section key={secKey} className="space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                      <h3 className="text-base font-bold text-white">{SECTION_TITLES[secKey]}</h3>
                      <button
                        type="button"
                        onClick={() => setSectionFilter(secKey)}
                        className="text-xs font-medium text-emerald-400 hover:text-emerald-300 cursor-pointer"
                      >
                        عرض القسم بالكامل
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                      {secItems.map((art, idx) => (
                        <ArticleCard key={`${secKey}-${art.id}-${idx}`} art={art} />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {remaining.map((art, idx) => (
                <ArticleCard key={`${art.id}-${idx}`} art={art} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
