import type { RosterPlayer } from '../types/sports';

export const LEAGUE_OPTIONS = [
  { slug: 'all', label: 'جميع البطولات' },
  { slug: 'eng.1', label: 'الدوري الإنجليزي' },
  { slug: 'esp.1', label: 'الدوري الإسباني' },
  { slug: 'uefa.champions', label: 'دوري أبطال أوروبا' },
  { slug: 'ita.1', label: 'الدوري الإيطالي' },
  { slug: 'ger.1', label: 'الدوري الألماني' },
  { slug: 'fra.1', label: 'الدوري الفرنسي' },
  { slug: 'ksa.1', label: 'دوري روشن السعودي' },
  { slug: 'caf.champions', label: 'دوري أبطال أفريقيا' },
  { slug: 'afc.champions', label: 'دوري أبطال آسيا' },
] as const;

export const STANDINGS_LEAGUES = LEAGUE_OPTIONS.filter((l) => l.slug !== 'all');

const STAT_LABELS_AR: Record<string, { label: string; group: 'attack' | 'passing' | 'defense' }> = {
  possessionPct: { label: 'نسبة الاستحواذ', group: 'passing' },
  totalShots: { label: 'إجمالي التسديدات', group: 'attack' },
  shotsOnTarget: { label: 'تسديدات على المرمى', group: 'attack' },
  shotPct: { label: 'دقة التسديد', group: 'attack' },
  blockedShots: { label: 'تسديدات مصدودة', group: 'attack' },
  wonCorners: { label: 'الضربات الركنية', group: 'attack' },
  offsides: { label: 'حالات التسلل', group: 'attack' },
  penaltyKickGoals: { label: 'أهداف ركلات الجزاء', group: 'attack' },
  penaltyKickShots: { label: 'ركلات جزاء مسددة', group: 'attack' },
  totalPasses: { label: 'إجمالي التمريرات', group: 'passing' },
  accuratePasses: { label: 'تمريرات صحيحة', group: 'passing' },
  passPct: { label: 'دقة التمرير', group: 'passing' },
  totalCrosses: { label: 'العرضيات', group: 'passing' },
  accurateCrosses: { label: 'عرضيات ناجحة', group: 'passing' },
  crossPct: { label: 'دقة العرضيات', group: 'passing' },
  totalLongBalls: { label: 'الكرات الطولية', group: 'passing' },
  accurateLongBalls: { label: 'كرات طولية ناجحة', group: 'passing' },
  longballPct: { label: 'دقة الكرات الطولية', group: 'passing' },
  saves: { label: 'تصديات حارس المرمى', group: 'defense' },
  totalTackles: { label: 'التدخلات', group: 'defense' },
  effectiveTackles: { label: 'تدخلات ناجحة', group: 'defense' },
  tacklePct: { label: 'نسبة نجاح التدخلات', group: 'defense' },
  interceptions: { label: 'اعتراض الكرة', group: 'defense' },
  totalClearance: { label: 'تشتيت الكرة', group: 'defense' },
  effectiveClearance: { label: 'تشتيت ناجح', group: 'defense' },
  foulsCommitted: { label: 'الأخطاء المرتكبة', group: 'defense' },
  yellowCards: { label: 'البطاقات الصفراء', group: 'defense' },
  redCards: { label: 'البطاقات الحمراء', group: 'defense' },
};

export function translateStatLabel(key: string, fallback: string): { label: string; group: 'attack' | 'passing' | 'defense' } {
  return STAT_LABELS_AR[key] || { label: fallback, group: 'defense' };
}

export function translateLeagueName(slug: string, fallback: string): string {
  const found = LEAGUE_OPTIONS.find((l) => l.slug === slug);
  if (found) return found.label;
  const s = (slug + ' ' + fallback).toLowerCase();
  if (s.includes('premier league') || s.includes('eng.1')) return 'الدوري الإنجليزي الممتاز';
  if (s.includes('laliga') || s.includes('esp.1')) return 'الدوري الإسباني';
  if (s.includes('serie a') || s.includes('ita.1')) return 'الدوري الإيطالي';
  if (s.includes('bundesliga') || s.includes('ger.1')) return 'الدوري الألماني';
  if (s.includes('ligue 1') || s.includes('fra.1')) return 'الدوري الفرنسي';
  if (s.includes('caf champions') || s.includes('caf.champions')) return 'دوري أبطال أفريقيا';
  if (s.includes('afc champions') || s.includes('afc.champions')) return 'دوري أبطال آسيا';
  if (s.includes('champions league')) return 'دوري أبطال أوروبا';
  if (s.includes('europa league')) return 'الدوري الأوروبي';
  if (s.includes('saudi') || s.includes('ksa.1')) return 'دوري روشن السعودي';
  if (s.includes('mls') || s.includes('usa.1')) return 'الدوري الأمريكي';
  return fallback || 'بطولة كرة قدم';
}

