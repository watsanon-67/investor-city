// ============================================================
// eventCatalog.js — ข้อมูลเหตุการณ์สุ่มทั้งเกม (EVENTS_SPEC ข้อ 6) + config รวม (ข้อ 10)
//   • ตัวเลขทุกตัว = ค่าตั้งต้นตามสเปก (จูนที่ SC.eventsCfg / ในแคตตาล็อกนี้ที่เดียว)
//   • engine อยู่ที่ events.js — ไฟล์นี้เป็น "ข้อมูลล้วน" (catalog + cfg)
//   • fx = ลิสต์ผลของเหตุการณ์ (ชนิดผลดูหัวข้อ 5 ของสเปก / ตัว handler ใน events.js)
//
//   นิยาม *Mult ทุกตัว (custMult/fixedMult/rentMult/divMult/volMult): v = "ตัวคูณ" ตรงๆ
//     (spec ×0.7 → v:0.7 · +25% → v:1.25 · −20% → v:0.80) เพื่อไม่สับสน
//   priceMult: v = เดลตา (%) คูณราคา ×(1+v) ท้ายรอบ (ซ้อนกันแบบ Π เหมือนข่าว) · รองรับ vMin/vMax + delay
//
//   ⚠️ ปรับตามความจริงของ repo (สเปกเขียนก่อนแมป/ตลาดเปลี่ยน):
//     - DOGE ในโค้ดคือ id 'DOG' (SC.coins) → ตาราง beta/กลุ่มใช้ 'DOG'
//     - riverside = ['LAND'] (ที่ดินริมแม่น้ำ — แปลงเดียวใน SC.properties ที่ชื่อสื่อว่าติดน้ำ)
//     - ตึก leaderboard ถูกถอดจากแมปแล้ว → บอทหลัง legend เดินเข้าตึก 'news' อย่างเดียว
// ============================================================

SC.eventsCfg = {
  // (baseChance/pityRounds/noHeavyNegRounds/maxClosedBuildings ถูกถอด 2026-07-20 — ไม่มีโค้ดอ่าน:
  //  โอกาสจริงมาจาก intensityMods · pity อยู่ใน _effChance · กติกา heavy รอบแรก/รอบสุดท้ายเช็คใน _pickEvent
  //  · จำนวนตึกที่ปิดพร้อมกันคุมด้วย cond closedCount()===0 + fx closeExtra)
  tierWeights: { light: 60, mid: 28, heavy: 10, legend: 2 },
  telegraphFireChance: 0.70,
  legendRounds: [3, 9],
  cooldownSame: 3,
  wildChance: 0.06, wildMult: 2, idioScale: 0.6,
  volBoostMult: 1.5, volBoostRounds: 2,
  priceCapHi: 3.0, priceCapLo: 0.25, capPullback: 0.04,
  goldClosedDrift: 0.03,   // ทุกท้ายรอบที่มีตึกปิด: ทอง +3%/ตึก (safe haven — user 2026-07-19)
  intensity: 'ปกติ',       // 'ชิล' | 'ปกติ' | 'โกลาหล' — ตัวเลือกที่หน้าเริ่มเกม (main.js)
  intensityMods: {
    'ชิล':    { chance: 0.35, size: 0.7 },
    'ปกติ':   { chance: 0.55, size: 1.0 },
    'โกลาหล': { chance: 0.85, size: 1.3 },
  },
};

// ---------- กลุ่มสินทรัพย์ (EVENTS_SPEC ข้อ 5 groups) ----------
//   stocksOther / cryptoOther = สมาชิกที่ "ไม่ถูกระบุชื่อในเหตุการณ์เดียวกัน" (คำนวณตอน apply)
SC.eventGroups = {
  stocksAll:  ['PTT', 'CPALL', 'AOT', 'KBANK', 'MEME'],
  cryptoAll:  ['BTC', 'ETH', 'BNB', 'SOL', 'ADA', 'DOG'],
  estateAll:  ['OLDROOM', 'CONDO', 'TOWNH', 'SHOP', 'OFFICE', 'LAND'],
  riverside:  ['LAND'],                 // แปลงเดียวที่ริมแม่น้ำจริง (ที่ดินริมแม่น้ำ)
  fundEquity: ['GROWTH', 'INDEX'],
};

