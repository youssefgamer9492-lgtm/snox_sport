import { Bell, BellOff, Volume2, VolumeX, X } from 'lucide-react';
import type { GoalAlert } from '../types/sports';
import { formatRelativeArabicTime } from '../utils/arabicSports';
import { TeamCrest } from './MatchSidebar';

interface AlertsPanelProps {
  alerts: GoalAlert[];
  soundEnabled: boolean;
  onToggleSound: () => void;
  favoritesOnlyAlerts: boolean;
  onToggleFavoritesOnly: () => void;
  browserPermission: NotificationPermission | 'unsupported';
  onRequestBrowserPermission: () => void;
  onTestGoalAlert: () => void;
  onClearAlerts: () => void;
  onSelectMatch: (matchId: string) => void;
}

export function AlertsPanel({
  alerts,
  soundEnabled,
  onToggleSound,
  favoritesOnlyAlerts,
  onToggleFavoritesOnly,
  browserPermission,
  onRequestBrowserPermission,
  onTestGoalAlert,
  onClearAlerts,
  onSelectMatch,
}: AlertsPanelProps) {
  return (
    <div className="space-y-6">
      {/* Notification Controls Bar */}
      <div className="rounded-xl border border-slate-800 bg-[#111827] p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-base font-bold text-white">مركز إشعارات الأهداف والنتائج الفورية</h2>
          <p className="text-xs text-slate-400">
            يراقب النظام جميع المباريات المباشرة كل 12 ثانية ويرسل تنبيهاً فورياً عند تسجيل أي هدف أو تغيير حالة المباراة.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onToggleSound}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
              soundEnabled
                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                : 'border-slate-700 bg-[#0B0F17] text-slate-400'
            }`}
          >
            {soundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
            <span>{soundEnabled ? 'صوت التنبيه مفعّل' : 'الصوت مكتوم'}</span>
          </button>

          <button
            type="button"
            onClick={onToggleFavoritesOnly}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
              favoritesOnlyAlerts
                ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                : 'border-slate-700 bg-[#0B0F17] text-slate-300'
            }`}
          >
            <span>{favoritesOnlyAlerts ? 'المفضلة فقط' : 'كل المباريات المباشرة'}</span>
          </button>

          {browserPermission !== 'unsupported' && browserPermission !== 'granted' && (
            <button
              type="button"
              onClick={onRequestBrowserPermission}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Bell className="h-3.5 w-3.5" />
              <span>تفعيل إشعارات المتصفح</span>
            </button>
          )}

          {browserPermission === 'granted' && (
            <span className="text-xs text-emerald-400 font-medium px-2">
              إشعارات المتصفح مفعّلة
            </span>
          )}

          <button
            type="button"
            onClick={onTestGoalAlert}
            className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
          >
            تجربة صوت وإشعار الهدف
          </button>
        </div>
      </div>

      {/* Alerts Feed */}
      <div className="rounded-xl border border-slate-800 bg-[#111827] overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-white">سجل تنبيهات الأهداف</h3>
            <span className="font-mono text-xs text-slate-400 tabular-nums">
              ({alerts.length})
            </span>
          </div>
          {alerts.length > 0 && (
            <button
              type="button"
              onClick={onClearAlerts}
              className="text-xs text-slate-400 hover:text-red-400 transition-colors cursor-pointer"
            >
              مسح السجل
            </button>
          )}
        </div>

        {alerts.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <BellOff className="h-8 w-8 text-slate-600 mx-auto" />
            <p className="text-sm font-semibold text-slate-300">لا توجد إشعارات أهداف جديدة بعد</p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              أثناء متابعة المباريات المباشرة سيتم تسجيل كل هدف وتنبيهك صوتياً وبصرياً فور حدوثه. يمكنك أيضاً الضغط على «تجربة صوت وإشعار الهدف» للتأكد من جاهزية التنبيهات.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {alerts.map((al) => (
              <button
                key={al.id}
                type="button"
                onClick={() => onSelectMatch(al.matchId)}
                className="w-full text-right px-4 py-3.5 hover:bg-slate-800/35 transition-colors flex flex-wrap items-center justify-between gap-4 cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-mono text-xs font-bold text-emerald-400 tabular-nums shrink-0">
                    {al.clock}
                  </span>
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span className="font-semibold text-emerald-300">{al.message}</span>
                      <span aria-hidden="true">·</span>
                      <span>{al.leagueName}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm font-bold text-white">
                      <TeamCrest logo={al.homeLogo} name={al.homeName} color="#10B981" size={18} />
                      <span>{al.homeName}</span>
                      <span className="font-mono tabular-nums text-emerald-400" dir="ltr">
                        {al.homeScore} - {al.awayScore}
                      </span>
                      <span>{al.awayName}</span>
                      <TeamCrest logo={al.awayLogo} name={al.awayName} color="#3B82F6" size={18} />
                    </div>
                  </div>
                </div>

                <span className="font-mono text-[11px] text-slate-500 shrink-0">
                  {formatRelativeArabicTime(al.timestamp)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function GoalToastBanner({
  alert,
  onDismiss,
  onOpenMatch,
}: {
  alert: GoalAlert | null;
  onDismiss: () => void;
  onOpenMatch: (matchId: string) => void;
}) {
  if (!alert) return null;

  return (
    <div className="fixed bottom-20 inset-x-3 lg:inset-x-auto lg:bottom-4 lg:left-4 z-50 lg:w-[380px] rounded-xl border border-emerald-500/50 bg-[#0E1624]/95 backdrop-blur-md shadow-2xl p-4">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => onOpenMatch(alert.matchId)}
          className="text-right flex-1 space-y-1.5 cursor-pointer"
        >
          <div className="flex items-center gap-2 text-xs">
            <span className="font-bold text-emerald-400">{alert.message}</span>
            <span className="text-slate-500">·</span>
            <span className="font-mono text-slate-300 tabular-nums">{alert.clock}</span>
          </div>
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <span>{alert.homeName}</span>
            <span className="font-mono text-emerald-400 tabular-nums" dir="ltr">
              {alert.homeScore} - {alert.awayScore}
            </span>
            <span>{alert.awayName}</span>
          </div>
          <p className="text-[11px] text-slate-400">اضغط لفتح الرادار التكتيكي للمباراة</p>
        </button>

        <button
          type="button"
          onClick={onDismiss}
          aria-label="إغلاق التنبيه"
          className="text-slate-400 hover:text-white p-1 cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
