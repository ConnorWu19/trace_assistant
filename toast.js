// toast.js — 右下角三選一提醒卡邏輯

const DEFAULT_TRACE_URL = 'http://tpecrawler:7779/timesheet/new';

const pulseIndicatorEl = document.getElementById('pulseIndicator');
const timeChipEl = document.getElementById('timeChip');
const btnToastLeave = document.getElementById('btnToastLeave');
const toastTitleEl = document.getElementById('toastTitle');
const windowTagEl = document.getElementById('windowTag');
const miniStripEl = document.getElementById('miniStrip');
const snoozeSubTextEl = document.getElementById('snoozeSubText');

const btnGoFill = document.getElementById('btnGoFill');
const toastSecondaryRowEl = document.getElementById('toastSecondaryRow');
const btnDone = document.getElementById('btnDone');
const btnSnooze = document.getElementById('btnSnooze');

let targetUrl = DEFAULT_TRACE_URL;

function formatTimeHHMM(msOrDate = new Date()) {
  const d = typeof msOrDate === 'number' ? new Date(msOrDate) : msOrDate;
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

function renderMiniStrip(settings, now) {
  const slots = buildScheduleSlots(settings, now);
  const nowMs = now.getTime();
  miniStripEl.innerHTML = '';

  let highlighted = false;
  slots.forEach((slotMs) => {
    const slot = document.createElement('div');
    slot.className = 'mini-slot';
    if (!highlighted && slotMs >= nowMs - 10 * 60 * 1000) {
      slot.classList.add('active');
      highlighted = true;
    }

    const bar = document.createElement('div');
    bar.className = 'mini-bar';

    const label = document.createElement('span');
    label.className = 'mini-label num';
    label.textContent = formatTimeHHMM(slotMs);

    slot.appendChild(bar);
    slot.appendChild(label);
    miniStripEl.appendChild(slot);
  });
}

// 動態根據實際內容高度與系統標題列高度，自動撐開視窗並貼齊螢幕右下角（解決 DPI 縮放遮擋問題）
let isFitting = false;
function fitWindowToContent() {
  if (isFitting) return;
  isFitting = true;

  requestAnimationFrame(() => {
    try {
      const shell = document.querySelector('.toast-shell');
      if (!shell) return;

      const contentHeight = Math.ceil(shell.getBoundingClientRect().height);
      const frameChromeHeight = Math.max(38, window.outerHeight - window.innerHeight);
      const targetOuterHeight = contentHeight + frameChromeHeight + 6;
      const targetOuterWidth = Math.max(396, window.outerWidth);

      const availLeft = typeof window.screen.availLeft === 'number' ? window.screen.availLeft : 0;
      const availTop = typeof window.screen.availTop === 'number' ? window.screen.availTop : 0;
      const availWidth = window.screen.availWidth || window.screen.width;
      const availHeight = window.screen.availHeight || window.screen.height;

      const targetLeft = Math.max(availLeft, availLeft + availWidth - targetOuterWidth - 14);
      const targetTop = Math.max(availTop, availTop + availHeight - targetOuterHeight - 14);

      if (typeof chrome !== 'undefined' && chrome.windows && chrome.windows.getCurrent) {
        chrome.windows.getCurrent((win) => {
          if (!win || !win.id) return;
          // 若尺寸與位置已就位，避免重複更新
          if (
            Math.abs(win.width - targetOuterWidth) <= 4 &&
            Math.abs(win.height - targetOuterHeight) <= 4 &&
            Math.abs(win.left - targetLeft) <= 4 &&
            Math.abs(win.top - targetTop) <= 4
          ) {
            return;
          }
          chrome.windows.update(win.id, {
            width: Math.round(targetOuterWidth),
            height: Math.round(targetOuterHeight),
            left: Math.round(targetLeft),
            top: Math.round(targetTop)
          });
        });
      }
    } finally {
      setTimeout(() => { isFitting = false; }, 300);
    }
  });
}

const params = new URLSearchParams(window.location.search);
const isFinal = params.get('final') === '1';
const isTest = params.get('test') === '1';

// 先立即渲染預設時間軸，確保視窗彈出瞬間零閃爍 (Zero CLS)
renderMiniStrip({ startTime: '13:00', endTime: '18:00', intervalMinutes: 60 }, new Date());
fitWindowToContent();
window.addEventListener('load', fitWindowToContent);

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
  chrome.runtime.sendMessage({ action: 'GET_STATE' }, (res) => {
    if (!res || !res.ok) return;
    const { settings } = res;

    // 套用深淺色主題
    const theme = settings.theme || 'dark';
    document.documentElement.setAttribute('data-theme', theme);

    targetUrl = settings.traceUrl || DEFAULT_TRACE_URL;
    windowTagEl.textContent = `截止 ${settings.endTime}`;

    const intervalMin = Number(settings.intervalMinutes) || 60;
    snoozeSubTextEl.textContent = intervalMin === 60
      ? '1 小時後再提醒'
      : `${intervalMin} 分鐘後再提醒`;

    const now = new Date();
    const nowStr = formatTimeHHMM(now);

    if (isTest) {
      timeChipEl.textContent = `${nowStr} · 預覽模式`;
      toastTitleEl.textContent = '該填寫今日 Trace 囉';
    } else if (isFinal) {
      pulseIndicatorEl.classList.add('urgent');
      timeChipEl.classList.add('urgent');
      timeChipEl.textContent = `${settings.endTime} · 最後提醒`;
      toastTitleEl.textContent = '最後一次提醒：快填 Trace！';
      // 最後一次提醒時自動隱藏「等等再填」按鈕，避免誤以為還會延後
      if (btnSnooze) btnSnooze.classList.add('hidden');
      if (toastSecondaryRowEl) toastSecondaryRowEl.classList.add('single');
    } else {
      timeChipEl.textContent = `${nowStr} · 定時提醒`;
    }

    renderMiniStrip(settings, now);
    fitWindowToContent();
  });
}

// 頂部快速今日請假免打擾
if (btnToastLeave) {
  btnToastLeave.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'MARK_TODAY_LEAVE' }, () => {
      window.close();
    });
  });
}

// 1. 現在去填
btnGoFill.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'GO_FILL_NOW', url: targetUrl }, () => {
    window.close();
  });
});

// 2. 我今天已經填了
btnDone.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'MARK_COMPLETED', completed: true }, () => {
    window.close();
  });
});

// 3. 等等再填
btnSnooze.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'SNOOZE' }, () => {
    window.close();
  });
});
