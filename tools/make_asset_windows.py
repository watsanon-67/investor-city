# -*- coding: utf-8 -*-
"""
make_asset_windows.py — เตรียมกรอบหน้าต่างตึกจาก assets/windows/*.png
(สูตรเดียวกับ make_window_frame.py ที่ใช้กับ stock market)

  โหมด 'flood' (ทุกบานตอนนี้): ตัดพื้นหลังรอบกรอบด้วย flood-fill + crop พอดีกรอบ
    - 'wipes'  = rect ที่ต้องล้างเป็นพื้นเรียบไล่เฉด (อาร์ตเก่าที่มีตัวหนังสือ AI เพี้ยนข้างใน)
    - 'wipe_interior' = ย้อม "ช่องเปิดด้านในกรอบ" ทั้งช่องเป็นสีไล่เฉดตามธีม (grad_top/grad_bot)
      ใช้กับอาร์ตกรอบเปล่าที่ข้างในเป็นสีฉากหลังติดมา (green/realestate/startup ใหม่ 2026-07-15)
      หา mask ด้วย interior_region() = ก้อนพื้นเรียบที่ไม่ติดขอบภาพ → **พอดีรูเป๊ะทุกพิกเซล**
      (อย่าใช้ rect เดามุม — กรอบพวกนี้มุมโค้ง/ตัดเฉียง rect จะกินอาร์ตขอบ)

  โหมด 'shape' — สร้าง alpha จากรูปทรงวัดมือ (rrect/circle/flood) + 'patches' ซ่อมรอย
    สำหรับอาร์ตที่ฉากหลังเป็นวิวละเอียดจน flood-fill ใช้ไม่ได้
    ** ตอนนี้ไม่มีบานไหนใช้แล้ว ** (อาร์ตใหม่ทุกบานฉากหลังเรียบ) — เก็บโค้ดไว้เผื่ออาร์ตแบบเดิม

  ผลลัพธ์ → assets/windows/frames/<id>_frame.png
  รัน:  python tools/make_asset_windows.py [โฟลเดอร์พรีวิว] [id เดียว]
  แล้วเช็คพรีวิวด้วยตาทุกภาพ (wipe ขาด/เกิน แก้ WIPES แล้วรันซ้ำ)
  ** เปลี่ยนอาร์ต → สัดส่วน crop เปลี่ยน ต้องอัปเดต SC.windows.ASSET_AR ใน js/windows.js ด้วย **
"""
import os, sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
WIN_DIR = os.path.join(HERE, '..', 'assets', 'windows')
OUT_DIR = os.path.join(WIN_DIR, 'frames')

