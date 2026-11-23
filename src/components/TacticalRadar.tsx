import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, Radio, RotateCcw } from 'lucide-react';
import type { MatchDetail, RadarPlay, RosterPlayer } from '../types/sports';
import { computeFormationCoords, translateEventType } from '../utils/arabicSports';

interface TacticalRadarProps {
  match: MatchDetail;
}

function getActiveLineupAtMinute(
  players: RosterPlayer[],
  minute: number
): RosterPlayer[] {
  const starters = players.filter((p) => p.starter);
  if (starters.length === 0) return [];

  const byId = new Map(players.map((p) => [p.id, p]));
  return starters.map((starter) => {
    if (starter.subbedOutMinute !== null && minute >= starter.subbedOutMinute && starter.replacedById) {
      const sub = byId.get(starter.replacedById);
      if (sub) {
        return {
          ...sub,
          position: starter.position, // Inherit tactical slot on pitch
        };
      }
    }
    return starter;
  });
}

function sanitizeTeamColor(hex: string, fallback: string): string {
  if (!hex || hex.toLowerCase() === '#000000' || hex.toLowerCase() === '#ffffff') {
    return fallback;
  }
  return hex;
}

export function TacticalRadar({ match }: TacticalRadarProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Only plays that have genuine X/Y coordinates from the match feed
  const trackedPlays = useMemo(
    () => match.plays.filter((p) => p.pitchX !== null && p.pitchY !== null),
    [match.plays]
  );

  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<1 | 3 | 6>(1);
  const [liveSync, setLiveSync] = useState(match.state === 'in');
  const [playIndex, setPlayIndex] = useState<number>(() =>
    Math.max(0, trackedPlays.length - 1)
  );
  const [showNames, setShowNames] = useState(true);
  const [showTrail, setShowTrail] = useState(true);

  // Reset playIndex when switching matches
  useEffect(() => {
    setLiveSync(match.state === 'in');
    setIsPlaying(false);
    setPlayIndex(Math.max(0, trackedPlays.length - 1));
  }, [match.id, match.state]);

  // Keep synced with latest real play during live matches
  useEffect(() => {
    if (liveSync && trackedPlays.length > 0) {
      setPlayIndex(trackedPlays.length - 1);
    }
  }, [liveSync, trackedPlays.length]);

  // Replay timer loop
  useEffect(() => {
    if (!isPlaying || trackedPlays.length === 0) return;
    const intervalMs = speed === 1 ? 1400 : speed === 3 ? 550 : 250;
    const timer = window.setInterval(() => {
      setPlayIndex((prev) => {
        if (prev >= trackedPlays.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [isPlaying, speed, trackedPlays.length]);

  const currentPlay: RadarPlay | null = trackedPlays[playIndex] || null;
  const currentMinute = currentPlay
    ? currentPlay.minute
    : match.state === 'post'
    ? 90
    : Math.round(match.clockSeconds / 60);

  const homeColor = sanitizeTeamColor(match.home.color, '#10B981');
  let awayColor = sanitizeTeamColor(match.away.color, '#3B82F6');
  if (awayColor.toLowerCase() === homeColor.toLowerCase()) {
    awayColor = '#38BDF8';
  }

  // Smoothly animated ball & player state inside Canvas loop
  const animStateRef = useRef({
    ballX: 50,
    ballY: 50,
    targetX: 50,
    targetY: 50,
  });

  useEffect(() => {
    if (currentPlay && currentPlay.pitchX !== null && currentPlay.pitchY !== null) {
      animStateRef.current.targetX = currentPlay.pitchX;
      animStateRef.current.targetY = currentPlay.pitchY;
    } else {
      animStateRef.current.targetX = 50;
      animStateRef.current.targetY = 50;
    }
  }, [currentPlay]);

  const homeActivePlayers = useMemo(() => {
    const raw = match.rosters.home?.players || [];
    const active = getActiveLineupAtMinute(raw, currentMinute);
    return computeFormationCoords(active, match.rosters.home?.formation || '4-4-2', 'home');
  }, [match.rosters.home, currentMinute]);

  const awayActivePlayers = useMemo(() => {
    const raw = match.rosters.away?.players || [];
    const active = getActiveLineupAtMinute(raw, currentMinute);
    return computeFormationCoords(active, match.rosters.away?.formation || '4-4-2', 'away');
  }, [match.rosters.away, currentMinute]);

  // High-DPI 60fps Canvas Renderer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const renderFrame = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const width = rect.width || 800;
      const height = rect.height || 500;
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      // Smoothly interpolate ball toward target coordinates
      const st = animStateRef.current;
      if (prefersReducedMotion) {
        st.ballX = st.targetX;
        st.ballY = st.targetY;
      } else {
        st.ballX += (st.targetX - st.ballX) * 0.12;
        st.ballY += (st.targetY - st.ballY) * 0.12;
      }

      const pad = 18;
      const pw = width - pad * 2;
      const ph = height - pad * 2;
      const toPxX = (nx: number) => pad + (nx / 100) * pw;
      const toPxY = (ny: number) => pad + (ny / 100) * ph;

      // 1. Pitch Surface & Subtle Mowing Stripes
      ctx.fillStyle = '#0D2218';
      ctx.fillRect(0, 0, width, height);

      const stripeCount = 12;
      const stripeW = pw / stripeCount;
      for (let i = 0; i < stripeCount; i++) {
        ctx.fillStyle = i % 2 === 0 ? '#112B1E' : '#0E2419';
        ctx.fillRect(pad + i * stripeW, pad, stripeW, ph);
      }

      // 2. FIFA Pitch Markings
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.28)';
      ctx.lineWidth = 1.4;

      // Outer touchline
      ctx.strokeRect(pad, pad, pw, ph);

      // Halfway line
      ctx.beginPath();
      ctx.moveTo(pad + pw / 2, pad);
      ctx.lineTo(pad + pw / 2, pad + ph);
      ctx.stroke();

      // Center circle & spot
      const centerR = Math.min(pw, ph) * 0.135;
      ctx.beginPath();
      ctx.arc(pad + pw / 2, pad + ph / 2, centerR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(226, 232, 240, 0.45)';
      ctx.beginPath();
      ctx.arc(pad + pw / 2, pad + ph / 2, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Penalty boxes (16.5m / 105m ≈ 15.7% width, 40.3m / 68m ≈ 59.3% height)
      const boxW = pw * 0.157;
      const boxH = ph * 0.59;
      const boxTop = pad + (ph - boxH) / 2;
      ctx.strokeRect(pad, boxTop, boxW, boxH);
      ctx.strokeRect(pad + pw - boxW, boxTop, boxW, boxH);

      // 6-yard boxes
      const sixW = pw * 0.055;
      const sixH = ph * 0.27;
      const sixTop = pad + (ph - sixH) / 2;
      ctx.strokeRect(pad, sixTop, sixW, sixH);
      ctx.strokeRect(pad + pw - sixW, sixTop, sixW, sixH);

      // Penalty spots & arcs
      const penX = pw * 0.105;
      ctx.beginPath();
      ctx.arc(pad + penX, pad + ph / 2, 2.2, 0, Math.PI * 2);
      ctx.arc(pad + pw - penX, pad + ph / 2, 2.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(pad + penX, pad + ph / 2, centerR, -0.64, 0.64);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(pad + pw - penX, pad + ph / 2, centerR, Math.PI - 0.64, Math.PI + 0.64);
      ctx.stroke();

      // Goals
      ctx.strokeStyle = 'rgba(248, 250, 252, 0.55)';
      ctx.lineWidth = 2;
      const goalH = ph * 0.11;
      const goalTop = pad + (ph - goalH) / 2;
      ctx.strokeRect(pad - 6, goalTop, 6, goalH);
      ctx.strokeRect(pad + pw, goalTop, 6, goalH);

      // 3. Recent Real Ball Trail (last 7 plays)
      if (showTrail && trackedPlays.length > 0) {
        const startIdx = Math.max(0, playIndex - 6);
        const recent = trackedPlays.slice(startIdx, playIndex + 1);
        if (recent.length > 1) {
          ctx.save();
          ctx.beginPath();
          recent.forEach((rp, idx) => {
            const rx = toPxX(rp.pitchX as number);
            const ry = toPxY(rp.pitchY as number);
            if (idx === 0) ctx.moveTo(rx, ry);
            else ctx.lineTo(rx, ry);
          });
          ctx.strokeStyle = 'rgba(250, 204, 21, 0.42)';
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 4]);
          ctx.stroke();
          ctx.restore();

          // Small coordinate breadcrumbs
          recent.slice(0, -1).forEach((rp, idx) => {
            const alpha = 0.25 + (idx / recent.length) * 0.45;
            ctx.fillStyle = `rgba(250, 204, 21, ${alpha})`;
            ctx.beginPath();
            ctx.arc(toPxX(rp.pitchX as number), toPxY(rp.pitchY as number), 2.8, 0, Math.PI * 2);
            ctx.fill();
          });
        }
      }

      // 4. Shot Trajectory Vector to Goal if current play is a shot/goal
      if (currentPlay && (currentPlay.typeCode.includes('shot') || currentPlay.scoringPlay || currentPlay.typeText.toLowerCase().includes('shot'))) {
        const targetGoalX = currentPlay.teamSide === 'home' ? toPxX(100) : toPxX(0);
        const targetGoalY = toPxY(50);
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(toPxX(st.ballX), toPxY(st.ballY));
        ctx.lineTo(targetGoalX, targetGoalY);
        ctx.strokeStyle = currentPlay.scoringPlay ? '#10B981' : 'rgba(248, 113, 113, 0.75)';
        ctx.lineWidth = currentPlay.scoringPlay ? 2.5 : 1.8;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.restore();
      }

      // 5. Dynamic Tactical Player Positioning (Shifted proportionally toward real ball X/Y)
      const shiftX = (st.ballX - 50) * 0.26;
      const shiftY = (st.ballY - 50) * 0.14;

      const isCompact = width < 520;
      const playerR = isCompact ? 7.5 : 10.5;
      const jerseyFont = isCompact ? '700 8px "JetBrains Mono", monospace' : '700 10px "JetBrains Mono", monospace';
      const labelFont = isCompact ? '600 8px "Cairo", sans-serif' : '600 9.5px "Cairo", sans-serif';

      const drawTeamPlayers = (
        list: ReturnType<typeof computeFormationCoords>,
        fillColor: string,
        side: 'home' | 'away'
      ) => {
        for (const item of list) {
          const isGK = item.player.position.toUpperCase() === 'G';
          const pxNormX = isGK
            ? item.baseX + shiftX * 0.12
            : Math.max(6, Math.min(94, item.baseX + shiftX * (side === 'home' ? 1 : 0.9)));
          const pxNormY = isGK
            ? item.baseY + shiftY * 0.2
            : Math.max(7, Math.min(93, item.baseY + shiftY));

          const cx = toPxX(pxNormX);
          const cy = toPxY(pxNormY);

          // Subtle shadow
          ctx.fillStyle = 'rgba(0,0,0,0.45)';
          ctx.beginPath();
          ctx.arc(cx, cy + 1.5, playerR + 0.5, 0, Math.PI * 2);
          ctx.fill();

          // Player jersey circle
          ctx.fillStyle = fillColor;
          ctx.beginPath();
          ctx.arc(cx, cy, playerR, 0, Math.PI * 2);
          ctx.fill();
          ctx.lineWidth = isCompact ? 1.2 : 1.6;
          ctx.strokeStyle = '#F8FAFC';
          ctx.stroke();

          // Jersey number
          ctx.fillStyle = '#FFFFFF';
          ctx.font = jerseyFont;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(item.player.jersey || '•', cx, cy + 0.5);

          // Optional surname label (shortened on mobile so labels never collide)
          if (showNames) {
            const rawLabel = item.player.shortName || item.player.name;
            const label = isCompact ? rawLabel.split(' ').slice(-1)[0].slice(0, 8) : rawLabel;
            ctx.font = labelFont;
            ctx.fillStyle = 'rgba(11, 15, 23, 0.78)';
            const tw = ctx.measureText(label).width + (isCompact ? 5 : 8);
            const pillY = cy + playerR + 2;
            const pillH = isCompact ? 10.5 : 13;
            ctx.fillRect(cx - tw / 2, pillY, tw, pillH);
            ctx.fillStyle = '#E2E8F0';
            ctx.fillText(label, cx, pillY + pillH / 2 + 0.5);
          }
        }
      };

      drawTeamPlayers(homeActivePlayers, homeColor, 'home');
      drawTeamPlayers(awayActivePlayers, awayColor, 'away');

      // 6. Live Ball Marker & Pulse Ring on Active Play
      const bx = toPxX(st.ballX);
      const by = toPxY(st.ballY);

      if (currentPlay) {
        const ringColor = currentPlay.scoringPlay
          ? 'rgba(16, 185, 129, 0.45)'
          : currentPlay.typeText.toLowerCase().includes('card')
          ? 'rgba(245, 158, 11, 0.45)'
          : 'rgba(250, 204, 21, 0.35)';
        ctx.fillStyle = ringColor;
        ctx.beginPath();
        ctx.arc(bx, by, currentPlay.scoringPlay ? 20 : 14, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(bx, by, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#0F172A';
      ctx.stroke();

      ctx.restore();
      rafId = window.requestAnimationFrame(renderFrame);
    };

    rafId = window.requestAnimationFrame(renderFrame);
    return () => window.cancelAnimationFrame(rafId);
  }, [homeActivePlayers, awayActivePlayers, homeColor, awayColor, showNames, showTrail, trackedPlays, playIndex, currentPlay]);

  // Visible synced commentary window around playIndex
  const visibleFeed = useMemo(() => {
    if (trackedPlays.length === 0) return [];
    const upto = trackedPlays.slice(0, playIndex + 1);
    return upto.slice(-25).reverse();
  }, [trackedPlays, playIndex]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
      {/* Pitch Radar Viewport */}
      <div className="xl:col-span-8 rounded-xl border border-slate-800 bg-[#111827] overflow-hidden flex flex-col">
        {/* Top Pitch Legend */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-800/80 bg-[#0F1521]">
          <div className="flex items-center gap-4 text-xs">
            <span className="inline-flex items-center gap-2 font-semibold text-white">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: homeColor }} />
              <span>{match.home.name}</span>
              <span className="font-mono text-slate-400">({match.rosters.home?.formation || '—'})</span>
            </span>
            <span className="text-slate-600">ضد</span>
            <span className="inline-flex items-center gap-2 font-semibold text-white">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: awayColor }} />
              <span>{match.away.name}</span>
              <span className="font-mono text-slate-400">({match.rosters.away?.formation || '—'})</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowNames((v) => !v)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded border transition-colors cursor-pointer whitespace-nowrap ${
                showNames
                  ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                  : 'border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              أسماء اللاعبين
            </button>
            <button
              type="button"
              onClick={() => setShowTrail((v) => !v)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded border transition-colors cursor-pointer whitespace-nowrap ${
                showTrail
                  ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                  : 'border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              مسار الكرة
            </button>
          </div>
        </div>

        {/* Canvas Pitch */}
        <div className="relative w-full aspect-[16/10] bg-[#0D2218]">
          <canvas ref={canvasRef} className="h-full w-full block" />

          {/* Current Event Overlay Strip (Desktop/Tablet Overlay) */}
          {currentPlay && (
            <div className="hidden sm:flex absolute bottom-3 inset-x-3 rounded-lg border border-slate-700/70 bg-[#0B0F17]/90 backdrop-blur-md px-3.5 py-2 items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="font-mono text-xs font-bold text-emerald-400 tabular-nums shrink-0">
                  {currentPlay.clockDisplay}
                </span>
                <span className="text-xs font-semibold text-white shrink-0">
                  {translateEventType(currentPlay.typeText)}
                </span>
                <span className="text-xs text-slate-300 truncate" dir="auto">
                  {currentPlay.text}
                </span>
              </div>
              <span className="font-mono text-[11px] text-slate-400 tabular-nums shrink-0" dir="ltr">
                X:{currentPlay.pitchX?.toFixed(0)} · Y:{currentPlay.pitchY?.toFixed(0)}
              </span>
            </div>
          )}

          {trackedPlays.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#0B0F17]/65 p-6 text-center">
              <div className="max-w-sm space-y-1.5">
                <p className="text-sm font-semibold text-white">
                  {match.state === 'pre'
                    ? 'الرادار ينتظر صافرة البداية'
                    : 'تتبع الإحداثيات غير متاح لهذه البطولة'}
                </p>
                <p className="text-xs text-slate-400">
                  {match.state === 'pre'
                    ? 'بمجرد انطلاق المباراة ستظهر تحركات الكرة والتشكيل الحقيقي لحظة بلحظة.'
                    : 'يمكنك متابعة الإحصائيات والتشكيل أو اختيار مباراة من الدوريات الكبرى.'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Mobile Event Strip below pitch so it doesn't obscure players */}
        {currentPlay && (
          <div className="sm:hidden border-t border-slate-800/80 bg-[#0B0F17] px-3.5 py-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-mono text-xs font-bold text-emerald-400 tabular-nums shrink-0">
                {currentPlay.clockDisplay}
              </span>
              <span className="text-xs font-semibold text-white shrink-0">
                {translateEventType(currentPlay.typeText)}
              </span>
              <span className="text-xs text-slate-300 truncate" dir="auto">
                {currentPlay.text}
              </span>
            </div>
            <span className="font-mono text-[10px] text-slate-400 tabular-nums shrink-0" dir="ltr">
              X:{currentPlay.pitchX?.toFixed(0)}
            </span>
          </div>
        )}

        {/* Interactive Scrubber & Playback Controls */}
        <div className="px-4 py-3 border-t border-slate-800/80 bg-[#0F1521] space-y-2.5">
          <div className="flex items-center gap-3">
            <input
              type="range"
              aria-label="شريط زمن المباراة"
              min={0}
              max={Math.max(0, trackedPlays.length - 1)}
              value={playIndex}
              disabled={trackedPlays.length === 0}
              onChange={(e) => {
                setLiveSync(false);
                setIsPlaying(false);
                setPlayIndex(Number(e.target.value));
              }}
              className="w-full accent-emerald-500 cursor-pointer"
            />
            <span className="font-mono text-xs font-semibold text-slate-200 tabular-nums w-14 text-left shrink-0">
              {currentPlay ? currentPlay.clockDisplay : "0'"}
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={trackedPlays.length === 0}
                onClick={() => {
                  setLiveSync(false);
                  if (playIndex >= trackedPlays.length - 1) setPlayIndex(0);
                  setIsPlaying((p) => !p);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-40 cursor-pointer whitespace-nowrap"
              >
                {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                <span>{isPlaying ? 'إيقاف' : 'محاكاة الماتش'}</span>
              </button>

              <button
                type="button"
                disabled={trackedPlays.length === 0}
                onClick={() => {
                  setLiveSync(false);
                  setPlayIndex(0);
                  setIsPlaying(true);
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-40 cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>من البداية</span>
              </button>

              <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-[#0B0F17] p-0.5">
                {([1, 3, 6] as const).map((sp) => (
                  <button
                    key={sp}
                    type="button"
                    onClick={() => setSpeed(sp)}
                    className={`px-2 py-1 font-mono text-[11px] rounded cursor-pointer ${
                      speed === sp ? 'bg-slate-700 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {sp}x
                  </button>
                ))}
              </div>
            </div>

            {match.state === 'in' && (
              <button
                type="button"
                onClick={() => {
                  setIsPlaying(false);
                  setLiveSync(true);
                  setPlayIndex(Math.max(0, trackedPlays.length - 1));
                }}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer whitespace-nowrap ${
                  liveSync
                    ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                    : 'border border-slate-700 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Radio className="h-3.5 w-3.5" />
                <span>اللحظة المباشرة</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Synced Live Event Feed */}
      <div className="xl:col-span-4 rounded-xl border border-slate-800 bg-[#111827] flex flex-col max-h-[540px]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/80">
          <h3 className="text-sm font-bold text-white">البث اللحظي للأحداث</h3>
          <span className="font-mono text-xs text-slate-400 tabular-nums">
            {trackedPlays.length} حدث مسجل
          </span>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
          {visibleFeed.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              لا توجد أحداث مسجلة حتى الآن لهذه المباراة.
            </div>
          ) : (
            visibleFeed.map((ev, idx) => {
              const isCurrent = currentPlay?.id === ev.id;
              return (
                <button
                  key={`${ev.id}-${ev.sequence}-${idx}`}
                  type="button"
                  onClick={() => {
                    const idx = trackedPlays.findIndex((p) => p.id === ev.id);
                    if (idx >= 0) {
                      setLiveSync(false);
                      setIsPlaying(false);
                      setPlayIndex(idx);
                    }
                  }}
                  className={`w-full text-right px-4 py-2.5 transition-colors cursor-pointer block ${
                    isCurrent ? 'bg-emerald-500/12' : 'hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-[11px] mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-emerald-400 tabular-nums">
                        {ev.clockDisplay}
                      </span>
                      <span
                        className={`font-semibold ${
                          ev.scoringPlay
                            ? 'text-emerald-300'
                            : ev.typeText.toLowerCase().includes('card')
                            ? 'text-amber-300'
                            : 'text-slate-300'
                        }`}
                      >
                        {translateEventType(ev.typeText)}
                      </span>
                    </div>
                    <span className="text-slate-500 truncate max-w-[120px]">{ev.teamName}</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed" dir="auto">
                    {ev.text}
                  </p>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
