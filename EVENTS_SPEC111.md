# EVENTS_SPEC.md — สเปกระบบเหตุการณ์ (Event System) สำหรับ Claude Code

> **ผู้รับงาน:** Claude Code ทำงานใน repo `stock-city/`
> **ภารกิจ:** สร้างระบบเหตุการณ์สุ่มทั้งเกมตามสเปกนี้ *ทุกตัวเลขในเอกสารนี้คือค่าตั้งต้นที่ต้องใช้จริง* (จูนภายหลังได้ที่ config เดียว)
> **อ่านก่อนเริ่ม:** `GAME_OVERVIEW.md` ทั้งไฟล์ · `js/config.js` · `js/turn.js` · `js/resolve.js` · `js/stocks.js` · `js/markets.js` · `js/newsSys.js` · `js/botBrain.js` · `js/windows.js` · `js/map.js` · `js/greenhub.js` · `js/bank.js`

---

## 0.0 แก้ไขเพิ่มเติมจาก user (2026-07-19 — ทับสเปกหลักทุกจุดที่ขัดกัน)

1. **Gold Vault ปิดไม่ได้เด็ดขาด** — `closeBuilding` ทุกกรณี (รวม pick random ของ meteor) ห้ามเลือกตึก `gold` · `tower_broken/gold.png` จึงไม่ถูกใช้ (เก็บไฟล์ไว้เฉยๆ)
2. **ยิ่งมีตึกปิดมาก ราคาทองยิ่งขึ้น** — ทุกท้ายรอบที่มีตึกปิดอยู่ ทองได้ drift เพิ่ม `goldClosedDrift × จำนวนตึกที่ปิด` (default `goldClosedDrift: 0.03` = +3%/ตึก/รอบ ใส่ใน `SC.eventsCfg`) — ธีม safe haven: เมืองยิ่งพัง คนยิ่งแห่ซื้อทอง

## 0. กฎเหล็ก

1. **Vanilla JS เท่านั้น ไม่มี build step** — เปิด `index.html` ตรงๆ ต้องเล่นได้เหมือนเดิม
2. ทุกอย่างอยู่ใต้ namespace `SC` ตามธรรมเนียมของ repo
3. ข้อความที่ผู้เล่นเห็นเป็น**ภาษาไทยทั้งหมด**
4. ค่าจูนทุกตัวรวมไว้ที่ `SC.eventsCfg` (ไฟล์ใหม่) — ห้ามฝังเลขกระจายตามโค้ด
5. **Asset รูปอาจยังไม่มี** — ทุกจุดที่ใช้รูปจาก `assets/events/` ต้องมี fallback เป็น emoji + กล่องสีธรรมดา (เกมต้องเล่นได้สมบูรณ์แบบไม่มีรูป) ตาราง asset contract อยู่ข้อ 11
6. ห้ามแตะไฟล์เลิกใช้: `decide.js` `bot.js` `tells.js` `world3d.js`
7. ระบบเดิมทั้งหมด (ข่าว/ดวล/GreenHub/ธนาคาร) ต้องทำงานเหมือนเดิมเมื่อไม่มีเหตุการณ์ active
8. เมื่อเสร็จ ให้เพิ่ม section "13. ระบบเหตุการณ์" ใน `GAME_OVERVIEW.md` สรุปสิ่งที่ทำจริง

## 1. ไฟล์ใหม่ + ลำดับโหลด

- `js/eventCatalog.js` — ข้อมูลเหตุการณ์ล้วนๆ (`SC.eventCatalog` array + `SC.eventsCfg`)
- `js/events.js` — engine (`SC.events`)
- แทรกใน `index.html` **หลัง** `newsSys.js` และ `markets.js`, **ก่อน** `attacks.js` / `botBrain.js` / `turn.js` / `resolve.js`

### state ใหม่ใน `s` (สร้างใน `newGame`)

```js
s.events = {
  active: [],        // ผลที่กำลังเดิน [{id, fx, roundsLeft, meta}]
  closed: {},        // {buildingId: roundsLeft}
  chains: [],        // [{next, p, delay, fromId}]
  telegraphs: [],    // [{eventId, round}] คำเตือนที่รอยิงรอบหน้า
  cooldown: {},      // {eventId: roundUsable}
  regime: 'normal',  // normal|boom|slump|crisis
  boomStreak: 0, lastM: 0, volBoost: 0,   // volBoost = รอบที่เหลือของ vol ×1.5
  rates: { dep: 0.01, loan: 0.04, roundsLeft: 0 },
  lastEventRound: 0, lastTargetNeg: null,
  onceUsed: {},      // taxAudit / taxRefund ใช้ครั้งเดียว/เกม
  history: [],       // log ทุกเหตุการณ์ {round,id}
};
```

## 2. Engine — จังหวะเวลา (hook เข้า `turn.js`)

เรียก `SC.events.onRoundStart(s)` ที่**จุดเริ่มรอบใหม่ ก่อนเทิร์นแรกของรอบ** (รวมรอบ 1):

