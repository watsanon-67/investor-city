# -*- coding: utf-8 -*-
"""
cut_towers.py — ตัดพื้นหลัง gradient ออกจาก asset ตึก (assets/tower/*.png)
  → เซฟเป็น PNG โปร่งใส crop พอดีตัวตึก ที่ assets/tower/cut/<id>.png
วิธี: หา "พื้นหลัง" = บริเวณสีเรียบต่อเนื่อง (gradient) ที่แตะขอบภาพ (flood-fill เชิง vectorized)
      เก็บเฉพาะก้อน foreground ใหญ่สุด (ตัดเศษ confetti/จุดลอย) + feather ขอบนิดหน่อย
รัน:  python tools/cut_towers.py [preview_dir]
      ถ้าให้ preview_dir จะเซฟ cut_sheet.png (รวมผลทุกตึก) + map_preview.png (วางบน map1)
"""
import os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
TOWER_DIR = os.path.join(HERE, '..', 'assets', 'tower')
OUT_DIR = os.path.join(TOWER_DIR, 'cut')
MAP_PATH = os.path.join(HERE, '..', 'assets', 'newestmap.png')

# id ในเกม → ไฟล์ต้นฉบับ (id ใช้เป็นชื่อไฟล์ output ที่สะอาด)
FILES = {
    'chart':       'stock market.png',
    'fin':         'bank saving.png',
    'realestate':  'real estate.png',
    'crypto':      'cryto arena.png',
    'gold':        'Gold vault.png',
    'startup':     'startup hub.png',
    'green':       'green invest.png',
    'bond':        'bonds & fund.png',
    'leaderboard': 'leader board.png',
    'news':        'news.png',
    'trend':       'city hall.png',
}

# ค่า tolerance ต่อภาพ (ค่า default 8 — เพิ่มถ้าพื้นหลังยังเหลือ, ลดถ้าตึกโดนกิน)
TOL = {}
TOL_DEFAULT = 8.0

# ---- ตำแหน่งวางบนแมป (พรีวิวเท่านั้น — ค่าจริงอยู่ใน js/map.js ให้ตรงกัน) ----
# fx, fy = จุด "ฐานตึก" (สัดส่วน 0..1 ของภาพแมป) · h = ความสูงตึกในพิกัดโลก 960x540
# จูนให้สไปรต์ทับ "พอดี" อาคารที่วาดใน map1.png (ฐานติดพื้น) — 2026-07-04
# trend (City Hall) ไม่วางสไปรต์ — ใช้น้ำพุนกฮูกที่วาดในรูปเดิม (จึงไม่อยู่ใน PLACE)
# หมายเหตุ: user สั่งสลับตำแหน่ง fin (Bank) ↔ bond (Bonds & Fund) — 2026-07-04
PLACE = {
    'chart':       (0.163, 0.473, 152),
    'bond':        (0.353, 0.471, 153),
    'realestate':  (0.508, 0.430, 158),
    'crypto':      (0.667, 0.425, 152),
    'gold':        (0.834, 0.491, 136),
    'startup':     (0.243, 0.701, 164),
    'green':       (0.683, 0.636, 133),
    'fin':         (0.365, 0.831, 135),
    'leaderboard': (0.489, 0.887, 155),
    'news':        (0.637, 0.802, 161),
}
WORLD_W, WORLD_H = 960.0, 540.0


