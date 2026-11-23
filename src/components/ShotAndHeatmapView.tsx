import { useEffect, useState } from 'react';
import type { MatchDetail, ShotEvent } from '../types/sports';

interface ShotAndHeatmapViewProps {
  match: MatchDetail;
}

const OUTCOME_LABEL: Record<ShotEvent['outcome'], string> = {
  goal: 'هدف',
  'on-target': 'على المرمى',
  'off-target': 'خارج المرمى',
  blocked: 'مصدودة',
};

const OUTCOME_COLOR: Record<ShotEvent['outcome'], string> = {
  goal: '#10B981',
  'on-target': '#38BDF8',
  'off-target': '#F59E0B',
  blocked: '#94A3B8',
};

export function ShotAndHeatmapView({ match }: ShotAndHeatmapViewProps) {
  const [teamFilter, setTeamFilter] = useState<'all' | 'home' | 'away'>('all');
  const [selectedShot, setSelectedShot] = useState<ShotEvent | null>(
    match.shots[0] || null
  );

  useEffect(() => {
    setSelectedShot(match.shots[0] || null);
  }, [match.id, match.shots]);

  const visibleShots = match.shots.filter(
    (s) => teamFilter === 'all' || s.teamSide === teamFilter
  );

  const maxMomentum = Math.max(
    1,
    ...match.momentum.map((m) => Math.max(m.homePressure, m.awayPressure, Math.abs(m.net)))
  );

  const { territorial } = match;

  return (
    <div className="space-y-6">
      {/* Shot Map + Territorial Control Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Interactive SVG Shot Map */}
        <div className="xl:col-span-7 rounded-xl border border-slate-800 bg-[#111827] overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-800/80">
            <div>
              <h3 className="text-sm font-bold text-white">خريطة التسديدات الدقيقة</h3>
              <p className="text-xs text-slate-400">
                كل تسديدة موضحة في موقعها الحقيقي على أرضية الملعب
              </p>
            </div>

            <div className="flex items-center gap-1 rounded-lg bg-[#0B0F17] p-1 border border-slate-800">
              {[
                { id: 'all' as const, label: 'الفريقان' },
                { id: 'home' as const, label: match.home.shortName || match.home.name },
                { id: 'away' as const, label: match.away.shortName || match.away.name },
              ].map((btn) => (
                <button
                  key={btn.id}
                  type="button"
                  onClick={() => setTeamFilter(btn.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap max-w-[110px] truncate ${
                    teamFilter === btn.id
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-4">
            <svg viewBox="0 0 1000 620" className="w-full h-auto rounded-lg bg-[#0D2218] border border-slate-800">
              {/* Pitch markings */}
              <rect x="30" y="30" width="940" height="560" fill="none" stroke="rgba(226,232,240,0.28)" strokeWidth="2" />
              <line x1="500" y1="30" x2="500" y2="590" stroke="rgba(226,232,240,0.28)" strokeWidth="2" />
              <circle cx="500" cy="310" r="76" fill="none" stroke="rgba(226,232,240,0.28)" strokeWidth="2" />
              <rect x="30" y="145" width="148" height="330" fill="none" stroke="rgba(226,232,240,0.28)" strokeWidth="2" />
              <rect x="822" y="145" width="148" height="330" fill="none" stroke="rgba(226,232,240,0.28)" strokeWidth="2" />
              <rect x="30" y="230" width="52" height="160" fill="none" stroke="rgba(226,232,240,0.28)" strokeWidth="2" />
              <rect x="918" y="230" width="52" height="160" fill="none" stroke="rgba(226,232,240,0.28)" strokeWidth="2" />

              {/* Shot trajectory lines & dots */}
              {visibleShots.map((shot, idx) => {
                const cx = 30 + (shot.pitchX / 100) * 940;
                const cy = 30 + (shot.pitchY / 100) * 560;
                const goalX = shot.teamSide === 'home' ? 970 : 30;
                const goalY = 310;
                const color = OUTCOME_COLOR[shot.outcome];
                const isSelected = selectedShot?.id === shot.id;

                return (
                  <g
                    key={`${shot.id}-${idx}`}
                    className="cursor-pointer"
                    onClick={() => setSelectedShot(shot)}
                  >
                    <line
                      x1={cx}
                      y1={cy}
                      x2={goalX}
                      y2={goalY}
                      stroke={color}
                      strokeWidth={isSelected ? 2.5 : 1.2}
                      strokeOpacity={isSelected ? 0.9 : 0.32}
                      strokeDasharray={shot.outcome === 'goal' ? undefined : '4 4'}
                    />
                    <circle
                      cx={cx}
                      cy={cy}
                      r={shot.outcome === 'goal' ? 11 : isSelected ? 10 : 7.5}
                      fill={color}
                      fillOpacity={0.9}
                      stroke="#0B0F17"
                      strokeWidth={2}
                    />
                  </g>
                );
              })}
            </svg>

            {/* Legend & Selected Shot Details */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-4">
                {(['goal', 'on-target', 'off-target', 'blocked'] as const).map((o) => (
                  <span key={o} className="inline-flex items-center gap-1.5 text-slate-300">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: OUTCOME_COLOR[o] }}
                    />
                    <span>{OUTCOME_LABEL[o]}</span>
                  </span>
                ))}
              </div>
              <span className="font-mono text-slate-400 tabular-nums">
                {visibleShots.length} تسديدة مسجلة
              </span>
            </div>

            {selectedShot && (
              <div className="mt-3 rounded-lg border border-slate-800 bg-[#0B0F17] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-mono font-bold text-emerald-400 tabular-nums">
                      {selectedShot.clockDisplay}
                    </span>
                    <span className="font-semibold text-white">{selectedShot.shooter}</span>
                    <span className="text-slate-500">·</span>
                    <span style={{ color: OUTCOME_COLOR[selectedShot.outcome] }}>
                      {OUTCOME_LABEL[selectedShot.outcome]}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 truncate" dir="auto">
                    {selectedShot.text}
                  </p>
                </div>
                <span className="font-mono text-[11px] text-slate-500 tabular-nums shrink-0" dir="ltr">
                  ({selectedShot.pitchX.toFixed(0)}, {selectedShot.pitchY.toFixed(0)})
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Territorial Control & Flank Breakdown */}
        <div className="xl:col-span-5 rounded-xl border border-slate-800 bg-[#111827] p-4 flex flex-col justify-between space-y-5">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-white">مناطق السيطرة والضغط</h3>
              <span className="font-mono text-xs text-slate-400 tabular-nums">
                {territorial.totalTrackedPlays} نقطة لعب
              </span>
            </div>

            {/* Pitch Thirds Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-slate-400">
                <span>ثلث {match.home.shortName || match.home.name}</span>
                <span>وسط الملعب</span>
                <span>ثلث {match.away.shortName || match.away.name}</span>
              </div>
              <div className="flex h-7 w-full overflow-hidden rounded-lg border border-slate-800 font-mono text-xs font-semibold tabular-nums">
                <div
                  style={{ width: `${Math.max(12, territorial.awayAttackThirdPct)}%` }}
                  className="bg-sky-600/80 flex items-center justify-center text-white"
                >
                  {territorial.awayAttackThirdPct}%
                </div>
                <div
                  style={{ width: `${Math.max(12, territorial.midfieldThirdPct)}%` }}
                  className="bg-slate-700/80 flex items-center justify-center text-slate-100"
                >
                  {territorial.midfieldThirdPct}%
                </div>
                <div
                  style={{ width: `${Math.max(12, territorial.homeAttackThirdPct)}%` }}
                  className="bg-emerald-600/80 flex items-center justify-center text-white"
                >
                  {territorial.homeAttackThirdPct}%
                </div>
              </div>
            </div>
          </div>

          {/* Attacking Lanes Comparison */}
          <div className="space-y-4 border-t border-slate-800/80 pt-4">
            <h4 className="text-xs font-semibold text-slate-300">توزيع الهجمات حسب الجبهات</h4>
            {[
              { label: 'الجبهة اليسرى', homeVal: territorial.homeLanes.left, awayVal: territorial.awayLanes.left },
              { label: 'العمق (الوسط)', homeVal: territorial.homeLanes.center, awayVal: territorial.awayLanes.center },
              { label: 'الجبهة اليمنى', homeVal: territorial.homeLanes.right, awayVal: territorial.awayLanes.right },
            ].map((lane) => (
              <div key={lane.label} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono font-semibold text-emerald-400 tabular-nums">
                    {lane.homeVal}%
                  </span>
                  <span className="text-slate-300 font-medium">{lane.label}</span>
                  <span className="font-mono font-semibold text-sky-400 tabular-nums">
                    {lane.awayVal}%
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5 h-2">
                  <div className="bg-slate-800 rounded-full overflow-hidden flex justify-end">
                    <div
                      className="bg-emerald-500 rounded-full"
                      style={{ width: `${lane.homeVal}%` }}
                    />
                  </div>
                  <div className="bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="bg-sky-500 rounded-full"
                      style={{ width: `${lane.awayVal}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Key Match Events Summary */}
          <div className="border-t border-slate-800/80 pt-4">
            <h4 className="text-xs font-semibold text-slate-300 mb-2">أبرز محطات المباراة</h4>
            {match.keyEvents.length === 0 ? (
              <p className="text-xs text-slate-500">لا توجد أهداف أو بطاقات مسجلة بعد.</p>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {match.keyEvents.slice(0, 8).map((ke, idx) => (
                  <div
                    key={`${ke.id}-${idx}`}
                    className="flex items-center justify-between gap-2 text-xs py-1 border-b border-slate-800/40 last:border-0"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono font-bold text-emerald-400 tabular-nums shrink-0">
                        {ke.clockDisplay}
                      </span>
                      <span className="text-slate-200 truncate">
                        {ke.participants.join(' ← ') || ke.text}
                      </span>
                    </div>
                    <span
                      className={`text-[11px] shrink-0 ${
                        ke.type === 'goal'
                          ? 'text-emerald-400 font-semibold'
                          : ke.type === 'yellow-card'
                          ? 'text-amber-400'
                          : ke.type === 'red-card'
                          ? 'text-red-400'
                          : 'text-slate-400'
                      }`}
                    >
                      {ke.type === 'goal'
                        ? 'هدف'
                        : ke.type === 'yellow-card'
                        ? 'إنذار'
                        : ke.type === 'red-card'
                        ? 'طرد'
                        : 'تبديل'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Momentum Timeline Chart */}
      <div className="rounded-xl border border-slate-800 bg-[#111827] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-bold text-white">مخطط الزخم والضغط الهجومي (كل 5 دقائق)</h3>
            <p className="text-xs text-slate-400">
              الأعلى يمثل ضغط {match.home.name} · الأسفل يمثل ضغط {match.away.name}
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="inline-flex items-center gap-1.5 text-emerald-400">
              <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
              {match.home.shortName || match.home.name}
            </span>
            <span className="inline-flex items-center gap-1.5 text-sky-400">
              <span className="h-2.5 w-2.5 rounded-sm bg-sky-500" />
              {match.away.shortName || match.away.name}
            </span>
          </div>
        </div>

        <div className="h-44 flex items-center gap-1 px-2 border-y border-slate-800/80 relative">
          {/* Center zero axis */}
          <div className="absolute inset-x-0 top-1/2 h-px bg-slate-700/80" />
          {match.momentum.map((bucket, idx) => {
            const pct = Math.min(48, Math.round((Math.abs(bucket.net) / maxMomentum) * 48));
            const isHome = bucket.net >= 0;
            return (
              <div
                key={`${bucket.label}-${idx}`}
                title={`${bucket.startMinute}'-${bucket.endMinute}'`}
                className="flex-1 h-full flex flex-col items-center justify-center relative group"
              >
                {isHome ? (
                  <div
                    style={{ height: `${Math.max(4, pct)}%`, bottom: '50%' }}
                    className="absolute w-full max-w-[18px] bg-emerald-500/85 rounded-t-sm transition-opacity group-hover:opacity-100 opacity-85"
                  />
                ) : (
                  <div
                    style={{ height: `${Math.max(4, pct)}%`, top: '50%' }}
                    className="absolute w-full max-w-[18px] bg-sky-500/85 rounded-b-sm transition-opacity group-hover:opacity-100 opacity-85"
                  />
                )}
                {(bucket.goalsHome > 0 || bucket.goalsAway > 0) && (
                  <span
                    className={`absolute font-mono text-[10px] font-bold ${
                      bucket.goalsHome > 0 ? 'top-1 text-emerald-300' : 'bottom-1 text-sky-300'
                    }`}
                  >
                    ⚽
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex justify-between mt-2 font-mono text-[11px] text-slate-500 tabular-nums" dir="ltr">
          <span>0&apos;</span>
          <span>15&apos;</span>
          <span>30&apos;</span>
          <span>45&apos;</span>
          <span>60&apos;</span>
          <span>75&apos;</span>
          <span>90&apos;</span>
        </div>
      </div>
    </div>
  );
}