# rect ทั้งหมดเป็นสัดส่วน 0..1 ของภาพต้นฉบับ (x0,y0,x1,y1)
WINDOWS = {
    'crypto': {
        'src': 'cryto arena win.png', 'mode': 'flood', 'tol': 9.0,
        # เหลือ: มาสคอตหุ่นยนต์ + แบนเนอร์ CRYPTO ARENA + ปุ่ม X · wipe แท็บ+เนื้อหาทั้งหมด
        'wipes': [(0.088, 0.205, 0.922, 0.900)],
        'sample_top': (0.63, 0.215, 0.86, 0.245),
        'sample_bot': (0.10, 0.855, 0.30, 0.885),
    },
    'bond': {
        # อาร์ตใหม่ 2026-07-20 (bonds_new.png) = กรอบเปล่าล้วน มีแบนเนอร์เขียว + ปุ่ม X ในอาร์ต
        # → flood ตัดพื้นทองรอบนอก + wipe_interior ย้อมช่องเปิด (สูตรเดียวกับ green/realestate/startup)
        'src': 'bonds_new.png', 'mode': 'flood', 'tol': 9.0,
        'wipes': [], 'wipe_interior': True,
        'sample_top': (0.20, 0.25, 0.80, 0.29),
        'sample_bot': (0.20, 0.80, 0.80, 0.84),
        'grad_top': (6, 38, 16), 'grad_bot': (3, 18, 8),
    },
    'realestate': {
        # อาร์ตใหม่ล่าสุด 2026-07-15 (real estate win last.png) = กรอบเปล่าล้วน ข้างในสะอาด ไม่มีตัวหนังสือ AI
        # → ไม่ต้อง wipe เป็นรูปสี่เหลี่ยม · ใช้ 'wipe_interior' ย้อมช่องเปิดด้านในเป็นน้ำเงินเข้ม
        # เนื้อหา 2 คอลัมน์ตามตัวอย่าง real estate win new.png วาดด้วย HTML ทับ (.re-* ใน style.css)
        'src': 'real estate win last.png', 'mode': 'flood', 'tol': 9.0,
        'wipes': [], 'wipe_interior': True,
        'sample_top': (0.20, 0.20, 0.80, 0.24),
        'sample_bot': (0.20, 0.80, 0.80, 0.84),
        'grad_top': (16, 38, 78), 'grad_bot': (7, 19, 45),
    },
    'bank': {
        # อาร์ตใหม่ 2026-07-13 (Bank savings win.png) = กรอบทอง + แบนเนอร์ BANK & SAVINGS + เหรียญบิตคอยน์บนสุด + ปุ่ม X
        # 2026-07-14 ทำตามตัวอย่าง bank savings win ex.png: **ไม่ wipe** — คงพื้นทองอุ่น +
        # ของตกแต่งขอบล่าง (ถุงเงิน/ทางเข้าธนาคาร/หมูออม) ไว้ทั้งหมด (ต้นฉบับข้างในเรียบ ไม่มีตัวหนังสือ AI)
        # แผงเขียว 2×2 (ถอน/ฝาก/กู้/ชำระหนี้) + แถบ BALANCE วาดด้วย HTML ทับ (.bank-* ใน style.css)
        'src': 'Bank savings win.png', 'mode': 'flood', 'tol': 9.0,
        'wipes': [],
        'sample_top': (0.40, 0.24, 0.55, 0.27),
        'sample_bot': (0.30, 0.80, 0.55, 0.83),
    },
    'news': {
        # อาร์ต 2026-07-14 (news win.png) = กรอบข่าวไฮเทค NEWS LIVE + ON AIR + ของตกแต่ง (จานดาวเทียม/ไมค์/กล้อง)
        # ตัวอย่างจัดวาง = news win ex.png (ตาราง 3 คอลัมน์ บริการ/ราคา/ผล) — เนื้อหา HTML ทับ
        # ภายในน้ำตาลเรียบ ไม่ wipe · ticker "BREAKING NEWS" ล่างมีคำเพี้ยน (NEWG) →
        # vgrad ล้างข้อความทั้งแถบจากช่องว่างสะอาดระหว่างวลี แล้ววาด ticker จริงด้วย HTML (.news-ticker)
        'src': 'news win.png', 'mode': 'flood', 'tol': 9.0,
        'wipes': [],
        'sample_top': (0.40, 0.30, 0.60, 0.34),
        'sample_bot': (0.40, 0.72, 0.60, 0.76),
        'patches': [('vgrad', (450, 898, 1390, 960), (1052, 898, 1102, 960))],
    },
    'leaderboard': {
        # อาร์ต 2026-07-14 (leader board win.png) = กรอบเขียว-ทอง + แท่น 1/2/3 + ถ้วยรางวัล — UI มินิมอลทับ
        # แถบเขียวล่างมีตัวหนังสือไทย AI เพี้ยน + ตราเหรียญ → vgrad ล้างทั้งช่วงจากแถบสะอาดขวา
        # แล้ววางคำบรรยายจริงด้วย HTML (.lb-note)
        'src': 'leader board win.png', 'mode': 'flood', 'tol': 9.0,
        'wipes': [],
        'sample_top': (0.40, 0.30, 0.60, 0.34),
        'sample_bot': (0.40, 0.52, 0.60, 0.56),
        # src = ช่วงคอลัมน์มืดจริง x 430..486 (วัดด้วย column-brightness — ขวาๆ ไปโดนแสงเจม)
        'patches': [('vgrad', (494, 912, 1148, 968), (430, 912, 486, 968))],
    },
    'gold': {
        'src': 'gold vault win.png', 'mode': 'flood', 'tol': 9.0,
        # เหลือ: กรอบทอง + ป้าย GOLD VAULT + ปุ่ม X + อาร์ตกองทอง/ตู้เซฟฝั่งซ้ายบน
        'wipes': [
            (0.370, 0.150, 0.885, 0.575),   # ขวาบน (BUY GOLD panel)
            (0.115, 0.575, 0.885, 0.930),   # แถวล่างทั้งแถบ
        ],
        'sample_top': (0.40, 0.155, 0.55, 0.175),
        'sample_bot': (0.13, 0.870, 0.35, 0.895),
        'grad_top': (5, 13, 21), 'grad_bot': (2, 9, 16),
    },
    'startup': {
        # อาร์ตใหม่ 2026-07-15 (startup hub win new.png) = กรอบเปล่าไฮเทค + จรวดมุมซ้ายบน
        # + ป้าย STARTUP HUB + ปุ่ม X + **ปุ่ม GREEN INVEST ในอาร์ตมุมซ้ายล่าง** (วาง hotspot ทับ → walkSwitch)
        # ข้างในสะอาด ไม่มีตัวหนังสือ AI → ไม่ wipe · ฉากหลังเรียบ → flood ตัดได้ (ไม่ต้องวัดรูปทรงมือแบบเดิม)
        # **ไม่มีแถบเมนูล่าง/กล่องสรุปในอาร์ตแล้ว** (user 2026-07-15: ไม่เอาแถบเมนู) → SU_NAV/su-sum ถูกถอด
        'src': 'startup hub win new.png', 'mode': 'flood', 'tol': 9.0,
        'wipes': [], 'wipe_interior': True,
        'sample_top': (0.20, 0.22, 0.80, 0.26),
        'sample_bot': (0.20, 0.78, 0.80, 0.82),
        'grad_top': (14, 34, 66), 'grad_bot': (6, 17, 40),
    },
    'green': {
        # อาร์ตใหม่ 2026-07-15 (green invest win new.png) = กรอบเปล่าเขียว-ทอง + แผงโซลาร์/กังหันมุมซ้ายบน
        # + ป้าย GREEN INVEST + ปุ่ม X · ข้างในสะอาด → ไม่ wipe, ย้อมช่องเปิดเป็นเขียวเข้ม
        # เนื้อหา 3 คอลัมน์ตามตัวอย่าง green invest win.png (ไม่เอาแท็บ OVERVIEW/MY PORTFOLIO)
        'src': 'green invest win new.png', 'mode': 'flood', 'tol': 9.0,
        'wipes': [], 'wipe_interior': True,
        'sample_top': (0.20, 0.26, 0.80, 0.30),
        'sample_bot': (0.20, 0.80, 0.80, 0.84),
        'grad_top': (18, 50, 26), 'grad_bot': (8, 28, 15),
    },
}