export function translatePosition(posAbbr: string): string {
  const p = posAbbr.toUpperCase();
  if (p === 'G' || p === 'GK') return 'حارس مرمى';
  if (p.includes('CD') || p === 'CB') return 'قلب دفاع';
  if (p === 'LB' || p === 'LWB') return 'ظهير أيسر';
  if (p === 'RB' || p === 'RWB') return 'ظهير أيمن';
  if (p.includes('DM')) return 'ارتكاز دفاعي';
  if (p === 'LM' || p === 'LW') return 'جناح أيسر';
  if (p === 'RM' || p === 'RW') return 'جناح أيمن';
  if (p.includes('AM')) return 'صانع ألعاب';
  if (p.includes('CM') || p === 'M') return 'وسط ميدان';
  if (p.includes('CF') || p === 'ST' || p === 'F') return 'مهاجم';
  if (p === 'SUB') return 'بديل';
  return posAbbr || 'لاعب';
}

export function translateEventType(typeText: string): string {
  const t = typeText.toLowerCase();
  if (t.includes('goal') && t.includes('own')) return 'هدف عكسي';
  if (t.includes('penalty') && t.includes('scored')) return 'هدف من ركلة جزاء';
  if (t.includes('goal')) return 'هدف';
  if (t.includes('shot on target') || t.includes('saved')) return 'تسديدة على المرمى';
  if (t.includes('shot off target') || t.includes('attempt missed')) return 'تسديدة خارج المرمى';
  if (t.includes('shot blocked')) return 'تسديدة مصدودة';
  if (t.includes('yellow card')) return 'بطاقة صفراء';
  if (t.includes('red card')) return 'بطاقة حمراء';
  if (t.includes('substitution')) return 'تبديل';
  if (t.includes('corner')) return 'ضربة ركنية';
  if (t.includes('offside')) return 'تسلل';
  if (t.includes('foul')) return 'خطأ';
  if (t.includes('free kick')) return 'ركلة حرة';
  if (t.includes('handball')) return 'لمسة يد';
  if (t.includes('var')) return 'تقنية الفيديو';
  if (t.includes('halftime')) return 'نهاية الشوط الأول';
  if (t.includes('full time') || t.includes('end of match')) return 'نهاية المباراة';
  if (t.includes('kickoff')) return 'بداية المباراة';
  if (t.includes('ball touch')) return 'استخلاص / مخالفة';
  if (t.includes('injury') || t.includes('delay')) return 'توقف اللعب';
  return typeText || 'حدث';
}

export function translateStatusText(state: 'in' | 'pre' | 'post', statusDetail: string, displayClock: string): string {
  if (state === 'in') {
    if (statusDetail.toLowerCase().includes('halftime') || statusDetail === 'HT') return 'استراحة بين الشوطين';
    return displayClock ? `مباشر · ${displayClock}` : 'مباشر الآن';
  }
  if (state === 'post') {
    if (statusDetail.includes('AET')) return 'انتهت (وقت إضافي)';
    if (statusDetail.includes('PEN')) return 'انتهت (ركلات ترجيح)';
    return 'انتهت المباراة';
  }
  return statusDetail || 'لم تبدأ بعد';
}

