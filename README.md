# Investor City

เกม **จำลองการลงทุน + บลัฟสไตล์ Coup** เล่นบนเบราว์เซอร์ (ผู้เล่น 1 คน vs บอท 2-5 ตัว)
vanilla JS ล้วน ไม่มี build step · UI/คอมเมนต์ภาษาไทย · ทุกไฟล์ใช้ namespace `SC` ร่วมกัน

> ⚠️ ข้อมูลหุ้นทั้งหมดเป็นข้อมูลจำลองเพื่อการเรียนรู้ ไม่ใช่ราคาเรียลไทม์ และไม่ใช่คำแนะนำการลงทุน

## 🎮 เล่นออนไลน์

**https://USERNAME.github.io/investor-city/**
*(แทน `USERNAME` ด้วยชื่อบัญชี GitHub ของคุณหลัง deploy)*

## วิธีรันในเครื่อง

**เปิด `index.html` ตรงๆ ได้เลย** (เกมเป็น 2D canvas ล้วน ไม่ต้องใช้ server)

ข้อยกเว้นเดียว: การย้อมสีชุดตัวละคร (`js/sprite.js` อ่านพิกเซลสไปรต์) ถูกเบราว์เซอร์บล็อกบน `file://`
→ ถ้าอยากเห็นชุดที่ออกแบบเอง ให้เสิร์ฟผ่าน http แทน:

```bash
node tools/serve.js 8080     # static server เล็กๆ ไม่ต้องลงอะไร
```

## เอกสารที่เป็นแหล่งอ้างอิงจริง

| ไฟล์ | เนื้อหา |
|------|---------|
| `GAME_SPEC.md` | **สเปกลูปเกมปัจจุบัน** (อาชีพลับ + ข่าว + เทิร์น 2 เฟส) — ทับกติกาเก่าทั้งหมด |
| `GAME_OVERVIEW.md` | ภาพรวมระบบทั้งเกม + โครงไฟล์ปัจจุบัน |
| `EVENTS_SPEC111.md` | ระบบเหตุการณ์สุ่ม |
| `greenhub-founder-mode-gdd.md` | โมดูล Startup Hub × Green Invest |
| `StockCity1_GDD.md` | GDD ต้นฉบับ (บางส่วนล้าสมัย — ยึด GAME_SPEC ก่อน) |

## Core loop โดยย่อ

เริ่มเกมด้วยเงิน **฿10,000** + การ์ดอาชีพลับ 2 ใบ (จาก 8 อาชีพ × 3 = 24 ใบ) · เล่น 5-30 รอบ (เลือกได้)

แต่ละเทิร์นมี 2 เฟส:

1. **เฟสโจมตี** (ไม่จับเวลา) — ใช้ท่าของอาชีพ (จะอ้างอาชีพที่ไม่มีก็ได้ = บลัฟ) หรือข้ามรับเงินเดือน ฿300
   เป้าตอบได้ใน 10 วิ: ยอม / Challenge / Counter
2. **เฟสแมพ 60 วิ** — เดินในเมือง คลิกตึก → เดินถึงแล้วหน้าต่างตึกเด้ง → ซื้อ-ขายสินทรัพย์
   (หุ้น · คริปโต · ทอง · อสังหา · พันธบัตร/กองทุน · ธนาคาร · ข่าว · ธุรกิจ GreenHub)

ระหว่างเกมมี **เหตุการณ์สุ่ม** และ **ภัยพิบัติที่ปิดตึกชั่วคราว** (อุกกาบาต / พายุ / UFO / นกชนเซิร์ฟเวอร์)
จบครบรอบ → ใครมูลค่าสุทธิสูงสุดชนะ + เฉลยการ์ดทุกคนและไทม์ไลน์การโกหก

## โครงไฟล์