def cut_background(img, tol):
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
    fg = ndimage.binary_fill_holes(fg)

    er = ndimage.binary_erosion(fg, iterations=1)
    return Image.fromarray((er * 255).astype(np.uint8), 'L').filter(ImageFilter.GaussianBlur(1.0))


def interior_region(img, tol):
    """ช่องเปิดด้านในกรอบ = ก้อน 'พื้นเรียบ' ที่ใหญ่สุดซึ่ง **ไม่ติดขอบภาพ**
    (ก้อนที่ติดขอบ = ฉากหลังรอบกรอบ) — ได้ mask พอดีรูเป๊ะทุกพิกเซล
    ใช้แทนการเดา rect/รัศมีมุม: กรอบใหม่มีมุมโค้ง/ตัดเฉียง rect ตรงๆ จะกินอาร์ตขอบ"""
    a = np.asarray(img.convert('RGB'), dtype=np.float32)
    h, w = a.shape[:2]
    diff = np.zeros((h, w), dtype=np.float32)
    d = np.abs(a[:, 1:] - a[:, :-1]).max(axis=2)
    diff[:, 1:] = np.maximum(diff[:, 1:], d); diff[:, :-1] = np.maximum(diff[:, :-1], d)
    d = np.abs(a[1:, :] - a[:-1, :]).max(axis=2)
    diff[1:, :] = np.maximum(diff[1:, :], d); diff[:-1, :] = np.maximum(diff[:-1, :], d)

    lab, n = ndimage.label(diff <= tol)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])).tolist())
    best, bestsz = 0, 0
    for i in range(1, n + 1):
        if i in border:
            continue
        sz = int((lab == i).sum())
        if sz > bestsz:
            best, bestsz = i, sz
    if not best:
        raise RuntimeError('interior region not found')
    # ขยาย 2 px ให้กินขอบ antialias ของพื้นเดิม (ไม่ถึงเส้นขอบกรอบ)
    return ndimage.binary_dilation(lab == best, iterations=2)


