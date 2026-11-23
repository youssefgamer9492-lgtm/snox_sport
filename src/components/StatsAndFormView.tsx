import type { MatchDetail } from '../types/sports';
import { translateStatLabel } from '../utils/arabicSports';
import { TeamCrest } from './MatchSidebar';

interface StatsAndFormViewProps {
  match: MatchDetail;
}

export function StatsAndFormView({ match }: StatsAndFormViewProps) {
  const grouped = {
    attack: [] as typeof match.stats,
    passing: [] as typeof match.stats,
    defense: [] as typeof match.stats,
  };

  for (const s of match.stats) {
    const meta = translateStatLabel(s.key, s.label);
    grouped[meta.group].push({ ...s, label: meta.label });
  }

  const sections: { title: string; items: typeof match.stats }[] = [
    { title: 'المؤشرات الهجومية', items: grouped.attack },
    { title: 'الاستحواذ وبناء اللعب', items: grouped.passing },
    { title: 'الدفاع والانضباط', items: grouped.defense },
  ];

  return (
    <div className="space-y-6">
      {/* Win Probability & Venue Metadata */}
      {(match.winProbability || match.venue) && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {match.winProbability && (
            <div className="lg:col-span-7 rounded-xl border border-slate-800 bg-[#111827] p-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <h3 className="font-bold text-white text-sm">احتمالات النتيجة وفق السوق الرياضي</h3>
                <span className="text-slate-500">{match.winProbability.provider}</span>
              </div>
              <div className="flex h-8 w-full overflow-hidden rounded-lg border border-slate-800 font-mono text-xs font-bold tabular-nums">
                <div
                  style={{ width: `${match.winProbability.homePct}%` }}
                  className="bg-emerald-600 flex items-center justify-center text-white"
                >
                  {match.winProbability.homePct}%
                </div>
                <div
                  style={{ width: `${match.winProbability.drawPct}%` }}
                  className="bg-slate-700 flex items-center justify-center text-slate-200"
                >
                  {match.winProbability.drawPct}%
                </div>
                <div
                  style={{ width: `${match.winProbability.awayPct}%` }}
                  className="bg-sky-600 flex items-center justify-center text-white"
                >
                  {match.winProbability.awayPct}%
                </div>
              </div>
              <div className="flex justify-between text-xs text-slate-400">
                <span>فوز {match.home.shortName || match.home.name}</span>
                <span>تعادل</span>
                <span>فوز {match.away.shortName || match.away.name}</span>
              </div>
            </div>
          )}

          <div
            className={`${
              match.winProbability ? 'lg:col-span-5' : 'lg:col-span-12'
            } rounded-xl border border-slate-800 bg-[#111827] p-4 flex flex-col justify-center space-y-2 text-xs`}
          >
            <h3 className="font-bold text-white text-sm mb-1">بطاقة الملعب والحضور</h3>
            <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
              <span className="text-slate-400">الملعب</span>
              <span className="text-slate-200 font-medium">
                {match.venue || 'غير محدد'}
                {match.city ? ` · ${match.city}` : ''}
              </span>
            </div>
            <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
              <span className="text-slate-400">الحضور الجماهيري</span>
              <span className="font-mono text-slate-200 tabular-nums">
                {match.attendance ? match.attendance.toLocaleString('en-US') : '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">حكم الساحة</span>
              <span className="text-slate-200 font-medium">{match.referee || 'غير معلن'}</span>
            </div>
          </div>
        </div>
      )}

      {/* Full Boxscore Statistics */}
      {match.stats.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-[#111827] p-8 text-center text-xs text-slate-400">
          لم تتوفر إحصائيات تفصيلية لهذه المباراة بعد.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {sections.map((sec) => (
            <div
              key={sec.title}
              className="rounded-xl border border-slate-800 bg-[#111827] p-4 space-y-4"
            >
              <h3 className="text-sm font-bold text-white border-b border-slate-800/80 pb-2.5">
                {sec.title}
              </h3>
              <div className="space-y-3.5">
                {sec.items.map((item) => {
                  const total = item.homeNum + item.awayNum;
                  const homePct = total > 0 ? Math.round((item.homeNum / total) * 100) : 50;
                  const awayPct = total > 0 ? 100 - homePct : 50;
                  return (
                    <div key={item.key} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs gap-2">
                        <span className="font-mono font-bold text-emerald-400 tabular-nums">
                          {item.homeValue}
                        </span>
                        <span className="text-slate-300 text-center truncate">{item.label}</span>
                        <span className="font-mono font-bold text-sky-400 tabular-nums">
                          {item.awayValue}
                        </span>
                      </div>
                      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-800 gap-0.5">
                        <div
                          className="bg-emerald-500 rounded-r-full"
                          style={{ width: `${homePct}%` }}
                        />
                        <div
                          className="bg-sky-500 rounded-l-full"
                          style={{ width: `${awayPct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Last 5 Matches Form */}
      {(match.lastFive.home.length > 0 || match.lastFive.away.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {[
            { side: 'home', team: match.home, games: match.lastFive.home },
            { side: 'away', team: match.away, games: match.lastFive.away },
          ].map((block) => (
            <div
              key={`${block.side}-${block.team.id}`}
              className="rounded-xl border border-slate-800 bg-[#111827] overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-slate-800/80 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TeamCrest logo={block.team.logo} name={block.team.name} color={block.team.color} size={20} />
                  <h4 className="text-sm font-bold text-white">آخر 5 مباريات — {block.team.name}</h4>
                </div>
                {block.team.form && (
                  <span className="font-mono text-xs text-slate-400" dir="ltr">
                    {block.team.form}
                  </span>
                )}
              </div>
              <div className="divide-y divide-slate-800/60">
                {block.games.map((g, idx) => (
                  <div
                    key={`${g.id || g.date}-${idx}`}
                    className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`font-mono text-[11px] font-bold w-6 text-center rounded py-0.5 shrink-0 ${
                          g.result === 'W'
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : g.result === 'L'
                            ? 'bg-red-500/15 text-red-400'
                            : 'bg-slate-700/60 text-slate-300'
                        }`}
                      >
                        {g.result === 'W' ? 'ف' : g.result === 'L' ? 'خ' : 'ت'}
                      </span>
                      <span className="text-slate-300 truncate">{g.opponent}</span>
                    </div>
                    <span className="font-mono font-semibold text-white tabular-nums shrink-0" dir="ltr">
                      {g.score}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
