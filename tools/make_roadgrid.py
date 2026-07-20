# -*- coding: utf-8 -*-
"""
make_roadgrid.py — สร้าง navigation grid "ผิวถนน" จาก assets/newestmap.png → js/roadgrid.js
ใช้กับระบบเดินตามถนนจริง (2026-07-18): เกมทำ A* บน grid นี้แทนกราฟโหนดเดิม
(กราฟเส้นตรงใช้ไม่ได้ — ถนนในแมปโค้ง/เพอร์สเปกทีฟ เส้นตรงระหว่างแยกหลุดถนนตลอด)

grid: 240×135 เซลล์ เซลล์ละ 4 world px (โลก 960×540) · bit=1 = เหยียบได้ (แอสฟัลต์+สะพาน+ลานหิน)
encode: แถวละ 30 ไบต์ (240 บิต MSB-first) → base64 ทั้งก้อนใน js/roadgrid.js (SC.roadGrid)
รัน: python tools/make_roadgrid.py → เขียน js/roadgrid.js + พรีวิว assets แสดงใน scratchpad ไม่มี
"""
import os
import base64
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAP = os.path.join(ROOT, 'assets', 'newestmap.png')
OUT = os.path.join(ROOT, 'js', 'roadgrid.js')
PREVIEW = os.path.join(ROOT, 'assets', 'roadgrid_preview.png')

CELL = 4          # world px ต่อเซลล์
GW, GH = 240, 135  # 960/4 × 540/4

im = Image.open(MAP).convert('RGB')
iw, ih = im.size
a = np.asarray(im, dtype=np.int16)
mx = a.max(2)
mn = a.min(2)
sat = mx - mn
# แอสฟัลต์ = เทา desaturate · สะพานไม้ = น้ำตาลอุ่น (ข้ามคลองตะวันออก)
road = (sat < 30) & (mx > 75) & (mx < 165)
r, g, b = a[..., 0], a[..., 1], a[..., 2]
bridge = (r > 120) & (r < 190) & (r - b > 35) & (r - b < 100) & (g > b) & (r - g < 55)
m = road | bridge
m[:150, :] = False  # ฟ้า/ภูเขาตอนบน
st8 = ndi.generate_binary_structure(2, 2)
m = ndi.binary_closing(m, ndi.iterate_structure(st8, 2))
m = ndi.binary_opening(m, ndi.iterate_structure(st8, 2))
lab, n = ndi.label(m)
sz = np.bincount(lab.ravel())
sz[0] = 0
m = lab == sz.argmax()

# world grid: เซลล์เดินได้ถ้าสัดส่วนพิกเซลถนนในเซลล์ ≥ 0.32
sx, sy = iw / 960.0, ih / 540.0
grid = np.zeros((GH, GW), dtype=bool)
for gy in range(GH):
    y0, y1 = int(gy * CELL * sy), int((gy + 1) * CELL * sy)
    for gx in range(GW):
        x0, x1 = int(gx * CELL * sx), int((gx + 1) * CELL * sx)
        grid[gy, gx] = m[y0:y1, x0:x1].mean() >= 0.32

# เก็บก้อนใหญ่สุดก้อนเดียว (กันเกาะหลุดที่ A* ไปไม่ถึง)
glab, gn = ndi.label(grid, structure=np.ones((3, 3)))
gsz = np.bincount(glab.ravel())
gsz[0] = 0
grid = glab == gsz.argmax()
print('grid walkable frac', round(float(grid.mean()), 4))

packed = np.packbits(grid, axis=1)  # (135, 30) MSB-first
b64 = base64.b64encode(packed.tobytes()).decode('ascii')
js = (
    '// ============================================================\n'
    '// roadgrid.js — grid ผิวถนนของ newestmap.png (สร้างโดย tools/make_roadgrid.py ห้ามแก้มือ)\n'
    '//   240×135 เซลล์ × 4 world px · bit=1 = เหยียบได้ · แถวละ 30 ไบต์ MSB-first → base64\n'
    '//   ใช้โดย map.js: A* เดินตามถนนจริง + clamp WASD (2026-07-18)\n'
    '// ============================================================\n'
    'SC.roadGrid = {\n'
    '  w: %d, h: %d, cell: %d,\n'
    "  data: '%s',\n"
    '};\n' % (GW, GH, CELL, b64)
)
open(OUT, 'w', encoding='utf-8').write(js)
print('wrote', OUT, len(b64), 'chars')

# พรีวิว: grid ทับแมป
ov = np.asarray(im).copy()
gy, gx = np.where(grid)
for yy, xx in zip(gy, gx):
    y0, y1 = int(yy * CELL * sy), int((yy + 1) * CELL * sy)
    x0, x1 = int(xx * CELL * sx), int((xx + 1) * CELL * sx)
    ov[y0:y1, x0:x1] = (ov[y0:y1, x0:x1] * 0.55 + np.array([0, 220, 255]) * 0.45).astype(np.uint8)
Image.fromarray(ov).save(PREVIEW)
print('preview', PREVIEW)