def wipe_interior(img, cfg, soft=None):
    """soft = ภาพต้นฉบับ "ยังไม่ sharpen" — ใช้ตรวจพื้นเรียบเท่านั้น
    (img ผ่าน UnsharpMask มาแล้ว มี noise → หาช่องเปิดด้านในไม่เจอ)"""
    W, H = img.size
    a = np.asarray(img.convert('RGB'), dtype=np.float32)

    def med(r):
        return np.median(a[int(r[1] * H):int(r[3] * H), int(r[0] * W):int(r[2] * W)], axis=(0, 1))
    # สีไล่เฉดกำหนดเองชนะ sample (พื้นเรียบแน่นอน ไม่ติดโซนเปื้อน)
    top = np.array(cfg['grad_top'], dtype=np.float32) if 'grad_top' in cfg else med(cfg['sample_top'])
    bot = np.array(cfg['grad_bot'], dtype=np.float32) if 'grad_bot' in cfg else med(cfg['sample_bot'])

    mask = np.zeros((H, W), dtype=np.float32)
    for (fx0, fy0, fx1, fy1) in cfg['wipes']:
        mask[int(fy0 * H):int(fy1 * H), int(fx0 * W):int(fx1 * W)] = 1.0
    if cfg.get('wipe_interior'):
        mask[interior_region(soft if soft is not None else img, cfg.get('tol', 9.0))] = 1.0
    mask = ndimage.gaussian_filter(mask, 2.0)

    y_lo, y_hi = cfg['sample_top'][1] * H, cfg['sample_bot'][3] * H
    t = np.clip((np.arange(H, dtype=np.float32)[:, None] - y_lo) / max(1.0, (y_hi - y_lo)), 0, 1)
    grad = top[None, None, :] * (1 - t[..., None]) + bot[None, None, :] * t[..., None]
    grad = np.broadcast_to(grad, a.shape)

    a = a * (1 - mask[..., None]) + grad * mask[..., None]
    return Image.fromarray(a.astype(np.uint8), 'RGB')


def apply_patches(img, patches):
    """ซ่อมภาพก่อน wipe/mask (พิกัด px): ลบของตกแต่งที่เกยแผง แล้วสร้างเส้นขอบที่โดนบังขึ้นใหม่"""
    a = np.asarray(img.convert('RGB'), dtype=np.float32)
    for op in patches:
        k = op[0]
        if k == 'vgrad':      # เติม dst ด้วย "สีเฉลี่ยต่อแถว" จากแถบ src — ก๊อปไล่เฉด+เส้นขอบแนวนอนข้ามมา
            d, s = op[1], op[2]
            rows = a[s[1]:s[3], s[0]:s[2]].mean(axis=1)
            idx = np.clip(np.arange(d[1], d[3]) - s[1], 0, rows.shape[0] - 1)
            a[d[1]:d[3], d[0]:d[2]] = rows[idx][:, None, :]
        elif k == 'hgrad':    # เติม dst ด้วย "สีเฉลี่ยต่อคอลัมน์" จากแถบ src — ก๊อปเส้นขอบแนวตั้ง
            d, s = op[1], op[2]
            cols = a[s[1]:s[3], s[0]:s[2]].mean(axis=0)
            idx = np.clip(np.arange(d[0], d[2]) - s[0], 0, cols.shape[0] - 1)
            a[d[1]:d[3], d[0]:d[2]] = cols[idx][None, :, :]
        elif k == 'corner':   # วาดมุมโค้งเส้นขอบ: สีตามระยะจากขอบนอก (โปรไฟล์จากแถบขอบตั้งที่สะอาด)
            (cx, cy, r), s = op[1], op[2]
            prof = a[s[1]:s[3], s[0]:s[2]].mean(axis=0)          # ระยะ 0 (ขอบนอก) → r (ด้านใน)
            x0, y0 = cx - r, cy - r
            yy, xx = np.mgrid[y0:cy, x0:cx]
            dist = r - np.hypot(xx - cx, yy - cy)
            m = dist >= 0
            di = np.clip(dist.astype(int), 0, prof.shape[0] - 1)
            blk = a[y0:cy, x0:cx]
            blk[m] = prof[di[m]]
        elif k == 'mirror':   # ก๊อป src พลิกซ้าย↔ขวา ไปวางที่มุม (px,py) — ใช้สร้างปลายป้ายอีกฝั่ง
            (px, py), s = op[1], op[2]
            blk = a[s[1]:s[3], s[0]:s[2]][:, ::-1]
            a[py:py + blk.shape[0], px:px + blk.shape[1]] = blk
    return Image.fromarray(a.astype(np.uint8), 'RGB')