```
1. ประมวล telegraphs ค้าง: ยิงเหตุการณ์จริง 70% / 30% ประกาศ "ตลาดปกติดี ขออภัยที่ทำตกใจ" ลงฟีด
2. ประมวล chains ครบ delay: ทอย p ของแต่ละ chain → ยิง/ทิ้ง
3. ถ้ายังไม่มีเหตุการณ์ใหม่ในรอบนี้จากข้อ 1–2: ทอยเหตุการณ์ใหม่
   p = baseChance (0.55)
   - ถ้ารอบก่อนไม่มีเหตุการณ์เลย → p = 1.0        // pity: การันตี ≥1 เหตุการณ์ / 2 รอบ
   - regime = crisis → p ×1.3 (เพดาน 1.0)
   - รอบก่อนเป็น calmTown → น้ำหนัก tier heavy ×1.5 เฉพาะรอบนี้
4. ถ้าทอยติด: สุ่ม tier ตาม tierWeights → สุ่มเหตุการณ์จากรายการที่ผ่านทุกเงื่อนไข (ข้อ 2.1)
   - ถ้า tier ที่ได้ไม่มีเหตุการณ์ผ่านเงื่อนไขเลย ให้ลด tier ลงขั้นหนึ่งแล้วสุ่มใหม่
5. เหตุการณ์ tier heavy ฝั่งลบ (flag `neg:true`) → ไม่ยิงทันที แต่สร้าง telegraph:
   ประกาศการ์ดเตือน 🔮 + ข่าวเตือนลงฟีด แล้วยิงจริงรอบถัดไปตามข้อ 1
6. เหตุการณ์อื่น → ยิงทันที: ผลกายภาพ (ตึกปิด/เงินสด/สถานะ) มีผลเดี๋ยวนั้น
   ผลราคาเก็บเป็น pending คูณตอนท้ายรอบ (ข้อ 5)
7. แสดง UI ประกาศ (ข้อ 9) + push ฟีดข่าวแบบปักหมุด 📌 + log ลง s.timeline และ s.events.history
```

### 2.1 เงื่อนไขการเลือกเหตุการณ์ (ทุกข้อต้องผ่าน)

| กติกา | ค่า |
|---|---|
| tierWeights | light 60 · mid 28 · heavy 10 · legend 2 |
| รอบ 1 | อนุญาตเฉพาะ light/mid |
| รอบ 10 | ห้าม heavy ที่ `neg:true` และห้าม legend `neg:true` (memeSqueeze ยิงรอบ 10 ไม่ได้เพราะ dump จะไม่มีรอบให้เกิด) |
| legend | เกิดได้เฉพาะรอบ 3–9 |
| cooldown เหตุการณ์เดิม | 3 รอบ |
| heavy สองรอบติด | ห้าม |
| ตึกปิดพร้อมกัน | สูงสุด 1 หลัง (`cond` ของ meteor/pigeonBank เช็ค `closedCount===0`) |
| เหตุการณ์เจาะบุคคลฝั่งลบ | ห้ามลงคนเดิม 2 ครั้งติด (`lastTargetNeg`) · สุ่มผู้เล่น+บอทน้ำหนักเท่ากัน |
| `cond` เฉพาะเหตุการณ์ | ตามตารางแคตตาล็อก (เช่น goldHeist ต้องมีคนถือทอง) |
| intensity (ตั้งหน้าเริ่มเกม) | 'ชิล' = baseChance 0.35 + ขนาดผลราคา ×0.7 · 'ปกติ' = ตามสเปก · 'โกลาหล' = baseChance 0.85 + ขนาด ×1.3 |

## 3. Regime — Markov chain (เดินท้ายรอบใน resolve)

สถานะ: `normal 🌤️ / boom 🚀 / slump 🌧️ / crisis ⛈️` — **ซ่อนจากผู้เล่น**

ตาราง transition ต่อรอบ (แถว = จาก):

| | normal | boom | slump | crisis |
|---|---|---|---|---|
| normal | .70 | .15 | .15 | 0 |
| boom | .25 | .60 | 0 | .15 + ฟองสบู่ |
| slump | .35 | 0 | .55 | .10 |
| crisis | .45 | .15 | 0 | .40 |

- **ดัชนีฟองสบู่:** ทุก "รอบ boom ติดต่อกัน" ตั้งแต่รอบที่ 2 ขึ้นไป เพิ่มโอกาส boom→crisis อีก +0.05/รอบ (streak เก็บใน `boomStreak`, รีเซ็ตเมื่อออกจาก boom)
- event สามารถ `regimeSet` ตรงๆ (recession → crisis)

ผลของ regime — **บวกเข้า drift เดิม** ของสินทรัพย์ + คูณ vol:

| regime | หุ้นทุกตัว | คริปโตทุกเหรียญ | ทอง | อสังหา | กองทุนหุ้นเติบโต/ดัชนี | vol ทุกตลาด |
|---|---|---|---|---|---|---|
| boom | +0.02 | +0.04 | −0.01 | +0.01 | +0.015 | ×0.9 |
| slump | −0.02 | −0.04 | +0.01 | −0.005 | −0.015 | ×1.15 |
| crisis | −0.06 | −0.12 | **+0.04** | −0.02 | −0.04 | ×1.8 |
| normal | 0 | 0 | 0 | 0 | 0 | ×1.0 |

