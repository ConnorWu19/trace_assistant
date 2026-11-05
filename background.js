// background.js — Trace Assistant Service Worker (Manifest V3)

const CHECK_ALARM_NAME = 'trace_periodic_check';
const EXACT_ALARM_NAME = 'trace_exact_reminder';
const NOTIFICATION_ID = 'trace_reminder_notification';
const DEFAULT_TRACE_URL = 'http://tpecrawler:7779/timesheet/new';

const DEFAULT_SETTINGS = {
  startTime: '13:00',               // 預設下午 1:00 (13:00) 開始提醒
  endTime: '18:00',                 // 預設下午 6:00 最後一次提醒
  intervalMinutes: 60,              // 預設每 60 分鐘 (1 小時) 提醒一次
  traceUrl: DEFAULT_TRACE_URL,      // 預設 Trace 填寫網頁網址
  skipWeekends: true,               // 預設週末 (週六、週日) 不提醒
  leaveDates: [],                   // 已排定請假免打擾日期清單 (YYYY-MM-DD)
  theme: 'dark'                     // 預設深色黑曜石質感主題 (可切換為 light)
};

let activeToastWindowId = null;

// 設定側邊欄行為：點擊擴充圖示開啟 Popup，側邊欄由按鈕或側邊欄選單開啟
if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
}

const DEFAULT_ICON_PATHS = {
  16: 'icons/icon16.png',
  24: 'icons/icon24.png',
  32: 'icons/icon32.png',
  48: 'icons/icon48.png',
  128: 'icons/icon128.png'
};