// ---------- ตาราง beta (EVENTS_SPEC ข้อ 4) — ทอง/อสังหาจัดการแยกใน events.js ----------
SC.eventBeta = {
  PTT: 0.6, KBANK: 0.6, CPALL: 0.9, AOT: 0.9, MEME: 1.6,
  BTC: 1.8, ETH: 1.8, BNB: 2.2, SOL: 2.2, ADA: 2.2, DOG: 2.6,
  GROWTH: 0.9, INDEX: 0.8, BALANCE: 0.5, INCOME: 0.15,
};

// ---------- ข่าวบรรยากาศ regime (EVENTS_SPEC ข้อ 3) — แม่น 80% / หลอก 20% ----------
SC.regimeHints = {
  boom:   ['ห้างแน่นผิดปกติ คิวชานมยาวถึงถนน', 'ร้านเปิดใหม่สามร้านในซอยเดียว', 'ลานจอดรถเต็มตั้งแต่เที่ยง', 'คนคุยเรื่องซื้อของกันทั้งเมือง'],
  slump:  ['ป้ายเซ้งร้านเพิ่มขึ้นสามแยกติดกัน', 'ตลาดเงียบผิดปกติช่วงเย็น', 'คนเดินห้างน้อยลงเห็นได้ชัด', 'ร้านลดราคากระหน่ำแต่ยังเงียบ'],
  crisis: ['ร้านทองแถวบ้านคนต่อคิวซื้อแน่น', 'ATM บางตู้เงินหมดตั้งแต่เช้า', 'คนแห่ถอนเงินสดเก็บไว้กับตัว', 'ข่าวลือปิดกิจการสะพัดทั้งเมือง'],
  normal: ['วันนี้ตลาดดูปกติดี ไม่มีอะไรพิเศษ', 'อากาศดี คนออกมาเดินเล่นพอสมควร', 'ร้านรวงเปิดปิดตามเวลาปกติ', 'บรรยากาศการค้าทรงตัว'],
};

