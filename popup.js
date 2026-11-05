// popup.js — Tactile Chrono-Instrument UI Controller

const DEFAULT_TRACE_URL = 'http://tpecrawler:7779/timesheet/new';
const WEEKDAYS = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];

const todayDateEl = document.getElementById('todayDate');
const tabOverviewBtn = document.getElementById('tabOverview');
const tabLeaveBtn = document.getElementById('tabLeave');
const leaveTabBadgeEl = document.getElementById('leaveTabBadge');
const tabSettingsBtn = document.getElementById('tabSettings');
const viewOverviewEl = document.getElementById('viewOverview');
const viewLeaveEl = document.getElementById('viewLeave');
const viewSettingsEl = document.getElementById('viewSettings');

const themeToggleBtn = document.getElementById('themeToggleBtn');
const themeIconSun = document.getElementById('themeIconSun');
const themeIconMoon = document.getElementById('themeIconMoon');

const statusPillEl = document.getElementById('statusPill');
const statusPillTextEl = document.getElementById('statusPillText');
const cutoffBadgeEl = document.getElementById('cutoffBadge');
const primaryTimeValueEl = document.getElementById('primaryTimeValue');
const metricLabelEl = document.getElementById('metricLabel');
const statusFindingEl = document.getElementById('statusFinding');

const dialCenterContentEl = document.getElementById('dialCenterContent');
const dialTopLabelEl = document.getElementById('dialTopLabel');
const dialMainValueEl = document.getElementById('dialMainValue');
const dialUnitEl = document.getElementById('dialUnit');

const scopeHostEl = document.getElementById('scopeHost');
const timeStripEl = document.getElementById('timeStrip');

const openUrlBtn = document.getElementById('openUrlBtn');
const secondaryRowEl = document.getElementById('secondaryRow');
const toggleCompleteBtn = document.getElementById('toggleCompleteBtn');
const checkBtnTextEl = document.getElementById('checkBtnText');
const checkBtnSubEl = document.getElementById('checkBtnSub');
const snoozeBtn = document.getElementById('snoozeBtn');
const snoozeBtnSubEl = document.getElementById('snoozeBtnSub');
const quickLeaveLinkBtn = document.getElementById('quickLeaveLinkBtn');
const quickTestBtn = document.getElementById('quickTestBtn');

// 請假免打擾視圖元件
const quickLeaveTodayBtn = document.getElementById('quickLeaveTodayBtn');
const qlTodayDateEl = document.getElementById('qlTodayDate');
const qlTodayWeekEl = document.getElementById('qlTodayWeek');
const qlTodayStatusEl = document.getElementById('qlTodayStatus');
const quickLeaveTomorrowBtn = document.getElementById('quickLeaveTomorrowBtn');
const qlTomorrowDateEl = document.getElementById('qlTomorrowDate');
const qlTomorrowWeekEl = document.getElementById('qlTomorrowWeek');
const qlTomorrowStatusEl = document.getElementById('qlTomorrowStatus');
const quickLeaveNextBtn = document.getElementById('quickLeaveNextBtn');
const qlNextLabelEl = document.getElementById('qlNextLabel');
const qlNextDateEl = document.getElementById('qlNextDate');
const qlNextWeekEl = document.getElementById('qlNextWeek');
const qlNextStatusEl = document.getElementById('qlNextStatus');
const leaveStartInput = document.getElementById('leaveStartInput');
const leaveEndInput = document.getElementById('leaveEndInput');
const addLeaveBtn = document.getElementById('addLeaveBtn');
const clearAllLeaveBtn = document.getElementById('clearAllLeaveBtn');
const leaveListEl = document.getElementById('leaveList');

const startTimeInput = document.getElementById('startTimeInput');
const endTimeInput = document.getElementById('endTimeInput');
const intervalGroup = document.getElementById('intervalGroup');
const traceUrlInput = document.getElementById('traceUrlInput');
const skipWeekendsInput = document.getElementById('skipWeekendsInput');
const resetTimeBtn = document.getElementById('resetTimeBtn');
const testNotifyBtn = document.getElementById('testNotifyBtn');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const toastMsgEl = document.getElementById('toastMsg');

let currentState = {
  settings: null,
  dailyState: null
};
let selectedInterval = 60;
let toastTimer = null;

function showToast(text) {
  toastMsgEl.textContent = text;
  toastMsgEl.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastMsgEl.classList.add('hidden');
  }, 2600);
}

function applyTheme(theme = 'dark') {
  document.documentElement.setAttribute('data-theme', theme);
  if (theme === 'light') {
    themeIconSun.classList.add('hidden');
    themeIconMoon.classList.remove('hidden');
  } else {
    themeIconSun.classList.remove('hidden');
    themeIconMoon.classList.add('hidden');
  }
}

