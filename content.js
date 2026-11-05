// content.js — Trace Assistant Content Script (In-Page Assistant, Auto-fill & 7~9h Allocator)
(function () {
  'use strict';

  let lastFocusedInput = null;

  // 監聽並記錄網頁上使用者最近點選的輸入欄位
  document.addEventListener('focusin', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') && !e.target.closest('#trace-alarm-plus-root')) {
      lastFocusedInput = e.target;
    }
  }, true);

  // 判斷當前頁面是否為指定的 Trace 網址
  function isTargetPage(customUrl = '') {
    const current = window.location.href.toLowerCase();
    const defaultTarget = 'tpecrawler:7779/timesheet/new';
    if (current.includes(defaultTarget)) return true;
    if (customUrl) {
      try {
        const u = new URL(customUrl);
        if (current.includes(u.host + u.pathname)) return true;
      } catch (e) {
        if (current.includes(customUrl.toLowerCase())) return true;
      }
    }
    return false;
  }

  // 執行填入目標輸入欄位（相容 Autocomplete 鍵盤即時搜尋）
  function fillIntoPage(textToFill) {
    let target = lastFocusedInput && document.contains(lastFocusedInput)
      ? lastFocusedInput
      : document.querySelector([
          'input[name*="tc" i]',
          'input[id*="tc" i]',
          'input[placeholder*="tc" i]',
          'input[class*="tc" i]',
          'input[name*="case" i]',
          'input[id*="case" i]',
          'input[placeholder*="case" i]',
          'input[placeholder*="測項" i]',
          'input[placeholder*="ID" i]',
          'input[type="text"]:not([readonly]):not([disabled])',
          'textarea:not([readonly]):not([disabled])'
        ].join(', '));

    if (target) {
      target.focus();

      // 原生 setter 以相容 React / Vue / 原生 input 響應式狀態
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (nativeSetter) {
        nativeSetter.call(target, textToFill);
      } else {
        target.value = textToFill;
      }

      // 派發完整鍵盤與輸入事件序列以喚起 Autocomplete / 即時搜尋選單
      const valStr = String(textToFill || '');
      const lastChar = valStr.slice(-1) || '0';
      const keyCode = lastChar.charCodeAt(0);

      target.dispatchEvent(new Event('focus', { bubbles: true }));
      target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: lastChar, keyCode, which: keyCode }));
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: lastChar, keyCode, which: keyCode }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    return false;
  }

  // --- 監聽來自 Extension Popup 或 Side Panel 的訊息 ---
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.type) return;

    if (message.type === 'PING') {
      sendResponse({ status: 'OK', url: window.location.href });
      return true;
    }

    if (message.type === 'FILL_CASE_ID') {
      const val = message.caseId || '';
      const filled = fillIntoPage(val);
      sendResponse({ success: true, filled, caseId: val });
      return true;
    }
  });

  // --- 注入網頁助手側邊欄 (In-Page Assistant Drawer) ---
  function initInPageAssistant() {
    if (document.getElementById('trace-alarm-plus-root')) return;

    const hostEl = document.createElement('div');
    hostEl.id = 'trace-alarm-plus-root';
    document.body.appendChild(hostEl);

    const shadow = hostEl.attachShadow({ mode: 'open' });

    let currentCases = [];
    let todaySelectedCases = [];
    let currentTheme = 'dark';
    let isCollapsed = false;
    let currentSuggestion = null;

    // 建立助手專屬隔離樣式
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      * { box-sizing: border-box; margin: 0; padding: 0; }
      :host {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans TC", sans-serif;
        font-size: 13px;
        line-height: 1.45;
        z-index: 2147483647;
      }
      .num {
        font-family: ui-monospace, "Cascadia Code", "JetBrains Mono", Consolas, monospace;
      }

      /* 懸浮縮放按鈕（當收起時在右側顯示的小膠囊） */
      .floating-launcher-btn {
        position: fixed;
        top: 140px;
        right: 0;
        background: #191c24;
        color: #f8fafc;
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-right: none;
        border-radius: 8px 0 0 8px;
        padding: 9px 12px;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 6px;
        box-shadow: -2px 4px 12px rgba(0, 0, 0, 0.35);
        transition: transform 0.15s ease, background-color 0.15s ease;
        z-index: 2147483647;
      }
      .floating-launcher-btn:hover {
        background: #232834;
        transform: translateX(-3px);
      }
      .floating-launcher-btn.hidden {
        display: none !important;
      }

      /* 側邊欄抽屜主體 */
      .assistant-drawer {
        position: fixed;
        top: 0;
        right: 0;
        width: 380px;
        height: 100vh;
        background: var(--bg, #13151b);
        color: var(--text, #f8fafc);
        border-left: 1px solid var(--border, rgba(255, 255, 255, 0.12));
        box-shadow: -6px 0 28px rgba(0, 0, 0, 0.35);
        display: flex;
        flex-direction: column;
        z-index: 2147483647;
        transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .assistant-drawer.collapsed {
        transform: translateX(100%);
        pointer-events: none;
      }

      /* 深色 / 淺色主題變數 */
      .assistant-drawer[data-theme="dark"] {
        --bg: #13151b;
        --bg-surface: #191c24;
        --bg-elevated: #222631;
        --bg-hover: #292f3d;
        --text: #f8fafc;
        --text-muted: #8b95a7;
        --border: rgba(255, 255, 255, 0.1);
        --border-strong: rgba(255, 255, 255, 0.2);
        --accent: #3b82f6;
        --green: #3fc07a;
        --green-bg: rgba(63, 192, 122, 0.14);
        --green-ink: #4ade80;
        --amber: #f59e0b;
        --amber-bg: rgba(245, 158, 11, 0.16);
        --amber-ink: #fbbf24;
        --red: #f43f5e;
        --red-bg: rgba(244, 63, 94, 0.16);
        --red-ink: #fb7185;
      }
      .assistant-drawer[data-theme="light"] {
        --bg: #ffffff;
        --bg-surface: #f8fafc;
        --bg-elevated: #f1f5f9;
        --bg-hover: #e2e8f0;
        --text: #0f172a;
        --text-muted: #64748b;
        --border: rgba(15, 23, 42, 0.1);
        --border-strong: rgba(15, 23, 42, 0.2);
        --accent: #2563eb;
        --green: #10b981;
        --green-bg: rgba(16, 185, 129, 0.12);
        --green-ink: #059669;
        --amber: #d97706;
        --amber-bg: rgba(217, 119, 6, 0.12);
        --amber-ink: #b45309;
        --red: #e11d48;
        --red-bg: rgba(225, 29, 72, 0.12);
        --red-ink: #be123c;
      }

      /* 標題頂欄 */
      .drawer-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 14px;
        background: var(--bg-surface);
        border-bottom: 1px solid var(--border);
      }
      .brand-title-wrap {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .brand-icon {
        font-size: 15px;
      }
      .brand-title {
        font-size: 13.5px;
        font-weight: 700;
        letter-spacing: -0.01em;
      }
      .case-count-tag {
        font-size: 11px;
        font-weight: 600;
        padding: 2px 7px;
        background: var(--accent-subtle);
        border: 1px solid rgba(56, 189, 248, 0.35);
        border-radius: 999px;
        color: var(--accent-primary);
        display: inline-flex;
        align-items: center;
        gap: 4px;
        line-height: 1;
      }
      .case-count-tag .badge-dot {
        width: 5.5px;
        height: 5.5px;
        border-radius: 50%;
        background-color: var(--signal-green);
        box-shadow: 0 0 5px rgba(16, 185, 129, 0.8);
        display: inline-block;
      }
      .case-count-tag .badge-num {
        font-weight: 700;
        color: var(--text-primary);
      }
      .header-controls {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .icon-btn {
        width: 26px;
        height: 26px;
        border-radius: 6px;
        border: 1px solid var(--border);
        background: transparent;
        color: var(--text-muted);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
      }
      .icon-btn:hover {
        background: var(--bg-hover);
        color: var(--text);
      }

      /* 7~9 小時儀表板區塊 */
      .allocator-box {
        padding: 10px 14px;
        background: var(--bg-surface);
        border-bottom: 1px solid var(--border);
        display: flex;
        flex-direction: column;
        gap: 7px;
      }
      .allocator-top {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .allocator-title-row {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .allocator-label {
        font-size: 12px;
        font-weight: 700;
      }
      .allocator-tag {
        font-size: 10px;
        font-weight: 700;
        padding: 1px 6px;
        border-radius: 999px;
      }
      .allocator-tag.warning { background: var(--amber-bg); color: var(--amber-ink); }
      .allocator-tag.success { background: var(--green-bg); color: var(--green-ink); }
      .allocator-tag.danger { background: var(--red-bg); color: var(--red-ink); }

      .allocator-stat {
        font-size: 13.5px;
        font-weight: 700;
      }

      /* 進度條 (標註 7~8.5h 合規區間) */
      .allocator-track {
        width: 100%;
        height: 8px;
        background: var(--bg-elevated);
        border-radius: 4px;
        position: relative;
        overflow: hidden;
      }
      .allocator-fill {
        height: 100%;
        border-radius: 4px;
        transition: width 0.25s ease, background-color 0.2s ease;
      }
      .allocator-fill.warning { background: var(--amber); }
      .allocator-fill.success { background: var(--green); }
      .allocator-fill.danger { background: var(--red); }

      .allocator-zone {
        position: absolute;
        top: 0;
        bottom: 0;
        left: 70%;
        width: 15%;
        border-left: 1px solid rgba(255, 255, 255, 0.4);
        border-right: 1px solid rgba(255, 255, 255, 0.4);
        background: rgba(63, 192, 122, 0.15);
        pointer-events: none;
      }

      /* 兩層式操作區 */
      .allocator-actions {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-top: 3px;
      }
      .btn-smart-primary,
      .btn-smart {
        width: 100%;
        height: 31px;
        padding: 6px 10px;
        font-size: 12px;
        font-weight: 700;
        border-radius: 6px;
        background: var(--accent);
        color: #fff;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        white-space: nowrap;
        transition: opacity 0.15s ease;
      }
      .btn-smart-primary:hover,
      .btn-smart:hover { opacity: 0.9; }

      .allocator-btn-subrow {
        display: flex;
        gap: 5px;
      }
      .btn-sub,
      .btn-text {
        flex: 1;
        min-width: 0;
        height: 27px;
        padding: 4px 6px;
        font-size: 11px;
        font-weight: 600;
        border-radius: 5px;
        border: 1px solid var(--border);
        background: var(--bg-elevated);
        color: var(--text);
        cursor: pointer;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        transition: background-color 0.12s ease;
      }
      .btn-sub:hover,
      .btn-text:hover { background: var(--bg-hover); }
      .btn-sub.btn-clear-today,
      .btn-text.btn-clear-today {
        flex: 0 0 auto;
        padding: 4px 8px;
      }

      /* 湊數推薦彈出卡片 */
      .sugg-panel {
        margin-top: 6px;
        background: var(--bg-elevated);
        border: 1px solid var(--accent);
        border-radius: 8px;
        padding: 8px 10px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .sugg-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 11.5px;
        font-weight: 700;
        color: var(--accent);
      }
      .sugg-close {
        background: transparent;
        border: none;
        color: var(--text-muted);
        cursor: pointer;
      }
      .sugg-list {
        display: flex;
        flex-direction: column;
        gap: 5px;
        max-height: 140px;
        overflow-y: auto;
      }
      .sugg-item {
        display: flex;
        flex-direction: column;
        gap: 3px;
        font-size: 11px;
        padding: 5px 6px;
        background: var(--bg-surface);
        border-radius: 5px;
        border: 1px solid var(--border);
      }
      .sugg-item-top {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .sugg-tc-id {
        font-size: 10px;
        font-weight: 700;
        color: var(--accent);
        background: rgba(59, 130, 246, 0.12);
        padding: 1px 5px;
        border-radius: 3px;
        cursor: pointer;
      }
      .sugg-tc-id:hover {
        background: var(--accent);
        color: #fff;
      }
      .sugg-item-title {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        color: var(--text);
        font-weight: 500;
      }
      .sugg-item-bottom {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 4px;
        margin-top: 2px;
      }
      .sugg-btn-mini {
        padding: 2px 6px;
        font-size: 10px;
        font-weight: 600;
        border-radius: 4px;
        border: 1px solid var(--border);
        background: var(--bg-elevated);
        color: var(--text-muted);
        cursor: pointer;
      }
      .sugg-btn-mini:hover {
        color: var(--text);
        background: var(--bg-hover);
      }
      .sugg-btn-fill {
        color: var(--accent);
        border-color: var(--accent);
      }
      .sugg-btn-fill:hover {
        background: var(--accent);
        color: #fff;
      }
      .sugg-action-row {
        display: flex;
        gap: 6px;
        margin-top: 4px;
      }
      .sugg-btn-copy-ids {
        flex: 1;
        padding: 5px;
        font-size: 11px;
        font-weight: 600;
        background: var(--bg-surface);
        border: 1px solid var(--border);
        color: var(--text);
        border-radius: 5px;
        cursor: pointer;
      }
      .sugg-btn-copy-ids:hover { background: var(--bg-hover); }
      .sugg-apply-btn {
        flex: 1.5;
        padding: 6px;
        font-size: 11px;
        font-weight: 700;
        background: var(--green);
        color: #fff;
        border: none;
        border-radius: 5px;
        cursor: pointer;
      }
      .sugg-apply-btn:hover { opacity: 0.9; }

      /* 今日已選測項操作托盤 (Today Tray) */
      .today-tray {
        margin-top: 6px;
        background: var(--bg-elevated);
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 8px 10px;
        display: flex;
        flex-direction: column;
        gap: 5px;
      }
      .today-tray-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 11px;
        font-weight: 700;
        color: var(--text);
        padding-bottom: 3px;
        border-bottom: 1px solid var(--border);
      }
      .today-tray-hint {
        font-size: 10px;
        color: var(--text-muted);
        font-weight: normal;
      }
      .today-tray-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
        max-height: 140px;
        overflow-y: auto;
      }
      .tray-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 4px 6px;
        background: var(--bg-surface);
        border: 1px solid var(--border);
        border-radius: 5px;
        gap: 6px;
      }
      .tray-item-left {
        display: flex;
        flex-direction: column;
        gap: 2px;
        overflow: hidden;
        flex: 1;
      }
      .tray-id-row {
        display: flex;
        align-items: center;
        gap: 5px;
      }
      .tray-tc-id {
        font-size: 10px;
        font-weight: 700;
        color: var(--accent);
        background: rgba(59, 130, 246, 0.1);
        padding: 0 4px;
        border-radius: 3px;
        cursor: pointer;
      }
      .tray-tc-id:hover {
        text-decoration: underline;
      }
      .tray-item-title {
        font-size: 10.5px;
        color: var(--text-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .tray-item-right {
        display: flex;
        align-items: center;
        gap: 4px;
        flex-shrink: 0;
      }
      .tray-time {
        font-size: 10.5px;
        font-weight: 600;
        color: var(--text-muted);
      }
      .tray-btn-fill {
        padding: 2px 6px;
        font-size: 10px;
        font-weight: 700;
        border-radius: 4px;
        border: 1px solid var(--accent);
        background: rgba(59, 130, 246, 0.12);
        color: var(--accent);
        cursor: pointer;
      }
      .tray-btn-fill:hover {
        background: var(--accent);
        color: #fff;
      }
      .tray-btn-remove {
        background: transparent;
        border: none;
        color: var(--text-muted);
        cursor: pointer;
        font-size: 11px;
        padding: 1px 3px;
        border-radius: 3px;
      }
      .tray-btn-remove:hover {
        color: var(--red);
      }

      /* 搜尋區塊 */
      .search-box {
        padding: 10px 14px 6px;
        background: var(--bg-surface);
        border-bottom: 1px solid var(--border);
      }
      .search-input-wrap {
        position: relative;
        display: flex;
        align-items: center;
      }
      .search-input {
        width: 100%;
        padding: 8px 30px 8px 10px;
        border-radius: 8px;
        font-size: 12.5px;
        background: var(--bg-elevated);
        border: 1px solid var(--border);
        color: var(--text);
        outline: none;
      }
      .search-input:focus {
        border-color: var(--accent);
      }
      .search-clear-btn {
        position: absolute;
        right: 8px;
        border: none;
        background: transparent;
        color: var(--text-muted);
        cursor: pointer;
        font-size: 12px;
        display: none;
      }
      .search-meta {
        font-size: 11.5px;
        color: var(--text-secondary);
        margin-top: 5px;
      }
      .search-meta .highlight-count {
        font-weight: 700;
        color: var(--accent-primary);
      }

      /* 測項卡片清單 */
      .cases-scroll-list {
        flex: 1;
        overflow-y: auto;
        padding: 10px 14px;
        display: flex;
        flex-direction: column;
        gap: 9px;
      }
      .case-card {
        background: var(--bg-surface);
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 10px 12px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        transition: border-color 0.12s ease;
      }
      .case-card:hover {
        border-color: var(--border-strong);
      }
      .case-card.selected {
        border-color: var(--green);
        background: var(--green-bg);
      }
      .card-top {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .card-badges {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .case-check {
        width: 16px;
        height: 16px;
        cursor: pointer;
        accent-color: var(--green);
      }
      .time-pill {
        font-size: 11px;
        font-weight: 700;
        padding: 2px 6px;
        border-radius: 4px;
        background: var(--amber-bg);
        color: var(--amber-ink);
      }
      .id-pill {
        font-size: 10.5px;
        padding: 2px 6px;
        background: var(--bg-elevated);
        border: 1px solid var(--border);
        border-radius: 4px;
        color: var(--text-muted);
      }
      .card-title {
        font-size: 12.5px;
        font-weight: 600;
        line-height: 1.4;
        word-break: break-word;
      }
      .card-actions {
        display: flex;
        gap: 6px;
        margin-top: 2px;
        padding-top: 6px;
        border-top: 1px solid var(--border);
      }
      .btn-action {
        flex: 1;
        padding: 5px 8px;
        font-size: 11px;
        font-weight: 600;
        border-radius: 6px;
        border: 1px solid var(--border);
        background: var(--bg-elevated);
        color: var(--text);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
      }
      .btn-action:hover {
        background: var(--bg-hover);
      }
      .btn-action.btn-fill {
        background: var(--accent);
        color: #fff;
        border-color: var(--accent);
      }
      .btn-action.btn-fill:hover {
        opacity: 0.9;
      }

      /* 底部 Toast */
      .in-toast {
        position: absolute;
        bottom: 12px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.88);
        color: #fff;
        padding: 6px 14px;
        border-radius: 20px;
        font-size: 11.5px;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.15s ease;
      }
      .in-toast.show {
        opacity: 1;
      }

      .empty-state {
        text-align: center;
        padding: 40px 10px;
        color: var(--text-muted);
      }
      .hidden { display: none !important; }
    `;
    shadow.appendChild(styleEl);

    // 懸浮展開按鈕（當收合時顯示）
    const launcherBtn = document.createElement('button');
    launcherBtn.type = 'button';
    launcherBtn.className = 'floating-launcher-btn hidden';
    launcherBtn.innerHTML = `<span>📋 Trace助手</span>`;
    launcherBtn.addEventListener('click', () => setDrawerCollapsed(false));
    shadow.appendChild(launcherBtn);

    // 抽屜主容器
    const drawer = document.createElement('div');
    drawer.className = 'assistant-drawer';
    drawer.setAttribute('data-theme', currentTheme);

    drawer.innerHTML = `
      <div class="drawer-header">
        <div class="brand-title-wrap">
          <span class="brand-icon">📋</span>
          <span class="brand-title">Trace助手</span>
          <span class="case-count-tag num" id="inCountTag"><span class="badge-dot"></span><span class="badge-num">0</span> 筆</span>
        </div>
        <div class="header-controls">
          <button type="button" class="icon-btn" id="inThemeToggleBtn" title="切換深淺主題">🌓</button>
          <button type="button" class="icon-btn" id="inCloseBtn" title="收合助手 (可隨時點擊展開)">▶</button>
        </div>
      </div>

      <!-- 7~9 小時儀表板 -->
      <div class="allocator-box">
        <div class="allocator-top">
          <div class="allocator-title-row">
            <span class="allocator-label">今日累計工時</span>
            <span class="allocator-tag warning" id="inAllocTag">&lt;7h 未達標</span>
          </div>
          <span class="allocator-stat num" id="inAllocStat">0.0h / 8.0h</span>
        </div>
        <div class="allocator-track">
          <div class="allocator-fill warning" id="inAllocFill" style="width: 0%;"></div>
          <div class="allocator-zone" title="7.0 ~ 8.5h 合規區間"></div>
        </div>
        <div class="allocator-actions">
          <button type="button" class="btn-smart-primary" id="inSmartAllocBtn">⚡ 智慧湊數 (7.0 ~ 8.5h)</button>
          <div class="allocator-btn-subrow">
            <button type="button" class="btn-sub" id="inCopyTodayBtn" title="複製今日已選清單與工時（含 TC ID）">📋 複製清單</button>
            <button type="button" class="btn-sub" id="inCopyPureIdsBtn" title="複製純 TC ID 清單（換行，方便批次貼上）">⚡ 純 TC ID</button>
            <button type="button" class="btn-sub btn-clear-today" id="inClearTodayBtn" title="清空今日選取">⟳ 重置</button>
          </div>
        </div>

        <div class="sugg-panel hidden" id="inSuggPanel">
          <div class="sugg-header">
            <span>🎯 湊數推薦：合計 <span id="inSuggTotal" class="num">8.0h</span></span>
            <button type="button" class="sugg-close" id="inCloseSuggBtn">✕</button>
          </div>
          <div class="sugg-list" id="inSuggList"></div>
          <div class="sugg-action-row">
            <button type="button" class="sugg-btn-copy-ids" id="inCopySuggIdsBtn" title="複製推薦組合的純 TC ID">📋 複製 TC ID</button>
            <button type="button" class="sugg-apply-btn" id="inApplySuggBtn">✓ 一鍵採用此組合</button>
          </div>
        </div>

        <!-- 今日已選測項操作托盤 (Today Tray) -->
        <div class="today-tray hidden" id="inTodayTray">
          <div class="today-tray-header">
            <span>📋 今日已選測項 (<span id="inTodayTrayCount" class="num">0</span>)</span>
            <span class="today-tray-hint">點「⚡填入」直接帶入網頁</span>
          </div>
          <div class="today-tray-list" id="inTodayTrayList"></div>
        </div>
      </div>

      <div class="search-box">
        <div class="search-input-wrap">
          <input type="text" class="search-input" id="inSearchInput" placeholder="搜尋 Test Case Name..." />
          <button type="button" class="search-clear-btn" id="inClearSearchBtn">✕</button>
        </div>
        <div class="search-meta" id="inSearchMeta">載入中...</div>
      </div>

      <div class="cases-scroll-list" id="inCasesList"></div>
      <div class="in-toast" id="inToast"></div>
    `;
    shadow.appendChild(drawer);

    const inCountTag = shadow.getElementById('inCountTag');
    const inThemeToggleBtn = shadow.getElementById('inThemeToggleBtn');
    const inCloseBtn = shadow.getElementById('inCloseBtn');
    const inAllocTag = shadow.getElementById('inAllocTag');
    const inAllocStat = shadow.getElementById('inAllocStat');
    const inAllocFill = shadow.getElementById('inAllocFill');
    const inSmartAllocBtn = shadow.getElementById('inSmartAllocBtn');
    const inCopyTodayBtn = shadow.getElementById('inCopyTodayBtn');
    const inCopyPureIdsBtn = shadow.getElementById('inCopyPureIdsBtn');
    const inClearTodayBtn = shadow.getElementById('inClearTodayBtn');
    const inTodayTray = shadow.getElementById('inTodayTray');
    const inTodayTrayCount = shadow.getElementById('inTodayTrayCount');
    const inTodayTrayList = shadow.getElementById('inTodayTrayList');
    const inCopySuggIdsBtn = shadow.getElementById('inCopySuggIdsBtn');

    const inSuggPanel = shadow.getElementById('inSuggPanel');
    const inSuggTotal = shadow.getElementById('inSuggTotal');
    const inCloseSuggBtn = shadow.getElementById('inCloseSuggBtn');
    const inSuggList = shadow.getElementById('inSuggList');
    const inApplySuggBtn = shadow.getElementById('inApplySuggBtn');

    const inSearchInput = shadow.getElementById('inSearchInput');
    const inClearSearchBtn = shadow.getElementById('inClearSearchBtn');
    const inSearchMeta = shadow.getElementById('inSearchMeta');
    const inCasesList = shadow.getElementById('inCasesList');
    const inToast = shadow.getElementById('inToast');

    let toastTimer = null;
    function showInToast(msg) {
      if (toastTimer) clearTimeout(toastTimer);
      inToast.textContent = msg;
      inToast.classList.add('show');
      toastTimer = setTimeout(() => {
        inToast.classList.remove('show');
      }, 1800);
    }

    function setDrawerCollapsed(collapsed) {
      isCollapsed = collapsed;
      if (collapsed) {
        drawer.classList.add('collapsed');
        launcherBtn.classList.remove('hidden');
      } else {
        drawer.classList.remove('collapsed');
        launcherBtn.classList.add('hidden');
        inSearchInput.focus();
      }
    }

    function applyTheme(t) {
      currentTheme = t;
      drawer.setAttribute('data-theme', t);
    }

    // 工時儀表板更新
    function getSelectedHours() {
      return todaySelectedCases.reduce((acc, c) => acc + (c.hours || 0), 0);
    }

    function updateInDashboard() {
      const total = Math.round(getSelectedHours() * 10) / 10;
      inAllocStat.textContent = `${total.toFixed(1)}h / 8.0h`;

      const status = window.SmartAllocator
        ? window.SmartAllocator.evaluateStatus(total)
        : (total < 7.0 ? 'warning' : (total <= 8.5 ? 'success' : 'danger'));

      inAllocTag.className = `allocator-tag ${status}`;
      if (status === 'warning') inAllocTag.textContent = '<7h 未達標';
      else if (status === 'success') inAllocTag.textContent = '7~8.5h 合規';
      else inAllocTag.textContent = '>8.5h 超標';

      inAllocFill.className = `allocator-fill ${status}`;
      const pct = Math.min(100, Math.round((total / 10.0) * 100));
      inAllocFill.style.width = `${pct}%`;

      renderTodayTray();
    }

    // 渲染今日已選測項操作托盤
    function renderTodayTray() {
      if (!inTodayTray || !inTodayTrayList) return;
      if (todaySelectedCases.length === 0) {
        inTodayTray.classList.add('hidden');
        inTodayTrayList.innerHTML = '';
        return;
      }

      inTodayTray.classList.remove('hidden');
      if (inTodayTrayCount) inTodayTrayCount.textContent = todaySelectedCases.length;
      inTodayTrayList.innerHTML = '';

      todaySelectedCases.forEach(item => {
        const row = document.createElement('div');
        row.className = 'tray-item';

        const left = document.createElement('div');
        left.className = 'tray-item-left';

        const idRow = document.createElement('div');
        idRow.className = 'tray-id-row';

        const tcIdSpan = document.createElement('span');
        tcIdSpan.className = 'tray-tc-id num';
        tcIdSpan.textContent = item.id || '無ID';
        tcIdSpan.title = '點擊單獨複製此 TC ID';
        tcIdSpan.addEventListener('click', (e) => {
          e.stopPropagation();
          const val = item.id || item.title;
          navigator.clipboard.writeText(val).then(() => {
            showInToast(`已複製 TC ID：${val}`);
          });
        });
        idRow.appendChild(tcIdSpan);

        const titleSpan = document.createElement('span');
        titleSpan.className = 'tray-item-title';
        titleSpan.textContent = item.title;
        titleSpan.title = item.title;

        left.appendChild(idRow);
        left.appendChild(titleSpan);

        const right = document.createElement('div');
        right.className = 'tray-item-right';

        const timeSpan = document.createElement('span');
        timeSpan.className = 'tray-time num';
        timeSpan.textContent = item.timeDisplay || `${item.hours}h`;

        const fillBtn = document.createElement('button');
        fillBtn.type = 'button';
        fillBtn.className = 'tray-btn-fill';
        fillBtn.textContent = '⚡ 填入';
        fillBtn.title = '填入目前聚焦的輸入欄位';
        fillBtn.addEventListener('click', () => {
          const valToFill = item.id || item.title;
          const filled = fillIntoPage(valToFill);
          if (filled) {
            showInToast(`已填入 TC ID：${valToFill}（請點選選單項目）`);
          } else {
            navigator.clipboard.writeText(valToFill).then(() => {
              showInToast(`已複製 TC ID：${valToFill}（未找到欄位，可手動貼上）`);
            });
          }
        });

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'tray-btn-remove';
        removeBtn.textContent = '✕';
        removeBtn.title = '從今日清單移除';
        removeBtn.addEventListener('click', () => {
          toggleSelectCase(item, false);
        });

        right.appendChild(timeSpan);
        right.appendChild(fillBtn);
        right.appendChild(removeBtn);

        row.appendChild(left);
        row.appendChild(right);
        inTodayTrayList.appendChild(row);
      });
    }

    function saveTodaySelected(cases, callback) {
      chrome.storage.local.set({ today_allocated_cases: cases }, () => {
        todaySelectedCases = cases;
        updateInDashboard();
        renderCases(inSearchInput.value);
        if (callback) callback();
      });
    }

    function toggleSelectCase(item, select) {
      if (select) {
        if (!todaySelectedCases.some(s => s.title === item.title)) {
          saveTodaySelected([...todaySelectedCases, item]);
        }
      } else {
        saveTodaySelected(todaySelectedCases.filter(s => s.title !== item.title));
      }
    }

    function handleSmartAllocate() {
      const currentHours = getSelectedHours();
      const selectedTitles = new Set(todaySelectedCases.map(c => c.title));
      const unselectedCandidates = currentCases.filter(c => !selectedTitles.has(c.title));

      if (!window.SmartAllocator) return;

      const result = window.SmartAllocator.allocate(unselectedCandidates, currentHours);

      if (result.status === 'already_compliant' || result.status === 'over_budget' || result.status === 'no_candidates') {
        showInToast(result.message);
        return;
      }

      if (result.status === 'no_combination') {
        showInToast('未能湊出 7~8.5h 組合，建議手動挑選');
        return;
      }

      currentSuggestion = result.combinations[0];
      inSuggTotal.textContent = `${currentSuggestion.totalHours.toFixed(1)}h`;
      inSuggList.innerHTML = '';

      currentSuggestion.cases.forEach(c => {
        const itemEl = document.createElement('div');
        itemEl.className = 'sugg-item';

        const topEl = document.createElement('div');
        topEl.className = 'sugg-item-top';

        const idBadge = document.createElement('span');
        idBadge.className = 'sugg-tc-id num';
        idBadge.textContent = c.id || '無ID';
        idBadge.title = '點擊單獨複製此 TC ID';
        idBadge.addEventListener('click', (e) => {
          e.stopPropagation();
          const val = c.id || c.title;
          navigator.clipboard.writeText(val).then(() => {
            showInToast(`已複製 TC ID：${val}`);
          });
        });

        const timeBadge = document.createElement('span');
        timeBadge.className = 'time-pill num';
        timeBadge.textContent = c.timeDisplay || (c.hours + 'h');

        topEl.appendChild(idBadge);
        topEl.appendChild(timeBadge);

        const titleEl = document.createElement('div');
        titleEl.className = 'sugg-item-title';
        titleEl.textContent = c.title;
        titleEl.title = c.title;

        const btmEl = document.createElement('div');
        btmEl.className = 'sugg-item-bottom';

        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'sugg-btn-mini';
        copyBtn.textContent = '📋 複製 ID';
        copyBtn.addEventListener('click', () => {
          const val = c.id || c.title;
          navigator.clipboard.writeText(val).then(() => {
            showInToast(`已複製 TC ID：${val}`);
          });
        });

        const fillBtn = document.createElement('button');
        fillBtn.type = 'button';
        fillBtn.className = 'sugg-btn-mini sugg-btn-fill';
        fillBtn.textContent = '⚡ 填入';
        fillBtn.title = '填入目前網頁欄位';
        fillBtn.addEventListener('click', () => {
          const valToFill = c.id || c.title;
          const filled = fillIntoPage(valToFill);
          if (filled) {
            showInToast(`已填入 TC ID：${valToFill}`);
          } else {
            navigator.clipboard.writeText(valToFill).then(() => {
              showInToast(`已複製 TC ID：${valToFill}（可手動貼上）`);
            });
          }
        });

        btmEl.appendChild(copyBtn);
        btmEl.appendChild(fillBtn);

        itemEl.appendChild(topEl);
        itemEl.appendChild(titleEl);
        itemEl.appendChild(btmEl);
        inSuggList.appendChild(itemEl);
      });

      inSuggPanel.classList.remove('hidden');
    }

    function applySuggestion() {
      if (!currentSuggestion || !currentSuggestion.cases) return;
      const newSelected = [...todaySelectedCases, ...currentSuggestion.cases];
      saveTodaySelected(newSelected, () => {
        inSuggPanel.classList.add('hidden');
        showInToast(`已採用湊數組合！累計 ${currentSuggestion.totalHours.toFixed(1)}h (合規)`);
      });
    }

    function copyTodayList() {
      if (todaySelectedCases.length === 0) {
        showInToast('今日尚未勾選任何測項');
        return;
      }
      const lines = todaySelectedCases.map((c, i) => {
        const idPrefix = c.id ? `[${c.id}] ` : '';
        return `${i + 1}. ${idPrefix}${c.title} — ${c.timeDisplay || (c.hours + 'h')}`;
      });
      const total = Math.round(getSelectedHours() * 10) / 10;
      lines.push(`\n合計工時：${total.toFixed(1)} 小時 (${todaySelectedCases.length} 個測項)`);
      navigator.clipboard.writeText(lines.join('\n')).then(() => {
        showInToast('已複製今日測項清單與工時（含 TC ID）！');
      });
    }

    function copyTodayPureIds() {
      if (todaySelectedCases.length === 0) {
        showInToast('今日尚未選取任何測項');
        return;
      }
      const ids = todaySelectedCases.map(c => c.id || c.title).filter(Boolean);
      navigator.clipboard.writeText(ids.join('\n')).then(() => {
        showInToast(`已複製 ${ids.length} 個純 TC ID（可逐行貼上）！`);
      });
    }

    function closeSuggestionPanel() {
      if (inSuggPanel) {
        inSuggPanel.classList.add('hidden');
      }
      currentSuggestion = null;
    }

    function clearTodayList() {
      let closedSugg = false;
      if (inSuggPanel && !inSuggPanel.classList.contains('hidden')) {
        closeSuggestionPanel();
        closedSugg = true;
      }

      if (todaySelectedCases.length > 0) {
        saveTodaySelected([], () => {
          showInToast(closedSugg ? '已重置選取工時並關閉湊數建議' : '已重置今日選取工時');
        });
        return;
      }

      if (closedSugg) {
        showInToast('已關閉並清除湊數建議');
      } else {
        showInToast('目前無任何選取工時或建議需重置');
      }
    }

    function renderCases(query = '') {
      const q = (query || '').trim();
      inClearSearchBtn.style.display = q ? 'block' : 'none';

      const list = window.CaseLibrary ? window.CaseLibrary.fuzzySearch(currentCases, q) : currentCases;
      inSearchMeta.innerHTML = q
        ? `找到 <strong class="highlight-count">${list.length}</strong> 筆相符測項 (共 ${currentCases.length} 筆)`
        : `共快取 <strong class="highlight-count">${currentCases.length}</strong> 筆測項資料`;

      inCasesList.innerHTML = '';

      if (currentCases.length === 0) {
        inCasesList.innerHTML = `
          <div class="empty-state">
            <p>目前尚無測項字典快取</p>
            <p style="font-size: 11px; margin-top: 4px;">請於擴充功能側邊欄匯入 Excel 測項檔案。</p>
          </div>
        `;
        return;
      }

      if (list.length === 0) {
        inCasesList.innerHTML = `
          <div class="empty-state">
            <p>找不到相符的測項</p>
          </div>
        `;
        return;
      }

      list.forEach(item => {
        const card = document.createElement('div');
        card.className = 'case-card';

        const isSelected = todaySelectedCases.some(s => s.title === item.title);
        if (isSelected) card.classList.add('selected');

        const top = document.createElement('div');
        top.className = 'card-top';

        const check = document.createElement('input');
        check.type = 'checkbox';
        check.className = 'case-check';
        check.checked = isSelected;
        check.title = isSelected ? '已選入今日清單（點擊移除）' : '勾選加入今日工時計算';
        check.addEventListener('change', (e) => {
          e.stopPropagation();
          toggleSelectCase(item, check.checked);
        });
        top.appendChild(check);

        const badges = document.createElement('div');
        badges.className = 'card-badges';

        const timePill = document.createElement('span');
        timePill.className = 'time-pill num';
        timePill.textContent = item.timeDisplay || `${item.hours}h`;
        badges.appendChild(timePill);

        if (item.id && item.id !== item.title) {
          const idPill = document.createElement('span');
          idPill.className = 'id-pill num';
          idPill.textContent = item.id;
          badges.appendChild(idPill);
        }

        top.appendChild(badges);

        const title = document.createElement('div');
        title.className = 'card-title';
        title.textContent = item.title;

        const actions = document.createElement('div');
        actions.className = 'card-actions';

        const fillBtn = document.createElement('button');
        fillBtn.type = 'button';
        fillBtn.className = 'btn-action btn-fill';
        fillBtn.textContent = '⚡ 填入 TC ID';
        fillBtn.addEventListener('click', () => {
          const valToFill = item.id || item.title;
          const filled = fillIntoPage(valToFill);
          if (filled) {
            showInToast(`已填入 TC ID：${valToFill}（請點選選單項目）`);
          } else {
            navigator.clipboard.writeText(valToFill);
            showInToast(`已複製 TC ID：${valToFill}（未找到欄位，可直接貼上）`);
          }
        });

        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'btn-action';
        copyBtn.textContent = '📋 複製 ID';
        copyBtn.addEventListener('click', () => {
          const valToCopy = item.id || item.title;
          navigator.clipboard.writeText(valToCopy).then(() => {
            showInToast(`已複製 TC ID：${valToCopy}`);
          });
        });

        actions.appendChild(fillBtn);
        actions.appendChild(copyBtn);

        card.appendChild(top);
        card.appendChild(title);
        card.appendChild(actions);

        inCasesList.appendChild(card);
      });
    }

    // 事件監聽綁定
    inCloseBtn.addEventListener('click', () => setDrawerCollapsed(true));
    inThemeToggleBtn.addEventListener('click', () => {
      const next = currentTheme === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      chrome.storage.local.set({ theme: next });
    });

    inSmartAllocBtn.addEventListener('click', handleSmartAllocate);
    inApplySuggBtn.addEventListener('click', applySuggestion);
    inCloseSuggBtn.addEventListener('click', closeSuggestionPanel);
    inCopyTodayBtn.addEventListener('click', copyTodayList);
    if (inCopyPureIdsBtn) inCopyPureIdsBtn.addEventListener('click', copyTodayPureIds);
    if (inCopySuggIdsBtn) {
      inCopySuggIdsBtn.addEventListener('click', () => {
        if (!currentSuggestion || !currentSuggestion.cases) return;
        const ids = currentSuggestion.cases.map(c => c.id || c.title).filter(Boolean);
        navigator.clipboard.writeText(ids.join('\n')).then(() => {
          showInToast(`已複製推薦組合的 ${ids.length} 個純 TC ID！`);
        });
      });
    }
    inClearTodayBtn.addEventListener('click', clearTodayList);

    inSearchInput.addEventListener('input', (e) => {
      renderCases(e.target.value);
    });

    inClearSearchBtn.addEventListener('click', () => {
      inSearchInput.value = '';
      renderCases('');
      inSearchInput.focus();
    });

    // 載入初始資料
    chrome.storage.local.get(['case_library', 'today_allocated_cases', 'theme'], (res) => {
      currentCases = Array.isArray(res.case_library) ? res.case_library : [];
      todaySelectedCases = Array.isArray(res.today_allocated_cases) ? res.today_allocated_cases : [];
      if (res.theme) applyTheme(res.theme);

      if (currentCases.length === 0) {
        fetch(chrome.runtime.getURL('default_cases.json'))
          .then((r) => r.json())
          .then((defaultCases) => {
            if (Array.isArray(defaultCases) && defaultCases.length > 0) {
              chrome.storage.local.set({ case_library: defaultCases });
            }
          })
          .catch(() => {});
      }

      inCountTag.innerHTML = `<span class="badge-dot"></span><span class="badge-num">${currentCases.length}</span> 筆`;
      updateInDashboard();
      renderCases('');
    });

    // 同步儲存庫變更（無論在側邊欄還是網頁助手內勾選，雙向即時同步）
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local') {
        if (changes.case_library) {
          currentCases = Array.isArray(changes.case_library.newValue) ? changes.case_library.newValue : [];
          inCountTag.innerHTML = `<span class="badge-dot"></span><span class="badge-num">${currentCases.length}</span> 筆`;
          renderCases(inSearchInput.value);
        }
        if (changes.today_allocated_cases) {
          todaySelectedCases = Array.isArray(changes.today_allocated_cases.newValue) ? changes.today_allocated_cases.newValue : [];
          updateInDashboard();
          renderCases(inSearchInput.value);
        }
        if (changes.theme) {
          applyTheme(changes.theme.newValue);
        }
      }
    });
  }

  // --- 判斷啟動時機 ---
  // 只有在 http://tpecrawler:7779/timesheet/new 或使用者自訂 Trace 網址時才自動打開助手
  chrome.storage.local.get(['settings'], (res) => {
    const customUrl = res?.settings?.traceUrl || '';
    if (isTargetPage(customUrl)) {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initInPageAssistant);
      } else {
        initInPageAssistant();
      }
    }
  });
})();