function getTodayStr(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTimeHHMM(dateOrMs) {
  if (!dateOrMs) return '--:--';
  const d = typeof dateOrMs === 'number' ? new Date(dateOrMs) : dateOrMs;
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

function isWeekend(date = new Date()) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function sanitizeLeaveDates(rawDates, todayStr = getTodayStr()) {
  if (!Array.isArray(rawDates)) return [];
  const valid = rawDates
    .map((d) => String(d || '').trim())
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= todayStr);
  return Array.from(new Set(valid)).sort();
}

async function getAppState() {
  const data = await chrome.storage.local.get(['settings', 'dailyState']);
  const today = getTodayStr();
  const settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
  if (!settings.traceUrl) {
    settings.traceUrl = DEFAULT_TRACE_URL;
  }
  settings.leaveDates = sanitizeLeaveDates(settings.leaveDates, today);

  let dailyState = data.dailyState;
  const startMs = parseTimeOnDate(settings.startTime);

  if (!dailyState || dailyState.date !== today) {
    dailyState = {
      date: today,
      completed: false,
      completedAt: null,
      nextRemindTimeMs: startMs,
      lastNotifiedTimeMs: null,
      finalNotified: false,
      snoozedCount: 0
    };
    await chrome.storage.local.set({ settings, dailyState });
  } else if (!data.settings || !data.settings.traceUrl || !Array.isArray(data.settings.leaveDates)) {
    await chrome.storage.local.set({ settings });
  }

  return { settings, dailyState };
}

async function updateBadge(settings, dailyState) {
  // 保持乾淨統一的質感黃色計時儀器圖示與固定標題
  await chrome.action.setBadgeText({ text: '' });
  await chrome.action.setTitle({ title: 'Trace助手 (Trace Assistant)' });

  try {
    await chrome.action.setIcon({ path: DEFAULT_ICON_PATHS });
  } catch (e) {
    console.warn('Set icon fallback:', e);
  }
}

async function scheduleExactAlarm(targetTimeMs) {
  await chrome.alarms.clear(EXACT_ALARM_NAME);
  if (targetTimeMs && targetTimeMs > Date.now()) {
    chrome.alarms.create(EXACT_ALARM_NAME, { when: targetTimeMs });
  }
}

async function closeToastWindow() {
  if (activeToastWindowId !== null) {
    try {
      await chrome.windows.remove(activeToastWindowId);
    } catch (e) {}
    activeToastWindowId = null;
  }
}

// 彈出高質感三選一提醒卡 (toast.html，位置由 toast.js 根據螢幕可用範圍自動貼齊右下角)
async function openBottomRightToast({ isFinal, settings, nextRemindTimeMs, isTest = false }) {
  await closeToastWindow();

  const winWidth = 404;
  const winHeight = 362;

  const query = new URLSearchParams({
    final: isFinal ? '1' : '0',
    test: isTest ? '1' : '0'
  });

  try {
    const createData = {
      url: chrome.runtime.getURL(`toast.html?${query.toString()}`),
      type: 'popup',
      focused: true,
      width: winWidth,
      height: winHeight
    };
    const win = await chrome.windows.create(createData);
    activeToastWindowId = win ? win.id : null;
    if (activeToastWindowId !== null) {
      return; // 已成功彈出視窗，不重複彈出原生通知避免重疊
    }
  } catch (e) {
    console.error('Failed to open bottom-right toast window:', e);
  }

  // 同步發送右下角系統通知作為輔助提醒
  try {
    await chrome.notifications.clear(NOTIFICATION_ID);
  } catch (e) {}

  const intervalLabel = Number(settings.intervalMinutes) === 60
    ? '1小時後'
    : `${settings.intervalMinutes}分鐘後`;

  let title = '該填寫今日 Trace 囉（點此直接開啟網頁）';
  let message = '點擊本通知直接開啟 tpecrawler:7779，或使用右下角提醒卡選擇「我今天已經填了 / 等等再填」。';
  let buttons = [
    { title: '我今天已經填了 (打勾確認)' },
    { title: `等等再填 (${intervalLabel})` }
  ];

  if (isFinal) {
    title = `最後一次提醒 (${settings.endTime})：快填 Trace！`;
    message = `已達今日最後提醒時間 (${settings.endTime})，請儘速填寫 Trace。`;
    buttons = [
      { title: '現在去填 (開啟網頁)' },
      { title: '我今天已經填了' }
    ];
  } else if (nextRemindTimeMs) {
    const nextStr = formatTimeHHMM(nextRemindTimeMs);
    message = `下次提醒 ${nextStr} · 截止 ${settings.endTime}`;
  }

  try {
    await chrome.notifications.create(NOTIFICATION_ID, {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title,
      message,
      priority: 2,
      requireInteraction: true,
      buttons
    });
  } catch (e) {}
}

async function openTraceWebpage(urlToOpen) {
  const { settings } = await getAppState();
  const targetUrl = urlToOpen || settings.traceUrl || DEFAULT_TRACE_URL;

  try {
    await chrome.notifications.clear(NOTIFICATION_ID);
  } catch (e) {}
  await closeToastWindow();

  // 若已有開啟的 Trace 分頁，直接切換過去聚焦（避免重複開多個分頁）
  try {
    const targetUrlObj = new URL(targetUrl);
    const tabs = await chrome.tabs.query({ url: ['http://tpecrawler:7779/*', 'http://tpecrawler/*'] });
    const matchedTab = tabs.find((t) => {
      if (!t.url) return false;
      try {
        const u = new URL(t.url);
        return u.origin === targetUrlObj.origin && u.pathname.startsWith(targetUrlObj.pathname);
      } catch (err) {
        return false;
      }
    });

    if (matchedTab && matchedTab.id) {
      await chrome.tabs.update(matchedTab.id, { active: true });
      if (matchedTab.windowId) {
        await chrome.windows.update(matchedTab.windowId, { focused: true });
      }
      return;
    }
  } catch (err) {
    console.warn('Tab match fallback:', err);
  }

  const wins = await chrome.windows.getAll({ windowTypes: ['normal'] });
  if (wins && wins.length > 0) {
    const targetWin = wins.find((w) => w.focused) || wins[0];
    await chrome.tabs.create({ windowId: targetWin.id, url: targetUrl, active: true });
    await chrome.windows.update(targetWin.id, { focused: true });
  } else {
    await chrome.windows.create({ url: targetUrl, type: 'normal', focused: true });
  }
}

async function markTodayLeave() {
  const { settings, dailyState } = await getAppState();
  const today = dailyState.date || getTodayStr();
  const currentList = Array.isArray(settings.leaveDates) ? settings.leaveDates : [];
  if (!currentList.includes(today)) {
    const nextList = [...currentList, today];
    await updateSettings({ leaveDates: nextList });
  }
  await closeToastWindow();
  return await getAppState();
}

async function checkAndRemind() {
  const { settings, dailyState } = await getAppState();
  const now = new Date();
  const nowMs = now.getTime();

  await updateBadge(settings, dailyState);

  if (dailyState.completed) {
    await chrome.alarms.clear(EXACT_ALARM_NAME);
    return;
  }

  if (Array.isArray(settings.leaveDates) && settings.leaveDates.includes(dailyState.date)) {
    await chrome.alarms.clear(EXACT_ALARM_NAME);
    try {
      await chrome.notifications.clear(NOTIFICATION_ID);
    } catch (e) {}
    await closeToastWindow();
    return;
  }

  if (settings.skipWeekends && isWeekend(now)) {
    await chrome.alarms.clear(EXACT_ALARM_NAME);
    return;
  }

  const startMs = parseTimeOnDate(settings.startTime, now);
  const endMs = parseTimeOnDate(settings.endTime, now);
  const intervalMs = Math.max(1, Number(settings.intervalMinutes) || 60) * 60 * 1000;

  if (dailyState.finalNotified) {
    await chrome.alarms.clear(EXACT_ALARM_NAME);
    return;
  }

  if (nowMs > endMs + 30 * 60 * 1000) {
    dailyState.finalNotified = true;
    dailyState.nextRemindTimeMs = null;
    await chrome.storage.local.set({ dailyState });
    await chrome.alarms.clear(EXACT_ALARM_NAME);
    return;
  }

  if (!dailyState.nextRemindTimeMs) {
    dailyState.nextRemindTimeMs = startMs;
  }

  if (nowMs < dailyState.nextRemindTimeMs) {
    await chrome.storage.local.set({ dailyState });
    await scheduleExactAlarm(dailyState.nextRemindTimeMs);
    return;
  }

  const isFinal = nowMs >= endMs || dailyState.nextRemindTimeMs >= endMs;

  if (isFinal) {
    dailyState.lastNotifiedTimeMs = nowMs;
    dailyState.finalNotified = true;
    dailyState.nextRemindTimeMs = null;
    await chrome.storage.local.set({ dailyState });
    await chrome.alarms.clear(EXACT_ALARM_NAME);

    await openBottomRightToast({
      isFinal: true,
      settings,
      nextRemindTimeMs: null
    });
  } else {
    let nextMs = dailyState.nextRemindTimeMs + intervalMs;
    while (nextMs <= nowMs) {
      nextMs += intervalMs;
    }
    if (nextMs >= endMs) {
      nextMs = endMs;
    }

    dailyState.lastNotifiedTimeMs = nowMs;
    dailyState.nextRemindTimeMs = nextMs;
    await chrome.storage.local.set({ dailyState });
    await scheduleExactAlarm(nextMs);

    await openBottomRightToast({
      isFinal: false,
      settings,
      nextRemindTimeMs: nextMs
    });
  }
}

async function markAsCompleted(completed = true) {
  const { settings, dailyState } = await getAppState();
  const now = new Date();
  const startMs = parseTimeOnDate(settings.startTime, now);
  const endMs = parseTimeOnDate(settings.endTime, now);
  const intervalMs = Math.max(1, Number(settings.intervalMinutes) || 60) * 60 * 1000;

  if (completed) {
    dailyState.completed = true;
    dailyState.completedAt = formatTimeHHMM(now);
    dailyState.nextRemindTimeMs = null;
    await chrome.storage.local.set({ dailyState });
    await chrome.alarms.clear(EXACT_ALARM_NAME);
    try {
      await chrome.notifications.clear(NOTIFICATION_ID);
    } catch (e) {}
    await closeToastWindow();
  } else {
    dailyState.completed = false;
    dailyState.completedAt = null;
    const nowMs = now.getTime();
    if (nowMs < startMs) {
      dailyState.nextRemindTimeMs = startMs;
      dailyState.finalNotified = false;
    } else if (nowMs < endMs) {
      let nextMs = nowMs + intervalMs;
      if (nextMs >= endMs) nextMs = endMs;
      dailyState.nextRemindTimeMs = nextMs;
      dailyState.finalNotified = false;
    } else {
      dailyState.nextRemindTimeMs = null;
      dailyState.finalNotified = true;
    }
    await chrome.storage.local.set({ dailyState });
    if (dailyState.nextRemindTimeMs) {
      await scheduleExactAlarm(dailyState.nextRemindTimeMs);
    }
  }

  await updateBadge(settings, dailyState);
  return { settings, dailyState };
}

async function snoozeReminder() {
  const { settings, dailyState } = await getAppState();
  const now = new Date();
  const nowMs = now.getTime();
  const startMs = parseTimeOnDate(settings.startTime, now);
  const endMs = parseTimeOnDate(settings.endTime, now);
  const intervalMs = Math.max(1, Number(settings.intervalMinutes) || 60) * 60 * 1000;

  try {
    await chrome.notifications.clear(NOTIFICATION_ID);
  } catch (e) {}
  await closeToastWindow();

  if (dailyState.completed) {
    return { settings, dailyState };
  }

  if (nowMs >= endMs) {
    dailyState.finalNotified = true;
    dailyState.nextRemindTimeMs = null;
  } else if (nowMs < startMs) {
    dailyState.nextRemindTimeMs = startMs;
  } else {
    const roundedNowMs = Math.floor(nowMs / 60000) * 60000;
    let nextMs = roundedNowMs + intervalMs;
    if (nextMs >= endMs) {
      nextMs = endMs;
    }
    dailyState.nextRemindTimeMs = nextMs;
    dailyState.snoozedCount = (dailyState.snoozedCount || 0) + 1;
  }

  await chrome.storage.local.set({ dailyState });
  if (dailyState.nextRemindTimeMs) {
    await scheduleExactAlarm(dailyState.nextRemindTimeMs);
  }
  await updateBadge(settings, dailyState);
  return { settings, dailyState };
}

async function updateSettings(newSettings) {
  const { settings: oldSettings, dailyState } = await getAppState();
  const today = getTodayStr();
  const mergedLeaveDates = newSettings.leaveDates !== undefined
    ? newSettings.leaveDates
    : oldSettings.leaveDates;

  const settings = {
    ...oldSettings,
    ...newSettings,
    traceUrl: (newSettings.traceUrl ?? oldSettings.traceUrl ?? '').trim() || DEFAULT_TRACE_URL,
    leaveDates: sanitizeLeaveDates(mergedLeaveDates, today)
  };
  const now = new Date();
  const nowMs = now.getTime();
  const startMs = parseTimeOnDate(settings.startTime, now);
  const endMs = parseTimeOnDate(settings.endTime, now);
  const intervalMs = Math.max(1, Number(settings.intervalMinutes) || 60) * 60 * 1000;

  if (!dailyState.completed) {
    if (nowMs <= startMs) {
      dailyState.nextRemindTimeMs = startMs;
      dailyState.finalNotified = false;
    } else if (nowMs <= endMs) {
      let slot = startMs;
      while (slot <= nowMs) {
        slot += intervalMs;
      }
      if (slot >= endMs) {
        slot = endMs;
      }
      dailyState.nextRemindTimeMs = slot;
      dailyState.finalNotified = false;
    } else {
      dailyState.nextRemindTimeMs = null;
      dailyState.finalNotified = true;
    }
  }

  await chrome.storage.local.set({ settings, dailyState });
  await checkAndRemind();
  return { settings, dailyState };
}

async function initAlarms() {
  await chrome.alarms.create(CHECK_ALARM_NAME, {
    periodInMinutes: 1
  });
  await checkAndRemind();
}

async function ensureDefaultCaseLibrary() {
  try {
    const res = await chrome.storage.local.get('case_library');
    if (!Array.isArray(res.case_library) || res.case_library.length === 0) {
      const resp = await fetch(chrome.runtime.getURL('default_cases.json'));
      if (resp.ok) {
        const defaultCases = await resp.json();
        if (Array.isArray(defaultCases) && defaultCases.length > 0) {
          await chrome.storage.local.set({ case_library: defaultCases });
        }
      }
    }
  } catch (e) {
    console.warn('Load default_cases failed:', e);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  initAlarms();
  ensureDefaultCaseLibrary();
});

chrome.runtime.onStartup.addListener(() => {
  initAlarms();
  ensureDefaultCaseLibrary();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === CHECK_ALARM_NAME || alarm.name === EXACT_ALARM_NAME) {
    checkAndRemind();
  }
});