```
stock-city/
├── index.html            ← เปิดไฟล์นี้เพื่อเล่น (ลำดับ <script> สำคัญ)
├── css/style.css
├── js/
│   ├── config.js          ★ ค่าจูนเกมทั้งหมดอยู่ที่นี่ที่เดียว
│   ├── stocks.js          หุ้น + สูตรราคา/ปันผล
│   ├── professions.js     การ์ดอาชีพ 8 แบบ + วงจรเคาน์เตอร์ + อาร์ตการ์ด
│   ├── characters.js      ตัวละครบนแมป
│   ├── designer.js        หน้าออกแบบตัวละคร (สี/ชื่อ, เก็บ localStorage)
│   ├── sprite.js          โหลด/ย้อมสีสไปรต์
│   ├── gameState.js       state กลาง + ซื้อขาย + คำนวณพอร์ต
│   ├── ui.js              HUD / toast / ฟอร์แมตตัวเลข / zoomCard
│   ├── bank.js            กู้-ฝาก-ดอกเบี้ย
│   ├── newsSys.js         ข่าวสาธารณะ + การ์ดข่าววงใน + ข่าวลือ
│   ├── markets.js         คริปโต/ทอง/พันธบัตร/กองทุน/อสังหา + รายได้รายสัปดาห์
│   ├── greenhub.js        โมดูลธุรกิจ Startup × Green Invest
│   ├── eventCatalog.js    ข้อมูลเหตุการณ์สุ่ม (ข้อมูลล้วน)
│   ├── events.js          เอนจินเหตุการณ์ + คัตซีนภัยพิบัติ
│   ├── attacks.js         ท่าโจมตี 8 ท่า + ระบบดวล/challenge/counter
│   ├── botBrain.js        สมองบอท (บุคลิก 4 แบบ · ห้ามโกง)
│   ├── roadgrid.js        bitmap ผิวถนน (สร้างจาก tools/make_roadgrid.py — ห้ามแก้มือ)
│   ├── map.js             แมปเมือง + สไปรต์ตึก 9 หลัง + A* เดินตามถนน + เอฟเฟกต์ ambient
│   ├── world2d.js         เอนจิน 2D canvas (เดิน/คลิก/hover/บอทเดิน)
│   ├── windows.js         หน้าต่างตึกทุกบาน (กรอบอาร์ต + เนื้อหา HTML)
│   ├── turn.js            ระบบเทิร์น 2 เฟส
│   ├── resolve.js         ปิดรอบ (ราคาขยับ/ปันผล/ค่าเช่า/ดอกเบี้ย) — เงียบ ไม่มีหน้าสรุป
│   └── main.js            เมนู 3 หน้า + flow เริ่มเกม + จอจบเกม
├── harness_err.html      หน้าทดสอบรวม (ดัก error + โหมดต่างๆ ด้านล่าง)
├── harness_fx.html       หน้าดูอนิเมชันเหตุการณ์/คัตซีน/ตึกปิด
├── assets/               อาร์ตทั้งหมด (แมป/ตึก/การ์ด/หน้าต่าง/เอฟเฟกต์)
└── tools/                สคริปต์ Python เตรียมอาร์ต + serve.js
```

## เครื่องมือทดสอบ (ไม่ต้องเล่นถึงเทิร์น)

`harness_err.html?mode=<โหมด>` — ทุกโหมดดัก error ขึ้นกล่องแดงให้เห็นทันที

| โหมด | ใช้ทำอะไร |
|------|-----------|
| (ไม่ใส่) | เริ่มเกมจริงเข้ารอบ 1 |
| `rounds` (+`&bots=n`) | วิ่งเอนจิน 20 เกม × ทุกรอบ ข้าม UI — เช็คว่าไม่มี error |
| `sim` | จำลอง 1000 เกม ดูสถิติเหตุการณ์ |
| `disaster` | ตรวจโควตาภัยพิบัติต่อเกม |
| `disfire&id=<event>` | ยิงภัยพิบัติกลางเฟสแมพจริง |
| `win&id=<ตึก>` | เปิดหน้าต่างตึกนั้นตรงๆ |
| `attack` / `reveal` / `map` / `menu2` / `menu3` / `designer` | เปิดหน้าจอนั้นๆ ตรงๆ |
| `?evt=<event>` | ยิงเหตุการณ์นั้นต้นรอบ 1 |

`harness_fx.html` — แผงปุ่มยิงเหตุการณ์ทุกตัว, สลับปิด/เปิดตึก, เล่นคัตซีนซ้ำ,
`?pose=0..1&cut=meteor|hurricane|ufo&on=<ตึก>` หยุดเฟรมคัตซีนไว้ตรวจ

แคปหน้าจอตรวจด้วย headless Chrome (Edge เคยล้มเหลวเงียบๆ):

```bash
chrome --headless=new --disable-gpu --user-data-dir=<temp> --window-size=1440,810 \
  --virtual-time-budget=8000 --screenshot=<out.png> "file:///.../stock-city/harness_err.html"
```

## จูนเกม

- **ค่าตัวเลขเกม → `js/config.js` ที่เดียว** (เงินเริ่ม, จำนวนรอบ, เวลาเฟสแมพ, ค่าปรับ challenge, ธนาคาร)
- เหตุการณ์สุ่ม → `js/eventCatalog.js` (`SC.eventsCfg` + แคตตาล็อก)
- ท่าโจมตี → `js/attacks.js` · อาชีพ/วงจรเคาน์เตอร์ → `js/professions.js`
- บุคลิกบอท → `js/botBrain.js` · สินทรัพย์ → `js/markets.js` · ธุรกิจกรีน → `js/greenhub.js`

