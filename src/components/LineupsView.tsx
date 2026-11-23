import { useEffect, useMemo, useState } from 'react';
import type { MatchDetail, RosterPlayer } from '../types/sports';
import { computeFormationCoords, translatePosition } from '../utils/arabicSports';

interface LineupsViewProps {
  match: MatchDetail;
}

export function LineupsView({ match }: LineupsViewProps) {
  const homeStarters = useMemo(
    () => (match.rosters.home?.players || []).filter((p) => p.starter),
    [match.rosters.home]
  );
  const awayStarters = useMemo(
    () => (match.rosters.away?.players || []).filter((p) => p.starter),
    [match.rosters.away]
  );

  const homeBench = useMemo(
    () => (match.rosters.home?.players || []).filter((p) => !p.starter),
    [match.rosters.home]
  );
  const awayBench = useMemo(
    () => (match.rosters.away?.players || []).filter((p) => !p.starter),
    [match.rosters.away]
  );

  const homePlaced = useMemo(
    () =>
      computeFormationCoords(
        homeStarters,
        match.rosters.home?.formation || '4-4-2',
        'home'
      ),
    [homeStarters, match.rosters.home]
  );

  const awayPlaced = useMemo(
    () =>
      computeFormationCoords(
        awayStarters,
        match.rosters.away?.formation || '4-4-2',
        'away'
      ),
    [awayStarters, match.rosters.away]
  );

  const [selectedPlayer, setSelectedPlayer] = useState<{
    player: RosterPlayer;
    teamName: string;
    side: 'home' | 'away';
  } | null>(() =>
    homeStarters[0]
      ? { player: homeStarters[0], teamName: match.home.name, side: 'home' }
      : null
  );

  useEffect(() => {
    setSelectedPlayer(
      homeStarters[0]
        ? { player: homeStarters[0], teamName: match.home.name, side: 'home' }
        : null
    );
  }, [match.id, match.home.name, homeStarters]);

  const hasRosters = homeStarters.length > 0 || awayStarters.length > 0;

  return (
    <div className="space-y-6">
      {!hasRosters ? (
        <div className="rounded-xl border border-slate-800 bg-[#111827] p-8 text-center space-y-2">
          <p className="text-sm font-semibold text-white">التشكيل الرسمي غير معلن بعد</p>
          <p className="text-xs text-slate-400">
            يتم نشر التشكيلات الأساسية والبدلاء عادةً قبل انطلاق المباراة بـ 60 دقيقة.
          </p>
        </div>
      ) : (
        <>
          {/* Tactical Pitch + Player Inspector */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
            <div className="xl:col-span-8 rounded-xl border border-slate-800 bg-[#111827] overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-800/80 text-xs">
                <span className="font-semibold text-emerald-400">
                  {match.home.shortName || match.home.name} ·{' '}
                  <span className="font-mono">{match.rosters.home?.formation || '—'}</span>
                </span>
                <span className="hidden sm:inline text-slate-400">اضغط على أي لاعب لعرض إحصائياته</span>
                <span className="font-semibold text-sky-400">
                  {match.away.shortName || match.away.name} ·{' '}
                  <span className="font-mono">{match.rosters.away?.formation || '—'}</span>
                </span>
              </div>

              {/* Dual-Team Pitch Map */}
              <div className="relative w-full aspect-[16/10] bg-[#0D2218]">
                <svg
                  viewBox="0 0 1000 620"
                  className="w-full h-full block"
                  aria-label="التشكيل التكتيكي على أرضية الملعب"
                >
                  <rect x="24" y="24" width="952" height="572" fill="none" stroke="rgba(226,232,240,0.25)" strokeWidth="2" />
                  <line x1="500" y1="24" x2="500" y2="596" stroke="rgba(226,232,240,0.25)" strokeWidth="2" />
                  <circle cx="500" cy="310" r="74" fill="none" stroke="rgba(226,232,240,0.25)" strokeWidth="2" />
                  <rect x="24" y="140" width="142" height="340" fill="none" stroke="rgba(226,232,240,0.25)" strokeWidth="2" />
                  <rect x="834" y="140" width="142" height="340" fill="none" stroke="rgba(226,232,240,0.25)" strokeWidth="2" />
                </svg>

                {/* HTML Overlay for crisp RTL player chips */}
                {homePlaced.map(({ player, baseX, baseY }, idx) => {
                  const isSelected = selectedPlayer?.player.id === player.id;
                  return (
                    <button
                      key={`h-${player.id}-${idx}`}
                      type="button"
                      onClick={() =>
                        setSelectedPlayer({ player, teamName: match.home.name, side: 'home' })
                      }
                      style={{ left: `${baseX}%`, top: `${baseY}%` }}
                      className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5 sm:gap-1 group cursor-pointer focus:outline-none"
                    >
                      <span
                        className={`h-6 w-6 sm:h-8 sm:w-8 rounded-full font-mono text-[10px] sm:text-xs font-bold flex items-center justify-center border-2 transition-transform ${
                          isSelected
                            ? 'bg-emerald-500 border-white text-white scale-110'
                            : 'bg-emerald-600/95 border-slate-100/80 text-white group-hover:scale-105'
                        }`}
                      >
                        {player.jersey || '•'}
                      </span>
                      <span className="px-1 sm:px-1.5 py-0.5 rounded bg-[#0B0F17]/85 text-[8px] sm:text-[10px] font-medium text-slate-100 whitespace-nowrap max-w-[44px] sm:max-w-[84px] truncate">
                        {player.shortName}
                        {player.stats.goals > 0 ? ` (${player.stats.goals}⚽)` : ''}
                      </span>
                    </button>
                  );
                })}

                {awayPlaced.map(({ player, baseX, baseY }, idx) => {
                  const isSelected = selectedPlayer?.player.id === player.id;
                  return (
                    <button
                      key={`a-${player.id}-${idx}`}
                      type="button"
                      onClick={() =>
                        setSelectedPlayer({ player, teamName: match.away.name, side: 'away' })
                      }
                      style={{ left: `${baseX}%`, top: `${baseY}%` }}
                      className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5 sm:gap-1 group cursor-pointer focus:outline-none"
                    >
                      <span
                        className={`h-6 w-6 sm:h-8 sm:w-8 rounded-full font-mono text-[10px] sm:text-xs font-bold flex items-center justify-center border-2 transition-transform ${
                          isSelected
                            ? 'bg-sky-500 border-white text-white scale-110'
                            : 'bg-sky-600/95 border-slate-100/80 text-white group-hover:scale-105'
                        }`}
                      >
                        {player.jersey || '•'}
                      </span>
                      <span className="px-1 sm:px-1.5 py-0.5 rounded bg-[#0B0F17]/85 text-[8px] sm:text-[10px] font-medium text-slate-100 whitespace-nowrap max-w-[44px] sm:max-w-[84px] truncate">
                        {player.shortName}
                        {player.stats.goals > 0 ? ` (${player.stats.goals}⚽)` : ''}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected Player Stats Inspector */}
            <div className="xl:col-span-4 rounded-xl border border-slate-800 bg-[#111827] p-4 flex flex-col justify-between">
              {selectedPlayer ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                    <div className="space-y-1">
                      <p className="text-xs text-slate-400">
                        {selectedPlayer.teamName} · {translatePosition(selectedPlayer.player.position)}
                      </p>
                      <h3 className="text-lg font-bold text-white">
                        {selectedPlayer.player.name}
                      </h3>
                    </div>
                    <span
                      className={`h-11 w-11 rounded-lg font-mono text-lg font-bold flex items-center justify-center border ${
                        selectedPlayer.side === 'home'
                          ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                          : 'border-sky-500/40 bg-sky-500/15 text-sky-300'
                      }`}
                    >
                      {selectedPlayer.player.jersey || '—'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    {[
                      { label: 'الأهداف', val: selectedPlayer.player.stats.goals },
                      { label: 'صناعة الأهداف', val: selectedPlayer.player.stats.assists },
                      { label: 'إجمالي التسديدات', val: selectedPlayer.player.stats.shots },
                      { label: 'على المرمى', val: selectedPlayer.player.stats.shotsOnTarget },
                      { label: 'أخطاء لصالحه', val: selectedPlayer.player.stats.foulsSuffered },
                      { label: 'أخطاء مرتكبة', val: selectedPlayer.player.stats.foulsCommitted },
                      { label: 'بطاقات صفراء', val: selectedPlayer.player.stats.yellowCards },
                      {
                        label: selectedPlayer.player.position === 'G' ? 'التصديات' : 'حالات التسلل',
                        val:
                          selectedPlayer.player.position === 'G'
                            ? selectedPlayer.player.stats.saves
                            : selectedPlayer.player.stats.offsides,
                      },
                    ].map((st) => (
                      <div
                        key={st.label}
                        className="rounded-lg border border-slate-800/80 bg-[#0B0F17] px-3 py-2 flex items-center justify-between"
                      >
                        <span className="text-xs text-slate-400">{st.label}</span>
                        <span className="font-mono text-sm font-bold text-white tabular-nums">
                          {st.val}
                        </span>
                      </div>
                    ))}
                  </div>

                  {(selectedPlayer.player.subbedOutMinute !== null ||
                    selectedPlayer.player.subbedInMinute !== null) && (
                    <div className="text-xs text-slate-300 border-t border-slate-800/80 pt-3">
                      {selectedPlayer.player.subbedOutMinute !== null && (
                        <p className="font-mono">
                          خرج بديلاً في الدقيقة {Math.round(selectedPlayer.player.subbedOutMinute)}&apos;
                        </p>
                      )}
                      {selectedPlayer.player.subbedInMinute !== null && (
                        <p className="font-mono">
                          شارك بديلاً في الدقيقة {Math.round(selectedPlayer.player.subbedInMinute)}&apos;
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-6 text-center text-xs text-slate-400">
                  اختر لاعباً من الملعب أو دكة البدلاء لعرض إحصائياته التفصيلية.
                </div>
              )}
            </div>
          </div>

          {/* Substitutes & Full Squad Tables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {[
              {
                title: `دكة البدلاء — ${match.home.name}`,
                teamName: match.home.name,
                side: 'home' as const,
                list: homeBench,
              },
              {
                title: `دكة البدلاء — ${match.away.name}`,
                teamName: match.away.name,
                side: 'away' as const,
                list: awayBench,
              },
            ].map((group) => (
              <div
                key={group.title}
                className="rounded-xl border border-slate-800 bg-[#111827] overflow-hidden"
              >
                <div className="px-4 py-3 border-b border-slate-800/80 flex items-center justify-between">
                  <h4 className="text-sm font-bold text-white">{group.title}</h4>
                  <span className="font-mono text-xs text-slate-400 tabular-nums">
                    {group.list.length} لاعب
                  </span>
                </div>
                <div className="divide-y divide-slate-800/60 max-h-72 overflow-y-auto">
                  {group.list.map((pl, idx) => (
                    <button
                      key={`${group.side}-sub-${pl.id}-${idx}`}
                      type="button"
                      onClick={() =>
                        setSelectedPlayer({ player: pl, teamName: group.teamName, side: group.side })
                      }
                      className="w-full px-4 py-2.5 flex items-center justify-between text-right hover:bg-slate-800/35 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono text-xs font-bold text-slate-400 w-6 text-center tabular-nums">
                          {pl.jersey || '—'}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-200 truncate">{pl.name}</p>
                          <p className="text-[11px] text-slate-500">
                            {translatePosition(pl.position)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-xs font-mono tabular-nums shrink-0">
                        {pl.subbedInMinute !== null && (
                          <span className="text-emerald-400">
                            د {Math.round(pl.subbedInMinute)}&apos;
                          </span>
                        )}
                        {pl.stats.goals > 0 && (
                          <span className="text-emerald-300">{pl.stats.goals} هدف</span>
                        )}
                        {pl.stats.yellowCards > 0 && (
                          <span className="text-amber-400">إنذار</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
