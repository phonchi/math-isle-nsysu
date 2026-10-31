#!/usr/bin/env python3
"""靜態檢查：產物是否最新、數學內容是否正確、vendor 雜湊、公開內容用語。"""
import hashlib
import math
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_site as B  # noqa: E402
import site_meta as M  # noqa: E402

ROOT = B.ROOT
errs = []


def expect(ok, msg):
    print(("  ✓ " if ok else "  ✗ ") + msg)
    if not ok:
        errs.append(msg)


# 產物與來源一致
expect((ROOT / "index.html").read_text(encoding="utf-8") == B.build_index(), "index.html 與來源一致")
expect((ROOT / "parents.html").read_text(encoding="utf-8") == B.build_parents(), "parents.html 與來源一致")

# vendor 雜湊
for line in (ROOT / "vendor/three/SHA256SUMS").read_text().splitlines():
    digest, name = line.split(maxsplit=1)
    expect(hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == digest, f"雜湊相符 {Path(name).name}")

# 數學內容獨立重算
def is_prime(n):
    return n > 1 and all(n % d for d in range(2, math.isqrt(n) + 1))


expect(all(is_prime(n * n + n + 41) for n in range(1, 40)), "n²+n+41 在 n=1..39 都是質數")
expect(40 * 40 + 40 + 41 == 41 * 41 == 1681, "n=40 時為 41²")
expect(sum(range(1, 101)) == 5050, "1+…+100 = 5050")
expect(math.comb(12, 2) == 66, "12 人握手 66 次")
expect(all(n * (n + 1) * (n + 2) % 6 == 0 for n in range(1, 2000)), "三個連續整數乘積為 6 的倍數")
expect(all(sum(2 * i + 1 for i in range(n)) == n * n for n in range(1, 50)), "奇數和為 n²")


def v2_factorial(n):
    c = 0
    for k in range(1, n + 1):
        while k % 2 == 0:
            k //= 2
            c += 1
    return c


legendre = [sum(n // 2 ** i for i in range(1, 8)) for n in range(1, 101)]
expect(legendre == [v2_factorial(n) for n in range(1, 101)], "n! 的因數 2 個數與 Legendre 公式相符（n=1..100）")
expect(v2_factorial(100) == 97 == 50 + 25 + 12 + 6 + 3 + 1, "100! 含 97 個因數 2")
removed = {(0, 0), (7, 7)}
colors = [(x + y) % 2 for x in range(8) for y in range(8) if (x, y) not in removed]
expect(abs(colors.count(0) - colors.count(1)) == 2, "棋盤去掉對角兩格後，黑白格相差 2")
for name, v, e, f in [("正四面體", 4, 6, 4), ("正六面體", 8, 12, 6), ("正八面體", 6, 12, 8), ("正十二面體", 20, 30, 12), ("正二十面體", 12, 30, 20)]:
    expect(v - e + f == 2 and f"{name} {v}、{e}、{f}" in M.ISLES[3]["act_static"], f"{name} 的 V、E、F")

scene = (ROOT / "tools/template/island-scene.js").read_text(encoding="utf-8")
expect("就是它含幾個因數 2" in M.ISLES[2]["hint"] and "const h = v2(k);" in scene, "碼頭木箱數等於號碼含的因數 2 個數")

def v2(k):
    return v2_factorial(k) - v2_factorial(k - 1)


expect(sum(v2(k) for k in range(1, 9)) == 7 == 4 + 2 + 1 == v2_factorial(8), "碼頭 1–8 號共 7 個木箱，等於 8! 的因數 2 個數")
activities = (ROOT / "tools/template/activities.js").read_text(encoding="utf-8")
expect("碼頭 1 到 8 號共有 7 個木箱" in activities and "min: 1, max: 100, value: 8 " in activities, "滑桿預設 n=8，並說明與碼頭的關係")
expect((0 + 0) % 2 == (7 + 7) % 2 and M.FEATURED["answer"] is False and "同色" in M.FEATURED["why"], "首屏題：左上、右下同色，答案為不能")
expect(not any("棋盤" in p["q"] for p in M.PUZZLES), "棋盤題只在首屏出現一次")
expect([i["key"] for i in M.ISLES if i.get("now")] == ["junior"], "「你在這裡」只標初級島")

# LINE 預覽卡與家長捷徑
index_html = (ROOT / "index.html").read_text(encoding="utf-8")
parents_html = (ROOT / "parents.html").read_text(encoding="utf-8")
for name, page, url in [("index", index_html, B.SITE_URL), ("parents", parents_html, B.SITE_URL + "parents.html")]:
    expect(f'property="og:url" content="{url}"' in page and f'property="og:image" content="{B.SITE_URL}og.png"' in page, f"{name} 有 OG 網址與圖片")
og = ROOT / "og.png"
head = og.read_bytes()[:24] if og.exists() else b""
size = (int.from_bytes(head[16:20], "big"), int.from_bytes(head[20:24], "big")) if head else None
expect(size == (1200, 630) and og.stat().st_size < 300 * 1024, f"og.png 為 1200×630 且小於 300 KB（{size}）")
for item in M.PARENT_TODAY:
    key, name = item["target"]
    target = B.fact_id(key, name)
    expect(f'href="#{target}"' in parents_html and f'id="{target}"' in parents_html, f"家長捷徑「{item['title']}」的連結目標存在")

# 公開內容界線：這些字樣不該出現在任何產物。姓名比對由本機掃描器另外執行，不放進 repo。
text = "\n".join((ROOT / n).read_text(encoding="utf-8") for n in ("index.html", "parents.html"))
visible = re.sub(r"<(script|style)\b.*?</\1>", "", text, flags=re.S | re.I)
for word in ["名單公告", "金牌", "銀牌", "銅牌", "奧林匹亞", "排名", "會議紀錄", "預算", "學費", "保證"]:
    expect(word not in visible, f"公開文字沒有「{word}」")
expect("cdn.jsdelivr" not in text, "不依賴 CDN")
expect("9322" not in text, "不連到含學生姓名的雙週一題紀錄頁")

if errs:
    raise SystemExit(f"{len(errs)} 項失敗")
print("靜態檢查全部通過")
