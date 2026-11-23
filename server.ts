import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALLOWED_LEAGUES = new Set([
  'all',
  'eng.1',
  'esp.1',
  'ita.1',
  'ger.1',
  'fra.1',
  'uefa.champions',
  'uefa.europa',
  'ksa.1',
  'usa.1',
  'ned.1',
  'por.1',
  'caf.champions',
  'afc.champions',
  'caf.nations',
  'fifa.world',
]);

const ESPN_SITE_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const ESPN_CORE_STANDINGS_BASE = 'https://site.api.espn.com/apis/v2/sports/soccer';

interface CacheEntry {
  expiresAt: number;
  data: unknown;
}

const memoryCache = new Map<string, CacheEntry>();

function getCached(key: string): unknown | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCached(key: string, data: unknown, ttlMs: number): void {
  if (memoryCache.size > 200) {
    const firstKey = memoryCache.keys().next().value;
    if (firstKey) memoryCache.delete(firstKey);
  }
  memoryCache.set(key, { expiresAt: Date.now() + ttlMs, data });
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeHttpUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

function parseClockToMinute(displayClock: string | undefined, clockSeconds: number | undefined, period: number | undefined): number {
  if (displayClock) {
    const plusMatch = displayClock.match(/(\d+)'\+(\d+)'/);
    if (plusMatch) {
      return Number(plusMatch[1]) + Number(plusMatch[2]) * 0.5;
    }
    const minMatch = displayClock.match(/(\d+)'/);
    if (minMatch) {
      return Number(minMatch[1]);
    }
  }
  if (typeof clockSeconds === 'number' && clockSeconds > 0) {
    return Math.round(clockSeconds / 60);
  }
  return period === 2 ? 46 : 1;
}

function inferLeagueSlug(event: any, fallbackLeague: string): string {
  const slug = String(event?.season?.slug || '');
  if (slug.includes('eng.1') || slug.includes('premier-league')) return 'eng.1';
  if (slug.includes('esp.1') || slug.includes('laliga')) return 'esp.1';
  if (slug.includes('ita.1') || slug.includes('serie-a')) return 'ita.1';
  if (slug.includes('ger.1') || slug.includes('bundesliga')) return 'ger.1';
  if (slug.includes('fra.1') || slug.includes('ligue-1')) return 'fra.1';
  if (slug.includes('champions-league') || slug.includes('uefa.champions')) return 'uefa.champions';
  if (slug.includes('europa-league') || slug.includes('uefa.europa')) return 'uefa.europa';
  if (slug.includes('saudi') || slug.includes('ksa.1')) return 'ksa.1';
  if (slug.includes('mls') || slug.includes('usa.1')) return 'usa.1';
  if (fallbackLeague && fallbackLeague !== 'all') return fallbackLeague;
  return slug || 'other';
}

function inferLeagueName(event: any, comp: any, fallbackName: string): string {
  if (comp?.altGameNote) return String(comp.altGameNote);
  const slug = String(event?.season?.slug || '');
  if (slug.includes('premier-league')) return 'الدوري الإنجليزي الممتاز';
  if (slug.includes('laliga')) return 'الدوري الإسباني';
  if (slug.includes('serie-a')) return 'الدوري الإيطالي';
  if (slug.includes('bundesliga')) return 'الدوري الألماني';
  if (slug.includes('ligue-1')) return 'الدوري الفرنسي';
  if (slug.includes('champions-league')) return 'دوري أبطال أوروبا';
  if (slug.includes('europa-league')) return 'الدوري الأوروبي';
  if (slug.includes('saudi')) return 'دوري روشن السعودي';
  if (fallbackName) return fallbackName;
  return slug.replace(/^\d{4}-\d{2}-/, '').replace(/-/g, ' ') || 'مباراة دولية';
}

function mapCompetitor(c: any) {
  const team = c?.team || {};
  return {
    id: String(team.id || c?.id || ''),
    name: String(team.displayName || team.name || 'Team'),
    shortName: String(team.shortDisplayName || team.displayName || ''),
    abbreviation: String(team.abbreviation || ''),
    logo: String(team.logo || team.logos?.[0]?.href || ''),
    color: team.color ? `#${String(team.color).replace(/^#/, '')}` : '#10B981',
    alternateColor: team.alternateColor ? `#${String(team.alternateColor).replace(/^#/, '')}` : '#3B82F6',
    score: Number(c?.score ?? 0) || 0,
    form: String(c?.form || ''),
    record: String(c?.records?.[0]?.summary || ''),
    homeAway: (c?.homeAway === 'away' ? 'away' : 'home') as 'home' | 'away',
  };
}

function normalizeScoreboard(raw: any, requestedLeague: string) {
  const leagueDisplayName = String(raw?.leagues?.[0]?.name || '');
  const events: any[] = Array.isArray(raw?.events) ? raw.events : [];

  const matches = events
    .map((ev) => {
      const comp = ev?.competitions?.[0];
      if (!comp || !Array.isArray(comp.competitors) || comp.competitors.length < 2) return null;

      const homeRaw = comp.competitors.find((c: any) => c.homeAway === 'home') || comp.competitors[0];
      const awayRaw = comp.competitors.find((c: any) => c.homeAway === 'away') || comp.competitors[1];
      const status = comp.status || ev.status || {};
      const stateRaw = status?.type?.state;
      const state: 'in' | 'pre' | 'post' =
        stateRaw === 'in' ? 'in' : stateRaw === 'post' ? 'post' : 'pre';

      return {
        id: String(ev.id),
        leagueSlug: inferLeagueSlug(ev, requestedLeague),
        leagueName: inferLeagueName(ev, comp, leagueDisplayName),
        date: String(comp.date || ev.date || ''),
        state,
        statusDetail: String(status?.type?.shortDetail || status?.type?.detail || status?.type?.description || ''),
        displayClock: String(status?.displayClock || ''),
        clockSeconds: Number(status?.clock || 0),
        period: Number(status?.period || 0),
        venue: String(comp?.venue?.fullName || ev?.venue?.fullName || ''),
        home: mapCompetitor(homeRaw),
        away: mapCompetitor(awayRaw),
      };
    })
    .filter((m): m is NonNullable<typeof m> => Boolean(m));

  const uniqueMatches = Array.from(new Map(matches.map((m) => [m.id, m])).values());

  // Sort live first, then post, then pre
  const order = { in: 0, post: 1, pre: 2 };
  uniqueMatches.sort((a, b) => order[a.state] - order[b.state]);
  return uniqueMatches;
}

function parseStatNum(val: string | undefined): number {
  if (!val) return 0;
  const cleaned = String(val).replace('%', '').trim();
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function americanOddsToProb(odds: number): number {
  if (!Number.isFinite(odds) || odds === 0) return 0;
  if (odds < 0) return (-odds) / (-odds + 100);
  return 100 / (odds + 100);
}

function normalizeMatchDetail(raw: any) {
  const headerComp = raw?.header?.competitions?.[0];
  const competitors = headerComp?.competitors || [];
  const homeRaw = competitors.find((c: any) => c.homeAway === 'home') || competitors[0] || {};
  const awayRaw = competitors.find((c: any) => c.homeAway === 'away') || competitors[1] || {};

  const home = mapCompetitor(homeRaw);
  const away = mapCompetitor(awayRaw);

  const status = headerComp?.status || {};
  const stateRaw = status?.type?.state;
  const state: 'in' | 'pre' | 'post' =
    stateRaw === 'in' ? 'in' : stateRaw === 'post' ? 'post' : 'pre';

  // Boxscore stats
  const boxTeams: any[] = raw?.boxscore?.teams || [];
  const homeBox = boxTeams.find((t) => String(t?.team?.id) === home.id) || boxTeams[0];
  const awayBox = boxTeams.find((t) => String(t?.team?.id) === away.id) || boxTeams[1];

  const statsMap = new Map<string, { label: string; homeValue: string; awayValue: string }>();
  for (const s of homeBox?.statistics || []) {
    statsMap.set(String(s.name), {
      label: String(s.label || s.name),
      homeValue: String(s.displayValue ?? '0'),
      awayValue: '0',
    });
  }
  for (const s of awayBox?.statistics || []) {
    const existing = statsMap.get(String(s.name));
    if (existing) {
      existing.awayValue = String(s.displayValue ?? '0');
    } else {
      statsMap.set(String(s.name), {
        label: String(s.label || s.name),
        homeValue: '0',
        awayValue: String(s.displayValue ?? '0'),
      });
    }
  }

  const stats = Array.from(statsMap.entries()).map(([key, v]) => {
    let hDisp = v.homeValue;
    let aDisp = v.awayValue;
    // ESPN returns shotPct / passPct / crossPct / longballPct / tacklePct as decimals (0.8 => 80%)
    if (key.endsWith('Pct') && key !== 'possessionPct') {
      const hNum = parseStatNum(hDisp);
      const aNum = parseStatNum(aDisp);
      if (hNum <= 1 && hNum >= 0 && !hDisp.includes('%')) hDisp = `${Math.round(hNum * 100)}%`;
      if (aNum <= 1 && aNum >= 0 && !aDisp.includes('%')) aDisp = `${Math.round(aNum * 100)}%`;
    } else if (key === 'possessionPct' && !hDisp.includes('%')) {
      hDisp = `${hDisp}%`;
      aDisp = `${aDisp}%`;
    }
    return {
      key,
      label: v.label,
      homeValue: hDisp,
      awayValue: aDisp,
      homeNum: parseStatNum(hDisp),
      awayNum: parseStatNum(aDisp),
    };
  });

  // Substitution timeline tracking
  const subInMin = new Map<string, number>();
  const subOutMin = new Map<string, { min: number; replacedById: string | null }>();
  const rawKeyEvents: any[] = Array.isArray(raw?.keyEvents) ? raw.keyEvents : [];

  for (const ke of rawKeyEvents) {
    const tType = String(ke?.type?.type || ke?.type?.text || '').toLowerCase();
    if (tType.includes('substitution')) {
      const min = parseClockToMinute(ke?.clock?.displayValue, ke?.clock?.value, ke?.period?.number);
      const pIn = ke?.participants?.[0]?.athlete?.id ? String(ke.participants[0].athlete.id) : null;
      const pOut = ke?.participants?.[1]?.athlete?.id ? String(ke.participants[1].athlete.id) : null;
      if (pIn) subInMin.set(pIn, min);
      if (pOut) subOutMin.set(pOut, { min, replacedById: pIn });
    }
  }

  // Rosters
  const mapRoster = (r: any) => {
    if (!r) return null;
    const players = (r.roster || []).map((p: any) => {
      const pid = String(p?.athlete?.id || '');
      const statLookup = new Map<string, number>();
      for (const st of p.stats || []) {
        statLookup.set(String(st.name), Number(st.value ?? st.displayValue ?? 0) || 0);
      }
      const subOutInfo = subOutMin.get(pid);
      return {
        id: pid,
        name: String(p?.athlete?.displayName || p?.athlete?.fullName || ''),
        shortName: String(p?.athlete?.shortName || p?.athlete?.lastName || p?.athlete?.displayName || ''),
        jersey: String(p?.jersey || ''),
        position: String(p?.position?.abbreviation || ''),
        positionName: String(p?.position?.displayName || p?.position?.name || ''),
        starter: Boolean(p?.starter),
        subbedInMinute: subInMin.get(pid) ?? null,
        subbedOutMinute: subOutInfo?.min ?? null,
        replacedById: subOutInfo?.replacedById ?? null,
        jerseyImage: p?.athlete?.jerseyImages?.[0]?.href || null,
        stats: {
          goals: statLookup.get('totalGoals') || 0,
          assists: statLookup.get('goalAssists') || 0,
          shots: statLookup.get('totalShots') || 0,
          shotsOnTarget: statLookup.get('shotsOnTarget') || 0,
          foulsCommitted: statLookup.get('foulsCommitted') || 0,
          foulsSuffered: statLookup.get('foulsSuffered') || 0,
          yellowCards: statLookup.get('yellowCards') || 0,
          redCards: statLookup.get('redCards') || 0,
          saves: statLookup.get('saves') || 0,
          offsides: statLookup.get('offsides') || 0,
          subIn: (statLookup.get('subIns') || 0) > 0,
          subOut: Boolean(p?.subbedOut),
        },
      };
    });

    return {
      teamId: String(r?.team?.id || ''),
      teamName: String(r?.team?.displayName || ''),
      formation: String(r?.formation || '4-4-2'),
      players,
    };
  };

  const rawRosters: any[] = Array.isArray(raw?.rosters) ? raw.rosters : [];
  const homeRosterRaw = rawRosters.find((r) => String(r?.team?.id) === home.id) || rawRosters[0] || null;
  const awayRosterRaw = rawRosters.find((r) => String(r?.team?.id) === away.id) || rawRosters[1] || null;

  // Commentary -> Radar Plays with unified Pitch Coordinates
  // Unified orientation: Home defends x=0, attacks x=100; Away defends x=100, attacks x=0
  const rawComm: any[] = Array.isArray(raw?.commentary) ? raw.commentary : [];
  const plays = rawComm.map((c, idx) => {
    const play = c?.play || {};
    const teamId = play?.team?.id ? String(play.team.id) : null;
    const teamName = String(play?.team?.displayName || '');
    let teamSide: 'home' | 'away' | null = null;
    if (teamId === home.id || (teamName && teamName === home.name)) teamSide = 'home';
    else if (teamId === away.id || (teamName && teamName === away.name)) teamSide = 'away';

    const rawX = typeof play?.fieldPositionX === 'number' ? play.fieldPositionX : null;
    const rawY = typeof play?.fieldPositionY === 'number' ? play.fieldPositionY : null;

    let pitchX: number | null = rawX;
    let pitchY: number | null = rawY;
    if (rawX !== null && rawY !== null && teamSide === 'away') {
      pitchX = Number((100 - rawX).toFixed(1));
      pitchY = Number((100 - rawY).toFixed(1));
    }

    const clockDisplay = String(c?.time?.displayValue || play?.clock?.displayValue || '');
    const period = Number(play?.period?.number || 1);
    const minute = parseClockToMinute(clockDisplay, play?.clock?.value ?? c?.time?.value, period);

    return {
      id: play?.id ? `${String(play.id)}-${Number(c?.sequence ?? idx)}-${idx}` : `play-${idx}`,
      sequence: Number(c?.sequence ?? idx),
      minute,
      clockDisplay: clockDisplay || `${Math.round(minute)}'`,
      period,
      teamId,
      teamSide,
      teamName,
      typeCode: String(play?.type?.type || ''),
      typeText: String(play?.type?.text || ''),
      text: String(c?.text || play?.text || ''),
      scoringPlay: Boolean(play?.scoringPlay),
      pitchX,
      pitchY,
      participants: (play?.participants || [])
        .map((pt: any) => pt?.athlete?.displayName)
        .filter(Boolean),
    };
  });

  // Extract Shots with coordinates
  const shots = plays
    .filter((p) => {
      if (p.pitchX === null || p.pitchY === null || !p.teamSide) return false;
      const tc = p.typeCode.toLowerCase();
      const tt = p.typeText.toLowerCase();
      return (
        p.scoringPlay ||
        tc.includes('shot') ||
        tc.includes('goal') ||
        tt.includes('shot') ||
        tt.includes('goal') ||
        tt.includes('penalty')
      );
    })
    .filter((p) => !p.typeText.toLowerCase().includes('goal kick'))
    .map((p) => {
      const tc = p.typeCode.toLowerCase();
      const tt = p.typeText.toLowerCase();
      let outcome: 'goal' | 'on-target' | 'off-target' | 'blocked' = 'off-target';
      if (p.scoringPlay || tt === 'goal' || tc === 'goal') outcome = 'goal';
      else if (tc.includes('on-target') || tt.includes('on target') || tt.includes('saved')) outcome = 'on-target';
      else if (tc.includes('blocked') || tt.includes('blocked')) outcome = 'blocked';

      return {
        id: p.id,
        minute: p.minute,
        clockDisplay: p.clockDisplay,
        teamSide: p.teamSide as 'home' | 'away',
        teamName: p.teamName,
        shooter: p.participants[0] || p.teamName,
        outcome,
        pitchX: p.pitchX as number,
        pitchY: p.pitchY as number,
        text: p.text,
      };
    });

  // Key Events
  const keyEvents = rawKeyEvents
    .filter((ke) => {
      const tt = String(ke?.type?.text || '').toLowerCase();
      return tt !== 'kickoff' && tt !== 'halftime' && tt !== 'start 2nd half';
    })
    .map((ke, idx) => {
      const tid = ke?.team?.id ? String(ke.team.id) : null;
      const teamSide: 'home' | 'away' | null =
        tid === home.id ? 'home' : tid === away.id ? 'away' : null;
      const tt = String(ke?.type?.text || '').toLowerCase();
      let type: 'goal' | 'yellow-card' | 'red-card' | 'substitution' | 'other' = 'other';
      if (ke?.scoringPlay || tt.includes('goal')) type = 'goal';
      else if (tt.includes('yellow')) type = 'yellow-card';
      else if (tt.includes('red')) type = 'red-card';
      else if (tt.includes('substitution')) type = 'substitution';

      const clockDisplay = String(ke?.clock?.displayValue || '');
      const period = Number(ke?.period?.number || 1);
      return {
        id: ke?.id ? `${String(ke.id)}-${idx}` : `ke-${idx}`,
        minute: parseClockToMinute(clockDisplay, ke?.clock?.value, period),
        clockDisplay,
        teamSide,
        teamName: String(ke?.team?.displayName || ''),
        type,
        typeText: String(ke?.type?.text || ''),
        text: String(ke?.text || ke?.shortText || ''),
        participants: (ke?.participants || [])
          .map((pt: any) => pt?.athlete?.displayName)
          .filter(Boolean),
      };
    });

  // Momentum by 5-minute buckets from real plays
  const maxMin = Math.max(90, ...plays.map((p) => Math.ceil(p.minute)));
  const bucketCount = Math.ceil(maxMin / 5);
  const momentum = Array.from({ length: bucketCount }, (_, i) => {
    const startMinute = i * 5;
    const endMinute = (i + 1) * 5;
    return {
      label: `${endMinute}'`,
      startMinute,
      endMinute,
      homePressure: 0,
      awayPressure: 0,
      net: 0,
      goalsHome: 0,
      goalsAway: 0,
    };
  });

  for (const p of plays) {
    const bIdx = Math.min(momentum.length - 1, Math.max(0, Math.floor(Math.max(0, p.minute - 0.01) / 5)));
    const b = momentum[bIdx];
    if (!b || !p.teamSide) continue;
    const tt = p.typeText.toLowerCase();
    let weight = 1;
    if (p.scoringPlay || tt.includes('goal')) {
      weight = 8;
      if (p.teamSide === 'home') b.goalsHome += 1;
      else b.goalsAway += 1;
    } else if (tt.includes('shot on target')) weight = 5;
    else if (tt.includes('shot')) weight = 3;
    else if (tt.includes('corner')) weight = 3;
    else if (p.pitchX !== null && ((p.teamSide === 'home' && p.pitchX > 66) || (p.teamSide === 'away' && p.pitchX < 34))) {
      weight = 2;
    }
    if (p.teamSide === 'home') b.homePressure += weight;
    else b.awayPressure += weight;
  }

  for (const b of momentum) {
    b.net = b.homePressure - b.awayPressure;
  }

  // Territorial zones from real X/Y coordinates
  const tracked = plays.filter((p) => p.pitchX !== null && p.pitchY !== null);
  let homeZoneCount = 0; // x < 33.3 (Home defensive third)
  let midZoneCount = 0; // 33.3..66.6
  let awayZoneCount = 0; // x > 66.6 (Home attacking third)
  const homeLanes = { left: 0, center: 0, right: 0 };
  const awayLanes = { left: 0, center: 0, right: 0 };

  for (const p of tracked) {
    const x = p.pitchX as number;
    const y = p.pitchY as number;
    if (x < 33.33) homeZoneCount++;
    else if (x <= 66.66) midZoneCount++;
    else awayZoneCount++;

    if (p.teamSide === 'home') {
      if (y < 33.33) homeLanes.left++;
      else if (y <= 66.66) homeLanes.center++;
      else homeLanes.right++;
    } else if (p.teamSide === 'away') {
      // For away team attacking left (x->0), top of screen (y<33) is their right flank, bottom (y>66) is their left flank
      if (y > 66.66) awayLanes.left++;
      else if (y >= 33.33) awayLanes.center++;
      else awayLanes.right++;
    }
  }

  const totalTracked = tracked.length || 1;
  const homeLTotal = homeLanes.left + homeLanes.center + homeLanes.right || 1;
  const awayLTotal = awayLanes.left + awayLanes.center + awayLanes.right || 1;

  const territorial = {
    homeAttackThirdPct: Math.round((awayZoneCount / totalTracked) * 100),
    midfieldThirdPct: Math.round((midZoneCount / totalTracked) * 100),
    awayAttackThirdPct: Math.round((homeZoneCount / totalTracked) * 100),
    homeLanes: {
      left: Math.round((homeLanes.left / homeLTotal) * 100),
      center: Math.round((homeLanes.center / homeLTotal) * 100),
      right: Math.round((homeLanes.right / homeLTotal) * 100),
    },
    awayLanes: {
      left: Math.round((awayLanes.left / awayLTotal) * 100),
      center: Math.round((awayLanes.center / awayLTotal) * 100),
      right: Math.round((awayLanes.right / awayLTotal) * 100),
    },
    totalTrackedPlays: tracked.length,
  };

  // Last 5 games
  const mapLastFive = (teamId: string) => {
    const entry = (raw?.lastFiveGames || []).find((l: any) => String(l?.team?.id) === teamId);
    return (entry?.events || []).slice(0, 5).map((ev: any) => ({
      id: String(ev.id || ''),
      date: String(ev.gameDate || ''),
      opponent: String(ev?.opponent?.displayName || ''),
      opponentLogo: String(ev?.opponent?.logo || ''),
      score: String(ev.score || ''),
      result: (ev.gameResult === 'W' || ev.gameResult === 'L' ? ev.gameResult : 'D') as 'W' | 'D' | 'L',
      homeAway: String(ev.atVs || ''),
    }));
  };

  // Odds -> Win Probability
  let winProbability: { homePct: number; drawPct: number; awayPct: number; provider: string } | null = null;
  const odds0 = raw?.odds?.[0];
  if (odds0?.homeTeamOdds?.moneyLine && odds0?.awayTeamOdds?.moneyLine) {
    const pH = americanOddsToProb(Number(odds0.homeTeamOdds.moneyLine));
    const pA = americanOddsToProb(Number(odds0.awayTeamOdds.moneyLine));
    const pD = odds0?.drawOdds?.moneyLine ? americanOddsToProb(Number(odds0.drawOdds.moneyLine)) : 0.25;
    const sum = pH + pA + pD;
    if (sum > 0) {
      const homePct = Math.round((pH / sum) * 100);
      const awayPct = Math.round((pA / sum) * 100);
      const drawPct = Math.max(0, 100 - homePct - awayPct);
      winProbability = {
        homePct,
        drawPct,
        awayPct,
        provider: String(odds0?.provider?.name || 'Market Odds'),
      };
    }
  }

  const leagueSlug = String(raw?.header?.league?.slug || inferLeagueSlug(raw?.header, 'all'));
  const leagueName = String(raw?.header?.league?.name || inferLeagueName(raw?.header, headerComp, ''));

  const referee = raw?.gameInfo?.officials?.[0]?.displayName
    ? String(raw.gameInfo.officials[0].displayName)
    : null;

  const videos = (Array.isArray(raw?.videos) ? raw.videos : []).map((v: any) => ({
    id: String(v?.id || ''),
    headline: String(v?.headline || ''),
    description: String(v?.description || ''),
    duration: Number(v?.duration || 0),
    thumbnail: sanitizeHttpUrl(v?.thumbnail),
    videoUrl: sanitizeHttpUrl(
      v?.links?.source?.HD?.href ||
        v?.links?.source?.href ||
        v?.links?.source?.full?.href ||
        v?.links?.mobile?.source?.href ||
        null
    ),
    webUrl: sanitizeHttpUrl(v?.links?.web?.href || null),
  }));

  const broadcasts = (Array.isArray(raw?.broadcasts) ? raw.broadcasts : [])
    .map((b: any) => ({
      channel: String(b?.media?.shortName || b?.media?.name || ''),
      type: String(b?.type?.shortName || b?.type?.longName || 'TV'),
      region: String(b?.region || ''),
    }))
    .filter((b: any) => b.channel);

  return {
    id: String(raw?.header?.id || ''),
    leagueSlug,
    leagueName,
    date: String(headerComp?.date || ''),
    state,
    statusDetail: String(status?.type?.shortDetail || status?.type?.detail || ''),
    displayClock: String(status?.displayClock || ''),
    clockSeconds: Number(status?.clock || 0),
    period: Number(status?.period || 0),
    venue: String(raw?.gameInfo?.venue?.fullName || ''),
    city: String(raw?.gameInfo?.venue?.address?.city || ''),
    attendance: typeof raw?.gameInfo?.attendance === 'number' ? raw.gameInfo.attendance : null,
    referee,
    home,
    away,
    stats,
    rosters: {
      home: mapRoster(homeRosterRaw),
      away: mapRoster(awayRosterRaw),
    },
    plays,
    shots,
    keyEvents,
    momentum,
    territorial,
    lastFive: {
      home: mapLastFive(home.id),
      away: mapLastFive(away.id),
    },
    winProbability,
    videos,
    broadcasts,
  };
}

function normalizeStandings(raw: any, leagueSlug: string) {
  const children: any[] = Array.isArray(raw?.children) ? raw.children : [];
  const groups = children.map((child) => {
    const entries: any[] = child?.standings?.entries || [];
    const rows = entries.map((entry, idx) => {
      const statMap = new Map<string, { val: number; disp: string }>();
      for (const s of entry?.stats || []) {
        statMap.set(String(s.name), {
          val: Number(s.value ?? 0) || 0,
          disp: String(s.displayValue ?? s.value ?? '0'),
        });
      }
      return {
        rank: statMap.get('rank')?.val || idx + 1,
        teamId: String(entry?.team?.id || ''),
        teamName: String(entry?.team?.displayName || ''),
        shortName: String(entry?.team?.shortDisplayName || entry?.team?.displayName || ''),
        logo: String(entry?.team?.logos?.[0]?.href || ''),
        played: statMap.get('gamesPlayed')?.val || 0,
        wins: statMap.get('wins')?.val || 0,
        draws: statMap.get('ties')?.val || 0,
        losses: statMap.get('losses')?.val || 0,
        goalsFor: statMap.get('pointsFor')?.val || 0,
        goalsAgainst: statMap.get('pointsAgainst')?.val || 0,
        goalDiff: statMap.get('pointDifferential')?.val || 0,
        points: statMap.get('points')?.val || 0,
        note: entry?.note?.description ? String(entry.note.description) : null,
        noteColor: entry?.note?.color ? String(entry.note.color) : null,
      };
    });
    rows.sort((a, b) => a.rank - b.rank);
    return {
      name: String(child?.name || ''),
      rows,
    };
  });

  return {
    leagueSlug,
    leagueName: String(raw?.name || leagueSlug),
    seasonName: String(raw?.season?.displayName || ''),
    groups,
  };
}

async function startServer() {
  const app = express();
  app.get('/health', (_req, res) => res.status(200).json({ status: 'ok', app: 'SNOX Sports' }));
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  // 1. Live & Scheduled Matches Scoreboard
  app.get('/api/matches', async (req, res) => {
    try {
      const leagueParam = typeof req.query.league === 'string' ? req.query.league.trim() : 'all';
      if (!ALLOWED_LEAGUES.has(leagueParam)) {
        res.status(400).json({ error: 'Invalid league parameter' });
        return;
      }

      const dateParam = typeof req.query.date === 'string' ? req.query.date.trim() : '';
      if (dateParam && !/^\d{8}$/.test(dateParam)) {
        res.status(400).json({ error: 'Invalid date format (expected YYYYMMDD)' });
        return;
      }

      const cacheKey = `matches:${leagueParam}:${dateParam || 'today'}`;
      const cached = getCached(cacheKey);
      if (cached) {
        res.json(cached);
        return;
      }

      const url = new URL(`${ESPN_SITE_BASE}/${leagueParam}/scoreboard`);
      if (dateParam) url.searchParams.set('dates', dateParam);

      const upstream = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
      if (!upstream.ok) {
        res.status(502).json({ error: `Upstream sports API returned ${upstream.status}` });
        return;
      }

      const raw = await upstream.json();
      const matches = normalizeScoreboard(raw, leagueParam);
      const payload = {
        league: leagueParam,
        date: dateParam || raw?.day?.date || '',
        fetchedAt: new Date().toISOString(),
        matches,
      };

      setCached(cacheKey, payload, 12000);
      res.json(payload);
    } catch (err) {
      console.error('Error fetching matches:', err);
      res.status(500).json({ error: 'Failed to load live matches' });
    }
  });

  // 2. Complete Real Match Detail (Stats, Lineups, Real X/Y Plays, Shots, Momentum)
  app.get('/api/match/:eventId', async (req, res) => {
    try {
      const eventId = String(req.params.eventId || '').trim();
      if (!/^\d{4,12}$/.test(eventId)) {
        res.status(400).json({ error: 'Invalid match event ID' });
        return;
      }

      const cacheKey = `match:${eventId}`;
      const cached = getCached(cacheKey);
      if (cached) {
        res.json(cached);
        return;
      }

      const url = `${ESPN_SITE_BASE}/all/summary?event=${encodeURIComponent(eventId)}`;
      const upstream = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if (!upstream.ok) {
        res.status(502).json({ error: `Upstream match summary returned ${upstream.status}` });
        return;
      }

      const raw = await upstream.json();
      const detail = normalizeMatchDetail(raw);
      // Cache live matches briefly (10s), finished matches longer (120s)
      const ttl = detail.state === 'in' ? 10000 : 120000;
      setCached(cacheKey, detail, ttl);
      res.json(detail);
    } catch (err) {
      console.error('Error fetching match detail:', err);
      res.status(500).json({ error: 'Failed to load match analytics' });
    }
  });

  // 3. League Standings
  app.get('/api/standings', async (req, res) => {
    try {
      const leagueParam = typeof req.query.league === 'string' ? req.query.league.trim() : 'eng.1';
      if (!ALLOWED_LEAGUES.has(leagueParam) || leagueParam === 'all') {
        res.status(400).json({ error: 'Invalid standings league parameter' });
        return;
      }

      const cacheKey = `standings:${leagueParam}`;
      const cached = getCached(cacheKey);
      if (cached) {
        res.json(cached);
        return;
      }

      const url = `${ESPN_CORE_STANDINGS_BASE}/${leagueParam}/standings`;
      const upstream = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!upstream.ok) {
        res.status(502).json({ error: `Upstream standings returned ${upstream.status}` });
        return;
      }

      const raw = await upstream.json();
      const standings = normalizeStandings(raw, leagueParam);
      setCached(cacheKey, standings, 300000);
      res.json(standings);
    } catch (err) {
      console.error('Error fetching standings:', err);
      res.status(500).json({ error: 'Failed to load league standings' });
    }
  });

  // 4. Real Local, Arab & World Football News
  function parseRssItems(
    xml: string,
    opts: {
      section: 'local' | 'africa' | 'asia' | 'world' | 'transfers';
      leagueSlug: string;
      leagueName: string;
      defaultSource: string;
    }
  ) {
    const items: Array<{
      id: string;
      headline: string;
      description: string;
      published: string;
      type: string;
      section: 'local' | 'africa' | 'asia' | 'world' | 'transfers';
      sourceName: string;
      leagueSlug: string;
      leagueName: string;
      imageUrl: string | null;
      linkUrl: string | null;
      category: string;
    }> = [];

    const matches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);
    let idx = 0;
    for (const m of matches) {
      if (idx >= 16) break;
      const block = m[1];
      const rawTitle = block.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '';
      const rawDesc = block.match(/<description>([\s\S]*?)<\/description>/)?.[1] || '';
      const rawLink = block.match(/<link>([\s\S]*?)<\/link>/)?.[1] || '';
      const rawDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || '';
      const rawSource = block.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] || '';
      const encImg = block.match(/<enclosure[^>]+url="([^"]+)"/)?.[1] || null;
      const mediaImg = block.match(/<media:(?:thumbnail|content)[^>]+url="([^"]+)"/)?.[1] || null;

      let headline = decodeHtmlEntities(rawTitle);
      let sourceName = decodeHtmlEntities(rawSource) || opts.defaultSource;
      const splitIdx = headline.lastIndexOf(' - ');
      if (splitIdx > 12) {
        const trailing = headline.slice(splitIdx + 3).trim();
        if (!rawSource) sourceName = trailing;
        if (trailing === sourceName || !rawSource) {
          headline = headline.slice(0, splitIdx).trim();
        }
      }

      const description = decodeHtmlEntities(rawDesc);
      const linkUrl = sanitizeHttpUrl(decodeHtmlEntities(rawLink));
      const imageUrl = sanitizeHttpUrl(encImg || mediaImg);

      if (!headline) continue;
      const combinedText = `${headline} ${description}`;
      const isTransfer =
        opts.section === 'transfers' ||
        combinedText.includes('انتقال') ||
        combinedText.includes('صفقة') ||
        combinedText.includes('تعاقد') ||
        combinedText.includes('ميركاتو') ||
        combinedText.includes('رحيل');

      let inferredSection = opts.section;
      if (isTransfer) {
        inferredSection = 'transfers';
      } else if (
        combinedText.includes('الأهلي المصري') ||
        combinedText.includes('الزمالك') ||
        combinedText.includes('بيراميدز') ||
        combinedText.includes('الدوري المصري') ||
        combinedText.includes('منتخب مصر') ||
        combinedText.includes('محمد صلاح')
      ) {
        inferredSection = 'local';
      } else if (
        combinedText.includes('أفريقيا') ||
        combinedText.includes('إفريقيا') ||
        combinedText.includes('الكاف') ||
        combinedText.includes('الرجاء') ||
        combinedText.includes('الوداد') ||
        combinedText.includes('الترجي') ||
        combinedText.includes('صن داونز')
      ) {
        inferredSection = 'africa';
      } else if (
        combinedText.includes('آسيا') ||
        combinedText.includes('الهلال') ||
        combinedText.includes('النصر') ||
        combinedText.includes('روشن') ||
        combinedText.includes('الاتحاد') ||
        combinedText.includes('رونالدو')
      ) {
        inferredSection = 'asia';
      }

      items.push({
        id: `rss-${opts.leagueSlug}-${idx}-${Buffer.from(headline).toString('base64').slice(0, 12)}`,
        headline,
        description:
          description && description !== headline
            ? description
            : `تغطية ${sourceName} — ${opts.leagueName}`,
        published: rawDate ? new Date(rawDate).toISOString() : new Date().toISOString(),
        type: 'Story',
        section: inferredSection,
        sourceName,
        leagueSlug: opts.leagueSlug,
        leagueName: opts.leagueName,
        imageUrl,
        linkUrl,
        category: sourceName,
      });
      idx++;
    }
    return items;
  }

  app.get('/api/news', async (req, res) => {
    try {
      const leagueParam = typeof req.query.league === 'string' ? req.query.league.trim() : 'all';
      if (!ALLOWED_LEAGUES.has(leagueParam)) {
        res.status(400).json({ error: 'Invalid league parameter' });
        return;
      }

      const cacheKey = `news:v3:${leagueParam}`;
      const cached = getCached(cacheKey);
      if (cached) {
        res.json(cached);
        return;
      }

      const targetLeagues =
        leagueParam === 'all'
          ? [
              'eng.1',
              'esp.1',
              'uefa.champions',
              'ita.1',
              'ger.1',
              'fra.1',
              'ksa.1',
              'caf.champions',
              'afc.champions',
              'caf.nations',
              'fifa.world',
            ]
          : [leagueParam];

      const leagueArabicNames: Record<string, string> = {
        'eng.1': 'الدوري الإنجليزي',
        'esp.1': 'الدوري الإسباني',
        'uefa.champions': 'دوري أبطال أوروبا',
        'ita.1': 'الدوري الإيطالي',
        'ger.1': 'الدوري الألماني',
        'fra.1': 'الدوري الفرنسي',
        'ksa.1': 'دوري روشن السعودي',
        'caf.nations': 'الكرة الأفريقية',
        'caf.champions': 'دوري أبطال أفريقيا',
        'afc.champions': 'دوري أبطال آسيا',
        'fifa.world': 'كأس العالم والمنتخبات',
        'uefa.europa': 'الدوري الأوروبي',
        'usa.1': 'الدوري الأمريكي',
      };

      const rssSpecs =
        leagueParam === 'all'
          ? [
              {
                url: 'https://news.google.com/rss/search?q=%D8%A7%D9%84%D8%AF%D9%88%D8%B1%D9%8A+%D8%A7%D9%84%D9%85%D8%B5%D8%B1%D9%8A+%D8%A7%D9%84%D8%A3%D9%87%D9%84%D9%8A+%D8%A7%D9%84%D8%B2%D9%85%D8%A7%D9%84%D9%83&hl=ar&gl=EG&ceid=EG:ar',
                section: 'local' as const,
                leagueSlug: 'local.eg',
                leagueName: 'الكرة المصرية والمحلية',
                defaultSource: 'أخبار الكرة المصرية',
              },
              {
                url: 'https://news.google.com/rss/search?q=%D8%AF%D9%88%D8%B1%D9%8A+%D8%A3%D8%A8%D8%B7%D8%A7%D9%84+%D8%A3%D9%81%D8%B1%D9%8A%D9%82%D9%8A%D8%A7+%D8%A7%D9%84%D9%83%D8%A7%D9%81&hl=ar&gl=EG&ceid=EG:ar',
                section: 'africa' as const,
                leagueSlug: 'caf.champions',
                leagueName: 'أفريقيا والبطولات القارية',
                defaultSource: 'أخبار أفريقيا',
              },
              {
                url: 'https://news.google.com/rss/search?q=%D8%AF%D9%88%D8%B1%D9%8A+%D8%A3%D8%A8%D8%B7%D8%A7%D9%84+%D8%A2%D8%B3%D9%8A%D8%A7+%D8%AF%D9%88%D8%B1%D9%8A+%D8%B1%D9%88%D8%B4%D9%86&hl=ar&gl=SA&ceid=SA:ar',
                section: 'asia' as const,
                leagueSlug: 'afc.champions',
                leagueName: 'آسيا والخليج',
                defaultSource: 'أخبار آسيا والخليج',
              },
              {
                url: 'https://news.google.com/rss/search?q=%D8%B5%D9%81%D9%82%D8%A7%D8%AA+%D8%A7%D9%86%D8%AA%D9%82%D8%A7%D9%84%D8%A7%D8%AA+%D9%84%D8%A7%D8%B9%D8%A8%D9%8A%D9%86+%D9%83%D8%B1%D8%A9+%D8%A7%D9%84%D9%82%D8%AF%D9%85&hl=ar&gl=EG&ceid=EG:ar',
                section: 'transfers' as const,
                leagueSlug: 'transfers.ar',
                leagueName: 'سوق الانتقالات',
                defaultSource: 'أخبار الميركاتو',
              },
              {
                url: 'https://www.skynewsarabia.com/rss/sport.xml',
                section: 'world' as const,
                leagueSlug: 'sky.sport',
                leagueName: 'أخبار الرياضة العربية والعالمية',
                defaultSource: 'سكاي نيوز عربية',
              },
              {
                url: 'https://arabic.rt.com/rss/sport/',
                section: 'africa' as const,
                leagueSlug: 'arab.sport',
                leagueName: 'الرياضة العربية والعالمية',
                defaultSource: 'RT Arabic Sport',
              },
            ]
          : [];

      const [espnResults, rssResults] = await Promise.all([
        Promise.allSettled(
          targetLeagues.map(async (lg) => {
            const url = `${ESPN_SITE_BASE}/${lg}/news`;
            const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
            if (!r.ok) return { lg, articles: [] };
            const j = await r.json();
            return { lg, articles: Array.isArray(j?.articles) ? j.articles : [] };
          })
        ),
        Promise.allSettled(
          rssSpecs.map(async (spec) => {
            const r = await fetch(spec.url, { signal: AbortSignal.timeout(8000) });
            if (!r.ok) return [];
            const xml = await r.text();
            return parseRssItems(xml, spec);
          })
        ),
      ]);

      const seenTitles = new Set<string>();
      const seenIds = new Set<string>();
      const articles: Array<{
        id: string;
        headline: string;
        description: string;
        published: string;
        type: string;
        section: 'local' | 'africa' | 'asia' | 'world' | 'transfers';
        sourceName: string;
        leagueSlug: string;
        leagueName: string;
        imageUrl: string | null;
        linkUrl: string | null;
        category: string;
      }> = [];

      // First add Arabic local, Africa, Asia & Transfers RSS items
      for (const rr of rssResults) {
        if (rr.status !== 'fulfilled') continue;
        for (const item of rr.value) {
          const key = item.headline.slice(0, 48).toLowerCase();
          if (seenTitles.has(key) || seenIds.has(item.id)) continue;
          seenTitles.add(key);
          seenIds.add(item.id);
          articles.push(item);
        }
      }

      // Then add ESPN global & regional league news
      for (const resItem of espnResults) {
        if (resItem.status !== 'fulfilled') continue;
        const { lg, articles: rawList } = resItem.value;
        for (const art of rawList) {
          const id = String(art?.id || art?.dataSourceIdentifier || '');
          const headline = String(art?.headline || '').trim();
          if (!id || !headline) continue;
          const key = headline.slice(0, 48).toLowerCase();
          if (seenTitles.has(key) || seenIds.has(id)) continue;
          seenTitles.add(key);
          seenIds.add(id);

          const safeLink = sanitizeHttpUrl(art?.links?.web?.href ? String(art.links.web.href) : null);
          const safeImg = sanitizeHttpUrl(art?.images?.[0]?.url ? String(art.images[0].url) : null);
          const teamCat = (art?.categories || []).find((c: any) => c?.type === 'team');

          const lowerH = headline.toLowerCase();
          let section: 'local' | 'africa' | 'asia' | 'world' | 'transfers' = 'world';
          if (lowerH.includes('transfer') || lowerH.includes('rumor') || lowerH.includes('sign')) {
            section = 'transfers';
          } else if (lg === 'caf.nations' || lg === 'caf.champions') {
            section = 'africa';
          } else if (lg === 'ksa.1' || lg === 'afc.champions') {
            section = 'asia';
          }

          articles.push({
            id,
            headline,
            description: String(art?.description || ''),
            published: String(art?.published || art?.lastModified || ''),
            type: String(art?.type || 'Story'),
            section,
            sourceName: 'ESPN Soccer',
            leagueSlug: lg,
            leagueName: leagueArabicNames[lg] || lg,
            imageUrl: safeImg,
            linkUrl: safeLink,
            category: String(teamCat?.description || leagueArabicNames[lg] || 'أخبار الكرة'),
          });
        }
      }

      articles.sort((a, b) => new Date(b.published).getTime() - new Date(a.published).getTime());

      const payload = {
        league: leagueParam,
        fetchedAt: new Date().toISOString(),
        articles,
      };
      setCached(cacheKey, payload, 120000);
      res.json(payload);
    } catch (err) {
      console.error('Error fetching news:', err);
      res.status(500).json({ error: 'Failed to load sports news' });
    }
  });

  // 5. Real Match Video Highlights & Goals (Free Player Feed)
  app.get('/api/highlights', async (_req, res) => {
    try {
      const cacheKey = 'highlights:today';
      const cached = getCached(cacheKey);
      if (cached) {
        res.json(cached);
        return;
      }

      const sbRes = await fetch(`${ESPN_SITE_BASE}/all/scoreboard`, {
        signal: AbortSignal.timeout(9000),
      });
      if (!sbRes.ok) {
        res.status(502).json({ error: 'Failed to load scoreboard for highlights' });
        return;
      }
      const sbJson = await sbRes.json();
      const candidateEvents = (Array.isArray(sbJson?.events) ? sbJson.events : [])
        .filter((ev: any) => {
          const st = ev?.status?.type?.state;
          return st === 'post' || st === 'in';
        })
        .slice(0, 14);

      const summaries = await Promise.allSettled(
        candidateEvents.map(async (ev: any) => {
          const id = String(ev.id);
          const sRes = await fetch(`${ESPN_SITE_BASE}/all/summary?event=${encodeURIComponent(id)}`, {
            signal: AbortSignal.timeout(7000),
          });
          if (!sRes.ok) return [];
          const sJson = await sRes.json();
          const vids: any[] = Array.isArray(sJson?.videos) ? sJson.videos : [];
          const comp = ev?.competitions?.[0];
          const home = comp?.competitors?.find((c: any) => c.homeAway === 'home') || comp?.competitors?.[0];
          const away = comp?.competitors?.find((c: any) => c.homeAway === 'away') || comp?.competitors?.[1];
          const scoreline = `${home?.score ?? 0} - ${away?.score ?? 0}`;
          const leagueName = inferLeagueName(ev, comp, '');

          return vids
            .map((v) => ({
              id: String(v?.id || ''),
              matchId: id,
              matchName: String(ev?.name || ''),
              leagueName,
              scoreline,
              headline: String(v?.headline || ''),
              description: String(v?.description || ''),
              duration: Number(v?.duration || 0),
              thumbnail: sanitizeHttpUrl(v?.thumbnail),
              videoUrl: sanitizeHttpUrl(
                v?.links?.source?.HD?.href ||
                  v?.links?.source?.href ||
                  v?.links?.source?.full?.href ||
                  null
              ),
              webUrl: sanitizeHttpUrl(v?.links?.web?.href || null),
            }))
            .filter((c) => c.id && c.videoUrl);
        })
      );

      const seen = new Set<string>();
      const clips: any[] = [];
      for (const r of summaries) {
        if (r.status !== 'fulfilled') continue;
        for (const clip of r.value) {
          if (seen.has(clip.id)) continue;
          seen.add(clip.id);
          clips.push(clip);
        }
      }

      const payload = { fetchedAt: new Date().toISOString(), clips };
      setCached(cacheKey, payload, 120000);
      res.json(payload);
    } catch (err) {
      console.error('Error fetching highlights:', err);
      res.status(500).json({ error: 'Failed to load highlights' });
    }
  });

  // 6. SEO: robots.txt & sitemap.xml for Google Search Console indexing
  const resolveOrigin = (req: express.Request): string => {
    const rawHost = String(req.headers['x-forwarded-host'] || req.get('host') || '').split(',')[0].trim();
    const isValidHost = /^[a-z0-9.-]+(:\d{1,5})?$/i.test(rawHost);
    if (isValidHost && !rawHost.startsWith('localhost') && !rawHost.startsWith('127.0.0.1')) {
      const rawProto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
      const proto = rawProto === 'http' ? 'http' : 'https';
      return `${proto}://${rawHost}`;
    }
    const envUrl = sanitizeHttpUrl(process.env.APP_URL);
    if (envUrl) return envUrl.replace(/\/+$/, '');
    return isValidHost ? `http://${rawHost}` : 'http://localhost:3000';
  };

  app.get('/robots.txt', (req, res) => {
    const origin = resolveOrigin(req);
    res.type('text/plain; charset=utf-8').send(
      `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${origin}/sitemap.xml\n`
    );
  });

  app.get('/sitemap.xml', (req, res) => {
    const origin = resolveOrigin(req);
    const lastmod = new Date().toISOString().split('T')[0];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${origin}/</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`;
    res.type('application/xml; charset=utf-8').send(xml);
  });

  // 7. Dynamic ads.txt for Google AdSense & Ad Networks
  let firebaseCfg: { projectId?: string; firestoreDatabaseId?: string } = {};
  try {
    const cfgPath = path.join(__dirname, 'firebase-applet-config.json');
    if (fs.existsSync(cfgPath)) {
      firebaseCfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    }
  } catch {
    firebaseCfg = {};
  }

  app.get('/ads.txt', async (_req, res) => {
    const cacheKey = 'ads:txt';
    const cached = getCached(cacheKey);
    if (typeof cached === 'string') {
      res.type('text/plain; charset=utf-8').send(cached);
      return;
    }

    let line = '';
    if (firebaseCfg.projectId && firebaseCfg.firestoreDatabaseId) {
      try {
        const fsUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
          firebaseCfg.projectId
        )}/databases/${encodeURIComponent(firebaseCfg.firestoreDatabaseId)}/documents/siteConfig/ads`;
        const fsRes = await fetch(fsUrl, { signal: AbortSignal.timeout(3000) });
        if (fsRes.ok) {
          const docJson: any = await fsRes.json();
          const fields = docJson?.fields || {};
          const customLine = String(fields?.adsTxtLine?.stringValue || '').replace(/[\r\n]+/g, ' ').trim();
          const clientId = String(fields?.adsenseClientId?.stringValue || '').trim();
          if (customLine && /^[a-z0-9., _-]+$/i.test(customLine)) {
            line = customLine;
          } else if (/^ca-pub-\d{10,20}$/.test(clientId)) {
            line = `google.com, ${clientId.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0`;
          }
        }
      } catch {
        // Fallback to environment variables
      }
    }

    if (!line) {
      const envLine = String(process.env.ADS_TXT_LINE || '').replace(/[\r\n]+/g, ' ').trim();
      const rawEnvClient = String(process.env.VITE_ADSENSE_CLIENT_ID || '').trim();
      const envClient = /^ca-pub-\d{10,20}$/.test(rawEnvClient)
        ? rawEnvClient
        : 'ca-pub-7243498880233715';
      if (envLine && /^[a-z0-9., _-]+$/i.test(envLine)) {
        line = envLine;
      } else {
        line = `google.com, ${envClient.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0`;
      }
    }

    const body = line
      ? `${line}\n`
      : '# SNOX Sports ads.txt\n# Add your Google AdSense Publisher ID in the Ad Manager to activate.\n';
    setCached(cacheKey, body, 60000);
    res.type('text/plain; charset=utf-8').send(body);
  });

  // Mount Vite middleware in dev or serve static dist in production
  const isProd = process.env.NODE_ENV === 'production' && fs.existsSync(path.join(__dirname, 'dist'));
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

startServer();
