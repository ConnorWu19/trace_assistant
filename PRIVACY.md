# 隱私權政策 (Privacy Policy) — Trace助手 (Trace Assistant)

**最後更新日期 (Last Updated):** 2026-11-05

感謝您使用 **Trace助手 (Trace Assistant)** 瀏覽器擴充套件（以下簡稱「本套件」）。本套件致力於保護使用者的個人隱私與數據安全。本隱私權政策旨在說明本套件對數據的處理方式。

---

### 一、數據蒐集與使用 (Data Collection & Usage)
1. **絕不蒐集個人資訊**：本套件不會蒐集、記錄、追蹤或傳輸任何使用者的個人身分資訊、帳號密碼、網路瀏覽歷史或設備資訊。
2. **無遠端伺服器傳輸**：本套件無任何遠端後端伺服器，亦未嵌入任何第三方分析（Analytics）、追蹤代碼或廣告模組。
3. **無數據販售**：本套件絕不販售、出租或分享任何使用者數據予第三方。

---

### 二、本地數據儲存 (Local Storage)
本套件所使用之所有數據均僅儲存於使用者本機電腦之瀏覽器沙盒中（透過 `chrome.storage.local` API）：
- **工時提醒排程設定**：提醒開始時間、結束時間、提醒間隔、請假免打擾日期。
- **本地測項字典快取**：使用者透過側邊欄自行匯入之 Excel 測項清單與今日已選工時項目。
- **介面偏好**：深色/淺色主題偏好。

使用者可隨時透過擴充套件側邊欄的「清空測項」按鈕，或透過瀏覽器擴充功能管理頁移除本套件，即可一鍵徹底刪除本機儲存的所有數據。

---

### 三、權限使用說明 (Permissions)
本套件僅索取維持核心功能所需之最小權限：
- `alarms`：用於定時觸發本機工時填寫提醒。
- `notifications`：用於向使用者彈出系統桌面提醒通知。
- `storage`：用於將上述提醒排程與測項快取儲存於使用者本機瀏覽器。
- `sidePanel`：用於提供側邊欄快速搜尋測項與智慧配時功能。
- 主機權限（`http://tpecrawler:7779/*`, `http://tpecrawler/*`）：僅用於在使用者瀏覽內部工時填寫系統時，提供網頁端輔助抽屜與自動填入測項 ID 功能。

---

### 四、政策變更與聯絡方式 (Contact)
若本隱私權政策有任何修訂，將更新於此頁面。若您對本隱私權政策有任何疑問，可透過您的內部專案管理管道或開發者聯繫。

---

# Privacy Policy (English Version)

**Last Updated:** November 5, 2026

**Trace Assistant** ("the Extension") respects and protects your privacy. This Privacy Policy explains our practices regarding user data.

### 1. Data Collection and Usage
- **No Personal Data Collected:** The Extension does not collect, track, log, or transmit any personally identifiable information, browsing history, or credentials.
- **No Remote Servers:** The Extension does not communicate with any external servers. There are no tracking tools, telemetry, or analytics embedded.
- **No Data Selling:** We do not sell, lease, or share user data with any third party.

### 2. Local Storage
All data is stored exclusively in your local browser sandbox via `chrome.storage.local`:
- User preferences (reminder hours, intervals, leave dates).
- Cached test case items imported locally by the user.
- Theme preference (Dark / Light mode).

All data can be wiped immediately at any time by clearing the extension storage or uninstalling the Extension.

### 3. Permissions
The Extension requests only minimal permissions necessary for its functionality:
- `alarms`: To schedule local reminders.
- `notifications`: To display local desktop notification banners.
- `storage`: To store user configuration and test case cache locally on device.
- `sidePanel`: To provide a side panel interface for fast search and time allocation.
- Host permissions (`http://tpecrawler:7779/*`, `http://tpecrawler/*`): Strictly used to interact with the internal timesheet page to assist filling test case IDs.

### 4. Contact
If you have any questions about this Privacy Policy, please contact the extension administrator or developer team.