chrome.notifications.onClicked.addListener(async (notificationId) => {
  if (notificationId !== NOTIFICATION_ID) return;
  const { settings } = await getAppState();
  await openTraceWebpage(settings.traceUrl);
});

chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  if (notificationId !== NOTIFICATION_ID) return;
  const { settings, dailyState } = await getAppState();

  if (dailyState.finalNotified) {
    if (buttonIndex === 0) {
      await openTraceWebpage(settings.traceUrl);
    } else if (buttonIndex === 1) {
      await markAsCompleted(true);
    }
    return;
  }

  if (buttonIndex === 0) {
    await markAsCompleted(true);
  } else if (buttonIndex === 1) {
    await snoozeReminder();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (message.action === 'GET_STATE') {
        const state = await getAppState();
        await updateBadge(state.settings, state.dailyState);
        sendResponse({ ok: true, ...state });
      } else if (message.action === 'GO_FILL_NOW') {
        await openTraceWebpage(message.url);
        sendResponse({ ok: true });
      } else if (message.action === 'MARK_COMPLETED') {
        const state = await markAsCompleted(message.completed);
        sendResponse({ ok: true, ...state });
      } else if (message.action === 'MARK_TODAY_LEAVE') {
        const state = await markTodayLeave();
        sendResponse({ ok: true, ...state });
      } else if (message.action === 'SNOOZE') {
        const state = await snoozeReminder();
        sendResponse({ ok: true, ...state });
      } else if (message.action === 'SAVE_SETTINGS') {
        const state = await updateSettings(message.settings);
        sendResponse({ ok: true, ...state });
      } else if (message.action === 'TEST_NOTIFICATION') {
        const { settings, dailyState } = await getAppState();
        await openBottomRightToast({
          isFinal: false,
          settings,
          nextRemindTimeMs: dailyState.nextRemindTimeMs,
          isTest: true
        });
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, error: 'Unknown action' });
      }
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
    }
  })();
  return true;
});
