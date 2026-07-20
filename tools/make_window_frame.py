# -*- coding: utf-8 -*-
"""
make_window_frame.py — เตรียม asset หน้าต่าง UI จาก assets/windows/*.png
  1) ตัดพื้นหลังทองรอบกรอบออก (flood-fill สีเรียบที่แตะขอบภาพ — วิธีเดียวกับ cut_towers.py)
  2) "wipe" เนื้อหาที่ AI วาดข้างใน (ตัวหนังสือเพี้ยน) เป็นสีพื้นเรียบ ไล่เฉดบน→ล่างเบาๆ
     เหลือไว้เฉพาะ: กรอบทอง + กระทิง + แบนเนอร์ชื่อ + ปุ่ม X  (เนื้อหาจริงวาดทับด้วย HTML ใน js/windows.js)
  3) crop พอดีกรอบ → เซฟ assets/windows/stock_market_frame.png (ชื่อไม่มีช่องว่าง กัน URL เพี้ยน)
  4) พิมพ์ landmark เป็น % ของภาพ crop — เอาไปใช้จัด layout ใน windows.js/style.css

รัน:  python tools/make_window_frame.py [preview.png]
"""
import os, sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
WIN_DIR = os.path.join(HERE, '..', 'assets', 'windows')
SRC = os.path.join(WIN_DIR, 'stock market.png')
OUT = os.path.join(WIN_DIR, 'stock_market_frame.png')

# บริเวณที่ wipe (สัดส่วน 0..1 ของภาพต้นฉบับ 1536x1024)
#   A = พื้นที่เนื้อหาหลักในกรอบ (ใต้ฐานกระทิง/แท็บ ลงถึงเหนือขอบล่างใน)
#   B = แถบแท็บที่วาดมา (OVERVIEW/MY PORTFOLIO เพี้ยน) — แคบพอไม่โดนชายริบบิ้นแบนเนอร์
WIPE_RECTS = [
    (0.064, 0.242, 0.913, 0.866),   # A: x0, y0, x1, y1
    (0.304, 0.180, 0.586, 0.246),   # B: แถบแท็บ (ทับ A นิดหน่อย กันรอยต่อ)
]
# จุด sample สีพื้น (พื้นที่เรียบ ไม่มีตัวหนังสือ/ปุ่ม): บน = แถบขวาข้างแท็บ · ล่าง = ขอบซ้ายแถบล่าง
SAMPLE_TOP = (0.62, 0.19, 0.88, 0.235)
SAMPLE_BOT = (0.068, 0.80, 0.092, 0.855)

# landmark ในพิกัดต้นฉบับ (วัดจากภาพกริด) → รายงานเป็น % ของภาพ crop
LANDMARKS = {
    'inner content box (x0,y0,x1,y1)': (0.064, 0.182, 0.913, 0.866),
    'tab strip (x0,y0,x1,y1)':         (0.304, 0.182, 0.586, 0.235),
    'close btn center (x,y)':          (0.914, 0.135),
    'banner bottom y':                 (0.178,),
    'bottom bar top y':                (0.788,),
}


def cut_background(img, tol=8.0):
    """พื้นหลัง = ก้อนสีเรียบต่อเนื่องที่แตะขอบภาพ → คืน alpha (โปร่งใสรอบกรอบ)"""
    a = np.asarray(img.convert('RGB'), dtype=np.float32)
    h, w = a.shape[:2]
    diff = np.zeros((h, w), dtype=np.float32)
    d = np.abs(a[:, 1:] - a[:, :-1]).max(axis=2)
    diff[:, 1:] = np.maximum(diff[:, 1:], d); diff[:, :-1] = np.maximum(diff[:, :-1], d)
    d = np.abs(a[1:, :] - a[:-1, :]).max(axis=2)
    diff[1:, :] = np.maximum(diff[1:, :], d); diff[:-1, :] = np.maximum(diff[:-1, :], d)
    smooth = diff <= tol

    lab, _ = ndimage.label(smooth)
    border = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    border = border[border != 0]
    bg = np.isin(lab, border)

    fg = ~bg
    lab2, n2 = ndimage.label(fg, structure=np.ones((3, 3)))
    if n2 == 0:
        raise RuntimeError('no foreground found')
    sizes = ndimage.sum(fg, lab2, range(1, n2 + 1))
    fg = lab2 == (int(np.argmax(sizes)) + 1)
    fg = ndimage.binary_fill_holes(fg)  # กันรูโหว่ในกรอบ (เผื่อ interior เรียบไปแตะเงื่อนไข bg)

    er = ndimage.binary_erosion(fg, iterations=1)
    return Image.fromarray((er * 255).astype(np.uint8), 'L').filter(ImageFilter.GaussianBlur(1.0))