// ============================================================
// แคตตาล็อกเหตุการณ์ (EVENTS_SPEC ข้อ 6) — id ต้องตรงชื่อไฟล์ icon
//   ฟิลด์: id · tier · w(น้ำหนักใน tier · w:0 = chain-only ไม่ถูกสุ่มปกติ) · emoji(fallback) · name
//          neg(heavy/legend ฝั่งลบ → telegraph ก่อน 1 รอบ) · personal(เจาะบุคคล pick เท่ากัน)
//          cond(s)→bool · telegraph(ข้อความเตือน) · flavor · fx[]
// ============================================================
SC.eventCatalog = [
  // ---------- 6.1 มหภาค ----------
  { id: 'rateHike', tier: 'mid', w: 6, emoji: '🏛️', name: 'ขึ้นดอกเบี้ย',
    flavor: "แบงก์ชาติ: 'จำเป็นต้องเหยียบเบรกครับ'",
    fx: [ { type: 'rateSet', dep: 0.015, loan: 0.055, rounds: 2 },
          { type: 'priceMult', group: 'stocksAll', v: -0.04 },
          { type: 'priceMult', group: 'estateAll', v: -0.03, delay: 1 },
          { type: 'priceMult', asset: 'GOLD', v: -0.02 } ] },
  { id: 'rateCut', tier: 'mid', w: 6, emoji: '🕊️', name: 'ลดดอกเบี้ย',
    flavor: 'คนถือเงินฝากถอนหายใจยาวหนึ่งที',
    fx: [ { type: 'rateSet', dep: 0.005, loan: 0.030, rounds: 2 },
          { type: 'priceMult', group: 'stocksAll', v: 0.04 },
          { type: 'priceMult', group: 'cryptoAll', v: 0.06 },
          { type: 'priceMult', group: 'estateAll', v: 0.03 } ] },
  { id: 'oilShock', tier: 'mid', w: 8, emoji: '🛢️', name: 'วิกฤตน้ำมันโลก',
    flavor: "ผู้เชี่ยวชาญคาดราคาหน้าปั๊มขึ้น 'เล็กน้อย' (3 บาท)",
    fx: [ { type: 'priceMult', asset: 'PTT', v: 0.12 },
          { type: 'priceMult', asset: 'AOT', v: -0.08 },
          { type: 'priceMult', group: 'stocksOther', v: -0.03 },
          { type: 'chain', next: 'inflation', p: 0.6, delay: 1 } ] },
  { id: 'inflation', tier: 'mid', w: 0, emoji: '📈', name: 'เงินเฟ้อพุ่ง',
    flavor: 'ราคาข้าวแกงทะลุจิตใจประชาชน',
    fx: [ { type: 'priceMult', group: 'stocksAll', v: -0.02 },
          { type: 'priceMult', asset: 'GOLD', v: 0.04 },
          { type: 'chain', next: 'rateHike', p: 1.0, delay: 1 } ] },
  { id: 'recession', tier: 'heavy', w: 5, neg: true, emoji: '📉', name: 'เศรษฐกิจถดถอย',
    telegraph: 'นักวิเคราะห์ชี้สัญญาณอันตรายในตัวเลขเศรษฐกิจ',
    flavor: 'ตัวเลขจ้างงานร่วง ทุกดัชนีเป็นสีแดง',
    fx: [ { type: 'regimeSet', to: 'crisis' },
          { type: 'priceMult', group: 'stocksAll', v: -0.12 },
          { type: 'priceMult', group: 'cryptoAll', v: -0.20 },
          { type: 'priceMult', asset: 'GOLD', v: 0.08 },
          { type: 'rentMult', v: 0.7, rounds: 2 },
          { type: 'custMult', v: 0.80, rounds: 2 } ] },
  { id: 'stimulus', tier: 'light', w: 6, emoji: '🧧', name: 'รัฐแจกเงินกระตุ้น',
    flavor: 'ประชาชนนำเงินไปซื้อชานมไข่มุกเป็นหลัก',
    fx: [ { type: 'cashAll', amt: 300, label: 'เงินกระตุ้นเศรษฐกิจ' },
          { type: 'priceMult', asset: 'CPALL', v: 0.06 },
          { type: 'custMult', v: 1.15, rounds: 1 } ] },
  { id: 'tourismBoom', tier: 'mid', w: 6, emoji: '🧳', name: 'ท่องเที่ยวบูม',
    flavor: 'สนามบินแน่นจนต้องต่อคิวถ่ายรูปป้าย',
    fx: [ { type: 'priceMult', asset: 'AOT', v: 0.10 },
          { type: 'priceMult', asset: 'CPALL', v: 0.04 },
          { type: 'custMult', v: 1.20, rounds: 1, bizTypes: ['cafe', 'restaurant'] } ] },

  // ---------- 6.2 รายสินทรัพย์ ----------
  { id: 'earningsMiss', tier: 'mid', w: 8, emoji: '📊', name: 'งบออกมาพัง',
    flavor: "CFO ชี้แจง: 'ปีนี้ฝนตกเยอะครับ'",
    fx: [ { type: 'priceMult', pick: 'stock', exclude: ['MEME'], vMin: -0.15, vMax: -0.10 } ] },
  { id: 'earningsBeat', tier: 'mid', w: 8, emoji: '🚀', name: 'งบดีเกินคาด',
    flavor: 'ผู้บริหารยิ้มจนเห็นเหงือกในงานแถลง',
    fx: [ { type: 'priceMult', pick: 'stock', exclude: ['MEME'], vMin: 0.08, vMax: 0.14 } ] },
  { id: 'whaleDump', tier: 'mid', w: 5, emoji: '🐋', name: 'วาฬนิรนามเทกระจาด',
    flavor: 'on-chain พบกระเป๋าเก่าแก่ขยับครั้งแรกใน 8 ปี',
    fx: [ { type: 'priceMult', asset: 'BTC', v: -0.15 },
          { type: 'priceMult', group: 'cryptoOther', v: -0.08 } ] },
  { id: 'dogeTweet', tier: 'mid', w: 5, emoji: '🤳', name: 'มหาเศรษฐีทวีตถึง DOGE',
    flavor: "แคปชัน: 'หมาน่ารักดี'",
    fx: [ { type: 'priceMult', asset: 'DOG', vMin: 0.25, vMax: 0.40 },
          { type: 'chain', next: 'dogeDelete', p: 0.5, delay: 1 } ] },
  { id: 'dogeDelete', tier: 'mid', w: 0, emoji: '🗑️', name: 'เขาลบทวีตแล้ว',
    flavor: "ทีมงานแจ้งว่า 'บัญชีโดนแฮ็กครับ'",
    fx: [ { type: 'priceMult', asset: 'DOG', v: -0.20 } ] },
  { id: 'cryptoCrackdown', tier: 'mid', w: 5, emoji: '⚖️', name: 'ก.ล.ต.โลกขู่คุมคริปโต',
    flavor: 'ร่างกฎหมายหนา 900 หน้า ไม่มีใครอ่านจบ',
    fx: [ { type: 'priceMult', group: 'cryptoAll', v: -0.10 },
          { type: 'volMult', v: 1.5, rounds: 1, market: 'crypto' } ] },
  { id: 'geoTension', tier: 'mid', w: 5, emoji: '🪖', name: 'ความตึงเครียดภูมิรัฐศาสตร์',
    flavor: 'คนถือทองยิ้มครั้งแรกในรอบหลายรอบ',
    fx: [ { type: 'priceMult', asset: 'GOLD', v: 0.08 },
          { type: 'priceMult', group: 'stocksAll', v: -0.03 },
          { type: 'priceMult', asset: 'PTT', v: 0.04 } ] },
  { id: 'memeSqueeze', tier: 'legend', w: 3, emoji: '💎', name: 'MEME SHORT SQUEEZE',
    cond: function (s) { return s.week < 10; },     // dump ต้องมีรอบให้เกิด (spec ข้อ 2.1)
    flavor: 'อากาศข้างบนเบาบางนะ...',
    fx: [ { type: 'priceMult', asset: 'MEME', vMin: 1.00, vMax: 2.00 },
          { type: 'chain', next: 'memeDump', p: 1.0, delay: 1 } ] },
  { id: 'memeDump', tier: 'heavy', w: 0, emoji: '🪂', name: 'แรงโน้มถ่วงทำงาน',
    flavor: "'ใครยังถืออยู่บ้าง' — เสียงเงียบกริบ",
    fx: [ { type: 'priceMult', asset: 'MEME', vMin: -0.65, vMax: -0.50 } ] },
  { id: 'megaProject', tier: 'mid', w: 4, emoji: '🏗️', name: 'เมกะโปรเจกต์ริมน้ำผ่านสภา',
    flavor: 'ส.ส. ยกมือพร้อมกันสวยงามผิดปกติ',
    fx: [ { type: 'priceMult', group: 'riverside', v: 0.18 } ] },
  { id: 'propertyBubble', tier: 'heavy', w: 4, neg: true, emoji: '🏚️', name: 'ฟองสบู่อสังหาแฟบ',
    telegraph: 'ยอดโอนคอนโดเงียบผิดสังเกต',
    flavor: 'ป้ายขายดาวน์ขึ้นเต็มทุกโครงการ',
    fx: [ { type: 'priceMult', group: 'estateAll', v: -0.12 } ] },

  // ---------- 6.3 แมพ / กายภาพ ----------
  { id: 'meteor', disaster: true, tier: 'legend', w: 3, emoji: '☄️', name: 'อุกกาบาตลงเมือง!',
    cond: function (s) { return SC.events.closedCount() === 0; },
    flavor: 'โชคดีไม่มีผู้บาดเจ็บ เพราะทุกคนมัวก้มดูกราฟอยู่',
    fx: [ { type: 'closeBuilding', pick: 'random', rounds: 2 },
          { type: 'closeExtra', maxExtra: 2, rounds: 1 },   // ลูกหลง 0-2 ลูก ลงตึกอื่น ปิด 1 รอบ
          { type: 'cashAll', amt: 100, label: 'ค่าทำขวัญจากเทศบาล' },
          { type: 'ifBuilding', is: 'realestate', then: [ { type: 'priceMult', group: 'estateAll', v: -0.05 } ] },
          { type: 'ifBuilding', is: 'startup', then: [ { type: 'apLock' } ] } ] },
  { id: 'goldHeist', tier: 'heavy', w: 4, neg: true, emoji: '🦹', name: 'โจรบุก Gold Vault',
    icon: 'assets/events/fx/robber.png',
    cond: function (s) { return SC.events.anyGoldHolder(); },
    telegraph: 'ตำรวจเตือนแก๊งมิจฉาชีพเคลื่อนไหวแถวย่านการเงิน',
    flavor: 'กล้องจับภาพคนร้ายใส่หมวกกันน็อกเดินเข้าไปเฉยๆ',
    fx: [ { type: 'goldTheft', lossBySec: [0.30, 0.15, 0.05, 0], reward: 400 } ] },
  { id: 'flood', tier: 'mid', w: 5, emoji: '🌊', name: 'น้ำท่วมริมแม่น้ำ',
    flavor: "เจ้าของที่ดินยืนยัน 'วิวน้ำ 360 องศา'",
    fx: [ { type: 'priceMult', group: 'riverside', v: -0.20 },
          { type: 'chain', next: 'floodRecovery', p: 0.4, delay: 1 } ] },
  { id: 'floodRecovery', tier: 'mid', w: 0, emoji: '🌈', name: 'ประกาศเขตพัฒนากันน้ำท่วม',
    flavor: 'คนไม่ขายตอนน้ำท่วมคือผู้ชนะตัวจริง',
    fx: [ { type: 'priceMult', group: 'riverside', v: 0.35 } ] },
  { id: 'blackout', tier: 'mid', w: 5, emoji: '⚡', name: 'ไฟดับทั้งเมือง',
    cond: function (s) { return SC.events.closedCount() === 0; },
    flavor: "การไฟฟ้า: 'กระรอกครับ'",
    fx: [ { type: 'mapTime', sec: 30, scope: 'all', rounds: 1 },
          { type: 'solarBonus', amt: 150, label: 'ขายไฟให้เพื่อนบ้าน' } ] },
  { id: 'pigeonBank', disaster: true, tier: 'mid', w: 5, emoji: '🐦', name: 'นกพิราบชนเซิร์ฟเวอร์ธนาคาร',
    cond: function (s) { return SC.events.closedCount() === 0; },
    flavor: 'ฝ่าย IT แนะนำให้ลองปิดแล้วเปิดใหม่',
    fx: [ { type: 'closeBuilding', pick: 'fin', rounds: 1 } ] },   // ดอกฝาก/หนี้ยังคิดปกติ (bank.endRound ไม่เช็คปิด)
  { id: 'hurricane', disaster: true, tier: 'heavy', w: 5, neg: true, emoji: '🌀', name: 'พายุหมุนเข้าเมือง',
    icon: 'assets/events/fx/hurricane1.png',   // ใช้อาร์ตเอฟเฟกต์เป็นรูปข่าว (user 2026-07-20)
    cond: function (s) { return SC.events.closedCount() === 0; },
    telegraph: 'กรมอุตุฯ เตือนพายุหมุนกำลังแรงกำลังเคลื่อนเข้าเมือง',
    flavor: 'หลังคาสังกะสีปลิวข้ามไปสามซอย',
    fx: [ { type: 'closeBuilding', pick: 'random', rounds: 2 },
          { type: 'closeExtra', maxExtra: 2, rounds: 1 },   // พัดผ่านตึกอื่นอีก 0-2 หลัง
          { type: 'priceMult', group: 'estateAll', v: -0.06 },
          { type: 'rentMult', v: 0.75, rounds: 1 },
          { type: 'custMult', v: 0.85, rounds: 1 } ] },
  { id: 'roadCollapse', tier: 'light', w: 5, emoji: '🕳️', name: 'ถนนหน้าวงเวียนทรุด',
    flavor: 'เทศบาลติดกรวยไว้ 1 อัน ถือว่าจัดการแล้ว',
    fx: [ { type: 'speedMult', v: 0.7, rounds: 1 } ] },
  { id: 'festival', tier: 'light', w: 6, emoji: '🎪', name: 'เทศกาลประจำเมือง',
    flavor: 'ปิดถนนขายของกิน เศรษฐกิจดีขึ้นทันตา',
    fx: [ { type: 'rentMult', v: 2, rounds: 1 },
          { type: 'custMult', v: 1.25, rounds: 1 },
          { type: 'priceMult', asset: 'CPALL', v: 0.05 } ] },

  // ---------- 6.4 เจาะรายบุคคล (pick: สุ่มผู้เล่น+บอทเท่ากัน) ----------
  { id: 'dogSteal', tier: 'light', w: 6, personal: true, targetNeg: true, emoji: '🐕', name: 'หมาคาบแบงก์',
    flavor: 'มันวิ่งเร็วมาก',
    fx: [ { type: 'cashTarget', pick: 'random', amt: -120 } ] },
  { id: 'oldPants', tier: 'light', w: 6, personal: true, emoji: '👖', name: 'เจอแบงก์ในกางเกงเก่า',
    flavor: 'ของขวัญจากตัวเองในอดีต',
    fx: [ { type: 'cashTarget', pick: 'random', amt: 250 } ] },
  { id: 'lottery', tier: 'light', w: 5, personal: true, emoji: '🎰', name: 'ถูกหวยเลขท้าย',
    flavor: 'เลขท้ายสองตัวจากทะเบียนรถเมล์',
    fx: [ { type: 'cashTarget', pick: 'random', amt: 400, tax: { p: 0.10, amt: -100, msg: 'เพื่อนรู้ข่าว ขอเลี้ยงหมูกระทะ' } } ] },
  { id: 'catKeyboard', tier: 'light', w: 5, personal: true, emoji: '🐈', name: 'แมวเหยียบคีย์บอร์ด',
    flavor: 'บันทึกไว้: บางเกมแมวคือเทพพยากรณ์',
    fx: [ { type: 'forceBuy', pick: 'random', pctCash: 0.10, cap: 500, market: 'stocks' } ] },
  { id: 'taxAudit', tier: 'light', w: 3, personal: true, targetNeg: true, once: true, emoji: '🧾', name: 'ภาษีย้อนหลัง',
    cond: function (s) { return s.week >= 4 && !s.events.onceUsed.taxAudit; },
    flavor: 'สรรพากรส่งจดหมายลายมือสวยมาก',
    fx: [ { type: 'cashTarget', pick: 'richest', amt: -300 } ] },
  { id: 'taxRefund', tier: 'light', w: 3, personal: true, once: true, emoji: '🍀', name: 'เงินคืนภาษี',
    cond: function (s) { return s.week >= 4 && !s.events.onceUsed.taxRefund; },
    flavor: 'ระบบคำนวณใหม่แล้วพบว่าคุณจ่ายเกิน',
    fx: [ { type: 'cashTarget', pick: 'poorest', amt: 300 } ] },
  { id: 'phoneDrop', tier: 'light', w: 4, personal: true, emoji: '📵', name: 'มือถือตกน้ำ',
    flavor: 'ข้าวสารช่วยได้แค่ทางใจ',
    fx: [ { type: 'mapTime', sec: 40, scope: 'target', pick: 'random', rounds: 1 } ] },
  { id: 'uncleTip', tier: 'light', w: 5, personal: true, emoji: '🤫', name: 'ลุงข้างบ้านกระซิบ',
    flavor: "ลุงยืนยันว่า 'แหล่งข่าวเชื่อถือได้'",
    fx: [ { type: 'giveInsiderCard', pick: 'random' } ] },

  // ---------- 6.5 GreenHub (cond: ผู้เล่นเปิดธุรกิจแล้ว) ----------
  { id: 'greenInfluencer', tier: 'mid', w: 5, emoji: '📸', name: 'อินฟลูสายกรีนบุกรีวิว',
    cond: function () { return SC.greenhub && SC.greenhub.hasBiz(); },
    flavor: 'กล้องพร้อม ไมค์พร้อม รอแค่ร้านคุณ',
    fx: [ { type: 'ifCond',
            test: function () { return SC.greenhub.carbonIdx() <= 65; },
            then: [ { type: 'custMult', v: 1.30, rounds: 2 } ],
            else: [ { type: 'custMult', v: 0.80, rounds: 1 }, { type: 'feed', text: 'โดนแฉ #greenwashing — ยอดขายเทิร์นหน้าหด' } ] } ] },
  { id: 'ratLive', tier: 'mid', w: 4, emoji: '🐀', name: 'หนูโผล่กลางไลฟ์',
    cond: function () { return SC.greenhub && SC.greenhub.hasBiz(); },
    flavor: 'หนูมองกล้องอย่างมั่นใจ',
    fx: [ { type: 'choice', label: 'หนูวิ่งผ่านกลางไลฟ์ร้านคุณ! จ่ายค่าทำความสะอาด+กู้ภาพลักษณ์ ฿150 หรือปล่อยให้ยอดขายเดือนนี้ −25%?',
            cost: 150, cancels: [ { type: 'custMult', v: 0.75, rounds: 1 } ] } ] },
  { id: 'greenContest', tier: 'light', w: 4, emoji: '🏆', name: 'ประกวดร้านรักษ์โลก',
    cond: function () { return SC.greenhub && SC.greenhub.hasBiz(); },
    flavor: 'คณะกรรมการถือคลิปบอร์ดเดินดูรอบร้าน',
    fx: [ { type: 'ifCond',
            test: function () { return SC.greenhub.ensure().certLv >= 2; },
            then: [ { type: 'cashTarget', pick: 'player', amt: 500 }, { type: 'greenRep', amt: 15 } ],
            else: [ { type: 'feed', text: 'ได้เกียรติบัตรผู้เข้าร่วม + คูปอง ฿20 (ยังไม่ถึงเกณฑ์รางวัลใหญ่)' } ] } ] },
  { id: 'supplierHike', tier: 'mid', w: 4, emoji: '🚚', name: 'ซัพพลายเออร์ขึ้นราคา',
    cond: function () { return SC.greenhub && SC.greenhub.hasBiz(); },
    flavor: 'ต้นทุนวัตถุดิบขยับขึ้นทั้งตลาด',
    fx: [ { type: 'ifCond',
            test: function () { return !SC.greenhub.ensure().items.routing; },
            then: [ { type: 'fixedMult', v: 1.25, rounds: 2 } ],
            else: [ { type: 'feed', text: 'มีระบบ "รวมรอบส่ง" อยู่แล้ว — รอดผลกระทบซัพพลายเออร์ขึ้นราคา 👍' } ] } ] },

  // ---------- 6.6 Meta สายฮา ----------
  { id: 'botToilet', tier: 'light', w: 4, emoji: '🤖', name: 'บอทขอตัวเข้าห้องน้ำ',
    flavor: 'บอทยืนนิ่งหน้าน้ำพุทั้งเฟส',
    fx: [ { type: 'botSkipMap', pick: 'randomBot' } ] },
  { id: 'ufoAttack', disaster: true, tier: 'legend', w: 2, neg: true, emoji: '🛸', name: 'UFO โจมตี',
    icon: 'assets/events/fx/ufo_invade.png',
    cond: function (s) { return SC.events.closedCount() === 0; },
    telegraph: 'มีคนถ่ายคลิปวัตถุบินไม่ทราบชนิดวนอยู่เหนือเมือง',
    flavor: 'ลำแสงดูดหลังคาไปทั้งหลัง ไม่ทิ้งแม้แต่ใบเสร็จ',
    fx: [ { type: 'closeBuilding', pick: 'random', rounds: 1 },   // ลำแสงดูดตึกเดียว (ห้ามหลายหลัง)
          { type: 'priceMult', group: 'stocksAll', v: -0.04 },
          { type: 'priceMult', asset: 'GOLD', v: 0.05 } ] },
  { id: 'ufo', tier: 'legend', w: 2, emoji: '👽', name: 'UFO ลงจอดกลางวงเวียน',
    flavor: 'พวกเขารับชำระเป็นทองเท่านั้น',
    fx: [ { type: 'priceMult', asset: 'AOT', v: 0.12 },
          { type: 'priceMult', asset: 'GOLD', v: 0.05 },
          { type: 'custMult', v: 1.20, rounds: 1 } ] },
  { id: 'newsTypo', tier: 'mid', w: 3, emoji: '📰', name: 'นักข่าวพิมพ์ผิด',
    flavor: 'ขออภัยในความผิดพลาด (ตัวเล็กมาก)',
    fx: [ { type: 'flipLastPublicNews' } ] },
  { id: 'fortuneTeller', tier: 'light', w: 4, emoji: '🧙', name: 'หมอดูชื่อดังพยากรณ์',
    flavor: 'ควันธูปลอยเป็นรูปกราฟแท่งเทียน',
    fx: [ { type: 'prophecy' } ] },
  { id: 'calmTown', tier: 'light', w: 3, emoji: '💤', name: 'เมืองสงบผิดปกติ',
    cond: function (s) { return s.week >= 2 && s.week <= 5; },
    flavor: '…เงียบเกินไปรึเปล่า',
    fx: [ { type: 'calm' } ] },
];

SC.eventById = function (id) {
  for (var i = 0; i < SC.eventCatalog.length; i++) if (SC.eventCatalog[i].id === id) return SC.eventCatalog[i];
  return null;
};
