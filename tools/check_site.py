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
