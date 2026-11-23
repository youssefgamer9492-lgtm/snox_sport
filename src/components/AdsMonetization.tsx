import { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  Check,
  Copy,
  ExternalLink,
  Image as ImageIcon,
  LogIn,
  LogOut,
  Megaphone,
  Plus,
  ShieldCheck,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import {
  auth,
  db,
  handleFirestoreError,
  isOwnerUser,
  OWNER_EMAIL,
  OperationType,
  signInAsOwner,
  signOutOwner,
} from '../firebase';
import { isSafeHttpUrl } from '../utils/arabicSports';

export type AdPlacement = 'main_banner' | 'news_feed' | 'watch_banner' | 'sidebar';

export interface DirectAdCampaign {
  id: string;
  title: string;
  subtitle: string;
  ctaText: string;
  targetUrl: string;
  imageUrl: string;
  placement: AdPlacement | 'all';
  active: boolean;
  ownerUid: string;
}

export interface AdConfig {
  adsEnabled: boolean;
  adsenseClientId: string;
  slotBannerId: string;
  slotNewsId: string;
  slotSidebarId: string;
  customScriptUrl: string;
  adsTxtLine: string;
  campaigns: DirectAdCampaign[];
}

const AD_STORAGE_KEY = 'snox_sport_ads_config_v2';

const RAW_ENV_CLIENT_ID =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_ADSENSE_CLIENT_ID
    ? String(import.meta.env.VITE_ADSENSE_CLIENT_ID).trim()
    : '';
const ENV_CLIENT_ID = /^ca-pub-\d{10,20}$/.test(RAW_ENV_CLIENT_ID)
  ? RAW_ENV_CLIENT_ID
  : 'ca-pub-7243498880233715';
const ENV_SLOT_BANNER =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_ADSENSE_SLOT_BANNER
    ? String(import.meta.env.VITE_ADSENSE_SLOT_BANNER)
    : '';

const BANNER_PRESETS = [
  {
    label: 'ملعب ليلي',
    url: '/src/assets/images/news_egypt_stadium_1795222605678.jpg',
  },
  {
    label: 'أبطال أوروبا',
    url: '/src/assets/images/news_europe_night_1795222605684.jpg',
  },
  {
    label: 'صفقات ورياضة',
    url: '/src/assets/images/news_transfer_contract_1795222605103.jpg',
  },
];

export function getDefaultAdConfig(): AdConfig {
  return {
    adsEnabled: true,
    adsenseClientId: ENV_CLIENT_ID,
    slotBannerId: ENV_SLOT_BANNER,
    slotNewsId: '',
    slotSidebarId: '',
    customScriptUrl: '',
    adsTxtLine: '',
    campaigns: [],
  };
}

function loadCachedAdConfig(): AdConfig {
  try {
    const raw = localStorage.getItem(AD_STORAGE_KEY);
    if (!raw) return getDefaultAdConfig();
    const parsed = JSON.parse(raw) as Partial<AdConfig>;
    return {
      adsEnabled: parsed.adsEnabled !== false,
      adsenseClientId: parsed.adsenseClientId || ENV_CLIENT_ID,
      slotBannerId: parsed.slotBannerId || ENV_SLOT_BANNER,
      slotNewsId: parsed.slotNewsId || '',
      slotSidebarId: parsed.slotSidebarId || '',
      customScriptUrl: parsed.customScriptUrl || '',
      adsTxtLine: parsed.adsTxtLine || '',
      campaigns: Array.isArray(parsed.campaigns) ? parsed.campaigns : [],
    };
  } catch {
    return getDefaultAdConfig();
  }
}

function cacheAdConfig(cfg: AdConfig): void {
  try {
    localStorage.setItem(AD_STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    // Ignore storage quota errors
  }
}

export function isValidAdSenseClient(id: string): boolean {
  return /^ca-pub-\d{10,20}$/.test(id.trim());
}

export function isValidAdSenseSlot(id: string): boolean {
  return /^\d{6,15}$/.test(id.trim());
}

function isSafeImageSrc(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.startsWith('/src/assets/images/')) return trimmed;
  return isSafeHttpUrl(trimmed);
}

function isSafeHttpsUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = new URL(raw.trim());
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function useSiteAds() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [siteSettings, setSiteSettings] = useState<Omit<AdConfig, 'campaigns'>>(() => {
    const { campaigns: _c, ...rest } = loadCachedAdConfig();
    return rest;
  });
  const [campaigns, setCampaigns] = useState<DirectAdCampaign[]>(() => loadCachedAdConfig().campaigns);
  const [saving, setSaving] = useState(false);

  const isOwner = isOwnerUser(user);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
    return unsub;
  }, []);

  // Real-time public siteConfig/ads subscription
  useEffect(() => {
    const ref = doc(db, 'siteConfig', 'ads');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) return;
        const d = snap.data();
        const nextSettings = {
          adsEnabled: d.adsEnabled !== false,
          adsenseClientId: String(d.adsenseClientId || ENV_CLIENT_ID),
          slotBannerId: String(d.slotBannerId || ENV_SLOT_BANNER),
          slotNewsId: String(d.slotNewsId || ''),
          slotSidebarId: String(d.slotSidebarId || ''),
          customScriptUrl: String(d.customScriptUrl || ''),
          adsTxtLine: String(d.adsTxtLine || ''),
        };
        setSiteSettings(nextSettings);
        setCampaigns((curr) => {
          cacheAdConfig({ ...nextSettings, campaigns: curr });
          return curr;
        });
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, 'siteConfig/ads');
      }
    );
    return unsub;
  }, []);

  // Real-time campaigns subscription (active-only for visitors; all for verified owner)
  useEffect(() => {
    if (!authReady) return;
    const colRef = collection(db, 'campaigns');
    const q = isOwner ? colRef : query(colRef, where('active', '==', true));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: DirectAdCampaign[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            title: String(data.title || ''),
            subtitle: String(data.subtitle || ''),
            ctaText: String(data.ctaText || 'زيارة العرض'),
            targetUrl: String(data.targetUrl || ''),
            imageUrl: String(data.imageUrl || ''),
            placement: (data.placement as DirectAdCampaign['placement']) || 'all',
            active: data.active !== false,
            ownerUid: String(data.ownerUid || ''),
          };
        });
        setCampaigns(list);
        setSiteSettings((curr) => {
          cacheAdConfig({ ...curr, campaigns: list });
          return curr;
        });
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'campaigns');
      }
    );
    return unsub;
  }, [authReady, isOwner]);

  // Global AdSense & custom network script injection when enabled
  useEffect(() => {
    const scriptId = 'snox-adsense-script';
    if (siteSettings.adsEnabled && isValidAdSenseClient(siteSettings.adsenseClientId)) {
      const client = siteSettings.adsenseClientId.trim();
      const expectedSrc = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(
        client
      )}`;
      const existing =
        (document.getElementById(scriptId) as HTMLScriptElement | null) ||
        (document.querySelector(
          `script[src*="pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"][src*="${client}"]`
        ) as HTMLScriptElement | null);
      if (!existing) {
        const s = document.createElement('script');
        s.id = scriptId;
        s.async = true;
        s.src = expectedSrc;
        s.crossOrigin = 'anonymous';
        document.head.appendChild(s);
      }
    }

    const customId = 'snox-custom-ad-network-script';
    const safeCustom = siteSettings.adsEnabled ? isSafeHttpsUrl(siteSettings.customScriptUrl) : null;
    const prevCustom = document.getElementById(customId) as HTMLScriptElement | null;
    if (safeCustom) {
      if (!prevCustom || prevCustom.src !== safeCustom) {
        if (prevCustom) prevCustom.remove();
        const s = document.createElement('script');
        s.id = customId;
        s.async = true;
        s.src = safeCustom;
        document.head.appendChild(s);
      }
    } else if (prevCustom) {
      prevCustom.remove();
    }
  }, [siteSettings.adsEnabled, siteSettings.adsenseClientId, siteSettings.customScriptUrl]);

  const saveSiteSettings = useCallback(
    async (partial: Partial<Omit<AdConfig, 'campaigns'>>) => {
      if (!auth.currentUser || !isOwnerUser(auth.currentUser)) {
        throw new Error('يجب تسجيل الدخول بحساب المالك أولاً لحفظ الإعلانات للجميع');
      }
      setSaving(true);
      try {
        const merged = { ...siteSettings, ...partial };
        const clientClean = merged.adsenseClientId.trim().slice(0, 32);
        const derivedAdsTxt =
          merged.adsTxtLine.trim().slice(0, 200) ||
          (isValidAdSenseClient(clientClean)
            ? `google.com, ${clientClean.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0`
            : '');

        await setDoc(doc(db, 'siteConfig', 'ads'), {
          adsEnabled: Boolean(merged.adsEnabled),
          adsenseClientId: clientClean,
          slotBannerId: merged.slotBannerId.trim().slice(0, 20),
          slotNewsId: merged.slotNewsId.trim().slice(0, 20),
          slotSidebarId: merged.slotSidebarId.trim().slice(0, 20),
          customScriptUrl: merged.customScriptUrl.trim().slice(0, 500),
          adsTxtLine: derivedAdsTxt,
          updatedBy: auth.currentUser.uid,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'siteConfig/ads');
      } finally {
        setSaving(false);
      }
    },
    [siteSettings]
  );

  const createCampaign = useCallback(
    async (input: {
      title: string;
      subtitle: string;
      ctaText: string;
      targetUrl: string;
      imageUrl: string;
      placement: DirectAdCampaign['placement'];
    }) => {
      if (!auth.currentUser || !isOwnerUser(auth.currentUser)) {
        throw new Error('يجب تسجيل الدخول بحساب المالك أولاً لنشر الإعلانات');
      }
      setSaving(true);
      const id = `ad_${Date.now()}`;
      try {
        await setDoc(doc(db, 'campaigns', id), {
          title: input.title.trim().slice(0, 140),
          subtitle: input.subtitle.trim().slice(0, 260),
          ctaText: (input.ctaText.trim() || 'زيارة العرض').slice(0, 40),
          targetUrl: input.targetUrl.trim().slice(0, 500),
          imageUrl: input.imageUrl.trim().slice(0, 500),
          placement: input.placement,
          active: true,
          ownerUid: auth.currentUser.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `campaigns/${id}`);
      } finally {
        setSaving(false);
      }
    },
    []
  );

  const toggleCampaignActive = useCallback(async (camp: DirectAdCampaign) => {
    if (!auth.currentUser || !isOwnerUser(auth.currentUser)) {
      throw new Error('صلاحية التعديل مخصصة لمالك الموقع فقط');
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'campaigns', camp.id), {
        active: !camp.active,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `campaigns/${camp.id}`);
    } finally {
      setSaving(false);
    }
  }, []);

  const removeCampaign = useCallback(async (id: string) => {
    if (!auth.currentUser || !isOwnerUser(auth.currentUser)) {
      throw new Error('صلاحية الحذف مخصصة لمالك الموقع فقط');
    }
    setSaving(true);
    try {
      await deleteDoc(doc(db, 'campaigns', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `campaigns/${id}`);
    } finally {
      setSaving(false);
    }
  }, []);

  const config: AdConfig = { ...siteSettings, campaigns };

  return {
    config,
    user,
    isOwner,
    saving,
    saveSiteSettings,
    createCampaign,
    toggleCampaignActive,
    removeCampaign,
    signInOwner: signInAsOwner,
    signOutOwner,
  };
}

function AdSenseUnit({
  clientId,
  slotId,
  compact = false,
}: {
  clientId: string;
  slotId: string;
  compact?: boolean;
}) {
  useEffect(() => {
    if (!isValidAdSenseClient(clientId) || !isValidAdSenseSlot(slotId)) return;
    try {
      const win = window as unknown as { adsbygoogle?: unknown[] };
      win.adsbygoogle = win.adsbygoogle || [];
      win.adsbygoogle.push({});
    } catch {
      // Ignore AdSense push errors before script loads
    }
  }, [clientId, slotId]);

  return (
    <div
      className={`rounded-xl border border-slate-800 bg-[#111827] text-center overflow-hidden ${
        compact ? 'p-2.5' : 'p-3'
      }`}
    >
      <p className="text-[10px] text-slate-500 mb-1">إعلان</p>
      <ins
        className="adsbygoogle block"
        style={{ display: 'block' }}
        data-ad-client={clientId.trim()}
        data-ad-slot={slotId.trim()}
        data-ad-format={compact ? 'rectangle' : 'auto'}
        data-full-width-responsive="true"
      />
    </div>
  );
}

const NATIVE_AD_CONTAINER_ID = 'container-baa86f0411e8164b5082ac7077780c67';
const NATIVE_AD_SCRIPT_URL = 'https://bauval.org/21/baa86f0411e8164b5082ac7077780c67';
const DIRECT_LINK_AD_URL = 'https://araplhn.org/4/6ccf67894051c5ae5c14ebe328806eb2';
const MONETAG_DIRECT_LINK_URL = 'https://uplcm.com/4/12319651';

const PLACEMENT_FALLBACK_COPY: Record<
  AdPlacement,
  { image: string; title: string; subtitle: string; primaryUrl: string; secondaryUrl: string }
> = {
  main_banner: {
    image: '/src/assets/images/news_europe_night_1795222605684.jpg',
    title: 'عروض حصرية لمتابعي الكرة على SNOX Sports',
    subtitle: 'اكتشف عروض الشركاء والمنتجات الرياضية المختارة الآن',
    primaryUrl: DIRECT_LINK_AD_URL,
    secondaryUrl: MONETAG_DIRECT_LINK_URL,
  },
  watch_banner: {
    image: '/src/assets/images/news_egypt_stadium_1795222605678.jpg',
    title: 'عروض الشركاء لمتابعي البث والملخصات',
    subtitle: 'تصفح أحدث عروض الشركاء المميزة أثناء متابعة الأهداف والقنوات',
    primaryUrl: MONETAG_DIRECT_LINK_URL,
    secondaryUrl: DIRECT_LINK_AD_URL,
  },
  news_feed: {
    image: '/src/assets/images/news_transfer_contract_1795222605103.jpg',
    title: 'عروض وروابط الشركاء الحصرية',
    subtitle: 'اكتشف العروض الممولة المختارة مع آخر أخبار الكرة والانتقالات',
    primaryUrl: MONETAG_DIRECT_LINK_URL,
    secondaryUrl: DIRECT_LINK_AD_URL,
  },
  sidebar: {
    image: '/src/assets/images/news_africa_football_1795222605769.jpg',
    title: 'عروض الشركاء الحصرية',
    subtitle: 'روابط وعروض مميزة لمتابعي SNOX Sports',
    primaryUrl: DIRECT_LINK_AD_URL,
    secondaryUrl: MONETAG_DIRECT_LINK_URL,
  },
};

function NativeAdNetworkUnit({
  placement = 'main_banner',
  isOwner = false,
  onOpenAdManager,
}: {
  placement?: AdPlacement;
  isOwner?: boolean;
  onOpenAdManager: () => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [nativeLoaded, setNativeLoaded] = useState(false);
  const copy = PLACEMENT_FALLBACK_COPY[placement] || PLACEMENT_FALLBACK_COPY.main_banner;

  useEffect(() => {
    setNativeLoaded(false);
    const host = hostRef.current;
    if (!host) return;
    const container = host.querySelector(`#${NATIVE_AD_CONTAINER_ID}`);
    if (!container) return;

    const checkPopulated = () => {
      const containerHasContent =
        container.childElementCount > 0 || (container.textContent || '').trim().length > 0;
      const hostHasInjectedSibling = Array.from(host.children).some(
        (el) => el.tagName !== 'SCRIPT' && el.id !== NATIVE_AD_CONTAINER_ID
      );
      if (containerHasContent || hostHasInjectedSibling) {
        setNativeLoaded(true);
      }
    };
    checkPopulated();

    const observer = new MutationObserver(checkPopulated);
    observer.observe(host, { childList: true, subtree: true });

    const existing = document.getElementById('snox-native-ad-script');
    if (existing) existing.remove();

    const s = document.createElement('script');
    s.id = 'snox-native-ad-script';
    s.async = true;
    s.setAttribute('data-cfasync', 'false');
    s.src = NATIVE_AD_SCRIPT_URL;
    host.prepend(s);

    return () => {
      observer.disconnect();
      s.remove();
    };
  }, [placement]);

  return (
    <div className="rounded-xl border border-slate-800 bg-[#111827] p-3.5 sm:px-5 space-y-2.5 overflow-hidden">
      <div className="flex items-center justify-between text-[11px] text-slate-400">
        <span>إعلان ممول · SNOX Sports</span>
        <div className="flex items-center gap-3">
          {isOwner && (
            <button
              type="button"
              onClick={onOpenAdManager}
              className="text-slate-300 hover:text-emerald-400 cursor-pointer"
            >
              إدارة الإعلانات
            </button>
          )}
          <a
            href={copy.secondaryUrl}
            target="_blank"
            rel="noopener noreferrer sponsored"
            className="text-emerald-400 hover:text-emerald-300 font-semibold inline-flex items-center gap-1"
          >
            <span>عروض الشركاء</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      <div ref={hostRef}>
        <div id={NATIVE_AD_CONTAINER_ID} />
      </div>

      {!nativeLoaded && (
        <a
          href={copy.primaryUrl}
          target="_blank"
          rel="noopener noreferrer sponsored"
          className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-emerald-500/30 bg-[#0B0F17] p-3 hover:border-emerald-500/60 transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-14 w-24 rounded-md overflow-hidden bg-slate-900 shrink-0 border border-slate-800">
              <img
                src={copy.image}
                alt={copy.title}
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
            </div>
            <div className="space-y-0.5 min-w-0">
              <p className="text-xs sm:text-sm font-bold text-white truncate">
                {copy.title}
              </p>
              <p className="text-[11px] text-slate-400 line-clamp-1">
                {copy.subtitle}
              </p>
            </div>
          </div>
          <span className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white group-hover:bg-emerald-500 transition-colors whitespace-nowrap shrink-0">
            <span>زيارة العرض</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </span>
        </a>
      )}
    </div>
  );
}

interface AdBannerSlotProps {
  placement: AdPlacement;
  config: AdConfig;
  isOwner?: boolean;
  onOpenAdManager: () => void;
}

export function AdBannerSlot({
  placement,
  config,
  isOwner = false,
  onOpenAdManager,
}: AdBannerSlotProps) {
  if (!config.adsEnabled) return null;

  const activeCampaign =
    config.campaigns.find((c) => c.active && c.placement === placement) ||
    config.campaigns.find((c) => c.active && c.placement === 'all');

  const compact = placement === 'sidebar';

  if (activeCampaign) {
    const safeHref = isSafeHttpUrl(activeCampaign.targetUrl);
    const safeImg = isSafeImageSrc(activeCampaign.imageUrl);

    if (compact) {
      return (
        <div className="rounded-xl border border-emerald-500/30 bg-[#111827] overflow-hidden">
          {safeImg && (
            <div className="aspect-[16/7] w-full overflow-hidden bg-slate-900">
              <img
                src={safeImg}
                alt={activeCampaign.title}
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            </div>
          )}
          <div className="p-3 space-y-2">
            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span className="font-semibold text-emerald-400">إعلان ممول</span>
              <span>SNOX Sports</span>
            </div>
            <h4 className="text-xs font-bold text-white line-clamp-1">{activeCampaign.title}</h4>
            {activeCampaign.subtitle && (
              <p className="text-[11px] text-slate-300 line-clamp-2">{activeCampaign.subtitle}</p>
            )}
            {safeHref && (
              <a
                href={safeHref}
                target="_blank"
                rel="noopener noreferrer sponsored"
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors"
              >
                <span>{activeCampaign.ctaText || 'زيارة العرض'}</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="rounded-xl border border-emerald-500/30 bg-[#111827] overflow-hidden flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3.5 sm:px-5 sm:py-3.5">
        <div className="flex items-center gap-3.5 min-w-0">
          {safeImg && (
            <div className="h-14 w-24 sm:h-16 sm:w-28 rounded-lg overflow-hidden bg-slate-900 shrink-0 border border-slate-800">
              <img
                src={safeImg}
                alt={activeCampaign.title}
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            </div>
          )}
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <span className="font-semibold text-emerald-400">إعلان ممول</span>
              <span aria-hidden="true">·</span>
              <span>شريك SNOX Sports</span>
            </div>
            <h4 className="text-sm font-bold text-white truncate">{activeCampaign.title}</h4>
            {activeCampaign.subtitle && (
              <p className="text-xs text-slate-300 line-clamp-1">{activeCampaign.subtitle}</p>
            )}
          </div>
        </div>

        {safeHref && (
          <a
            href={safeHref}
            target="_blank"
            rel="noopener noreferrer sponsored"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors whitespace-nowrap shrink-0"
          >
            <span>{activeCampaign.ctaText || 'زيارة العرض'}</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    );
  }

  const resolvedSlot =
    placement === 'news_feed'
      ? config.slotNewsId || config.slotBannerId
      : placement === 'sidebar'
      ? config.slotSidebarId || config.slotBannerId
      : config.slotBannerId;

  if (isValidAdSenseClient(config.adsenseClientId) && isValidAdSenseSlot(resolvedSlot)) {
    return (
      <AdSenseUnit
        clientId={config.adsenseClientId}
        slotId={resolvedSlot}
        compact={compact}
      />
    );
  }

  if (!compact) {
    return (
      <NativeAdNetworkUnit
        placement={placement}
        isOwner={isOwner}
        onOpenAdManager={onOpenAdManager}
      />
    );
  }

  const sidebarCopy = PLACEMENT_FALLBACK_COPY.sidebar;

  return (
    <div className="rounded-xl border border-emerald-500/25 bg-[#0B0F17] overflow-hidden">
      <a
        href={sidebarCopy.primaryUrl}
        target="_blank"
        rel="noopener noreferrer sponsored"
        className="block aspect-[16/7] w-full overflow-hidden bg-slate-900"
      >
        <img
          src={sidebarCopy.image}
          alt={sidebarCopy.title}
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover hover:scale-105 transition-transform duration-300"
        />
      </a>
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between text-[10px] text-slate-400">
          <span className="font-semibold text-emerald-400">إعلان ممول</span>
          <span>SNOX Sports</span>
        </div>
        <p className="text-xs font-bold text-slate-100 line-clamp-1">{sidebarCopy.title}</p>
        <div className="flex items-center gap-2">
          {isOwner && (
            <button
              type="button"
              onClick={onOpenAdManager}
              className="rounded-lg border border-slate-700 bg-[#111827] px-2.5 py-1.5 text-[11px] font-medium text-slate-200 hover:border-emerald-500 cursor-pointer"
            >
              تعديل
            </button>
          )}
          <a
            href={sidebarCopy.secondaryUrl}
            target="_blank"
            rel="noopener noreferrer sponsored"
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-500"
          >
            <span>زيارة العرض</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>
  );
}

export type ModalTab = 'ads' | 'earnings' | 'privacy';

interface MonetizationModalProps {
  isOpen: boolean;
  initialTab: ModalTab;
  onClose: () => void;
  config: AdConfig;
  user: User | null;
  isOwner: boolean;
  saving: boolean;
  onSignInOwner: () => Promise<User>;
  onSignOutOwner: () => Promise<void>;
  onSaveSettings: (partial: Partial<Omit<AdConfig, 'campaigns'>>) => Promise<void>;
  onCreateCampaign: (input: {
    title: string;
    subtitle: string;
    ctaText: string;
    targetUrl: string;
    imageUrl: string;
    placement: DirectAdCampaign['placement'];
  }) => Promise<void>;
  onToggleCampaign: (camp: DirectAdCampaign) => Promise<void>;
  onDeleteCampaign: (id: string) => Promise<void>;
}

export function MonetizationModal({
  isOpen,
  initialTab,
  onClose,
  config,
  user,
  isOwner,
  saving,
  onSignInOwner,
  onSignOutOwner,
  onSaveSettings,
  onCreateCampaign,
  onToggleCampaign,
  onDeleteCampaign,
}: MonetizationModalProps) {
  const [tab, setTab] = useState<ModalTab>(initialTab);
  const [clientInput, setClientInput] = useState(config.adsenseClientId);
  const [slotBannerInput, setSlotBannerInput] = useState(config.slotBannerId);
  const [slotNewsInput, setSlotNewsInput] = useState(config.slotNewsId);
  const [slotSidebarInput, setSlotSidebarInput] = useState(config.slotSidebarId);
  const [customScriptInput, setCustomScriptInput] = useState(config.customScriptUrl);

  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [ctaText, setCtaText] = useState('اشترك الآن');
  const [targetUrl, setTargetUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [placement, setPlacement] = useState<DirectAdCampaign['placement']>('all');
  const [formError, setFormError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [copiedAdsTxt, setCopiedAdsTxt] = useState(false);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    setClientInput(config.adsenseClientId);
    setSlotBannerInput(config.slotBannerId);
    setSlotNewsInput(config.slotNewsId);
    setSlotSidebarInput(config.slotSidebarId);
    setCustomScriptInput(config.customScriptUrl);
  }, [
    config.adsenseClientId,
    config.slotBannerId,
    config.slotNewsId,
    config.slotSidebarId,
    config.customScriptUrl,
  ]);

  if (!isOpen) return null;

  const showSuccess = (msg: string) => {
    setSavedMsg(msg);
    window.setTimeout(() => setSavedMsg(null), 3000);
  };

  const generatedAdsTxt = isValidAdSenseClient(clientInput)
    ? `google.com, ${clientInput.trim().replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0`
    : config.adsTxtLine || 'google.com, pub-0000000000000000, DIRECT, f08c47fec0942fa0';

  const handleSaveAdNetworks = async () => {
    setFormError(null);
    const c = clientInput.trim();
    const sb = slotBannerInput.trim();
    const sn = slotNewsInput.trim();
    const ss = slotSidebarInput.trim();
    const cs = customScriptInput.trim();

    if (c && !isValidAdSenseClient(c)) {
      setFormError('صيغة معرف الناشر يجب أن تبدأ بـ ca-pub- متبوعة بأرقام');
      return;
    }
    if ((sb && !isValidAdSenseSlot(sb)) || (sn && !isValidAdSenseSlot(sn)) || (ss && !isValidAdSenseSlot(ss))) {
      setFormError('أرقام الوحدات الإعلانية (Slot ID) يجب أن تتكون من 6 إلى 15 رقماً فقط');
      return;
    }
    if (cs && !isSafeHttpsUrl(cs)) {
      setFormError('رابط كود شبكة الإعلانات يجب أن يبدأ بـ https://');
      return;
    }

    try {
      await onSaveSettings({
        adsenseClientId: c,
        slotBannerId: sb,
        slotNewsId: sn,
        slotSidebarId: ss,
        customScriptUrl: cs,
        adsTxtLine: c ? `google.com, ${c.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0` : '',
      });
      showSuccess('تم نشر إعدادات الإعلانات لجميع زوار الموقع');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'تعذر حفظ الإعدادات');
    }
  };

  const handleAddCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const safeUrl = isSafeHttpUrl(targetUrl);
    if (!title.trim()) {
      setFormError('اكتب عنوان الإعلان');
      return;
    }
    if (!safeUrl) {
      setFormError('أدخل رابطاً صحيحاً يبدأ بـ https:// أو http://');
      return;
    }
    if (imageUrl.trim() && !isSafeImageSrc(imageUrl)) {
      setFormError('رابط الصورة يجب أن يبدأ بـ https:// أو http://');
      return;
    }

    try {
      await onCreateCampaign({
        title: title.trim(),
        subtitle: subtitle.trim(),
        ctaText: ctaText.trim() || 'زيارة العرض',
        targetUrl: safeUrl,
        imageUrl: imageUrl.trim(),
        placement,
      });
      setTitle('');
      setSubtitle('');
      setTargetUrl('');
      setImageUrl('');
      showSuccess('تم نشر الإعلان بنجاح وسيظهر لجميع الزوار');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'تعذر نشر الإعلان');
    }
  };

  const placementLabels: Record<DirectAdCampaign['placement'], string> = {
    all: 'كل الأماكن',
    main_banner: 'أسفل المباراة',
    news_feed: 'قسم الأخبار',
    watch_banner: 'مركز المشاهدة',
    sidebar: 'الشريط الجانبي',
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-4">
      <div className="w-full max-w-3xl max-h-[92vh] rounded-xl border border-slate-800 bg-[#0E131D] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Megaphone className="h-5 w-5 text-emerald-400" />
            <h2 className="text-sm sm:text-base font-bold text-white">مركز الإعلانات والأرباح · SNOX Sports</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="text-slate-400 hover:text-white p-1.5 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-4 sm:px-5 pt-2.5 border-b border-slate-800 flex items-center gap-2 overflow-x-auto no-scrollbar">
          {[
            { id: 'ads' as const, label: 'إدارة الإعلانات ونشرها', icon: Megaphone },
            { id: 'earnings' as const, label: 'طرق الربح والسحب', icon: Wallet },
            { id: 'privacy' as const, label: 'سياسة الخصوصية (AdSense)', icon: ShieldCheck },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  tab === t.id
                    ? 'border-emerald-500 text-emerald-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5 text-xs">
          {tab === 'ads' && (
            <>
              {/* Owner Auth Status Bar */}
              <div
                className={`rounded-lg border px-4 py-3 flex flex-wrap items-center justify-between gap-3 ${
                  isOwner
                    ? 'border-emerald-500/40 bg-emerald-500/10'
                    : 'border-amber-500/40 bg-amber-500/10'
                }`}
              >
                {isOwner ? (
                  <>
                    <div className="space-y-0.5">
                      <p className="font-bold text-emerald-300">متصل بصلاحية مالك الموقع ({user?.email})</p>
                      <p className="text-[11px] text-slate-300">
                        أي إعلان أو كود AdSense تحفظه هنا يُنشر فوراً في السحابة ويظهر لجميع الزوار على كل الأجهزة.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onSignOutOwner()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white cursor-pointer whitespace-nowrap"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      <span>تسجيل خروج</span>
                    </button>
                  </>
                ) : (
                  <>
                    <div className="space-y-0.5">
                      <p className="font-bold text-amber-300">
                        {user
                          ? `الحساب الحالي (${user.email}) ليس حساب المالك`
                          : 'سجّل الدخول بحساب المالك لنشر الإعلانات على الموقع للجميع'}
                      </p>
                      <p className="text-[11px] text-slate-300">
                        حساب المالك المعتمد: <span className="font-mono" dir="ltr">{OWNER_EMAIL}</span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        setFormError(null);
                        try {
                          await onSignInOwner();
                        } catch (err) {
                          setFormError(err instanceof Error ? err.message : 'تعذر تسجيل الدخول عبر Google');
                        }
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-500 cursor-pointer whitespace-nowrap"
                    >
                      <LogIn className="h-3.5 w-3.5" />
                      <span>دخول المالك (Google)</span>
                    </button>
                  </>
                )}
              </div>

              {formError && (
                <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-red-300 font-medium">
                  {formError}
                </div>
              )}
              {savedMsg && (
                <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-emerald-300 font-semibold">
                  {savedMsg}
                </div>
              )}

              {/* Installed Ad Codes Status */}
              <div className="rounded-lg border border-slate-800 bg-[#111827] p-4 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-white">الأكواد المربوطة حالياً في كود الموقع</h3>
                  <span className="text-[11px] font-semibold text-emerald-400">7 وحدات وتاجات مفعّلة</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-[11px]" dir="ltr">
                  <div className="rounded-md border border-slate-800 bg-[#0B0F17] px-3 py-2 text-slate-300 truncate">
                    AdSense: ca-pub-7243498880233715
                  </div>
                  <div className="rounded-md border border-slate-800 bg-[#0B0F17] px-3 py-2 text-slate-300 truncate">
                    Monetag Meta: 76f04106a2d513e2...
                  </div>
                  <div className="rounded-md border border-slate-800 bg-[#0B0F17] px-3 py-2 text-slate-300 truncate">
                    Script 1: bauval.org/14/a8178353...
                  </div>
                  <div className="rounded-md border border-slate-800 bg-[#0B0F17] px-3 py-2 text-slate-300 truncate">
                    Script 2: abscloud.org/1/5e86abf9...
                  </div>
                  <div className="rounded-md border border-slate-800 bg-[#0B0F17] px-3 py-2 text-slate-300 truncate">
                    Native: bauval.org/21/baa86f04...
                  </div>
                  <div className="rounded-md border border-slate-800 bg-[#0B0F17] px-3 py-2 text-slate-300 truncate">
                    Direct Link 1: araplhn.org/4/6ccf6789...
                  </div>
                  <div className="rounded-md border border-slate-800 bg-[#0B0F17] px-3 py-2 text-slate-300 truncate sm:col-span-2">
                    Direct Link 2 (Monetag): https://uplcm.com/4/12319651
                  </div>
                </div>
              </div>

              {/* Global Switch */}
              <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-[#111827] px-4 py-3">
                <div>
                  <p className="font-bold text-white">تفعيل مساحات الإعلانات في الموقع</p>
                  <p className="text-slate-400">
                    تظهر الإعلانات أسفل المباراة، داخل الأخبار، في مركز المشاهدة، وفي الشريط الجانبي
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!isOwner || saving}
                  onClick={() => onSaveSettings({ adsEnabled: !config.adsEnabled })}
                  className={`px-3.5 py-1.5 rounded-lg font-semibold cursor-pointer disabled:opacity-50 whitespace-nowrap ${
                    config.adsEnabled ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {config.adsEnabled ? 'مفعّلة' : 'معطّلة'}
                </button>
              </div>

              {/* Section 1: Google AdSense + Alternative Network */}
              <div className="rounded-lg border border-slate-800 bg-[#111827] p-4 space-y-3.5">
                <div className="space-y-0.5">
                  <h3 className="text-sm font-bold text-white">1. ربط Google AdSense أو شبكة إعلانات</h3>
                  <p className="text-[11px] text-slate-400">
                    أدخل رقم الناشر والوحدة الإعلانية من حسابك في AdSense، وسيتم تفعيل ملف <span className="font-mono">/ads.txt</span> تلقائياً.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1">معرف الناشر (Publisher ID)</label>
                    <input
                      type="text"
                      value={clientInput}
                      onChange={(e) => setClientInput(e.target.value)}
                      placeholder="ca-pub-1234567890123456"
                      dir="ltr"
                      className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 font-mono text-xs text-white focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">وحدة أسفل المباراة والمشاهدة (Slot ID)</label>
                    <input
                      type="text"
                      value={slotBannerInput}
                      onChange={(e) => setSlotBannerInput(e.target.value)}
                      placeholder="9876543210"
                      dir="ltr"
                      className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 font-mono text-xs text-white focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">وحدة قسم الأخبار (اختياري)</label>
                    <input
                      type="text"
                      value={slotNewsInput}
                      onChange={(e) => setSlotNewsInput(e.target.value)}
                      placeholder="يستخدم الوحدة الرئيسية إذا تُرك فارغاً"
                      dir="ltr"
                      className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 font-mono text-xs text-white focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">وحدة الشريط الجانبي (اختياري)</label>
                    <input
                      type="text"
                      value={slotSidebarInput}
                      onChange={(e) => setSlotSidebarInput(e.target.value)}
                      placeholder="يستخدم الوحدة الرئيسية إذا تُرك فارغاً"
                      dir="ltr"
                      className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 font-mono text-xs text-white focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">
                    رابط سكريبت شبكة إعلانات بديلة (Adsterra / Monetag — اختياري)
                  </label>
                  <input
                    type="url"
                    value={customScriptInput}
                    onChange={(e) => setCustomScriptInput(e.target.value)}
                    placeholder="https://pl123456.highperformanceformat.com/..."
                    dir="ltr"
                    className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 font-mono text-xs text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                {/* ads.txt Helper */}
                <div className="rounded-lg border border-slate-800 bg-[#0B0F17] px-3 py-2.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] text-slate-400">سطر ملف ads.txt (متاح تلقائياً على رابط /ads.txt):</p>
                    <p className="font-mono text-[11px] text-emerald-400 truncate" dir="ltr">
                      {generatedAdsTxt}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(generatedAdsTxt);
                        setCopiedAdsTxt(true);
                        window.setTimeout(() => setCopiedAdsTxt(false), 2000);
                      } catch {
                        // Ignore clipboard errors
                      }
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2.5 py-1 text-[11px] text-slate-200 hover:border-emerald-500 cursor-pointer shrink-0"
                  >
                    {copiedAdsTxt ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                    <span>{copiedAdsTxt ? 'تم النسخ' : 'نسخ'}</span>
                  </button>
                </div>

                <button
                  type="button"
                  disabled={!isOwner || saving}
                  onClick={handleSaveAdNetworks}
                  className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 cursor-pointer"
                >
                  {saving ? 'جاري الحفظ...' : 'حفظ ونشر إعدادات الشبكة للجميع'}
                </button>
              </div>

              {/* Section 2: Add Direct Sponsor / Image Banner */}
              <form
                onSubmit={handleAddCampaign}
                className="rounded-lg border border-slate-800 bg-[#111827] p-4 space-y-3"
              >
                <div className="space-y-0.5">
                  <h3 className="text-sm font-bold text-white">2. نشر إعلان مباشر أو بانر صورة (رعاية / عمولة)</h3>
                  <p className="text-[11px] text-slate-400">
                    أنشئ إعلان لمتجر رياضي أو قناة أو رابط تسويق بالعمولة واختر مكانه في الموقع.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="عنوان الإعلان (مثال: خصم 25% على تيشيرتات الأندية)"
                    className="rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-white focus:border-emerald-500 focus:outline-none"
                  />
                  <input
                    type="text"
                    value={subtitle}
                    onChange={(e) => setSubtitle(e.target.value)}
                    placeholder="وصف مختصر يظهر تحت العنوان"
                    className="rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-white focus:border-emerald-500 focus:outline-none"
                  />
                  <input
                    type="url"
                    value={targetUrl}
                    onChange={(e) => setTargetUrl(e.target.value)}
                    placeholder="رابط الإعلان https://example.com"
                    dir="ltr"
                    className="rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 font-mono text-white focus:border-emerald-500 focus:outline-none"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={ctaText}
                      onChange={(e) => setCtaText(e.target.value)}
                      placeholder="نص الزر"
                      className="rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-white focus:border-emerald-500 focus:outline-none"
                    />
                    <select
                      aria-label="مكان ظهور الإعلان"
                      value={placement}
                      onChange={(e) => setPlacement(e.target.value as DirectAdCampaign['placement'])}
                      className="rounded-lg border border-slate-700 bg-[#0B0F17] px-2 py-2 text-white focus:border-emerald-500 focus:outline-none"
                    >
                      <option value="all">كل الأماكن</option>
                      <option value="main_banner">أسفل المباراة</option>
                      <option value="news_feed">قسم الأخبار</option>
                      <option value="watch_banner">مركز المشاهدة</option>
                      <option value="sidebar">الشريط الجانبي</option>
                    </select>
                  </div>
                </div>

                {/* Optional Image URL + Quick Presets */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <input
                      type="text"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      placeholder="رابط صورة البانر (اختياري https://... أو اختر خلفية جاهزة)"
                      dir="ltr"
                      className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 font-mono text-white focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] text-slate-400">خلفيات رياضية جاهزة:</span>
                    {BANNER_PRESETS.map((p) => (
                      <button
                        key={p.url}
                        type="button"
                        onClick={() => setImageUrl(p.url)}
                        className={`rounded-md border px-2.5 py-1 text-[11px] cursor-pointer transition-colors ${
                          imageUrl === p.url
                            ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
                            : 'border-slate-700 bg-[#0B0F17] text-slate-300 hover:border-slate-500'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                    {imageUrl && (
                      <button
                        type="button"
                        onClick={() => setImageUrl('')}
                        className="text-[11px] text-slate-400 hover:text-red-400 cursor-pointer"
                      >
                        بدون صورة
                      </button>
                    )}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!isOwner || saving}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>{saving ? 'جاري النشر...' : 'نشر الإعلان في الموقع الآن'}</span>
                </button>
              </form>

              {/* Campaigns List */}
              {config.campaigns.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-bold text-white">الإعلانات المنشورة حالياً ({config.campaigns.length})</h4>
                  {config.campaigns.map((camp) => (
                    <div
                      key={camp.id}
                      className="rounded-lg border border-slate-800 bg-[#111827] px-4 py-3 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="space-y-0.5 min-w-0">
                        <p className="font-bold text-white truncate">{camp.title}</p>
                        <p className="text-[11px] text-slate-400">
                          المكان: {placementLabels[camp.placement]} · {camp.ctaText}
                        </p>
                      </div>
                      {isOwner && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => onToggleCampaign(camp)}
                            className={`px-2.5 py-1 rounded font-semibold cursor-pointer ${
                              camp.active
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {camp.active ? 'نشط' : 'متوقف'}
                          </button>
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => onDeleteCampaign(camp.id)}
                            aria-label="حذف الإعلان"
                            className="p-1.5 text-slate-400 hover:text-red-400 cursor-pointer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === 'earnings' && (
            <div className="space-y-4 leading-relaxed text-slate-300">
              <div className="rounded-lg border border-slate-800 bg-[#111827] p-4 space-y-2">
                <h3 className="text-sm font-bold text-emerald-400">أولاً: الربح ينزلك على إيه (طرق استلام الفلوس)؟</h3>
                <ul className="list-disc pr-5 space-y-1.5">
                  <li>
                    <strong className="text-white">أرباح Google AdSense:</strong> تُحوّل شهرياً (عند الوصول للحد الأدنى 100 دولار) مباشرة إلى{' '}
                    <strong className="text-white">حسابك البنكي في مصر أو أي دولة عربية</strong> عبر التحويل البنكي (IBAN / SWIFT).
                  </li>
                  <li>
                    <strong className="text-white">شبكات الإعلانات الفورية (Adsterra / Monetag):</strong> تقبل السحب الأسبوعي أو الشهري ابتداءً من 5–20 دولار عبر PayPal أو المحافظ الإلكترونية أو التحويل البنكي.
                  </li>
                  <li>
                    <strong className="text-white">أرباح الإعلانات المباشرة والرعاية:</strong> تستلمها فوراً من المعلن عبر{' '}
                    <strong className="text-white">إنستاباي (InstaPay) أو فودافون كاش أو التحويل البنكي</strong> بدون أي وسطاء.
                  </li>
                </ul>
              </div>

              <div className="rounded-lg border border-slate-800 bg-[#111827] p-4 space-y-2">
                <h3 className="text-sm font-bold text-white">ثانياً: خطوات تشغيل الإعلانات على SNOX Sports الآن</h3>
                <ol className="list-decimal pr-5 space-y-1.5">
                  <li>سجّل الدخول بحساب المالك من تبويب «إدارة الإعلانات ونشرها».</li>
                  <li>
                    لو معاك حساب <strong className="text-white">Google AdSense</strong>: أدخل رقم الناشر (<span className="font-mono">ca-pub-...</span>) ورقم الوحدة الإعلانية واضغط حفظ (وملف <span className="font-mono">/ads.txt</span> بيتحدث تلقائياً).
                  </li>
                  <li>
                    لو لسه منتظر موافقة AdSense: تقدر تشغل إعلانات فورية من <strong className="text-white">Adsterra أو Monetag</strong> بوضع رابط السكريبت، أو نشر <strong className="text-white">بانرات رعاية وروابط عمولة</strong> مباشرة في الـ 4 أماكن المجهزة بالموقع.
                  </li>
                </ol>
              </div>
            </div>
          )}

          {tab === 'privacy' && (
            <div className="rounded-lg border border-slate-800 bg-[#111827] p-5 space-y-3 leading-relaxed text-slate-300">
              <h3 className="text-sm font-bold text-white">سياسة الخصوصية واتفاقية الاستخدام — SNOX Sports BY WANIS</h3>
              <p>
                يحترم موقع <strong>SNOX Sports</strong> خصوصية جميع الزوار، وتوضح هذه الوثيقة كيفية التعامل مع البيانات عند تصفح نتائج المباريات والأخبار الرياضية:
              </p>
              <p>
                <strong>1. ملفات تعريف الارتباط والإعلانات:</strong> قد يستخدم الموقع جهات إعلانية خارجية مثل Google AdSense لعرض الإعلانات عند زيارتك. تستخدم Google ملفات تعريف الارتباط لعرض إعلانات مخصصة بناءً على زياراتك السابقة للموقع أو لمواقع أخرى.
              </p>
              <p>
                <strong>2. التفضيلات المحلية:</strong> يتم حفظ المباريات المفضلة وإعدادات التنبيهات محلياً على متصفحك فقط دون جمع أو بيع أي بيانات شخصية.
              </p>
              <p>
                <strong>3. مصادر البيانات والروابط الخارجية:</strong> تُعرض النتائج والإحصائيات والأخبار لأغراض إعلامية وتحليلية، وتعود ملكية الروابط الإخبارية والقنوات الرسمية لأصحابها.
              </p>
              <p>
                <strong>4. التواصل:</strong> للاستفسارات الإعلانية أو القانونية يمكنكم التواصل مباشرة عبر الرقم{' '}
                <span className="font-mono text-emerald-400" dir="ltr">01152567493</span>.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
