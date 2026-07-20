// ============================================================
// characters.js — 6 อาชีพ + สกิล (จาก StockCity1_GDD ข้อ 5 "ระบบอาชีพ")
// ============================================================
// v2: ขยายจาก 4 → 6 อาชีพตาม GDD ข้อ 5
//   free    = ตึก "ข้อมูล" ที่เก็บได้ฟรี (แกน core loop เดิม chart/fin/news/trend)
//   towers  = ตึกในเมือง (ข้อ 6) ที่อาชีพนี้ "ใช้สกิลได้" → ใช้วางตัวละครข้างตึกบนแมป
//   color   = สีตัวละคร (วาดบนแมป 2D)
// หมายเหตุ: mapping อาชีพ-ตึกปรับได้ทั้งหมด (GDD ระบุว่าเป็น default ที่จูนได้)
SC.characters = [
  {
    id: 'analyst', name: 'Roxy', role: 'นักวิเคราะห์ (Analyst)', emoji: '👩‍💼',
    color: '#4da3ff',
    free: ['chart'],
    towers: ['chart', 'leaderboard'],
    skill: 'อ่านกราฟ/เทคนิคเชิงลึก เห็นแนวโน้มแม่นกว่า → เก็บ "หอดูกราฟ" ฟรี',
  },
  {
    id: 'accountant', name: 'Scooter', role: 'นักบัญชี (Accountant)', emoji: '🧑‍💻',
    color: '#36d399',
    free: ['fin'],
    towers: ['fin', 'bond'],
    skill: 'เห็นงบ/ดอกเบี้ยลึก คำนวณผลตอบแทนจริง → เก็บ "ตึกงบการเงิน" ฟรี',
  },
  {
    id: 'journalist', name: 'Rusty', role: 'นักข่าว (Journalist)', emoji: '🎙️',
    color: '#ff9f43',
    free: ['news'],
    towers: ['news', 'realestate'],
    skill: 'ได้ข่าว insider ล่วงหน้า 1 ชิ้น (ใบ้ทิศทางราคา) → เก็บ "สำนักข่าว" ฟรี',
  },
  {
    id: 'crypto', name: 'Nova', role: 'เทรดเดอร์คริปโต (Crypto Trader)', emoji: '🧑‍🚀',
    color: '#a66bff',
    free: ['chart'],
    towers: ['crypto'],
    skill: 'เห็น volume + ส่วนลดค่าธรรมเนียมสินทรัพย์ผันผวนสูง',
  },
  {
    id: 'vc', name: 'Vera', role: 'นักลงทุน VC (Venture Capitalist)', emoji: '👩‍🔬',
    color: '#ff6b9d',
    free: ['news'],
    towers: ['startup', 'green'],
    skill: 'เข้าถึงดีลเริ่มต้น high risk/high return ที่คนอื่นเข้าไม่ถึง',
  },
  {
    id: 'economist', name: 'Theo', role: 'นักเศรษฐศาสตร์ (Economist)', emoji: '🧭',
    color: '#f7c948',
    free: ['trend'],
    towers: ['gold', 'trend'],
    skill: 'เห็นภาพมหภาค (ดอกเบี้ย/เงินเฟ้อ) ช่วยอ่านทั้งตลาด → เก็บ "ซิตี้ฮอลล์" ฟรี',
  },
];

SC.getCharacter = function (id) {
  return SC.characters.find(function (c) { return c.id === id; });
};

// คืนอาชีพที่ "เป็นเจ้าของ" ตึกในเมือง id นั้น (สำหรับวางตัวละครข้างตึก)
SC.ownerOfTower = function (towerId) {
  return SC.characters.find(function (c) { return c.towers && c.towers.indexOf(towerId) >= 0; }) || null;
};

// สุ่มสับลำดับ (Fisher-Yates)
SC._shuffle = function (arr) {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
};

// แจกอาชีพแบบสุ่ม (ไม่ให้เลือก) ตามจำนวนผู้เล่นรวม
//   เพดานต่ออาชีพ = ceil(total/2)  → เล่น 2 คน=อาชีพละ1, 4 คน=อาชีพละ2, 6 คน=อาชีพละ3
//   คืน array ความยาว = total ของ id อาชีพ (ผู้เล่นได้ตัวแรก ที่เหลือเป็นบอท)
SC.assignProfessions = function (total) {
  var cap = Math.ceil(total / 2);
  var pool = [];
  SC.characters.forEach(function (c) {
    for (var i = 0; i < cap; i++) pool.push(c.id);
  });
  SC._shuffle(pool);
  return pool.slice(0, total);
};
