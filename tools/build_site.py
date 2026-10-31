#!/usr/bin/env python3
"""由 tools/site_meta.py 與 tools/template/ 產生 index.html 與 parents.html。冪等。

頁面是 DOM 優先：全部資訊都直接輸出成語意 HTML，沒有 JS、Three.js 載入失敗或沒有 WebGL 時仍可讀完。
Three.js 放在 vendor/three/，以 importmap 指向同源檔案，不依賴 CDN。
"""
import hashlib
import html
import json
import sys
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import site_meta as M  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
TEMPLATE = ROOT / "tools" / "template"
TITLE = "猜想群島"
SUB = "中山大學南部高中數學人才培育班導覽"
SITE_URL = "https://phonchi.github.io/math-isle-nsysu/"
INDEX_DESC = "用五座島認識中山大學南部高中數學人才培育班：兩年路徑、課程、晉級原則與學習資源，還能動手玩幾個數學小實驗。"
PARENTS_DESC = "給家長的中山大學南部高中數學人才培育班重點：兩年路徑、課程、晉級原則、升學相關與交通。"
FONT_TEXT = TITLE + "計畫島初級中高資源港"
FONTS = ("https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@900&display=swap&text="
         + urllib.parse.quote(FONT_TEXT))
MONKEY = ('<svg class="monkey" viewBox="0 0 48 48" aria-hidden="true">'
          '<circle cx="9" cy="24" r="6" fill="#d29b73"/><circle cx="39" cy="24" r="6" fill="#d29b73"/>'
          '<circle cx="24" cy="24" r="17" fill="#8d6a4f"/><ellipse cx="24" cy="29" rx="11" ry="9" fill="#e9b794"/>'
          '<ellipse cx="18" cy="21" rx="6" ry="5.5" fill="#e9b794"/><ellipse cx="30" cy="21" rx="6" ry="5.5" fill="#e9b794"/>'
          '<circle cx="18" cy="22" r="2" fill="#2b2420"/><circle cx="30" cy="22" r="2" fill="#2b2420"/>'
          '<path d="M20 31 Q24 34 28 31" stroke="#7c4a33" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>')


def esc(s: str) -> str:
    return html.escape(s, quote=True)


def check_meta():
    errs = []
    keys = [i["key"] for i in M.ISLES]
    if len(keys) != len(set(keys)):
        errs.append("ISLES 有重複的 key")
    for i in M.ISLES:
        for k in ("code", "name", "landmark", "period", "hint", "lead", "facts", "activity", "act_title", "act_static"):
            if not i.get(k):
                errs.append(f"{i['key']} 缺 {k}")
        for link in i["links"]:
            if link not in M.URLS:
                errs.append(f"{i['key']} 的 links 指向不存在的 {link}")
    if {i["activity"] for i in M.ISLES} != {"dots", "claims", "primes", "solids", "puzzles"}:
        errs.append("五個小互動必須各出現一次")
    if errs:
        raise SystemExit("site_meta 不一致：\n  " + "\n  ".join(errs))


def vendor_stamp() -> str:
    """把 vendor 內容的雜湊放進查詢字串，更新 Three.js 時不會讀到舊快取。"""
    h = hashlib.sha256()
    for f in sorted((ROOT / "vendor" / "three").glob("*.js")):
        h.update(f.read_bytes())
    return h.hexdigest()[:10]


def fact_value(v) -> str:
    if isinstance(v, str):
        return f"<dd>{esc(v)}</dd>"
    rows = "".join(f"<li>{esc(x)}</li>" for x in v)
    return f"<dd><ul>{rows}</ul></dd>"


def fact_id(isle_key: str, name: str) -> str:
    """家長頁事實列的錨點：用事實在該島的位置編號，不把中文放進 id。"""
    isle = next(i for i in M.ISLES if i["key"] == isle_key)
    return f"p-{isle_key}-{[k for k, _ in isle['facts']].index(name)}"


def facts(isle: dict, anchors: bool = False) -> str:
    def row(k, v):
        attr = f' id="{fact_id(isle["key"], k)}"' if anchors else ""
        return f"        <div{attr}><dt>{esc(k)}</dt>{fact_value(v)}</div>"
    return "\n".join(row(k, v) for k, v in isle["facts"])