## Pipeline อาร์ต (Python 3.11 + Pillow/numpy/scipy)

| สคริปต์ | หน้าที่ |
|---------|---------|
| `tools/cut_towers.py` | ตัดพื้นหลังสไปรต์ตึก → `assets/tower/cut/` |
| `tools/make_cards.py` | อาร์ตการ์ดอาชีพ → `assets/card/cut/` (720×1000 ทุกใบ) |
| `tools/make_asset_windows.py` | กรอบหน้าต่างตึกจากอาร์ตที่ user ส่ง → `assets/windows/frames/` |
| `tools/make_window_frame.py` | กรอบหน้าต่าง Stock Market |
| `tools/make_roadgrid.py` | สกัด mask ถนนจากแมป → `js/roadgrid.js` |
| `tools/fit_towers_newmap.py` | หาตำแหน่ง/สเกลตึกบนแมปด้วย template matching |
| `tools/normalize_event_assets.py` | จัดอาร์ตเหตุการณ์ |
| `tools/patch_map.py` | ปะแมปเก่า `map1.png` (legacy) |

⚠️ เกมนี้เป็น **2D เท่านั้น** — ไฟล์/asset ฝั่ง 3D (world3d.js, Three.js, models.glb) ถูกลบออกแล้ว

> อาร์ตในรีโปถูกย่อให้พอดีขนาดที่แสดงจริงเพื่อให้เว็บโหลดเร็ว (235 MB → ~57 MB)
> ต้นฉบับความละเอียดเต็มเก็บไว้นอกรีโปที่ `../assets_originals/`

## 🚀 Deploy ขึ้น GitHub Pages

เกมเป็น static ล้วน → โฮสต์ฟรีบน GitHub Pages ได้ทันที ไม่ต้องมีเซิร์ฟเวอร์

```bash
cd stock-city
git init && git add -A
git commit -m "Investor City"
git branch -M main
git remote add origin https://github.com/USERNAME/investor-city.git
git push -u origin main
```

จากนั้นในหน้า GitHub ของรีโป: **Settings → Pages → Source: Deploy from a branch →
Branch: `main` / `(root)` → Save** · รอ 1-2 นาที เว็บจะขึ้นที่
`https://USERNAME.github.io/investor-city/`

**ข้อควรรู้**

- รีโปต้องเป็น **public** ถ้าใช้ GitHub Pages แบบฟรี (private ต้องมีแพ็กเกจ Pro ขึ้นไป)
- โฟลเดอร์นี้ (`stock-city/`) ต้องเป็น **root ของรีโป** เพราะ Pages เสิร์ฟจาก root หรือ `/docs` เท่านั้น
- อัปเดตเกม = `git add -A && git commit -m "..." && git push` แล้ว Pages เผยแพร่ใหม่เอง
- ทางเลือกอื่นที่ deploy ได้เหมือนกัน: Netlify / Vercel / Cloudflare Pages (ลาก-วางโฟลเดอร์ได้เลย)

## 📄 License

| ส่วน | สัญญาอนุญาต |
|------|-------------|
| **ซอร์สโค้ด** (`*.js`, `*.css`, `*.html`, `tools/*.py`) | [MIT](LICENSE) — เอาไปใช้/แก้/ต่อยอดได้ |
| **อาร์ตทั้งหมด** (`assets/`) | [All Rights Reserved](assets/LICENSE-ART.md) — ห้ามนำไปใช้ในงานอื่น |

**เรื่องการคัดลอกงาน (ตรงๆ):** เกมทำงานฝั่งเบราว์เซอร์ทั้งหมด แปลว่า **ใครก็ตามที่เปิดเว็บได้
ย่อมกด View Source / DevTools อ่านโค้ดและโหลดไฟล์อาร์ตได้เสมอ — ไม่มีวิธีป้องกันทางเทคนิค**
(minify/obfuscate ทำได้แค่ให้อ่านยากขึ้น ไม่ได้กันการคัดลอก)

สิ่งที่ป้องกันได้จริงคือ**ทางกฎหมาย**: LICENSE ประกาศชัดว่าอาร์ตสงวนลิขสิทธิ์
ถ้ามีคนเอาไป re-host หรือใช้ในโปรเจกต์อื่น ถือเป็นการละเมิดลิขสิทธิ์
ยื่น **DMCA takedown** กับ GitHub / โฮสต์ของเขาได้ทันที

ถ้าอนาคตจำเป็นต้องกันจริงจัง ต้องย้ายตรรกะสำคัญไปฝั่งเซิร์ฟเวอร์ (multiplayer/บัญชีผู้เล่น)
ซึ่งเกินขอบเขตเวอร์ชันนี้