**ข่าวบรรยากาศ:** ทุกต้นรอบ push ฟีด 1 บรรทัดใบ้ regime — แม่น 80% / จงใจหลอก 20% (สุ่มข้อความจากชุดละ ≥4 ข้อความ/regime เช่น boom: "ห้างแน่นผิดปกติ คิวชานมยาวถึงถนน" · crisis: "ร้านทองแถวบ้านคนต่อคิวซื้อแน่น" · slump: "ป้ายเซ้งร้านเพิ่มขึ้นสามแยกติดกัน")

## 4. ราคาแบบมี correlation (แก้ `stocks.js` + `markets.js`)

resolve.js ต้องเรียก `SC.events.prepareMarket(s)` **ก่อน**ขั้นขยับราคาใดๆ:

```js
SC.events.prepareMarket = (s) => {
  const M = gauss();                              // Box-Muller หรือผลรวม rand 4 ตัว −2
  const wild = Math.random() < 0.06 ? 2 : 1;      // 6% "วันบ้า" หางอ้วน
  SC.events.market = { M, wild, Mprev: s.events.lastM };
  s.events.lastM = M;
};
```

สูตรราคาใหม่ (แทน `p×(1+drift+rand(−vol..vol))` เดิม, ใช้ทุกตลาดที่ราคาขยับ):

```
p' = p × ( 1 + drift + regimeDrift(id) + eventDrift(id)
             + beta(id) × M × vol × wild
             + idio() × vol × 0.6 )
       × eventMult(id)            // ตัวคูณเหตุการณ์รอบนี้ ซ้อนกันแบบ Π(1+v) เหมือนข่าว
       × newsMult(id)             // ระบบข่าวเดิม ไม่แตะ
```

- `idio()` = สุ่ม uniform(−1..1)
- vol ที่ใช้ = vol เดิมของสินทรัพย์ × regimeVol × (volBoost>0 ? 1.5 : 1) × ตัวคูณจาก event `volMult`
- **volatility clustering:** หลังเหตุการณ์ heavy/legend ตั้ง `volBoost = 2` (ลดท้ายรอบละ 1)
- **เพดานกันหลุดโลก:** หลังคำนวณ ถ้า `p' > 3×ราคาเริ่มเกม` ให้ drift รอบถัดไป −0.04 เพิ่ม · ถ้า `< 0.25×` ให้ +0.04 (เก็บเป็น flag ต่อสินทรัพย์)
- **อสังหา** ใช้ `Mprev` (lag 1 รอบ) แทน M

ตาราง beta:

| สินทรัพย์ | beta |
|---|---|
| PTT, KBANK | 0.6 |
| CPALL, AOT | 0.9 |
| MEME | 1.6 |
| BTC, ETH | 1.8 |
| BNB, SOL, ADA | 2.2 |
| DOGE | 2.6 |
| ทองคำ | −0.4 · ถ้า M < −1 ใช้ −0.9 (safe haven) |
| กองทุน: หุ้นเติบโต 0.9 · ดัชนี 0.8 · ผสม 0.5 · รายได้ประจำ 0.15 |
| อสังหาทุกแปลง | 0.35 (คูณ Mprev) |
| พันธบัตร | ราคาไม่ขยับ (คงดีไซน์เดิม) |

## 5. ชนิดผล (fx types) ที่ resolver `SC.events.apply(fx, s, meta)` ต้องรองรับ

| type | ความหมาย | จังหวะมีผล |
|---|---|---|
| `priceMult {asset\|group, v}` หรือ `{vMin,vMax}` | เก็บ pending คูณราคา `×(1+v)` | ท้ายรอบนี้ |
| `closeBuilding {pick:'random'\|id, rounds}` | ปิดตึก: เข้าไม่ได้ ธุรกรรมทำไม่ได้ | ทันที |
| `cashAll {amt,label}` / `cashTarget {pick:'random'\|'richest'\|'poorest', amt}` | เงินสดเข้า/ออก (ติดลบได้ ไม่พอ→forcedSell เดิม) | ทันที |
| `rateSet {dep, loan, rounds}` | เปลี่ยนดอกเบี้ยธนาคาร แล้วคืนค่า default เมื่อครบ | ตั้งแต่ท้ายรอบนี้ |
| `rentMult {v, rounds}` / `divMult` | คูณค่าเช่า/ปันผลตอนจ่าย | ท้ายรอบ |
| `custMult {v, rounds, bizTypes?}` / `fixedMult {v, rounds}` | GreenHub ลูกค้า / fixed cost | ปิดเดือนถัดไป |
| `mapTime {sec, scope:'all'\|'target', rounds}` | เปลี่ยน `mapSeconds` ชั่วคราว | เทิร์นในรอบที่ระบุ |
| `speedMult {v, rounds}` | ความเร็วเดินทุก actor | ทันที |
| `goldTheft {lossBySec:[.30,.15,.05,0], rewardMaxSec:400}` | ผู้ถือทองเสียทองตามระดับ security ตู้เซฟ · ระดับ 3 ไม่เสีย + รับรางวัล | ทันที |
| `forceBuy {pctCash:0.10, cap:500, market:'stocks'}` | บังคับซื้อหุ้นสุ่ม 1 ตัวที่ราคาตลาดด้วยเงินเป้า | ทันที |
| `giveInsiderCard {pick}` | เป้าจั่วข่าววงในฟรี 1 ใบจากกองเดิม (ระบบ 60:40 เดิม) | ทันที |
| `flipLastPublicNews` | ข่าวสาธารณะใบล่าสุดที่ยังไม่ครบกำหนด กลับทิศทาง | ทันที |
| `botSkipMap {pick:'randomBot'}` | บอทข้ามเฟสแมพรอบนี้ (ยืนหน้าน้ำพุ) | ทันที |
| `volMult {v, rounds, market?}` | คูณ vol เพิ่มเติม | ท้ายรอบ |
| `regimeSet {to}` | บังคับ regime | ทันที |
| `chain {next, p, delay}` | เข้าคิว chains | — |
| `prophecy` | หมอดู: สุ่มสินทรัพย์ 1 ตัว + สุ่มทำนายขึ้น/ลง push ฟีด (ไม่มีผลราคาใดๆ) ท้ายรอบถัดไป push ฟีดเฉลยว่าแม่น/พลาด | — |
| `calm` | vol ×0.5 รอบนี้ + flag ให้รอบถัดไป heavy weight ×1.5 | ท้ายรอบ |
| `choice {label, cost, cancels}` | popup ให้เป้าเลือกจ่ายเงินยกเลิกผล (ratLive) — บอทเลือกจ่ายถ้าเงินสด > cost×3 | ทันที |
| `ifBuilding {is, then}` / `ifCond {fn, then, else}` | เงื่อนไขซ้อน | — |