def parent_today() -> str:
    rows = []
    for item in M.PARENT_TODAY:
        key, name = item["target"]
        isle = next(i for i in M.ISLES if i["key"] == key)
        text = item.get("text") or dict(isle["facts"])[name]
        rows.append(f'    <li><a href="#{fact_id(key, name)}">{esc(item["title"])}</a><span>{esc(text)}</span></li>')
    return '  <nav class="today" aria-labelledby="today-h">\n    <h2 id="today-h">今天先找這三件事</h2>\n    <ul>\n' + "\n".join(rows) + "\n    </ul>\n  </nav>"


def og_tags(title: str, description: str, page: str) -> str:
    return "\n".join([
        '<meta property="og:type" content="website">',
        '<meta property="og:locale" content="zh_TW">',
        f'<meta property="og:title" content="{esc(title)}">',
        f'<meta property="og:description" content="{esc(description)}">',
        f'<meta property="og:url" content="{SITE_URL}{page}">',
        f'<meta property="og:image" content="{SITE_URL}og.png">',
        '<meta property="og:image:width" content="1200">',
        '<meta property="og:image:height" content="630">',
        f'<meta property="og:image:alt" content="{esc(TITLE)}：五座島的 3D 地圖">',
        '<meta name="twitter:card" content="summary_large_image">',
    ])


def featured() -> str:
    f = M.FEATURED
    verdict = f["yes"] if f["answer"] else f["no"]
    return f"""    <aside class="hook act" data-activity="board" aria-labelledby="hook-h">
      <h2 class="hook-title" id="hook-h">{esc(f['title'])}</h2>
      <div class="act-body"><p class="act-q">{esc(f['q'])}</p><p>{esc(verdict)}。{esc(f['why'])}</p></div>
    </aside>"""


def links(isle: dict) -> str:
    return "".join(f'<li><a href="{esc(M.URLS[k][1])}" target="_blank" rel="noopener">{esc(M.URLS[k][0])}</a></li>'
                   for k in isle["links"])


def section(i: dict) -> str:
    return f"""    <section class="isle" id="isle-{i['key']}" data-isle="{i['key']}" aria-labelledby="h-{i['key']}">
      <header class="isle-head">
        <span class="isle-num">{i['code']}</span>
        <div><h2 id="h-{i['key']}">{esc(i['name'])}{'<span class="isle-now">你在這裡</span>' if i.get('now') else ''}</h2><p class="isle-period">{esc(i['period'])}</p></div>
      </header>
      <p class="isle-lead">{esc(i['lead'])}</p>
      <dl class="isle-facts">
{facts(i)}
      </dl>
      <div class="act" data-activity="{i['activity']}">
        <h3><span class="act-kicker">{esc(i['landmark'])}</span>{esc(i['act_title'])}</h3>
        <p class="act-hint">{MONKEY}<span>{esc(i['hint'])}</span></p>
        <div class="act-body"><p>{esc(i['act_static'])}</p></div>
      </div>
      <ul class="isle-links">{links(i)}</ul>
    </section>"""


