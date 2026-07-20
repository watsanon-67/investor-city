# -*- coding: utf-8 -*-
"""
make_cards.py — แปลงการ์ดอาชีพ 8 ใบ (assets/card/*.png จาก user, ตัวหนังสือ AI เพี้ยน 5 ใบ)
เป็น assets/card/cut/<profId>.png พื้นโปร่งใส พร้อมทับข้อความไทยอ่านออกตัวใหญ่สุด

วิธี:
  • 5 ใบเพี้ยน (media/whale/short/tiger/sec) = mask สี่เหลี่ยมมุมโค้ง manual (flood ใช้ไม่ได้ —
    ขอบการ์ดสีเนวี่กลืนกับ bg มืด) + wipe โซนข้อความเดิม (สุ่มสีพื้นจาก median พิกเซลสว่าง/มืดในโซน)
    แล้ววาดข้อความใหม่ด้วย leelawdb.ttf (ไม่มี raqm — ตรวจสระ/วรรณยุกต์ด้วยตาแล้ว)
  • 3 ใบอ่านออก (banker/mafia/hacker) = flood-fill ตัด bg อย่างเดียว ไม่แตะข้อความ
  • back.png = หลังการ์ดวาดเอง (ใช้ตอนอนิเมชันแจกไพ่)
รัน:  python tools/make_cards.py   → เขียน cut/*.png + พรีวิว _sheet.png บนลายหมากรุก
"""
import os
from collections import deque
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np
from scipy.ndimage import label, binary_dilation

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'card')
OUT = os.path.join(SRC, 'cut')
FONT = r'C:\Windows\Fonts\leelawdb.ttf'

NAVY = (18, 30, 74)
INK = (23, 33, 52)

# PIL ไม่มี raqm → วรรณยุกต์ที่ตามหลังสระบน (ที่/เมื่อ/นี้/ตั้ง) จะวาดทับสระจนมองไม่เห็น
# แก้โดยดึงวรรณยุกต์ออกจากสตริงหลัก แล้ววาดแยกแบบยกสูงเหนือสระ (ตรวจตำแหน่งด้วยตาแล้ว)
ABOVE = set('ัิีึื็')
TONE = set('่้๊๋์')


def draw_thai(d, pos, text, font, fill):
    base, marks = [], []
    for ch in text:
        if ch in TONE and base and base[-1] in ABOVE:
            marks.append((font.getlength(''.join(base)), ch))
        else:
            base.append(ch)
    d.text(pos, ''.join(base), font=font, fill=fill)
    ry = font.size * 0.17
    for dx, ch in marks:
        d.text((pos[0] + dx, pos[1] - ry), ch, font=font, fill=fill)