groups: `stocksAll`(5) · `stocksOther`(หุ้นที่ไม่ถูกระบุใน event เดียวกัน) · `cryptoAll`(6) · `estateAll`(6) · `riverside`(ที่ดินริมแม่น้ำ) · `fundEquity`(หุ้นเติบโต+ดัชนี)

## 6. แคตตาล็อกเหตุการณ์ทั้งหมด (id ต้องตรงเป๊ะ — ผูกกับชื่อไฟล์รูปใน EVENTS_ASSET_BRIEF.md)

> `w` = น้ำหนักสุ่มภายใน tier เดียวกัน · ผลราคาเขียนเป็น % คูณท้ายรอบ · flavor ลงฟีดพร้อมประกาศ

### 6.1 มหภาค

| id | tier | w | ผล | flavor |
|---|---|---|---|---|
| `rateHike` 🏛️ ขึ้นดอกเบี้ย | mid | 6 | rateSet dep 1.5% loan 5.5% ×2 รอบ · stocksAll −4% · estateAll −3% **delay 1 รอบ** · ทอง −2% | "แบงก์ชาติ: 'จำเป็นต้องเหยียบเบรกครับ'" |
| `rateCut` 🕊️ ลดดอกเบี้ย | mid | 6 | rateSet dep 0.5% loan 3.0% ×2 รอบ · stocksAll +4% · cryptoAll +6% · estateAll +3% | "คนถือเงินฝากถอนหายใจยาวหนึ่งที" |
| `oilShock` 🛢️ วิกฤตน้ำมันโลก | mid | 8 | PTT +12% · AOT −8% · stocksOther −3% · chain→`inflation` p .6 delay 1 | "ผู้เชี่ยวชาญคาดราคาหน้าปั๊มขึ้น 'เล็กน้อย' (3 บาท)" |
| `inflation` 📈 เงินเฟ้อพุ่ง (chain-only) | mid | 0 | stocksAll −2% · ทอง +4% · chain→`rateHike` p 1.0 delay 1 | "ราคาข้าวแกงทะลุจิตใจประชาชน" |
| `recession` 📉 เศรษฐกิจถดถอย | heavy `neg` | 5 | regimeSet crisis · stocksAll −12% · cryptoAll −20% · ทอง +8% · rentMult ×0.7 ×2 รอบ · custMult −20% ×2 | telegraph: "นักวิเคราะห์ชี้สัญญาณอันตรายในตัวเลขเศรษฐกิจ" |
| `stimulus` 🧧 รัฐแจกเงินกระตุ้น | light | 6 | cashAll +300 · CPALL +6% · custMult +15% ×1 | "ประชาชนนำเงินไปซื้อชานมไข่มุกเป็นหลัก" |
| `tourismBoom` 🧳 ท่องเที่ยวบูม | mid | 6 | AOT +10% · CPALL +4% · custMult +20% ×1 (เฉพาะ cafe,restaurant) | "สนามบินแน่นจนต้องต่อคิวถ่ายรูปป้าย" |

### 6.2 รายสินทรัพย์