def build_index() -> str:
    check_meta()
    css = (TEMPLATE / "island.css").read_text(encoding="utf-8").rstrip()
    js = "\n\n".join((TEMPLATE / f).read_text(encoding="utf-8").rstrip()
                     for f in ("island.js", "activities.js", "island-scene.js"))
    data = dict(isles=[dict(key=i["key"], code=i["code"], name=i["name"], landmark=i["landmark"], now=bool(i.get("now"))) for i in M.ISLES],
                claims=M.CLAIMS, puzzles=M.PUZZLES, featured=M.FEATURED)
    data_json = json.dumps(data, ensure_ascii=False, indent=1).replace("</", "<\\/")
    v = vendor_stamp()
    importmap = json.dumps({"imports": {
        "three": f"./vendor/three/three.module.min.js?v={v}",
        # three.module.min.js 內部 import 未壓縮的 three.core.js，這裡改指向壓縮版
        "./vendor/three/three.core.js": f"./vendor/three/three.core.min.js?v={v}",
        "three/addons/controls/OrbitControls.js": f"./vendor/three/OrbitControls.js?v={v}",
        "three/addons/geometries/RoundedBoxGeometry.js": f"./vendor/three/RoundedBoxGeometry.js?v={v}",
    }}, indent=1)
    sections = "\n".join(section(i) for i in M.ISLES)
    jumps = "\n".join(f'      <button type="button" class="isl-jump-btn" data-isle="{i["key"]}">{esc(i["name"])}</button>'
                      for i in M.ISLES)
    return f"""<!DOCTYPE html>
<!-- 產物：由 tools/build_site.py 產生，不要手改。文案在 tools/site_meta.py，樣式與程式在 tools/template/ -->
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="description" content="{INDEX_DESC}">
{og_tags(f"{TITLE}｜{SUB}", INDEX_DESC, "")}
<title>{TITLE}｜{SUB}</title>
<script>
/* 有 WebGL 才先排 3D 版面。若模組腳本完全無法執行，12 秒後由這裡退回 2D；資訊本身一直可讀。 */
if (window.WebGLRenderingContext) {{
  document.documentElement.classList.add('gl-pending');
  setTimeout(function () {{ document.documentElement.classList.remove('gl-pending'); }}, 12000);
}}
</script>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="{FONTS}" rel="stylesheet" media="print" onload="this.media='all'">
<style>
{css}
</style>
<script type="importmap">
{importmap}
</script>
</head>
<body>
<header class="isl-bar">
  <div class="isl-brand">
    <h1>{TITLE}</h1>
    <span class="isl-brand-sub">{SUB}</span>
  </div>
  <div class="isl-actions">
    <a class="isl-btn is-strong" href="parents.html">給家長</a>
    <a class="isl-btn" href="{esc(M.URLS['official'][1])}" target="_blank" rel="noopener">官網</a>
    <button type="button" class="isl-btn" id="islReset" hidden>全景</button>
  </div>
</header>
<main class="isl-main">
  <div class="isl-stage" id="islStage" hidden>
    <p class="isl-loading" aria-hidden="true">群島載入中，下方資訊可以先看</p>
    <canvas id="islCanvas" tabindex="0" aria-label="3D 群島地圖：拖曳旋轉、滾輪或雙指縮放、點選島嶼。所有內容也可在島嶼列表閱讀。"></canvas>
    <div class="isl-jumps" role="group" aria-label="跳到島嶼">
{jumps}
    </div>
    <div class="isl-labels" id="islLabels"></div>
    <p class="isl-drag" aria-hidden="true">拖曳旋轉 · 點島看介紹</p>
  </div>
  <nav class="isl-list" id="islList" aria-label="島嶼列表">
{featured()}
    <div class="isl-intro">
      <p>五座島，兩年路徑，新生從 2 號初級島出發。點一座島，就能看課程、時程和資源，也能順手玩一個小實驗。</p>
      <p class="isl-date">{esc(M.INFO_DATE)}。{esc(M.DISCLAIMER)}</p>
    </div>
{sections}
    <footer class="isl-foot">
      <p>中山大學南部高中數學人才培育班導覽。{esc(M.INFO_DATE)}。</p>
      <p>{esc(M.DISCLAIMER)}</p>
    </footer>
  </nav>
</main>
<button type="button" class="isl-back" id="islBack" hidden>回到地圖</button>
<script type="application/json" id="island-data">
{data_json}
</script>
<script type="module">
{js}
</script>
</body>
</html>
"""


def build_parents() -> str:
    check_meta()
    css = (TEMPLATE / "parents.css").read_text(encoding="utf-8").rstrip()
    rows = []
    for i in M.ISLES:
        rows.append(f"""  <section aria-labelledby="p-{i['key']}">
    <h2 id="p-{i['key']}">{esc(i['name'])}<small>{esc(i['period'])}</small></h2>
    <p>{esc(i['lead'])}</p>
    <dl>
{facts(i, anchors=True)}
    </dl>
    <ul class="links">{links(i)}</ul>
  </section>""")
    body = "\n".join(rows)
    return f"""<!DOCTYPE html>
<!-- 產物：由 tools/build_site.py 產生，不要手改。文案在 tools/site_meta.py -->
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="description" content="{PARENTS_DESC}">
{og_tags(f"給家長｜{TITLE}", PARENTS_DESC, "parents.html")}
<title>給家長｜{TITLE}</title>
<style>
{css}
</style>
</head>
<body>
<header>
  <p class="back"><a href="index.html">← 回到猜想群島</a></p>
  <h1>給家長：兩年路徑與規則</h1>
  <p>{esc(M.INFO_DATE)}。{esc(M.DISCLAIMER)}</p>
</header>
<main>
{parent_today()}
{body}
</main>
</body>
</html>
"""


def write(name: str, text: str):
    out = ROOT / name
    if not out.exists() or out.read_text(encoding="utf-8") != text:
        out.write_text(text, encoding="utf-8")
        print(f"寫入 {name}（{len(text.encode()) // 1024} KB）")
    else:
        print(f"{name} 已是最新")


if __name__ == "__main__":
    write("index.html", build_index())
    write("parents.html", build_parents())
