# 商店上架與審核備忘指南 (Store Submission Guide)

**適用平台：** Google Chrome Web Store / Microsoft Edge Add-ons  
**發布模式：** 不公開 (Unlisted) 或 公開 (Public)

---

## 1. 必填基本資訊 (Basic Information)

- **擴充套件名稱 (Name):**  
  `Trace助手 (Trace Assistant)`
- **簡短說明 (Summary / Short Description):**  
  `Trace 輔助工時提醒與填寫助手，提供定時提醒、測項速查庫與 7~8.5 小時智慧配時建議。`
- **類別 (Category):**  
  `生產力工具 (Productivity)`
- **語言 (Language):**  
  `繁體中文 (Traditional Chinese)` 或 `English`

---

## 2. 隱私權政策 (Privacy Policy)

- **Privacy Policy URL (隱私權政策網址):**  
  ```text
  https://github.com/ConnorWu19/trace_assistant/blob/main/PRIVACY.md
  ```
  *(已通過 GitHub 公開驗證 HTTP 200 OK，聲明純本機儲存、零個資蒐集、零第三方伺服器傳輸)*

---

## 3. 單一用途宣告 (Single Purpose Description)

- **Single Purpose 欄位填寫：**
  ```text
  Trace Assistant is an internal timesheet reminder tool that helps users log their daily working hours on schedule, provides a side panel for searching test cases, and calculates optimal hour allocation.
  ```

---

## 4. 給審查員的測試說明 (Testing Instructions / Notes for Reviewer)

> **非常重要：** 請將以下完整英文複製貼入審核後台的 **「Testing instructions」** (Chrome) 或 **「Notes for certification」** (Edge) 欄位中，避免審查員因無法連上內網而誤判退件。

```text
This is an internal unlisted enterprise tool for company employees. The target host (http://tpecrawler) is a corporate intranet portal accessible only inside company network/VPN.

Reviewers can test all standalone extension features locally without intranet access:
1. Click the extension icon to test schedule settings, dark/light theme toggling, and the leave management UI.
2. Open the Side Panel to test test-case fuzzy search and the 7~8.5h smart hour allocation dashboard.
3. In the Side Panel "Import" tab, test importing local Excel (.xlsx/.xls/.csv) files.
4. Library notice: "xlsx.mini.min.js" is the official SheetJS v0.20.3 open-source build used strictly for offline local Excel parsing with zero remote code execution.
```

---

## 5. 權限用途申報 (Permission Justifications)

若商店後台要求說明各項權限用途：

| 權限項目 | 英文用途說明 (Justification for Reviewer) |
| :--- | :--- |
| **`alarms`** | Used to trigger periodic reminders at user-configured time slots. |
| **`notifications`** | Used to show local desktop notification alerts when reminder triggers. |
| **`storage`** | Used to store user preferences, schedules, and cached test case dictionary in local storage (`chrome.storage.local`). |
| **`sidePanel`** | Used to provide a persistent side panel for test case searching, Excel importing, and hour calculations. |
| **`host_permissions`**<br>`http://tpecrawler:7779/*`<br>`http://tpecrawler/*` | Strictly scoped to the internal timesheet domain to mount the in-page assistant drawer and fill test case IDs into the input fields. |

---

## 6. 打包上傳步驟 (Packaging)

1. 確認資料夾內已包含所有必要檔案（`manifest.json`, `background.js`, `fonts/`, `icons/`, `xlsx.mini.min.js` 等）。
2. 在專案根目錄下，選取所有檔案（不要選取外層資料夾，直接選取裡面的檔案），點擊右鍵 ➔ **壓縮為 ZIP 檔案**。
3. 將產出的 `.zip` 檔案上傳至 Chrome Web Store 開發者資訊主頁或 Microsoft Partner Center 即可。