| id | tier | w | ผล | flavor |
|---|---|---|---|---|
| `earningsMiss` 📊 งบออกมาพัง | mid | 8 | หุ้นสุ่ม 1 ตัว (ยกเว้น MEME) vMin −15% vMax −10% | "CFO ชี้แจง: 'ปีนี้ฝนตกเยอะครับ'" |
| `earningsBeat` 🚀 งบดีเกินคาด | mid | 8 | หุ้นสุ่ม 1 ตัว (ยกเว้น MEME) +8..+14% | "ผู้บริหารยิ้มจนเห็นเหงือกในงานแถลง" |
| `whaleDump` 🐋 วาฬนิรนามเทกระจาด | mid | 5 | BTC −15% · เหรียญอื่น −8% | "on-chain พบกระเป๋าเก่าแก่ขยับครั้งแรกใน 8 ปี" |
| `dogeTweet` 🤳 มหาเศรษฐีทวีตถึง DOGE ตอนตี 3 | mid | 5 | DOGE +25..+40% · chain→`dogeDelete` p .5 delay 1 | "แคปชัน: 'หมาน่ารักดี'" |
| `dogeDelete` 🗑️ เขาลบทวีตแล้ว (chain-only) | mid | 0 | DOGE −20% | "ทีมงานแจ้งว่า 'บัญชีโดนแฮ็กครับ'" |
| `cryptoCrackdown` ⚖️ ก.ล.ต. โลกขู่คุมคริปโต | mid | 5 | cryptoAll −10% · volMult ×1.5 ×1 (crypto) | "ร่างกฎหมายหนา 900 หน้า ไม่มีใครอ่านจบ" |
| `geoTension` 🪖 ความตึงเครียดภูมิรัฐศาสตร์ | mid | 5 | ทอง +8% · stocksAll −3% · PTT +4% | "คนถือทองยิ้มครั้งแรกในรอบหลายรอบ" |
| `memeSqueeze` 💎 MEME SHORT SQUEEZE | legend | 3 | MEME ×2..×3 (vMin +100% vMax +200%) · chain→`memeDump` p 1.0 delay 1 | "อากาศข้างบนเบาบางนะ..." |
| `memeDump` 🪂 แรงโน้มถ่วงทำงาน (chain-only) | heavy | 0 | MEME −65..−50% | "'ใครยังถืออยู่บ้าง' — เสียงเงียบกริบ" |
| `megaProject` 🏗️ เมกะโปรเจกต์ริมน้ำผ่านสภา | mid | 4 | riverside +18% | "ส.ส. ยกมือพร้อมกันสวยงามผิดปกติ" |
| `propertyBubble` 🏚️ ฟองสบู่อสังหาแฟบ | heavy `neg` | 4 | estateAll −12% | telegraph: "ยอดโอนคอนโดเงียบผิดสังเกต" |

### 6.3 แมพ / กายภาพ

| id | tier | w | cond | ผล | flavor |
|---|---|---|---|---|---|
| `meteor` ☄️ อุกกาบาตลงเมือง! | legend | 3 | closedCount=0 | closeBuilding random ×2 รอบ · cashAll +100 "ค่าทำขวัญจากเทศบาล" · ifBuilding realestate → estateAll −5% · ifBuilding startup → เจ้าของธุรกิจใช้ AP ไม่ได้ระหว่างปิด (รายได้ยังเข้า) | "โชคดีไม่มีผู้บาดเจ็บ เพราะทุกคนมัวก้มดูกราฟอยู่" |
| `goldHeist` 🦹 โจรบุก Gold Vault | heavy `neg` | 4 | มีคนถือทอง | goldTheft lossBySec [30,15,5,0]% · sec 3 = รางวัลจับโจร ฿400 | telegraph: "ตำรวจเตือนแก๊งมิจฉาชีพเคลื่อนไหวแถวย่านการเงิน" · ตอนยิง: "กล้องจับภาพคนร้ายใส่หมวกกันน็อกเดินเข้าไปเฉยๆ" |
| `flood` 🌊 น้ำท่วมริมแม่น้ำ | mid | 5 | — | riverside −20% · chain→`floodRecovery` p .4 delay 1 | "เจ้าของที่ดินยืนยัน 'วิวน้ำ 360 องศา'" |
| `floodRecovery` 🌈 ประกาศเขตพัฒนากันน้ำท่วม (chain-only) | mid | 0 | — | riverside +35% | "คนไม่ขายตอนน้ำท่วมคือผู้ชนะตัวจริง" |
| `blackout` ⚡ ไฟดับทั้งเมือง | mid | 5 | closedCount=0 | mapTime 30s all ×1 รอบ · เจ้าของ GreenHub ที่มีโซลาร์ (เช่าหรือซื้อ) cash +150 "ขายไฟให้เพื่อนบ้าน" | "การไฟฟ้า: 'กระรอกครับ'" |
| `pigeonBank` 🐦 นกพิราบชนเซิร์ฟเวอร์ธนาคาร | mid | 5 | closedCount=0 | closeBuilding fin ×1 รอบ (ดอกเบี้ยฝาก/หนี้ยังคิดปกติ) | "ฝ่าย IT แนะนำให้ลองปิดแล้วเปิดใหม่" |
| `roadCollapse` 🕳️ ถนนหน้าวงเวียนทรุด | light | 5 | — | speedMult ×0.7 ×1 รอบ | "เทศบาลติดกรวยไว้ 1 อัน ถือว่าจัดการแล้ว" |
| `festival` 🎪 เทศกาลประจำเมือง | light | 6 | — | rentMult ×2 ×1 รอบ · custMult +25% ×1 · CPALL +5% | "ปิดถนนขายของกิน เศรษฐกิจดีขึ้นทันตา" |

### 6.4 เจาะรายบุคคล (pick: สุ่มผู้เล่น+บอทเท่ากัน)

