import { useEffect, useState } from 'react';
import type { StandingsData } from '../types/sports';
import { STANDINGS_LEAGUES } from '../utils/arabicSports';
import { TeamCrest } from './MatchSidebar';

interface StandingsViewProps {
  initialLeagueSlug: string;
  highlightHomeId?: string;
  highlightAwayId?: string;
}

export function StandingsView({
  initialLeagueSlug,
  highlightHomeId,
  highlightAwayId,
}: StandingsViewProps) {
  const validInitial = STANDINGS_LEAGUES.some((l) => l.slug === initialLeagueSlug)
    ? initialLeagueSlug
    : 'eng.1';

  const [league, setLeague] = useState(validInitial);
  const [data, setData] = useState<StandingsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (STANDINGS_LEAGUES.some((l) => l.slug === initialLeagueSlug)) {
      setLeague(initialLeagueSlug);
    }
  }, [initialLeagueSlug]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetch(`/api/standings?league=${encodeURIComponent(league)}`)
      .then((r) => {
        if (!r.ok) throw new Error('تعذر تحميل جدول الترتيب');
        return r.json();
      })
      .then((json: StandingsData) => {
        if (active) setData(json);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'حدث خطأ');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [league]);

  return (
    <div className="space-y-4">
      {/* League Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-[#111827] p-1 border border-slate-800">
          {STANDINGS_LEAGUES.map((lg) => (
            <button
              key={lg.slug}
              type="button"
              onClick={() => setLeague(lg.slug)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                league === lg.slug
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {lg.label}
            </button>
          ))}
        </div>
        {data?.seasonName && (
          <span className="font-mono text-xs text-slate-400">{data.seasonName}</span>
        )}
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-800 bg-[#111827] p-6 space-y-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-9 rounded bg-slate-800/40 animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-slate-800 bg-[#111827] p-8 text-center text-xs text-red-400">
          {error}
        </div>
      ) : !data || data.groups.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-[#111827] p-8 text-center text-xs text-slate-400">
          لا يتوفر جدول ترتيب مسجل لهذه البطولة حالياً.
        </div>
      ) : (
        data.groups.map((grp, gIdx) => (
          <div
            key={`${grp.name || 'grp'}-${gIdx}`}
            className="rounded-xl border border-slate-800 bg-[#111827] overflow-hidden"
          >
            {grp.name && (
              <div className="px-4 py-3 border-b border-slate-800/80 flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">{grp.name}</h3>
                <span className="font-mono text-xs text-slate-400 tabular-nums">
                  {grp.rows.length} فريق
                </span>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-[#0E1420] text-slate-400">
                    <th className="py-2.5 px-2 sm:px-3 text-center font-medium w-8 sm:w-10">#</th>
                    <th className="py-2.5 px-2 sm:px-3 text-right font-medium">الفريق</th>
                    <th className="py-2.5 px-1.5 sm:px-2.5 text-center font-medium">لعب</th>
                    <th className="py-2.5 px-1.5 sm:px-2.5 text-center font-medium">فاز</th>
                    <th className="py-2.5 px-1.5 sm:px-2.5 text-center font-medium">تعادل</th>
                    <th className="py-2.5 px-1.5 sm:px-2.5 text-center font-medium">خسر</th>
                    <th className="py-2.5 px-2.5 text-center font-medium hidden sm:table-cell">له</th>
                    <th className="py-2.5 px-2.5 text-center font-medium hidden sm:table-cell">عليه</th>
                    <th className="py-2.5 px-1.5 sm:px-2.5 text-center font-medium">الفارق</th>
                    <th className="py-2.5 px-2 sm:px-3 text-center font-bold text-slate-200">النقاط</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {grp.rows.map((row, rIdx) => {
                    const isHighlighted =
                      row.teamId === highlightHomeId || row.teamId === highlightAwayId;
                    return (
                      <tr
                        key={`${row.teamId || row.rank}-${rIdx}`}
                        className={`transition-colors ${
                          isHighlighted
                            ? 'bg-emerald-500/12'
                            : 'hover:bg-slate-800/30'
                        }`}
                      >
                        <td className="py-2.5 px-3 text-center font-mono tabular-nums font-semibold">
                          <span
                            className="inline-block w-5 text-center"
                            style={{ color: row.noteColor || '#CBD5E1' }}
                          >
                            {row.rank}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2.5">
                            <TeamCrest logo={row.logo} name={row.teamName} color="#1E293B" size={20} />
                            <span className={`font-medium ${isHighlighted ? 'text-emerald-300 font-bold' : 'text-slate-200'}`}>
                              {row.teamName}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-2.5 text-center font-mono tabular-nums text-slate-300">
                          {row.played}
                        </td>
                        <td className="py-2.5 px-2.5 text-center font-mono tabular-nums text-emerald-400">
                          {row.wins}
                        </td>
                        <td className="py-2.5 px-2.5 text-center font-mono tabular-nums text-slate-400">
                          {row.draws}
                        </td>
                        <td className="py-2.5 px-2.5 text-center font-mono tabular-nums text-red-400">
                          {row.losses}
                        </td>
                        <td className="py-2.5 px-2.5 text-center font-mono tabular-nums text-slate-400 hidden sm:table-cell">
                          {row.goalsFor}
                        </td>
                        <td className="py-2.5 px-2.5 text-center font-mono tabular-nums text-slate-400 hidden sm:table-cell">
                          {row.goalsAgainst}
                        </td>
                        <td className="py-2.5 px-2.5 text-center font-mono tabular-nums text-slate-300" dir="ltr">
                          {row.goalDiff > 0 ? `+${row.goalDiff}` : row.goalDiff}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono tabular-nums font-bold text-white">
                          {row.points}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