def build_shape_mask(img, shapes, feather=1.4):
    """alpha จาก union ของรูปทรงที่วัดมือ (px) — 'flood' = ตัดจากฉากหลังเรียบเฉพาะกรอบเล็กๆ"""
    from PIL import ImageDraw
    m = Image.new('L', img.size, 0)
    d = ImageDraw.Draw(m)
    for sh in shapes:
        if sh[0] == 'rrect':
            d.rounded_rectangle(sh[1], radius=sh[2], fill=255)
        elif sh[0] == 'circle':
            (cx, cy), r = sh[1], sh[2]
            d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=255)
        elif sh[0] == 'flood':
            box, tol = sh[1], sh[2]
            al = cut_background(img.crop(box), tol)
            m.paste(al, (box[0], box[1]), al)
    return m.filter(ImageFilter.GaussianBlur(feather))


def checker(cw, ch):
    pv = Image.new('RGB', (cw, ch), (90, 60, 120))
    for yy in range(0, ch, 64):
        for xx in range(0, cw, 64):
            if (xx // 64 + yy // 64) % 2 == 0:
                pv.paste((60, 40, 84), (xx, yy, min(xx + 64, cw), min(yy + 64, ch)))
    return pv


def main():
    # arg1 = โฟลเดอร์พรีวิว (ไม่บังคับ) · arg2 = id เดียวที่ต้องการ regenerate (ไม่บังคับ เช่น "bank")
    preview_dir = sys.argv[1] if len(sys.argv) > 1 else None
    only = sys.argv[2] if len(sys.argv) > 2 else None
    os.makedirs(OUT_DIR, exist_ok=True)
    if preview_dir:
        os.makedirs(preview_dir, exist_ok=True)

    for wid, cfg in WINDOWS.items():
        if only and wid != only:
            continue
        orig = Image.open(os.path.join(WIN_DIR, cfg['src']))
        W, H = orig.size
        # เพิ่มความคมชัด: unsharp เฉพาะ RGB ที่จะแสดง — mask/flood ต้องใช้ภาพนุ่มเดิม
        # (sharpen ทำให้พื้นเรียบมี noise → flood-fill ตรวจ bg พัง)
        img = orig.convert('RGB').filter(ImageFilter.UnsharpMask(radius=2, percent=80, threshold=2))
        if cfg.get('patches'):
            img = apply_patches(img, cfg['patches'])   # ซ่อมก่อน wipe (แหล่งโคลนต้องยังไม่โดน wipe)
        rgb = wipe_interior(img, cfg, soft=orig)

        if cfg['mode'] == 'flood':
            alpha = cut_background(orig, cfg['tol'])
            out = rgb.convert('RGBA')
            out.putalpha(alpha)
            am = np.asarray(alpha)
            ys, xs = np.where(am > 10)
            x0, x1 = max(0, xs.min() - 2), min(W, xs.max() + 3)
            y0, y1 = max(0, ys.min() - 2), min(H, ys.max() + 3)
            out = out.crop((x0, y0, x1, y1))
        elif cfg['mode'] == 'shape':
            alpha = build_shape_mask(orig, cfg['shapes'])
            out = rgb.convert('RGBA')
            out.putalpha(alpha)
            x0, y0, x1, y1 = 0, 0, W, H   # ไม่ crop — คงขนาด/สัดส่วนเดิม (hotspot % เดิมใช้ได้)
        else:
            out = rgb.convert('RGBA')
            x0, y0, x1, y1 = 0, 0, W, H

        path = os.path.join(OUT_DIR, wid + '_frame.png')
        out.save(path)
        cw, ch = out.size
        print('%-11s crop (%d,%d)-(%d,%d) -> %dx%d aspect %.4f' % (wid, x0, y0, x1, y1, cw, ch, cw / ch))
        # wipe rects เทียบเป็น % ของภาพ crop (เอาไปวาง .wa-body ใน CSS)
        for r in cfg['wipes']:
            print('   wipe -> x %.1f..%.1f%%  y %.1f..%.1f%%' % (
                100 * (r[0] * W - x0) / cw, 100 * (r[2] * W - x0) / cw,
                100 * (r[1] * H - y0) / ch, 100 * (r[3] * H - y0) / ch))

        if preview_dir:
            pv = checker(cw, ch)
            pv.paste(out, (0, 0), out)
            pv.save(os.path.join(preview_dir, wid + '_preview.png'))

    if preview_dir:
        print('previews ->', preview_dir)


if __name__ == '__main__':
    main()