| id | tier | w | ผล | flavor |
|---|---|---|---|---|
| `dogSteal` 🐕 หมาคาบแบงก์ | light | 6 | cashTarget random −120 | "มันวิ่งเร็วมาก" |
| `oldPants` 👖 เจอแบงก์ในกางเกงเก่า | light | 6 | cashTarget random +250 | "ของขวัญจากตัวเองในอดีต" |
| `lottery` 🎰 ถูกหวยเลขท้าย | light | 5 | cashTarget random +400 · 10% ตามด้วย −100 + ฟีด "เพื่อนรู้ข่าว ขอเลี้ยงหมูกระทะ" | — |
| `catKeyboard` 🐈 แมวเหยียบคีย์บอร์ด | light | 5 | forceBuy 10% เงินสด (เพดาน ฿500) หุ้นสุ่ม 1 ตัว | "บันทึกไว้: บางเกมแมวคือเทพพยากรณ์" |
| `taxAudit` 🧾 ภาษีย้อนหลัง | light | 3 | cashTarget **richest** −300 · ใช้ได้ครั้งเดียว/เกม · รอบ ≥4 | "สรรพากรส่งจดหมายลายมือสวยมาก" |
| `taxRefund` 🍀 เงินคืนภาษี | light | 3 | cashTarget **poorest** +300 · ครั้งเดียว/เกม · รอบ ≥4 | "ระบบคำนวณใหม่แล้วพบว่าคุณจ่ายเกิน" |
| `phoneDrop` 📵 มือถือตกน้ำ | light | 4 | mapTime 40s target ×1 (เทิร์นถัดไปของเป้า) | "ข้าวสารช่วยได้แค่ทางใจ" |
| `uncleTip` 🤫 ลุงข้างบ้านกระซิบ | light | 5 | giveInsiderCard random | "ลุงยืนยันว่า 'แหล่งข่าวเชื่อถือได้'" (เข้าระบบจริง:ปลอม 60:40 เดิม) |

### 6.5 GreenHub (cond: ผู้เล่นเปิดธุรกิจแล้ว)

| id | tier | w | ผล | flavor |
|---|---|---|---|---|
| `greenInfluencer` 📸 อินฟลูสายกรีนบุกรีวิว | mid | 5 | ดัชนีคาร์บอน ≤65% → custMult +30% ×2 · ไม่งั้น → custMult −20% ×1 + ฟีด "โดนแฉ #greenwashing" | — |
| `ratLive` 🐀 หนูโผล่กลางไลฟ์ | mid | 4 | choice: ยอด −25% ×1 เดือน **หรือ** จ่าย ฿150 ยกเลิก | "หนูมองกล้องอย่างมั่นใจ" |
| `greenContest` 🏆 ประกวดร้านรักษ์โลก | light | 4 | ใบรับรอง ≥Lv.2 → cash +500 + ชื่อเสียง +15 · ไม่ถึง → ฟีด "ได้เกียรติบัตรผู้เข้าร่วม + คูปอง ฿20" | — |
| `supplierHike` 🚚 ซัพพลายเออร์ขึ้นราคา | mid | 4 | fixedMult +25% ×2 เดือน · มีไอเท็ม "รวมรอบส่ง" = immune + ฟีดชม | — |

### 6.6 Meta สายฮา

| id | tier | w | ผล | flavor |
|---|---|---|---|---|
| `botToilet` 🤖 บอทขอตัวเข้าห้องน้ำ | light | 4 | botSkipMap randomBot | บอทยืนนิ่งหน้าน้ำพุทั้งเฟส |
| `ufo` 👽 UFO ลงจอดกลางวงเวียน | legend | 2 | AOT +12% · ทอง +5% · custMult +20% ×1 | "พวกเขารับชำระเป็นทองเท่านั้น" |
| `newsTypo` 📰 นักข่าวพิมพ์ผิด | mid | 3 | flipLastPublicNews | ฟีดขึ้นแถบ "ขออภัยในความผิดพลาด" ตัวเล็กมาก |
| `fortuneTeller` 🧙 หมอดูชื่อดังพยากรณ์ | light | 4 | prophecy (แม่นจริง ~50% โดยธรรมชาติของการสุ่ม) | เครื่องมือจิตวิทยาคู่ระบบข่าวลือ |
| `calmTown` 💤 เมืองสงบผิดปกติ | light | 3 (เฉพาะรอบ 2–5) | calm: vol ×0.5 รอบนี้ + รอบถัดไป heavy weight ×1.5 | "…เงียบเกินไปรึเปล่า" |

## 7. บอท (แก้ `botBrain.js`)

เหตุการณ์เป็นข้อมูลสาธารณะ → เพิ่มใน `s.botPub.events` (id + ผลย่อ) และ reaction ตอนบอทวางแผนเฟสแมพ:

