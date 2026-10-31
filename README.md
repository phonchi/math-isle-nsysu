# 猜想群島

中山大學南部高中數學人才培育班的公開導覽頁：五座 3D 島呈現兩年路徑、課程與資源，每座島附一個簡單的數學小互動。資訊內容不需要 3D 也能完整閱讀，家長另有純 HTML 的 `parents.html`。

## 內容界線

這是公開網站，只放官網與公開資料中的計畫資訊和自編數學內容。不放學生或教師個人姓名、成績、名單、內部會議內容、經費與獎牌統計。

## 修改與檢查

文案在 `tools/site_meta.py`，樣式與程式在 `tools/template/`。`index.html`、`parents.html` 是產物，不要手改。

```bash
python3 -B tools/build_site.py
python3 -B tools/check_site.py
SHOT_DIR=shots node tools/check_browser.js
```

本機預覽請用 HTTP 伺服器，例如 `python3 -m http.server`；用 `file://` 開啟時瀏覽器會擋下模組，頁面會退回 2D。

Three.js 0.186.1 放在 `vendor/three/`（MIT 授權），不依賴 CDN。
