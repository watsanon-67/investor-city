// ============================================================
// stocks.js — ข้อมูลหุ้น + สูตรราคา/ปันผล (จาก GDD ข้อ 6)
// ============================================================
// *** ข้อมูลจำลองเพื่อการเรียนรู้ ไม่ใช่ราคาเรียลไทม์ ไม่ใช่คำแนะนำลงทุน ***
//
// drift = ดริฟต์จริงต่อสัปดาห์ (ซ่อนไว้ ผู้เล่นต้องเดาจากข้อมูล)
// vol   = ความผันผวน (สุ่ม ±vol)
// div   = ปันผลต่อปี (จ่ายรายไตรมาส = div/4 ต่อสัปดาห์)
// base  = คะแนนพื้นฐานสำหรับบอทใช้ตัดสินใจ (งบดี +2, ข่าวบวก +1, เทรนด์หนุน +1, P/E แพง -2)
// highPE = แพงเกินจริง (ใช้เตือนผู้เล่นสาย VI / ปรับคะแนนบอท)
// color/icon = สีประจำตัวหุ้น (คงที่ตลอดเกม ใช้ใน stock list/โดนัทพอร์ต — ชุดสีผ่านตัวตรวจ
//   dataviz palette validator บนพื้นเข้ม: CVD ≥12, contrast ≥3:1 · เลี่ยงเขียว/แดงที่กันไว้บอกกำไร/ขาดทุน)

SC.stocks = [
  {
    id: 'PTT', name: 'PTT', sector: 'ปั๊มน้ำมัน',
    color: '#3987e5', icon: '⛽',
    start: 33, drift: 0.005, vol: 0.05, div: 0.066,
    info: {
      chart: 'แกว่งออกข้าง 6 เดือน',
      fin:   'P/E 9 ถูก · D/E 1.1 · ปันผล 6.6%',
      news:  'โครงสร้างราคาก๊าซใหม่ บวกเล็กน้อย',
      trend: 'พลังงานทรงตัว มั่นคง',
    },
    base: 3, highPE: false,
  },
  {
    id: 'CPALL', name: 'CPALL', sector: 'ร้านสะดวกซื้อ',
    color: '#199e70', icon: '🏪',
    start: 47, drift: 0.035, vol: 0.04, div: 0.025,
    info: {
      chart: 'ไต่ขึ้นทำ new high',
      fin:   'P/E 18 · D/E 1.8 · ปันผล 2.5%',
      news:  'ผู้ถือหุ้นโหวตคงโครงสร้าง',
      trend: 'ค้าปลีกรับนโยบายกระตุ้น',
    },
    base: 1, highPE: false,
  },
  {
    id: 'AOT', name: 'AOT', sector: 'สนามบิน',
    color: '#c98500', icon: '✈️',
    start: 38, drift: 0.04, vol: 0.07, div: 0.012,
    info: {
      chart: 'เด้งขึ้นแรง',
      fin:   'P/E 28 แพง · D/E 0.6 · ปันผล 1.2%',
      news:  'นักท่องเที่ยวฟื้นต่อเนื่อง',
      trend: 'ท่องเที่ยวขาขึ้น แต่ราคาแพง',
    },
    base: 0, highPE: true,
  },
  {
    id: 'KBANK', name: 'KBANK', sector: 'ธนาคาร',
    color: '#9085e9', icon: '🏦',
    start: 185, drift: 0.015, vol: 0.05, div: 0.05,
    info: {
      chart: 'แกว่งตามดอกเบี้ย',
      fin:   'P/E 8 ถูก · D/E 7.5 (ปกติของแบงก์) · ปันผล 5%',
      news:  'แบงก์ชูปันผลสูง + ซื้อหุ้นคืน',
      trend: 'ดอกเบี้ยอาจขึ้น หนุนแบงก์',
    },
    base: 4, highPE: false,
  },
  {
    id: 'MEME', name: 'MEME', sector: 'หุ้นปั่นกระแส',
    color: '#d95926', icon: '🎈',
    start: 12, drift: -0.05, vol: 0.42, div: 0,
    info: {
      chart: 'ฟันปลา ขึ้นแรงลงแรง',
      fin:   'P/E 80 แพงเวอร์ · ไม่มีปันผล',
      news:  'ข่าวลือซื้อกิจการ ยังไม่ยืนยัน',
      trend: 'ไม่มีพื้นฐาน วิ่งตามข่าว',
    },
    base: -1, highPE: true,
  },
];

// ============================================================
// ข้อมูลสินทรัพย์อ้างอิง (StockCity1_GDD ข้อ 8) — ไล่ระดับความเสี่ยง
//   ใช้เป็นธีมของ "ตึกตลาดสินทรัพย์" ในเมือง (ข้อ 6) + อ้างอิงสำหรับต่อยอด
//   *** ข้อมูลจำลองเพื่อการเรียนรู้ ไม่ใช่ราคาเรียลไทม์ ไม่ใช่คำแนะนำลงทุน ***
//   เรียงความเสี่ยง: BOND < GOLD < REALESTATE < STOCK < CRYPTO < STARTUP
SC.assetsRef = [
  { id: 'BOND',       name: 'พันธบัตร/กองทุน', emoji: '📜', start: 100, drift: 0.005, vol: 0.015, yield: 0.04,  tower: 'bond',       note: 'ความเสี่ยงต่ำสุด ปลอดภัย โตช้า' },
  { id: 'GOLD',       name: 'ทอง',             emoji: '🏆', start: 65,  drift: 0.010, vol: 0.04,  yield: 0,     tower: 'gold',       note: 'สินทรัพย์ปลอดภัย ขึ้นเวลาตลาดผันผวน' },
  { id: 'REALESTATE', name: 'อสังหา',          emoji: '🏠', start: 120, drift: 0.015, vol: 0.03,  yield: 0.04,  tower: 'realestate', note: 'ราคานิ่ง ปันผลค่าเช่าสม่ำเสมอ' },
  { id: 'STOCK',      name: 'หุ้นใหญ่',        emoji: '📈', start: 47,  drift: 0.03,  vol: 0.05,  yield: 0.03,  tower: 'chart',      note: 'ไต่ขึ้นทำ new high เศรษฐกิจหนุน' },
  { id: 'CRYPTO',     name: 'คริปโต',          emoji: '🪙', start: 25,  drift: 0.02,  vol: 0.35,  yield: 0,     tower: 'crypto',     note: 'ฟันปลา ขึ้นแรงลงแรง กระแสแรงแต่เสี่ยง' },
  { id: 'STARTUP',    name: 'สตาร์ทอัพ',       emoji: '🚀', start: 8,   drift: 0.06,  vol: 0.50,  yield: 0,     tower: 'startup',    note: 'เหวี่ยงสุด (เฉพาะ VC เข้าถึง) ถ้ารอดโตก้าวกระโดด' },
];

SC.getAssetRefByTower = function (towerId) {
  return SC.assetsRef.find(function (a) { return a.tower === towerId; }) || null;
};

SC.getStock = function (id) {
  return SC.stocks.find(function (s) { return s.id === id; });
};

// ราคาใหม่ = ราคาเก่า × (1 + ดริฟต์จริง + สุ่ม(-vol..+vol)) ขั้นต่ำ 1
SC.stepPrice = function (price, stock) {
  var r = stock.drift + (Math.random() * 2 - 1) * stock.vol;
  return Math.max(1, price * (1 + r));
};

// ปันผลต่อสัปดาห์ = จำนวนหุ้น × ราคา × (ปันผลต่อปี ÷ 4)
SC.dividendFor = function (shares, price, stock) {
  return shares * price * (stock.div / 4);
};