| บุคลิก | กติกา |
|---|---|
| 🦈 ฉลาม | 60%: ซื้อสินทรัพย์ที่โดนเหตุการณ์ลบรอบก่อน (ช้อน) · เห็น telegraph: ขายสินทรัพย์กลุ่มเสี่ยงก่อน 70% |
| 🐢 เต่า | เห็น telegraph หรือเดา regime = crisis: ย้าย ≥50% พอร์ตเสี่ยงเข้าทอง+ฝาก · ไม่ซื้อ MEME ช่วง squeeze เด็ดขาด |
| 🎲 นักพนัน | 70%: ไล่ซื้อสินทรัพย์ที่เพิ่งมีเหตุการณ์บวก · **ซื้อ MEME ตอน squeeze แล้วถือข้ามรอบ 70%** (จงใจ — สีสันประจำเกม) |
| 🔭 นักสังเกตการณ์ | จด event ไว้ รอ 1 รอบแล้วค่อยขยับตามทิศทางจริง |

กติกากลางทุกบุคลิก: เช็คตึกปิดก่อนตั้งเป้าเดิน (ปิด → เลือกตึกอื่น) · หลังเหตุการณ์ legend เพิ่มโอกาสเดินเข้าตึกข่าว/leaderboard ×2 หนึ่งรอบ (ดูเหมือนตกใจหาข้อมูล)

## 8. จุดเสียบ integration

- **turn.js:** เรียก `SC.events.onRoundStart(s)` ตอนเริ่มรอบใหม่ก่อนเทิร์นแรก · เช็ค `mapTime` override ตอนตั้งนาฬิกา · เช็ค `botSkipMap`
- **resolve.js:** ลำดับใหม่ = ข่าวครบกำหนด → `SC.events.prepareMarket` + regime เดิน 1 ก้าว → ราคาทุกตลาด (สูตรข้อ 4) → ปันผล (×divMult) → ค่าเช่า/ดอกเบี้ยสินทรัพย์ (×rentMult) → ดอกธนาคาร (ใช้ `s.events.rates`) → GreenHub (×custMult ×fixedMult) → `SC.events.onRoundEnd(s)` (ลดตัวนับ active/closed/volBoost/rates, คืนค่า, เฉลย prophecy) → เฉลยข่าว+เหตุการณ์เข้าฟีด
- **windows.js / world2d.js:** ตึกที่ `s.events.closed[id]` → คลิกแล้ว toast "🚧 ปิดซ่อม (อีก N รอบ)" ไม่เปิดหน้าต่าง
- **map.js:** วาดตึกปิด (ข้อ 9) · `speedMult`
- **bank.js:** อ่านดอกเบี้ยจาก `s.events.rates` เสมอ (default 1%/4%)
- **greenhub.js:** อ่าน custMult/fixedMult · จ่ายโบนัสโซลาร์ตอน blackout · เช็ค immune supplierHike
- **newsSys.js:** ฟีดรองรับ entry ชนิด `event` (ปักหมุด 📌 ค้างตลอดที่ active) + entry `regimeHint`

## 9. UI ประกาศเหตุการณ์ (ต้นรอบ)

ลำดับแอนิเมชัน (CSS transition ล้วน ไม่ใช้ไลบรารี):

1. Overlay มืดลง 40% → **หนังสือพิมพ์แผ่นใหญ่หมุนปลิวเข้ามา** จากมุมจอ (เริ่ม scale 0.1 + rotate 3 รอบ → จบกลางจอ scale 1) ~1.2 วิ — ใช้รูป `assets/events/paper_good.png` (เหตุการณ์บวก/กลาง) หรือ `paper_bad.png` (ลบ) · เกมวาด**พาดหัวภาษาไทย**ทับแถบว่างกลางกระดาษ + ไอคอนเหตุการณ์ `assets/events/icons/<id>.png` + flavor text
2. คลิกที่ไหนก็ได้ หรือรอ 3 วิ → กระดาษย่อหายไปเป็นหมุด 📌 ในฟีดข่าว
3. **กรณี meteor เท่านั้น — คัตซีนพิเศษก่อนหนังสือพิมพ์:** สไปรต์ `fx/meteor.png` พุ่งเฉียงจากขอบบนจอไปยังพิกัดตึกเป้า (~0.8 วิ) → `fx/impact_flash.png` วาบ 200ms + screen shake 300ms → สลับสไปรต์ตึกเป็น `assets/events/tower_broken/<towerId>.png` (ถ้าไม่มีไฟล์: ตึกเดิม filter brightness 0.45) + `fx/rubble.png` ที่ฐาน + `fx/smoke_1..3.png` วนลูป 600ms/เฟรมตลอดที่ปิด + ป้าย `fx/sign_closed.png` วาดข้อความ "ปิดซ่อม N รอบ" ทับ
4. **telegraph:** ใช้การ์ด `assets/events/warn_card.png` + ข้อความเตือน (ไม่ใช้หนังสือพิมพ์ — เก็บความอลังการไว้ให้ของจริง)
5. ตึกปิดทุกกรณี (รวม pigeonBank): แสดง sign_closed + ควัน (pigeonBank ใช้ควันเฟรมเดียวจางๆ + สไปรต์ `fx/pigeon.png` เกาะหลังคา)
6. ทุกเหตุการณ์ log ลง `s.timeline` รูปแบบ `{round, kind:'event', id, text}` → จอจบเกมแสดงในไทม์ไลน์เดิมอัตโนมัติ

