# Polyglot — 開發進度

> 最後更新：2026-05-14

---

## 完成狀態

### ✅ 已完成的檔案

| 檔案 | 說明 |
|------|------|
| `index.html` | 語言選擇首頁（韓語 / 越南語） |
| `css/main.css` | 全站 CSS（變數、元件、排版） |
| `js/firebase-config.js` | Firebase 設定模板（需填入真實 config） |
| `js/db.js` | Firestore CRUD（levels / lessons / words / progress） |
| `js/tts.js` | Web Speech API 封裝（ko-KR / vi-VN） |
| `app.html` | 主學習 app（SPA，6 頁） |
| `js/app.js` | 學習 app 邏輯（四種模式） |
| `editor.html` | 詞彙編輯器（SPA，4 頁） |
| `js/editor.js` | 編輯器邏輯（CRUD UI） |

---

## app.html 頁面結構

```
pg-levels    → 選級別（顯示進度 %）
pg-lessons   → 選課程（顯示星星平均）
pg-modes     → 選學習模式
  ├── pg-flashcard  → 單字卡片（翻面 + 會了/不會）
  ├── pg-mcq        → 聽力 / 詞彙測驗（4 選 1）
  └── pg-spell      → 拼寫練習（拼排 or 輸入，可切換）
pg-results   → 學習結果（正確率 + 星星更新）
```

---

## Firestore 資料結構

```
/languages/{lang}/levels/{levelId}
  - name: "初級"
  - order: 1

/languages/{lang}/levels/{levelId}/lessons/{lessonId}
  - name: "打招呼"
  - order: 1

/languages/{lang}/levels/{levelId}/lessons/{lessonId}/words/{wordId}
  - word:     "안녕하세요"   ← 目標語言原文
  - zh:       "你好"         ← 中文翻譯
  - phonetic: "annyeonghaseyo"  ← 發音（選填）
  - notes:    ""             ← 備註 / 例句（選填）

/languages/{lang}/progress/{wordId}
  - stars:       0-3
  - correct:     int
  - wrong:       int
  - streak:      int
  - lastStudied: ISO timestamp
```

`{lang}` = `"ko"` 或 `"vi"`

---

## 星星升降規則（db.js / saveSessionResults）

- 連續 2 次正確 → 升 1 星（最高 3）
- 答錯 1 次 → 降 1 星（最低 0）、連勝歸零

---

## 還沒做（原計畫中的可選功能）

- [ ] `css/app.css`（目前樣式內嵌在 `app.html` 的 `<style>`）
- [ ] `js/state.js`（目前 state 直接在 `app.js` 全局變數）
- [ ] `js/nav.js`（目前 showPage 也在 app.js）
- [ ] `assets/flags/`（目前用 emoji 旗幟）
- [ ] `editor.html` 支援 `?lang=` URL 參數（目前需手動選語言）

這些是架構優化，功能上已完整，可以先測試再補。

---

## 前置條件（你回家需要做的）

### 1. 建立 Firebase 專案

1. 前往 [Firebase Console](https://console.firebase.google.com/)
2. 建立新專案，名稱：`polyglot`
3. 啟用 **Firestore Database**（選「測試模式」）
4. 新增 **Web 應用程式**，取得 `firebaseConfig`

### 2. 填入設定

開啟 `js/firebase-config.js`，將以下欄位替換為你的真實值：

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

### 3. 測試流程

1. 用本地伺服器開啟（VS Code Live Server / `npx serve .`）
2. 開啟 `editor.html` → 選韓語 → 新增一個級別 → 一個課程 → 5 個韓語單字
3. 開啟 `app.html?lang=ko` → 進入課次 → 測試四種模式
4. 完成後確認 Firebase Console > Firestore 有寫入 `progress` 資料

### 4. 聽力 / 測驗模式注意

- 需要課次內至少 **4 個詞彙**才能使用（不足時按鈕會 disabled）
- TTS 依賴瀏覽器支援 `ko-KR` / `vi-VN` 語音（Chrome / Edge 最佳）

---

## 已知限制

- 無帳號系統，所有進度儲存在 Firestore（個人使用）
- 拼寫模式的「拼排」子模式：越南語按空格分割音節，韓語按字元分割
- TTS 在 Safari iOS 可能需要用戶觸發才能自動播放