# ---------- ข้อความใหม่ (ย่อสั้นสุดแต่ครบกติกาใน attacks.js) ----------
CARDS = {
    'media': {
        'file': 'เจ้าพ่อสื่อ.png', 'rect': (55, 79, 966, 1338), 'r': 46,
        'skill_head': (186, 581, 472, 646),
        'panel': (86, 654, 938, 1002),
        'name': 'ยัดข่าวปลอม',
        'bullets': ['แอบดูการ์ดข่าวสุ่ม 1 ใบของเป้า',
                    'เลือกสลับกับกองข่าว หรือวางคืน — เป้าไม่รู้',
                    'เป้าไม่มีข่าว = เราจั่วข่าวฟรี 1 ใบ'],
        'ctr_head': (174, 1046, 560, 1106),
        'ctr': (258, 1128, 935, 1282),
        'ctr_text': ["กันท่า 'เจาะระบบ'", 'ของนักสืบไซเบอร์'],
    },
    'whale': {
        'file': 'วาฬคริปโต.png', 'rect': (55, 79, 966, 1307), 'r': 46,
        'skill_head': (186, 600, 478, 670),
        'panel': (86, 678, 938, 986),
        'name': 'เทใส่',
        'bullets': ['คริปโตในพอร์ตเป้าหายทันที 20%',
                    'ครึ่งของที่หาย (10%) เข้ากระเป๋าเราเป็นเงินสด',
                    'ใช้ได้เมื่อเป้าถือคริปโตเท่านั้น'],
        'ctr_head': (174, 1026, 508, 1090),
        'ctr': (262, 1102, 935, 1246),
        'ctr_text': ["กันท่า 'ยัดข่าวปลอม'", 'ของเจ้าพ่อสื่อ'],
    },
    'short': {
        'file': 'สายชอร์ต.png', 'rect': (50, 80, 972, 1307), 'r': 46,
        'skill_head': (186, 598, 482, 668),
        'panel': (86, 672, 936, 990),
        'name': 'ชอร์ตพอร์ต',
        'bullets': ['เป้าจ่ายเรา 10% ของสินทรัพย์ก้อนใหญ่สุด',
                    'เพดาน ฿1,500 · นับเงินฝากธนาคารด้วย',
                    'เงินสดไม่พอ = เป้าถูกบังคับขาย −10%'],
        'ctr_head': (174, 1026, 508, 1090),
        'ctr': (262, 1100, 930, 1250),
        'ctr_text': ["กันท่า 'เทใส่'", 'ของวาฬคริปโต'],
    },
    'tiger': {
        'file': 'เสือนอนกิน.png', 'rect': (50, 80, 972, 1203), 'r': 46,
        'skill_head': (186, 546, 482, 616),
        'panel': (86, 622, 936, 896),
        'name': 'ฮุบที่ดิน',
        'bullets': ['บังคับซื้ออสังหาเป้า 1 แปลง ที่ราคา −15%',
                    'เป้าปฏิเสธได้ โดยจ่ายค่ายอมความ ฿500'],
        'ctr_head': (174, 929, 522, 994),
        'ctr': (268, 1002, 930, 1140),
        'ctr_text': ["กันท่า 'ชอร์ตพอร์ต'", 'ของสายชอร์ต'],
    },
    'sec': {
        'file': 'กลต.png', 'rect': (153, 146, 869, 1266), 'r': 40,
        'panel': (180, 826, 852, 1086), 'panel_ink': (42, 33, 24),
        'bullets': ['เทิร์นถัดไปของเป้า: ห้ามทุกธุรกรรม',
                    'ห้ามโจมตี · เดินแมพได้อย่างเดียว',
                    'เป้ายัง challenge / เคาน์เตอร์ได้'],
        'ctr': (332, 1100, 852, 1212),
        'ctr_text': ['เคาน์เตอร์เมื่อโดน:', "กันท่า 'ข่มขู่' ของมาเฟียเงินกู้"],
    },
    # 3 ใบนี้ตัวหนังสือในอาร์ตอ่านออก+ตรงกติกาแล้ว — ตัด bg อย่างเดียว
    'banker': {'file': 'นายแบงค์.png', 'flood': True},
    'mafia': {'file': 'มาเฟียเงินกู้.png', 'flood': True},
    'hacker': {'file': 'นักสืบไซเบอร์.png', 'flood': True},
}


# ---------- helpers ----------
def rounded_alpha(size, rect, r):
    m = Image.new('L', size, 0)
    ImageDraw.Draw(m).rounded_rectangle(rect, radius=r, fill=255)
    return m.filter(ImageFilter.GaussianBlur(1.2))


def flood_alpha(im, tol=26):
    """bg สม่ำเสมอ (ดำ/ขาว/เนวี่เรียบ): flood จากขอบเทียบเพื่อนบ้าน → เก็บก้อน fg ใหญ่สุด"""
    a = np.asarray(im.convert('RGB'), dtype=np.int16)
    h, w, _ = a.shape
    seen = np.zeros((h, w), dtype=bool)
    seeds = []
    for x in range(w):
        seeds += [(0, x), (h - 1, x)]
    for y in range(h):
        seeds += [(y, 0), (y, w - 1)]
    q = deque()
    for sy, sx in seeds:
        if not seen[sy, sx]:
            seen[sy, sx] = True
            q.append((sy, sx))
    while q:
        y, x = q.popleft()
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < h and 0 <= nx < w and not seen[ny, nx]:
                if np.abs(a[ny, nx] - a[y, x]).max() <= tol:
                    seen[ny, nx] = True
                    q.append((ny, nx))
    fg = ~seen
    lab, n = label(fg)
    if n:
        sizes = np.bincount(lab.ravel()); sizes[0] = 0
        fg = lab == sizes.argmax()
    # กันรูโปร่งในตัวการ์ด (ข้อความสีเดียว bg หลุดเป็นเกาะ): เติมรูที่ไม่ติดขอบภาพ
    holes, hn = label(~fg)
    edge_ids = set(holes[0, :]) | set(holes[-1, :]) | set(holes[:, 0]) | set(holes[:, -1])
    for i in range(1, hn + 1):
        if i not in edge_ids:
            fg |= holes == i
    m = Image.fromarray((fg * 255).astype(np.uint8))
    m = m.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(1.0))
    return m