**Fallback ทุกรูป:** ไม่มีไฟล์ → กล่องสีตาม tier (เขียว/เหลือง/แดง/ม่วง) + emoji ของเหตุการณ์ขนาดใหญ่ ห้าม error ห้ามรูปแตก (ใช้ `onerror` หรือ preload check)

## 10. Config รวม (ใน `eventCatalog.js`)

```js
SC.eventsCfg = {
  baseChance: 0.55, pityRounds: 2,
  tierWeights: { light: 60, mid: 28, heavy: 10, legend: 2 },
  telegraphFireChance: 0.70,
  noHeavyNegRounds: [1, 10], legendRounds: [3, 9],
  cooldownSame: 3, maxClosedBuildings: 1,
  wildChance: 0.06, wildMult: 2, idioScale: 0.6,
  volBoostMult: 1.5, volBoostRounds: 2,
  priceCapHi: 3.0, priceCapLo: 0.25, capPullback: 0.04,
  intensity: 'ปกติ', // 'ชิล' | 'ปกติ' | 'โกลาหล' — เพิ่มตัวเลือกที่หน้าเริ่มเกม (main.js)
  intensityMods: { 'ชิล': {chance:0.35, size:0.7}, 'ปกติ': {chance:0.55, size:1.0}, 'โกลาหล': {chance:0.85, size:1.3} },
};
```

## 11. Asset contract (ตรงกับ `EVENTS_ASSET_BRIEF.md` — ห้ามเปลี่ยนชื่อฝั่งเดียว)

```
assets/events/
├─ paper_good.png · paper_bad.png · card_frame.png · warn_card.png
├─ icons/<eventId>.png                 (ทุก id ใน catalog, 256×256)
├─ fx/meteor.png · impact_flash.png · smoke_1.png..smoke_3.png
│   rubble.png · sign_closed.png · flood.png · blackout_glow.png
│   festival.png · ufo.png · robber.png · pigeon.png
└─ tower_broken/<towerId>.png          (chart, crypto, gold, bond, realestate,
                                        startup, green, fin, news, leaderboard)
```

fallback emoji ต่อเหตุการณ์ = emoji ในตารางแคตตาล็อก

## 12. เครื่องมือ debug (จำเป็น — ใช้เทสต์)

- `SC.events.debugFire('meteor')` — ยิงเหตุการณ์ทันทีข้ามทุกเงื่อนไข
- `SC.events.debugRegime('crisis')`
- `SC.events.state()` — dump สถานะระบบ
- URL param `?evt=meteor` — ยิงต้นรอบ 1
- `SC.events.simulate(1000)` — จำลองการทอยเหตุการณ์ล้วนๆ 1000 เกม (ไม่แตะ UI) print จำนวนเฉลี่ย/เกม + สัดส่วน tier + ยืนยัน pity ไม่มีช่องว่าง >2 รอบ

## 13. Acceptance checklist (ต้องผ่านครบก่อนส่งงาน)

- [ ] `simulate(1000)`: เฉลี่ย 6–8 เหตุการณ์/เกม · ไม่มีช่วงว่างเกิน 2 รอบ · สัดส่วน tier ±20% ของน้ำหนัก
- [ ] รอบ 1 ไม่มี heavy/legend · รอบ 10 ไม่มี heavy-neg · legend เกิดเฉพาะรอบ 3–9
- [ ] heavy-neg ทุกตัวมีการ์ดเตือนก่อน 1 รอบ และเก้อได้ 30%
- [ ] ตึกปิด: เข้าไม่ได้ทั้งผู้เล่น/บอท · ราคาสินทรัพย์ของตึกนั้นยังขยับปกติ · ครบรอบแล้วเปิดคืน สไปรต์กลับปกติ
- [ ] pigeonBank: ธุรกรรมธนาคารทำไม่ได้ แต่ดอกฝาก/ดอกหนี้ยังคิดท้ายรอบ
- [ ] goldHeist: เสียทองตามระดับ security ถูกต้อง 4 ระดับ · ระดับ 3 ได้ ฿400
- [ ] memeSqueeze → memeDump เกิดรอบถัดไป 100% เสมอ
- [ ] oilShock → inflation → rateHike ลูกโซ่ทำงาน + ดอกเบี้ยคืนค่า default เมื่อครบ 2 รอบ
- [ ] taxAudit/taxRefund เกิดได้อย่างละครั้ง/เกม เฉพาะรอบ ≥4 และเลือกคนรวยสุด/จนสุดจริง
- [ ] catKeyboard ซื้อหุ้นจริง เข้าพอร์ต avgCost ถูกต้อง ขายคืนได้
- [ ] ทอง beta ติดลบ: จำลอง M ลบแรง → ทองขึ้นสวนหุ้น
- [ ] volBoost: หลัง heavy กราฟแกว่งแรงขึ้น 2 รอบแล้วสงบ
- [ ] ลบโฟลเดอร์ assets/events ทั้งอัน → เกมเล่นได้ครบทุกเหตุการณ์ด้วย emoji fallback ไม่มี console error
- [ ] บอทไม่เดินเข้าตึกปิด · นักพนันซื้อ MEME ตอน squeeze ให้เห็นได้จริง
- [ ] จอจบเกม: ไทม์ไลน์แสดงเหตุการณ์ครบทุกอันของเกมนั้น