def cut_one(path, tol):
    img = Image.open(path).convert('RGB')
    a = np.asarray(img, dtype=np.float32)
    h, w = a.shape[:2]

    # 1) จุด "เรียบ" = ต่างจากเพื่อนบ้าน 4 ทิศไม่เกิน tol (ประมาณ flood-fill ผ่าน gradient)
    diff = np.zeros((h, w), dtype=np.float32)
    d = np.abs(a[:, 1:] - a[:, :-1]).max(axis=2)
    diff[:, 1:] = np.maximum(diff[:, 1:], d); diff[:, :-1] = np.maximum(diff[:, :-1], d)
    d = np.abs(a[1:, :] - a[:-1, :]).max(axis=2)
    diff[1:, :] = np.maximum(diff[1:, :], d); diff[:-1, :] = np.maximum(diff[:-1, :], d)
    smooth = diff <= tol

    # 2) พื้นหลัง = ก้อน "เรียบ" ที่แตะขอบภาพ
    lab, n = ndimage.label(smooth)
    border = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    border = border[border != 0]
    bg = np.isin(lab, border)

    # 3) foreground = ที่เหลือ → เก็บก้อนใหญ่สุดก้อนเดียว (ตัด confetti/เศษ)
    fg = ~bg
    lab2, n2 = ndimage.label(fg, structure=np.ones((3, 3)))
    if n2 == 0:
        raise RuntimeError('no foreground found: ' + path)
    sizes = ndimage.sum(fg, lab2, range(1, n2 + 1))
    fg = lab2 == (int(np.argmax(sizes)) + 1)

    # 4) alpha: หด 1px กันขอบติดสีพื้น แล้ว blur เบาๆ ให้ขอบนุ่ม
    er = ndimage.binary_erosion(fg, iterations=1)
    alpha = Image.fromarray((er * 255).astype(np.uint8), 'L').filter(ImageFilter.GaussianBlur(1.0))

    out = img.convert('RGBA')
    out.putalpha(alpha)

    # 5) crop กรอบพอดี (alpha > 10) + ขอบ 2px
    am = np.asarray(alpha)
    ys, xs = np.where(am > 10)
    x0, x1 = max(0, xs.min() - 2), min(w, xs.max() + 3)
    y0, y1 = max(0, ys.min() - 2), min(h, ys.max() + 3)
    return out.crop((x0, y0, x1, y1))


def main():
    preview_dir = sys.argv[1] if len(sys.argv) > 1 else None
    os.makedirs(OUT_DIR, exist_ok=True)
    cut = {}
    for tid, fname in FILES.items():
        src = os.path.join(TOWER_DIR, fname)
        im = cut_one(src, TOL.get(tid, TOL_DEFAULT))
        outp = os.path.join(OUT_DIR, tid + '.png')
        im.save(outp)
        cut[tid] = im
        print('%-12s %-22s -> cut/%s.png  %dx%d (aspect %.2f)' % (
            tid, fname, tid, im.width, im.height, im.width / im.height))

    if not preview_dir:
        return
    os.makedirs(preview_dir, exist_ok=True)

    # ---- contact sheet: ผลตัดทุกตึกบนพื้นเขียว (เช็คขอบ/เศษพื้นหลังค้าง) ----
    cols, cell = 4, 300
    rows = (len(cut) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * cell, rows * cell), (70, 160, 90))
    dr = ImageDraw.Draw(sheet)
    for i, (tid, im) in enumerate(cut.items()):
        cx, cy = (i % cols) * cell, (i // cols) * cell
        th = cell - 40
        tw = int(th * im.width / im.height)
        if tw > cell - 20:
            tw = cell - 20; th = int(tw * im.height / im.width)
        t = im.resize((tw, th), Image.LANCZOS)
        sheet.paste(t, (cx + (cell - tw) // 2, cy + (cell - 30 - th) // 2 + 5), t)
        dr.text((cx + 10, cy + cell - 24), '%s %dx%d' % (tid, im.width, im.height), fill=(255, 255, 255))
    sheet.save(os.path.join(preview_dir, 'cut_sheet.png'))

    # ---- map preview: วางตึกบน map1.png ตามตำแหน่ง/สเกลเดียวกับในเกม ----
    m = Image.open(MAP_PATH).convert('RGBA')
    iw, ih = m.size
    sx, sy = iw / WORLD_W, ih / WORLD_H
    order = sorted(PLACE.keys(), key=lambda k: PLACE[k][1])  # วาดบนลงล่าง (ตึกล่างทับ)
    for tid in order:
        fx, fy, hw = PLACE[tid]
        im = cut[tid]
        th = int(hw * sy)
        tw = int(th * im.width / im.height)
        t = im.resize((tw, th), Image.LANCZOS)
        bx, by = int(fx * iw), int(fy * ih)
        m.paste(t, (bx - tw // 2, by - th), t)
    dr = ImageDraw.Draw(m)
    for tid in order:
        fx, fy, hw = PLACE[tid]
        bx, by = int(fx * iw), int(fy * ih)
        dr.ellipse([bx - 6, by - 6, bx + 6, by + 6], fill=(255, 40, 40), outline=(255, 255, 255))
    m.convert('RGB').save(os.path.join(preview_dir, 'map_preview.png'))
    print('previews ->', preview_dir)


if __name__ == '__main__':
    main()
