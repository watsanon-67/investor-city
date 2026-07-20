// ============================================================
// resolve.js — ประมวลผลท้ายรอบ "อัตโนมัติเบื้องหลังทันที" (GAME_SPEC 5.1)
//   ไม่มีหน้าจอรอ/หน้าสรุปแล้ว — ผู้เล่นเห็นความเปลี่ยนแปลงเองจากกราฟ/HUD
//   ลำดับ: ข่าวครบกำหนด → ราคาขยับ → รายได้สินทรัพย์/ปันผล → ดอกเบี้ยธนาคาร
//          → GreenHub เดินเดือน → ตัวนับสถานะลด
// ============================================================
SC.resolve = {};

SC.resolve.endRound = function () {
  var s = SC.state;
  var all = [s.player].concat(s.bots);

  // 1) ข่าวครบกำหนดรอบนี้: ข่าวจริงให้ตัวคูณราคา + เฉลยให้ทุกคนเห็น
  var due = SC.newsSys.collectDue();

  // 1.5) เหตุการณ์: เตรียมตลาด (M/วันบ้า) + regime เดิน 1 ก้าว — ก่อนขยับราคาใดๆ (EVENTS_SPEC ข้อ 4/8)
  if (SC.events) { SC.events.prepareMarket(s); SC.events.advanceRegime(s); }
  var divM = SC.events ? SC.events.divMult() : 1;

  // 2) ราคาหุ้นขยับ (สูตร correlation ข้อ 4) × ตัวคูณเหตุการณ์(ใน stepAsset) × ตัวคูณข่าว แล้วเก็บลงประวัติ
  var newPrices = {};
  SC.stocks.forEach(function (st) {
    var p = SC.events ? SC.events.stepAsset(s.prices[st.id], st.id, st.drift, st.vol) : SC.stepPrice(s.prices[st.id], st);
    if (due.factors[st.id]) p = Math.max(1, p * due.factors[st.id]);
    newPrices[st.id] = p;
  });
  SC.pushWeekPrices(newPrices);

  // 3) ปันผลหุ้นเข้าเงินสดทุกคน (× divMult เหตุการณ์)
  all.forEach(function (a) {
    SC.stocks.forEach(function (st) {
      a.cash += SC.dividendFor(a.holdings[st.id], newPrices[st.id], st) * divM;
    });
  });

  // 4) ตลาดสินทรัพย์ขยับ + จ่ายค่าเช่า(×rentMult)/ดอกเบี้ย/ปันผลกองทุน(×divMult) (ทุกคน)
  if (SC.markets) SC.markets.stepWeek();
  SC.newsSys.applyToMarkets(due.factors); // ข่าวเหรียญ/ทองคูณเข้าราคาล่าสุด

  // 5) ธนาคาร: ดอกฝากเข้า (เครดิตพังอด) + ดอกหนี้ทบ (อ่านดอกเบี้ยจาก s.events.rates)
  all.forEach(function (a) { SC.bank.endRound(a); });

  // 6) GreenHub เดินเดือนธุรกิจ (1 รอบเกม = 1 เดือนของฮับ · อ่าน custMult/fixedMult)
  if (SC.greenhub) SC.greenhub.advanceTurn();

  // 7) ตัวนับสถานะลด
  all.forEach(function (a) {
    if (a.brokenCredit > 0) a.brokenCredit--;
  });

  // 8) เหตุการณ์: ลดตัวนับ active/closed/volBoost/rates + คืนค่า default + เฉลย prophecy
  if (SC.events) SC.events.onRoundEnd(s);

  // เฉลยข่าวเข้าฟีดสาธารณะ
  due.reveals.forEach(function (txt) { SC.feedPush('📰 ' + txt, 'news'); });
};