def sample_fill(im, rect, want='light'):
    """สีพื้นสำหรับ wipe: median ของพิกเซลสว่างสุด (พื้นกระดาษ) หรือมืดสุด (แบนเนอร์เนวี่) ในโซน"""
    a = np.asarray(im.convert('RGB').crop(rect), dtype=np.uint8).reshape(-1, 3)
    v = a.astype(np.int32).sum(1)
    if want == 'light':
        pick = a[v >= np.percentile(v, 70)]
    else:
        pick = a[v <= np.percentile(v, 30)]
    return tuple(int(c) for c in np.median(pick, axis=0))


def font_fit(text, max_w, start, min_size=24):
    size = start
    while size > min_size:
        f = ImageFont.truetype(FONT, size)
        if f.getlength(text) <= max_w:
            return f
        size -= 2
    return ImageFont.truetype(FONT, min_size)


def wrap_text(text, f, max_w):
    words = text.split(' ')
    lines, cur = [], ''
    for wd in words:
        t = (cur + ' ' + wd).strip()
        if f.getlength(t) <= max_w or not cur:
            cur = t
        else:
            lines.append(cur); cur = wd
    if cur:
        lines.append(cur)
    return lines


def draw_bullets(d, bullets, rect, ink, start_size):
    """วาด bullet list ให้ 'ใหญ่สุดที่ยังพอดีกล่อง' — ลดขนาดจนความสูงรวมไม่ล้น"""
    x0, y0, x1, y1 = rect
    size = start_size
    while size > 24:
        f = ImageFont.truetype(FONT, size)
        lh = int(size * 1.42)
        lines = []
        for b in bullets:
            ws = wrap_text(b, f, (x1 - x0) - int(size * 1.2))
            for i, ln in enumerate(ws):
                lines.append(('• ' + ln) if i == 0 else ('   ' + ln))
        if len(lines) * lh <= (y1 - y0):
            y = y0 + max(0, ((y1 - y0) - len(lines) * lh) // 2)
            for ln in lines:
                draw_thai(d, (x0, y), ln, f, ink)
                y += lh
            return size
        size -= 2
    return size


def center_text(d, text, rect, f, fill):
    x0, y0, x1, y1 = rect
    bb = d.textbbox((0, 0), text, font=f)
    d.text((x0 + ((x1 - x0) - (bb[2] - bb[0])) / 2 - bb[0],
            y0 + ((y1 - y0) - (bb[3] - bb[1])) / 2 - bb[1]), text, font=f, fill=fill)


# ---------- การ์ดหลัง (ใช้ตอนแจกไพ่) ----------
def make_back(path):
    W, H = 720, 1000
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((6, 6, W - 6, H - 6), radius=44, fill=(17, 26, 58, 255), outline=(212, 175, 85, 255), width=8)
    d.rounded_rectangle((28, 28, W - 28, H - 28), radius=32, outline=(212, 175, 85, 200), width=3)
    # ลายเพชรจางๆ
    step = 56
    for yy in range(40, H - 40, step):
        for xx in range(40 + (yy // step % 2) * step // 2, W - 40, step):
            d.polygon([(xx, yy - 12), (xx + 12, yy), (xx, yy + 12), (xx - 12, yy)],
                      outline=(78, 96, 150, 90))
    cx, cy = W // 2, H // 2
    d.ellipse((cx - 130, cy - 130, cx + 130, cy + 130), fill=(24, 36, 78, 255), outline=(212, 175, 85, 255), width=6)
    f1 = ImageFont.truetype(FONT, 96)
    f2 = ImageFont.truetype(FONT, 40)
    center_text(d, 'IC', (cx - 130, cy - 150, cx + 130, cy + 80), f1, (233, 200, 120))
    center_text(d, '🏙', (cx - 130, cy - 10, cx + 130, cy + 110), f2, (233, 200, 120))
    center_text(d, 'INVESTOR CITY', (0, H - 132, W, H - 72), f2, (172, 186, 224))
    im.save(path)


# ---------- main ----------
def run():
    os.makedirs(OUT, exist_ok=True)
    outs = []
    for cid, cfg in CARDS.items():
        im = Image.open(os.path.join(SRC, cfg['file'])).convert('RGB')

        if cfg.get('flood'):
            alpha = flood_alpha(im)
            rgba = im.convert('RGBA'); rgba.putalpha(alpha)
            bbox = alpha.getbbox()
            rgba = rgba.crop(bbox)
        else:
            d = ImageDraw.Draw(im)
            ink = cfg.get('panel_ink', INK)

            # หัวข้อ "สกิลโจมตี" / "เคาน์เตอร์เมื่อโดน" บนแบนเนอร์เนวี่ (เฉพาะเทมเพลต 4 ใบ)
            if 'skill_head' in cfg:
                hf = sample_fill(im, cfg['skill_head'], 'dark')
                d.rectangle(cfg['skill_head'], fill=hf)
                f = font_fit('สกิลโจมตี', cfg['skill_head'][2] - cfg['skill_head'][0] - 10, 54)
                draw_thai(d, (cfg['skill_head'][0] + 5, cfg['skill_head'][1] +
                          (cfg['skill_head'][3] - cfg['skill_head'][1] - f.size * 1.35) / 2), 'สกิลโจมตี', f, (255, 255, 255))
            if 'ctr_head' in cfg:
                hf = sample_fill(im, cfg['ctr_head'], 'dark')
                d.rectangle(cfg['ctr_head'], fill=hf)
                t = 'เคาน์เตอร์เมื่อโดน'
                f = font_fit(t, cfg['ctr_head'][2] - cfg['ctr_head'][0] - 10, 50)
                draw_thai(d, (cfg['ctr_head'][0] + 5, cfg['ctr_head'][1] +
                          (cfg['ctr_head'][3] - cfg['ctr_head'][1] - f.size * 1.35) / 2), t, f, (255, 255, 255))

            # แผงสกิล: wipe แล้ววาด ชื่อท่า + bullets ใหม่
            px0, py0, px1, py1 = cfg['panel']
            fill = sample_fill(im, cfg['panel'], 'light')
            d.rectangle(cfg['panel'], fill=fill)
            if 'name' in cfg:  # sec ชื่อท่าเดิมอ่านออก ไม่ต้องวาด
                nf = font_fit(cfg['name'], (px1 - px0) - 20, 82)
                draw_thai(d, (px0 + 12, py0 + 8), cfg['name'], nf, NAVY)
                by0 = py0 + 8 + int(nf.size * 1.5)
            else:
                by0 = py0
            draw_bullets(d, cfg['bullets'], (px0 + 12, by0, px1 - 12, py1 - 8), ink, 48)

            # โซนเคาน์เตอร์ (ขวาของโล่)
            cx0, cy0, cx1, cy1 = cfg['ctr']
            cfill = sample_fill(im, cfg['ctr'], 'light')
            d.rectangle(cfg['ctr'], fill=cfill)
            n = len(cfg['ctr_text'])
            for i, t in enumerate(cfg['ctr_text']):
                f = font_fit(t, (cx1 - cx0) - 16, 58 if cid != 'sec' else 48)
                seg_h = (cy1 - cy0) / n
                draw_thai(d, (cx0 + 8, cy0 + i * seg_h + (seg_h - f.size * 1.4) / 2), t, f, ink if cid == 'sec' else NAVY)

            alpha = rounded_alpha(im.size, cfg['rect'], cfg['r'])
            rgba = im.convert('RGBA'); rgba.putalpha(alpha)
            rgba = rgba.crop(cfg['rect'])

        # ทุกใบจบที่ 720×1000 เท่ากับหลังการ์ด (user 2026-07-19: การ์ดต้องขนาดเท่ากันทุกใบ)
        #   crop ต้นฉบับสัดส่วนไม่เท่ากัน (สูง 876-1160 ที่กว้าง 720) → ยืด/บีบตรงๆ
        #   ใบสุดขั้ว (tiger/hacker) เพี้ยน ~14% — ตรวจตาใน _sheet.png แล้วรับได้
        rgba = rgba.resize((720, 1000), Image.LANCZOS)
        p = os.path.join(OUT, cid + '.png')
        rgba.save(p)
        outs.append((cid, rgba))
        print('saved', cid, rgba.size)

    make_back(os.path.join(OUT, 'back.png'))
    outs.append(('back', Image.open(os.path.join(OUT, 'back.png'))))

    # พรีวิวบนลายหมากรุก (เช็คขอบโปร่ง + ข้อความ)
    th = 480
    tiles = []
    for cid, img in outs:
        r = img.resize((int(img.width * th / img.height), th), Image.LANCZOS)
        tiles.append(r)
    W = sum(t.width for t in tiles) + 10 * (len(tiles) + 1)
    sheet = Image.new('RGB', (W, th + 20), (90, 90, 90))
    dch = ImageDraw.Draw(sheet)
    for yy in range(0, th + 20, 20):
        for xx in range(0, W, 20):
            if (xx // 20 + yy // 20) % 2 == 0:
                dch.rectangle((xx, yy, xx + 19, yy + 19), fill=(120, 120, 120))
    x = 10
    for t in tiles:
        sheet.paste(t, (x, 10), t)
        x += t.width + 10
    sheet.save(os.path.join(OUT, '_sheet.png'))
    print('sheet done')


if __name__ == '__main__':
    run()