function switchTab(tab) {
  const tabs = [
    { key: 'overview', btn: tabOverviewBtn, view: viewOverviewEl },
    { key: 'leave', btn: tabLeaveBtn, view: viewLeaveEl },
    { key: 'settings', btn: tabSettingsBtn, view: viewSettingsEl }
  ];
  tabs.forEach(({ key, btn, view }) => {
    const isActive = key === tab;
    if (btn) {
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    }
    if (view) {
      view.classList.toggle('hidden', !isActive);
    }
  });
}

function formatTimeHHMM(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function parseTimeOnDate(timeStr, baseDate = new Date()) {
  const [hh, mm] = (timeStr || '13:00').split(':').map(Number);
  const d = new Date(baseDate);
  d.setHours(isNaN(hh) ? 13 : hh, isNaN(mm) ? 0 : mm, 0, 0);
  return d.getTime();
}

function formatRelativeDiff(targetMs, nowMs) {
  const diffMin = Math.max(1, Math.round((targetMs - nowMs) / 60000));
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  if (h > 0 && m > 0) {
    return { num: `${h} 小時 ${m}`, unit: '分', full: `${h} 小時 ${m} 分`, isLong: true };
  }
  if (h > 0) {
    return { num: `${h}`, unit: '小時', full: `${h} 小時`, isLong: false };
  }
  return { num: `${m}`, unit: '分', full: `${m} 分`, isLong: false };
}

function parseHost(rawUrl) {
  try {
    const u = new URL(rawUrl || DEFAULT_TRACE_URL);
    return u.host || 'tpecrawler:7779';
  } catch (e) {
    return 'tpecrawler:7779';
  }
}

function buildScheduleSlots(settings, now) {
  const startMs = parseTimeOnDate(settings.startTime, now);
  const endMs = parseTimeOnDate(settings.endTime, now);
  const intervalMs = Math.max(15, Number(settings.intervalMinutes) || 60) * 60 * 1000;

  const slots = [];
  let cursor = startMs;
  while (cursor < endMs && slots.length < 5) {
    slots.push(cursor);
    cursor += intervalMs;
  }
  if (slots[slots.length - 1] !== endMs) {
    slots.push(endMs);
  }
  return slots;
}

function formatDateISO(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDateISO(dateStr) {
  const [y, m, d] = String(dateStr || '').split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}

function formatShortMMDDWithWeek(dateStr) {
  const d = parseDateISO(dateStr);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd} (${WEEKDAYS[d.getDay()]})`;
}

function getShortDateParts(dateStr) {
  const d = parseDateISO(dateStr);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return {
    mmdd: `${mm}/${dd}`,
    week: WEEKDAYS[d.getDay()]
  };
}

function getQuickPresetDates(now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const nextWork = new Date(tomorrow);
  nextWork.setDate(tomorrow.getDate() + 1);
  while (nextWork.getDay() === 0 || nextWork.getDay() === 6) {
    nextWork.setDate(nextWork.getDate() + 1);
  }

  const diffDays = Math.round((nextWork.getTime() - today.getTime()) / 86400000);
  const nextLabel = diffDays === 2 ? '後天' : WEEKDAYS[nextWork.getDay()];

  return {
    todayStr: formatDateISO(today),
    tomorrowStr: formatDateISO(tomorrow),
    nextWorkStr: formatDateISO(nextWork),
    nextLabel
  };
}

function getNextActiveWorkdayLabel(settings, now = new Date()) {
  const leaveSet = new Set(Array.isArray(settings.leaveDates) ? settings.leaveDates : []);
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  for (let i = 1; i <= 60; i++) {
    const candidate = new Date(base);
    candidate.setDate(base.getDate() + i);
    const iso = formatDateISO(candidate);
    const day = candidate.getDay();
    const isSkippedWeekend = settings.skipWeekends && (day === 0 || day === 6);
    if (!isSkippedWeekend && !leaveSet.has(iso)) {
      if (i === 1) {
        return `明日 (${WEEKDAYS[day]}) 恢復提醒`;
      }
      const mm = String(candidate.getMonth() + 1).padStart(2, '0');
      const dd = String(candidate.getDate()).padStart(2, '0');
      return `${mm}/${dd} (${WEEKDAYS[day]}) 恢復提醒`;
    }
  }
  return '下次上班日恢復提醒';
}

function renderLeaveView(settings, dailyState, now) {
  const todayStr = dailyState.date || formatDateISO(now);
  const leaveDates = Array.isArray(settings.leaveDates)
    ? settings.leaveDates.filter((d) => d >= todayStr).sort()
    : [];
  const leaveSet = new Set(leaveDates);
  const isTodayLeave = leaveSet.has(todayStr);

  if (leaveTabBadgeEl) {
    if (leaveDates.length > 0) {
      leaveTabBadgeEl.textContent = String(leaveDates.length);
      leaveTabBadgeEl.classList.remove('hidden');
    } else {
      leaveTabBadgeEl.classList.add('hidden');
    }
  }

  if (quickLeaveLinkBtn) {
    if (isTodayLeave) {
      quickLeaveLinkBtn.textContent = '今日休假中 · 管理排假 →';
    } else if (leaveDates.length > 0) {
      quickLeaveLinkBtn.textContent = `已排定 ${leaveDates.length} 天請假 · 管理 →`;
    } else {
      quickLeaveLinkBtn.textContent = '排定請假免打擾 →';
    }
  }

  const presets = getQuickPresetDates(now);

  if (quickLeaveTodayBtn) {
    const active = leaveSet.has(presets.todayStr);
    const parts = getShortDateParts(presets.todayStr);
    quickLeaveTodayBtn.classList.toggle('active', active);
    quickLeaveTodayBtn.setAttribute('data-date', presets.todayStr);
    if (qlTodayDateEl) qlTodayDateEl.textContent = parts.mmdd;
    if (qlTodayWeekEl) qlTodayWeekEl.textContent = parts.week;
    if (qlTodayStatusEl) qlTodayStatusEl.textContent = active ? '今日休假 ✓' : '點擊休假';
  }

  if (quickLeaveTomorrowBtn) {
    const active = leaveSet.has(presets.tomorrowStr);
    const parts = getShortDateParts(presets.tomorrowStr);
    quickLeaveTomorrowBtn.classList.toggle('active', active);
    quickLeaveTomorrowBtn.setAttribute('data-date', presets.tomorrowStr);
    if (qlTomorrowDateEl) qlTomorrowDateEl.textContent = parts.mmdd;
    if (qlTomorrowWeekEl) qlTomorrowWeekEl.textContent = parts.week;
    if (qlTomorrowStatusEl) qlTomorrowStatusEl.textContent = active ? '已排假 ✓' : '預先排假';
  }

  if (quickLeaveNextBtn) {
    const active = leaveSet.has(presets.nextWorkStr);
    const parts = getShortDateParts(presets.nextWorkStr);
    quickLeaveNextBtn.classList.toggle('active', active);
    quickLeaveNextBtn.setAttribute('data-date', presets.nextWorkStr);
    if (qlNextLabelEl) qlNextLabelEl.textContent = presets.nextLabel;
    if (qlNextDateEl) qlNextDateEl.textContent = parts.mmdd;
    if (qlNextWeekEl) qlNextWeekEl.textContent = parts.week;
    if (qlNextStatusEl) qlNextStatusEl.textContent = active ? '已排假 ✓' : '預先排假';
  }

  if (leaveStartInput && leaveEndInput) {
    leaveStartInput.min = todayStr;
    leaveEndInput.min = todayStr;
    if (!leaveStartInput.value || leaveStartInput.value < todayStr) {
      leaveStartInput.value = todayStr;
    }
    if (!leaveEndInput.value || leaveEndInput.value < leaveStartInput.value) {
      leaveEndInput.value = leaveStartInput.value;
    }
  }

  if (clearAllLeaveBtn) {
    clearAllLeaveBtn.classList.toggle('hidden', leaveDates.length === 0);
  }

  if (leaveListEl) {
    leaveListEl.innerHTML = '';
    if (leaveDates.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'leave-empty';
      empty.textContent = '目前無排定的請假日期 · 請假當日將全天停用 Trace 提醒';
      leaveListEl.appendChild(empty);
    } else {
      const todayDateObj = parseDateISO(todayStr);
      leaveDates.forEach((dateStr) => {
        const item = document.createElement('div');
        item.className = 'leave-item';
        item.setAttribute('role', 'listitem');

        const left = document.createElement('div');
        left.className = 'leave-item-left';

        const dot = document.createElement('span');
        dot.className = 'leave-item-dot';

        const dObj = parseDateISO(dateStr);
        const dateText = document.createElement('span');
        dateText.className = 'leave-item-date num';
        dateText.textContent = `${dateStr} (${WEEKDAYS[dObj.getDay()]})`;

        left.appendChild(dot);
        left.appendChild(dateText);

        const right = document.createElement('div');
        right.className = 'leave-item-right';

        const diffDays = Math.round((dObj.getTime() - todayDateObj.getTime()) / 86400000);
        const tag = document.createElement('span');
        tag.className = 'leave-item-tag num';
        if (diffDays === 0) {
          tag.classList.add('today');
          tag.textContent = '今日休假';
        } else if (diffDays === 1) {
          tag.textContent = '明日';
        } else if (diffDays === 2) {
          tag.textContent = '後天';
        } else {
          tag.textContent = `${diffDays} 天後`;
        }

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'leave-item-remove';
        removeBtn.setAttribute('data-remove-date', dateStr);
        removeBtn.textContent = '移除';

        right.appendChild(tag);
        right.appendChild(removeBtn);

        item.appendChild(left);
        item.appendChild(right);
        leaveListEl.appendChild(item);
      });
    }
  }
}

function renderTimeStrip(settings, dailyState, now) {
  const slots = buildScheduleSlots(settings, now);
  const nowMs = now.getTime();
  const nextMs = dailyState.nextRemindTimeMs;
  const isTodayLeave = Array.isArray(settings.leaveDates) && settings.leaveDates.includes(dailyState.date);

  timeStripEl.innerHTML = '';
  let markedNext = false;

  slots.forEach((slotMs) => {
    const pill = document.createElement('div');
    pill.className = 'slot-pill';

    if (dailyState.completed || isTodayLeave) {
      pill.classList.add('done');
    } else if (!markedNext && nextMs && Math.abs(slotMs - nextMs) < 30 * 60 * 1000 && slotMs >= nowMs - 60000) {
      pill.classList.add('next');
      markedNext = true;
    } else if (!markedNext && slotMs >= nowMs && !dailyState.finalNotified) {
      pill.classList.add('next');
      markedNext = true;
    } else if (slotMs < nowMs || dailyState.finalNotified) {
      pill.classList.add('past');
    }

    const bar = document.createElement('div');
    bar.className = 'slot-bar';

    const label = document.createElement('span');
    label.className = 'slot-time num';
    label.textContent = formatTimeHHMM(slotMs);

    pill.appendChild(bar);
    pill.appendChild(label);
    timeStripEl.appendChild(pill);
  });
}

function setDialState({ signalVar, topLabel, mainValue, unit = '', isLong = false, isStatus = false, hidden = false }) {
  document.documentElement.style.setProperty('--signal-color', `var(${signalVar})`);
  if (dialCenterContentEl) {
    dialCenterContentEl.classList.toggle('hidden', Boolean(hidden));
  }
  if (dialTopLabelEl) dialTopLabelEl.textContent = topLabel;
  if (dialMainValueEl) {
    dialMainValueEl.textContent = mainValue;
    dialMainValueEl.classList.toggle('long', Boolean(isLong));
    dialMainValueEl.classList.toggle('status-text', Boolean(isStatus));
    if (isStatus) {
      if (signalVar === '--signal-green') {
        dialMainValueEl.style.color = 'var(--signal-green-ink)';
      } else if (signalVar === '--signal-red') {
        dialMainValueEl.style.color = 'var(--signal-red-ink)';
      } else {
        dialMainValueEl.style.color = 'var(--text-muted)';
      }
    } else {
      dialMainValueEl.style.color = 'var(--text-primary)';
    }
  }
  if (dialUnitEl) {
    dialUnitEl.textContent = unit;
    dialUnitEl.style.display = unit ? 'inline' : 'none';
  }
}

function renderState(settings, dailyState) {
  currentState = { settings, dailyState };
  applyTheme(settings.theme || 'dark');

  const now = new Date();
  const nowMs = now.getTime();
  const weekday = WEEKDAYS[now.getDay()];

  todayDateEl.textContent = `${dailyState.date} (${weekday})`;
  cutoffBadgeEl.textContent = `${settings.startTime} – ${settings.endTime}`;

  const intervalMin = Number(settings.intervalMinutes) || 60;
  if (scopeHostEl) {
    scopeHostEl.textContent = intervalMin === 60
      ? '每 1 小時提醒'
      : `每 ${intervalMin} 分鐘提醒`;
  }
  snoozeBtnSubEl.textContent = intervalMin === 60
    ? '延後 1 小時後提醒'
    : `延後 ${intervalMin} 分鐘後提醒`;

  const isWeekend = now.getDay() === 0 || now.getDay() === 6;
  const isTodayLeave = Array.isArray(settings.leaveDates) && settings.leaveDates.includes(dailyState.date);
  const startMs = parseTimeOnDate(settings.startTime, now);
  const endMs = parseTimeOnDate(settings.endTime, now);

  if (dailyState.completed) {
    statusPillEl.className = 'status-chip positive';
    statusPillTextEl.textContent = '今日已完成';
    primaryTimeValueEl.textContent = dailyState.completedAt || formatTimeHHMM(nowMs);
    metricLabelEl.textContent = '完成打卡時間';
    statusFindingEl.textContent = '已手動打勾確認，今日不會再彈出提醒通知。';

    setDialState({
      signalVar: '--signal-green',
      topLabel: '',
      mainValue: '',
      unit: '',
      hidden: true
    });

    checkBtnTextEl.textContent = '已完成今日打卡';
    checkBtnSubEl.textContent = '點此可取消打勾狀態';
    snoozeBtn.classList.add('hidden');
    secondaryRowEl.classList.add('single');
  } else if (isTodayLeave) {
    statusPillEl.className = 'status-chip positive';
    statusPillTextEl.textContent = '今日請假免打擾';
    primaryTimeValueEl.textContent = settings.startTime;
    metricLabelEl.textContent = getNextActiveWorkdayLabel(settings, now);
    statusFindingEl.textContent = '今日已排定請假免打擾，全天不會彈出任何 Trace 提醒通知。';

    setDialState({
      signalVar: '--signal-green',
      topLabel: '',
      mainValue: '',
      unit: '',
      hidden: true
    });

    checkBtnTextEl.textContent = '取消今日請假';
    checkBtnSubEl.textContent = '點此恢復今日定時提醒';
    snoozeBtn.classList.add('hidden');
    secondaryRowEl.classList.add('single');
  } else {
    const isUrgent = nowMs >= startMs;
    checkBtnTextEl.textContent = '我今天已經填了';
    checkBtnSubEl.textContent = '今日不再提醒';
    snoozeBtn.classList.remove('hidden');
    secondaryRowEl.classList.remove('single');

    if (settings.skipWeekends && isWeekend) {
      statusPillEl.className = 'status-chip positive';
      statusPillTextEl.textContent = '週末免打擾';
      primaryTimeValueEl.textContent = settings.startTime;
      metricLabelEl.textContent = '週一恢復提醒';
      statusFindingEl.textContent = '週末免打擾模式開啟中，今日不主動跳出提醒。';

      setDialState({
        signalVar: '--signal-green',
        topLabel: '',
        mainValue: '',
        unit: '',
        hidden: true
      });
    } else if (dailyState.finalNotified || !dailyState.nextRemindTimeMs) {
      statusPillEl.className = 'status-chip negative';
      statusPillTextEl.textContent = '逾時未填';
      primaryTimeValueEl.textContent = settings.endTime;
      metricLabelEl.textContent = '最後提醒時間';
      statusFindingEl.textContent = '今日最後提醒已發送，請儘速完成填寫並打勾！';

      setDialState({
        signalVar: '--signal-red',
        topLabel: '',
        mainValue: '',
        unit: '',
        hidden: true
      });
    } else {
      const nextTimeStr = formatTimeHHMM(dailyState.nextRemindTimeMs);
      const rel = formatRelativeDiff(dailyState.nextRemindTimeMs, nowMs);
      primaryTimeValueEl.textContent = nextTimeStr;

      if (isUrgent) {
        statusPillEl.className = 'status-chip warning';
        statusPillTextEl.textContent = '今日待填寫';
        metricLabelEl.textContent = '下次提醒時間';
        statusFindingEl.textContent = '到達提醒時間將於螢幕右下角彈出通知。';

        setDialState({
          signalVar: '--signal-amber',
          topLabel: '距離下次提醒',
          mainValue: rel.num,
          unit: rel.unit,
          isLong: rel.isLong,
          isStatus: false,
          hidden: false
        });
      } else {
        statusPillEl.className = 'status-chip warning';
        statusPillTextEl.textContent = '今日待填寫';
        metricLabelEl.textContent = '首次提醒時間';
        statusFindingEl.textContent = '到達提醒時間將於螢幕右下角自動彈出通知卡。';

        setDialState({
          signalVar: '--signal-amber',
          topLabel: '距離首次提醒',
          mainValue: rel.num,
          unit: rel.unit,
          isLong: rel.isLong,
          isStatus: false,
          hidden: false
        });
      }
    }
  }

  renderTimeStrip(settings, dailyState, now);
  renderLeaveView(settings, dailyState, now);
}

function populateSettingsForm(settings) {
  startTimeInput.value = settings.startTime || '13:00';
  endTimeInput.value = settings.endTime || '18:00';
  selectedInterval = Number(settings.intervalMinutes) || 60;
  traceUrlInput.value = settings.traceUrl || DEFAULT_TRACE_URL;
  skipWeekendsInput.checked = Boolean(settings.skipWeekends);

  intervalGroup.querySelectorAll('.seg-pill').forEach((btn) => {
    const val = Number(btn.getAttribute('data-val'));
    btn.classList.toggle('active', val === selectedInterval);
  });
}

// 先以預設狀態立即渲染，確保零版面跳動 (Zero CLS)
const initialThemeParam = new URLSearchParams(window.location.search).get('theme');
const initialDefaultSettings = {
  startTime: '13:00',
  endTime: '18:00',
  intervalMinutes: 60,
  traceUrl: DEFAULT_TRACE_URL,
  skipWeekends: true,
  leaveDates: [],
  theme: initialThemeParam === 'light' ? 'light' : 'dark'
};
const initialDefaultDaily = {
  date: (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })(),
  completed: false,
  completedAt: null,
  nextRemindTimeMs: parseTimeOnDate('13:00'),
  finalNotified: false
};
populateSettingsForm(initialDefaultSettings);
renderState(initialDefaultSettings, initialDefaultDaily);

// 讀取背景儲存的真實狀態
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
  chrome.runtime.sendMessage({ action: 'GET_STATE' }, (res) => {
    if (res && res.ok) {
      populateSettingsForm(res.settings);
      renderState(res.settings, res.dailyState);
    }
  });
}

// 頁籤切換
tabOverviewBtn.addEventListener('click', () => switchTab('overview'));
if (tabLeaveBtn) tabLeaveBtn.addEventListener('click', () => switchTab('leave'));
if (quickLeaveLinkBtn) quickLeaveLinkBtn.addEventListener('click', () => switchTab('leave'));
tabSettingsBtn.addEventListener('click', () => switchTab('settings'));

// 儲存並套用請假清單
function saveLeaveDates(nextLeaveDates, toastMessage) {
  if (!currentState.settings || !currentState.dailyState) return;
  const todayStr = currentState.dailyState.date || formatDateISO(new Date());
  const cleaned = Array.from(new Set(nextLeaveDates))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= todayStr)
    .sort();

  const updatedSettings = {
    ...currentState.settings,
    leaveDates: cleaned
  };
  renderState(updatedSettings, currentState.dailyState);
  if (toastMessage) showToast(toastMessage);

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage(
      {
        action: 'SAVE_SETTINGS',
        settings: updatedSettings
      },
      (res) => {
        if (res && res.ok) {
          renderState(res.settings, res.dailyState);
        }
      }
    );
  }
}

// 一鍵快速請假切換 (今日 / 明日 / 下個工作日)
[quickLeaveTodayBtn, quickLeaveTomorrowBtn, quickLeaveNextBtn].forEach((btn) => {
  if (!btn) return;
  btn.addEventListener('click', () => {
    const dateStr = btn.getAttribute('data-date');
    if (!dateStr || !currentState.settings) return;
    const currentList = Array.isArray(currentState.settings.leaveDates)
      ? [...currentState.settings.leaveDates]
      : [];
    const exists = currentList.includes(dateStr);
    const nextList = exists
      ? currentList.filter((d) => d !== dateStr)
      : [...currentList, dateStr];

    const label = formatShortMMDDWithWeek(dateStr);
    saveLeaveDates(
      nextList,
      exists ? `已取消 ${label} 請假，恢復提醒` : `已設定 ${label} 請假免打擾`
    );
  });
});

// 新增請假日期或連假區間
if (leaveStartInput && leaveEndInput) {
  leaveStartInput.addEventListener('change', () => {
    if (leaveStartInput.value && (!leaveEndInput.value || leaveEndInput.value < leaveStartInput.value)) {
      leaveEndInput.value = leaveStartInput.value;
    }
  });
}

if (addLeaveBtn) {
  addLeaveBtn.addEventListener('click', () => {
    if (!leaveStartInput || !leaveEndInput || !currentState.settings) return;
    const startStr = leaveStartInput.value;
    const endStr = leaveEndInput.value || startStr;
    if (!startStr) {
      showToast('請先選擇請假日期');
      return;
    }
    if (startStr > endStr) {
      showToast('開始日期不可晚於結束日期');
      return;
    }

    const startDate = parseDateISO(startStr);
    const endDate = parseDateISO(endStr);
    const diffDays = Math.round((endDate.getTime() - startDate.getTime()) / 86400000);
    if (diffDays > 60) {
      showToast('單次連假區間最多可新增 60 天');
      return;
    }

    const addedDates = [];
    for (let i = 0; i <= diffDays; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      addedDates.push(formatDateISO(d));
    }

    const currentList = Array.isArray(currentState.settings.leaveDates)
      ? currentState.settings.leaveDates
      : [];
    const nextList = [...currentList, ...addedDates];
    const msg = addedDates.length === 1
      ? `已將 ${formatShortMMDDWithWeek(startStr)} 加入請假免打擾`
      : `已將 ${addedDates.length} 天連假加入免打擾排程`;

    saveLeaveDates(nextList, msg);
  });
}

// 移除單筆請假日期
if (leaveListEl) {
  leaveListEl.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('[data-remove-date]');
    if (!removeBtn || !currentState.settings) return;
    const targetDate = removeBtn.getAttribute('data-remove-date');
    const currentList = Array.isArray(currentState.settings.leaveDates)
      ? currentState.settings.leaveDates
      : [];
    const nextList = currentList.filter((d) => d !== targetDate);
    saveLeaveDates(nextList, `已移除 ${formatShortMMDDWithWeek(targetDate)} 請假設定`);
  });
}

// 全部清除請假清單
if (clearAllLeaveBtn) {
  clearAllLeaveBtn.addEventListener('click', () => {
    saveLeaveDates([], '已清除所有排定的請假日期');
  });
}

// 主題切換 (深色黑曜石 / 淺色暖白)
themeToggleBtn.addEventListener('click', () => {
  const curTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  const nextTheme = curTheme === 'dark' ? 'light' : 'dark';
  applyTheme(nextTheme);

  if (currentState.settings) {
    chrome.runtime.sendMessage(
      {
        action: 'SAVE_SETTINGS',
        settings: { ...currentState.settings, theme: nextTheme }
      },
      (res) => {
        if (res && res.ok) {
          currentState = { settings: res.settings, dailyState: res.dailyState };
        }
      }
    );
  }
});

// 延後頻率分段膠囊點擊
intervalGroup.addEventListener('click', (e) => {
  const pill = e.target.closest('.seg-pill');
  if (!pill) return;
  selectedInterval = Number(pill.getAttribute('data-val')) || 60;
  intervalGroup.querySelectorAll('.seg-pill').forEach((btn) => {
    btn.classList.toggle('active', btn === pill);
  });
});

// 1. 現在去填
openUrlBtn.addEventListener('click', () => {
  const url = currentState.settings?.traceUrl?.trim() || DEFAULT_TRACE_URL;
  chrome.runtime.sendMessage({ action: 'GO_FILL_NOW', url }, () => {
    window.close();
  });
});

// 2. 我今天已經填了 (若今日處於請假狀態，則點擊可快速取消今日請假)
toggleCompleteBtn.addEventListener('click', () => {
  if (!currentState.dailyState || !currentState.settings) return;
  const todayStr = currentState.dailyState.date;
  const leaveList = Array.isArray(currentState.settings.leaveDates)
    ? currentState.settings.leaveDates
    : [];
  const isTodayLeave = leaveList.includes(todayStr);

  if (!currentState.dailyState.completed && isTodayLeave) {
    const nextList = leaveList.filter((d) => d !== todayStr);
    saveLeaveDates(nextList, '已取消今日請假，恢復今日定時提醒');
    return;
  }

  const nextCompleted = !currentState.dailyState.completed;

  chrome.runtime.sendMessage(
    { action: 'MARK_COMPLETED', completed: nextCompleted },
    (res) => {
      if (res && res.ok) {
        renderState(res.settings, res.dailyState);
        showToast(nextCompleted ? '已打勾確認！今天不會再跳出提醒' : '已恢復為今日待填寫狀態');
      }
    }
  );
});

// 3. 等等再填
snoozeBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'SNOOZE' }, (res) => {
    if (res && res.ok) {
      renderState(res.settings, res.dailyState);
      if (res.dailyState.nextRemindTimeMs) {
        const nextStr = formatTimeHHMM(res.dailyState.nextRemindTimeMs);
        showToast(`已延後提醒 · 下次將於 ${nextStr} 通知你`);
      } else {
        showToast(`已達今日最後提醒時間 (${res.settings.endTime})`);
      }
    }
  });
});

// 4. 開啟測項智慧速查側邊欄
const openSidePanelBtn = document.getElementById('openSidePanelBtn');
if (openSidePanelBtn) {
  openSidePanelBtn.addEventListener('click', async () => {
    try {
      const curWin = await chrome.windows.getCurrent();
      if (chrome.sidePanel && chrome.sidePanel.open) {
        await chrome.sidePanel.open({ windowId: curWin.id });
        window.close();
      } else {
        chrome.tabs.create({ url: chrome.runtime.getURL('sidepanel.html') });
        window.close();
      }
    } catch (err) {
      chrome.tabs.create({ url: chrome.runtime.getURL('sidepanel.html') });
      window.close();
    }
  });
}

// 讓點選時間或日期欄位任何區域時，均可直接喚起選擇視窗
[startTimeInput, endTimeInput, leaveStartInput, leaveEndInput].forEach((input) => {
  if (!input) return;

  input.addEventListener('click', () => {
    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker();
      } catch (err) {}
    }
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (typeof input.showPicker === 'function') {
        try {
          input.showPicker();
        } catch (err) {}
      }
    }
  });
});

// 支援滑鼠滾輪於時間欄位上方快速微調 (每次滾動 +/- 30 分鐘)
[startTimeInput, endTimeInput].forEach((input) => {
  if (!input) return;
  input.addEventListener('wheel', (e) => {
    e.preventDefault();
    const val = input.value || '13:00';
    const [hh, mm] = val.split(':').map(Number);
    const step = e.deltaY < 0 ? 30 : -30;
    let totalMins = (isNaN(hh) ? 13 : hh) * 60 + (isNaN(mm) ? 0 : mm) + step;
    if (totalMins < 0) totalMins += 24 * 60;
    totalMins = totalMins % (24 * 60);
    const newH = String(Math.floor(totalMins / 60)).padStart(2, '0');
    const newM = String(totalMins % 60).padStart(2, '0');
    input.value = `${newH}:${newM}`;
  }, { passive: false });
});

// 4. 點擊「首次提醒時間」或「最後提醒時間」標籤也能直接開啟調整
document.querySelectorAll('.time-range-row .field-box label').forEach((label) => {
  label.addEventListener('click', (e) => {
    e.preventDefault();
    const forId = label.getAttribute('for');
    const input = document.getElementById(forId);
    if (input && typeof input.showPicker === 'function') {
      try {
        input.showPicker();
      } catch (err) {}
    }
  });
});

// 回復預設時間 (13:00 ~ 18:00)
if (resetTimeBtn) {
  resetTimeBtn.addEventListener('click', () => {
    startTimeInput.value = '13:00';
    endTimeInput.value = '18:00';

    const traceUrl = traceUrlInput ? traceUrlInput.value.trim() : DEFAULT_TRACE_URL;
    const skipWeekends = skipWeekendsInput ? skipWeekendsInput.checked : true;
    const theme = document.documentElement.getAttribute('data-theme') || 'dark';

    const newSettings = {
      startTime: '13:00',
      endTime: '18:00',
      intervalMinutes: selectedInterval,
      traceUrl,
      skipWeekends,
      leaveDates: currentState.settings?.leaveDates || [],
      theme
    };

    chrome.runtime.sendMessage(
      {
        action: 'SAVE_SETTINGS',
        settings: newSettings
      },
      (res) => {
        if (res && res.ok) {
          currentState = { ...currentState, settings: res.settings, dailyState: res.dailyState };
          renderState(currentState.settings, currentState.dailyState);
          showToast('已回復預設時間：13:00 ~ 18:00 並套用');
        } else {
          showToast('已回復為預設 13:00 ~ 18:00，請點擊儲存套用');
        }
      }
    );
  });
}

// 儲存設定
saveSettingsBtn.addEventListener('click', () => {
  const startTime = startTimeInput.value || '13:00';
  const endTime = endTimeInput.value || '18:00';
  const traceUrl = traceUrlInput.value.trim() || DEFAULT_TRACE_URL;
  const skipWeekends = skipWeekendsInput.checked;
  const theme = document.documentElement.getAttribute('data-theme') || 'dark';

  if (startTime > endTime) {
    showToast('首次提醒時間不可晚於最後提醒時間');
    return;
  }

  chrome.runtime.sendMessage(
    {
      action: 'SAVE_SETTINGS',
      settings: {
        startTime,
        endTime,
        intervalMinutes: selectedInterval,
        traceUrl,
        skipWeekends,
        leaveDates: currentState.settings?.leaveDates || [],
        theme
      }
    },
    (res) => {
      if (res && res.ok) {
        populateSettingsForm(res.settings);
        renderState(res.settings, res.dailyState);
        showToast('設定已儲存並套用');
        setTimeout(() => switchTab('overview'), 500);
      }
    }
  );
});

// 預覽右下角通知卡
function triggerTestToast() {
  chrome.runtime.sendMessage({ action: 'TEST_NOTIFICATION' }, () => {
    window.close();
  });
}

quickTestBtn.addEventListener('click', triggerTestToast);
testNotifyBtn.addEventListener('click', triggerTestToast);

// 每 15 秒輕量自動刷新一次倒數分鐘與狀態 (開著 popup 首頁時即時動態更新，無需關閉重開)
setInterval(() => {
  if (currentState.settings && currentState.dailyState) {
    renderState(currentState.settings, currentState.dailyState);
  }
}, 15000);