export function formatMatchTimeArabic(isoDate: string): string {
  if (!isoDate) return '';
  try {
    const d = new Date(isoDate);
    return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function getDateParam(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

/**
 * Maps real ESPN player position abbreviations (G, LB, CD-L, CD-R, RB, DM, CM, AM, LM, RM, CF, etc.)
 * into normalized 0..100 pitch coordinates for both Home (left->right) and Away (right->left).
 */
export function computeFormationCoords(
  players: RosterPlayer[],
  formation: string,
  side: 'home' | 'away'
): Array<{ player: RosterPlayer; baseX: number; baseY: number }> {
  // Position slot templates (x from own goal 0..48, y from top 0..100)
  const posCoords = (pos: string, indexInGroup: number, groupCount: number): { x: number; y: number } => {
    const p = pos.toUpperCase();
    const spreadY = (idx: number, total: number, minY = 16, maxY = 84) => {
      if (total <= 1) return 50;
      return minY + (idx / (total - 1)) * (maxY - minY);
    };

    if (p === 'G' || p === 'GK') return { x: 5.5, y: 50 };

    // Wingbacks / Fullbacks
    if (p === 'LB' || p === 'LWB') return { x: p === 'LWB' ? 23 : 18, y: 14 };
    if (p === 'RB' || p === 'RWB') return { x: p === 'RWB' ? 23 : 18, y: 86 };

    // Center backs
    if (p === 'CD-L') return { x: 15, y: 36 };
    if (p === 'CD-R') return { x: 15, y: 64 };
    if (p === 'CD' || p === 'CB') return { x: 15, y: spreadY(indexInGroup, groupCount, 30, 70) };

    // Defensive midfield
    if (p === 'DM-L') return { x: 28, y: 37 };
    if (p === 'DM-R') return { x: 28, y: 63 };
    if (p === 'DM' || p === 'CDM') return { x: 28, y: spreadY(indexInGroup, groupCount, 35, 65) };

    // Midfielders
    if (p === 'LM') return { x: 34, y: 15 };
    if (p === 'RM') return { x: 34, y: 85 };
    if (p === 'CM-L') return { x: 33, y: 35 };
    if (p === 'CM-R') return { x: 33, y: 65 };
    if (p === 'CM' || p === 'M') return { x: 33, y: spreadY(indexInGroup, groupCount, 28, 72) };

    // Attacking Midfield / Wingers
    if (p === 'AM-L' || p === 'LW' || p === 'F-L') return { x: 40, y: 18 };
    if (p === 'AM-R' || p === 'RW' || p === 'F-R') return { x: 40, y: 82 };
    if (p === 'AM' || p === 'CAM') return { x: 39, y: spreadY(indexInGroup, groupCount, 32, 68) };

    // Forwards / Strikers
    if (p === 'CF-L' || p === 'ST-L') return { x: 45, y: 38 };
    if (p === 'CF-R' || p === 'ST-R') return { x: 45, y: 62 };
    if (p === 'CF' || p === 'ST' || p === 'F') return { x: 45, y: spreadY(indexInGroup, groupCount, 30, 70) };

    // Fallback based on formation lines
    const lines = formation.split('-').map((n) => parseInt(n, 10)).filter((n) => !Number.isNaN(n));
    if (lines.length >= 3) {
      return { x: 25, y: spreadY(indexInGroup, groupCount, 18, 82) };
    }
    return { x: 26, y: 50 };
  };

  // Group identical positions so multiple 'CD' or 'CM' spread cleanly across Y
  const counts = new Map<string, number>();
  for (const pl of players) {
    const k = pl.position.toUpperCase();
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const seen = new Map<string, number>();

  return players.map((player) => {
    const k = player.position.toUpperCase();
    const idx = seen.get(k) || 0;
    seen.set(k, idx + 1);
    const total = counts.get(k) || 1;
    const raw = posCoords(k, idx, total);

    const baseX = side === 'home' ? raw.x : 100 - raw.x;
    const baseY = side === 'home' ? raw.y : 100 - raw.y;
    return { player, baseX, baseY };
  });
}

export function isSafeHttpUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export function formatRelativeArabicTime(isoDate: string): string {
  if (!isoDate) return '';
  try {
    const diffMs = Date.now() - new Date(isoDate).getTime();
    const mins = Math.max(1, Math.floor(diffMs / 60000));
    if (mins < 60) return `منذ ${mins} دقيقة`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `منذ ${hrs} ساعة`;
    const days = Math.floor(hrs / 24);
    return `منذ ${days} يوم`;
  } catch {
    return '';
  }
}

export function playGoalAlertChime(): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.08);
      gain.gain.setValueAtTime(0.001, now + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.12, now + idx * 0.08 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.28);
    });
  } catch {
    // Ignore audio context autoplay restrictions
  }
}