def wipe_interior(img):
    """เติมสีพื้นเรียบ (ไล่เฉดแนวตั้งเบาๆ ตามภาพเดิม) ทับบริเวณ WIPE_RECTS
    สี fill sample จากบริเวณเรียบข้างเคียง (SAMPLE_TOP/BOT) → รอยต่อกับส่วนที่ไม่ได้ wipe กลืนกัน
    ขอบ mask blur เบาๆ กันเส้นรอยต่อคม"""
    W, H = img.size
    a = np.asarray(img.convert('RGB'), dtype=np.float32)

    def med(r):
        return np.median(a[int(r[1] * H):int(r[3] * H), int(r[0] * W):int(r[2] * W)], axis=(0, 1))
    top, bot = med(SAMPLE_TOP), med(SAMPLE_BOT)
    print('fill top %s  bottom %s' % (top.astype(int), bot.astype(int)))

    mask = np.zeros((H, W), dtype=np.float32)
    for (fx0, fy0, fx1, fy1) in WIPE_RECTS:
        mask[int(fy0 * H):int(fy1 * H), int(fx0 * W):int(fx1 * W)] = 1.0
    mask = ndimage.gaussian_filter(mask, 2.0)

    # gradient แนวตั้งทั้งภาพ ระหว่างสีบน (ที่ y=SAMPLE_TOP) → สีล่าง (ที่ y=SAMPLE_BOT)
    y_lo, y_hi = SAMPLE_TOP[1] * H, SAMPLE_BOT[3] * H
    t = np.clip((np.arange(H, dtype=np.float32)[:, None] - y_lo) / max(1.0, (y_hi - y_lo)), 0, 1)
    grad = top[None, None, :] * (1 - t[..., None]) + bot[None, None, :] * t[..., None]
    grad = np.broadcast_to(grad, a.shape)

    a = a * (1 - mask[..., None]) + grad * mask[..., None]
    return Image.fromarray(a.astype(np.uint8), 'RGB')


def main():
    preview = sys.argv[1] if len(sys.argv) > 1 else None
    img = Image.open(SRC)
    W, H = img.size
    alpha = cut_background(img)   # mask จากภาพนุ่มเดิม (sharpen ก่อนจะทำ flood-fill ตรวจ bg พัง)
    # เพิ่มความคมชัดเฉพาะ RGB ที่จะแสดง (กรอบทอง/กระทิง/ตัวหนังสือ)
    sharp = img.convert('RGB').filter(ImageFilter.UnsharpMask(radius=2, percent=80, threshold=2))
    rgb = wipe_interior(sharp)
    out = rgb.convert('RGBA')
    out.putalpha(alpha)

    am = np.asarray(alpha)
    ys, xs = np.where(am > 10)
    x0, x1 = max(0, xs.min() - 2), min(W, xs.max() + 3)
    y0, y1 = max(0, ys.min() - 2), min(H, ys.max() + 3)
    out = out.crop((x0, y0, x1, y1))
    out.save(OUT)
    cw, ch = out.size
    print('crop box (%d,%d)-(%d,%d)  ->  %s  %dx%d (aspect %.4f)' % (x0, y0, x1, y1, OUT, cw, ch, cw / ch))

    # landmark เดิม (สัดส่วนของภาพเต็ม) → % ของภาพ crop (ปัด 2 ตำแหน่ง — พอสำหรับ CSS)
    def cx(fx): return 100.0 * (fx * W - x0) / cw
    def cy(fy): return 100.0 * (fy * H - y0) / ch
    print('--- landmarks (% of cropped frame) ---')
    for name, vals in LANDMARKS.items():
        if len(vals) == 1:
            print('%-36s y=%.2f%%' % (name, cy(vals[0])))
        elif len(vals) == 2:
            print('%-36s x=%.2f%% y=%.2f%%' % (name, cx(vals[0]), cy(vals[1])))
        else:
            print('%-36s x %.2f..%.2f%%  y %.2f..%.2f%%' % (name, cx(vals[0]), cx(vals[2]), cy(vals[1]), cy(vals[3])))

    if preview:
        # พรีวิวบนพื้นลายตาราง (เช็คขอบโปร่งใส + ความสะอาดของ wipe)
        pv = Image.new('RGB', (cw, ch), (90, 60, 120))
        for yy in range(0, ch, 64):
            for xx in range(0, cw, 64):
                if (xx // 64 + yy // 64) % 2 == 0:
                    pv.paste((60, 40, 84), (xx, yy, min(xx + 64, cw), min(yy + 64, ch)))
        pv.paste(out, (0, 0), out)
        pv.save(preview)
        print('preview ->', preview)


if __name__ == '__main__':
    main()
