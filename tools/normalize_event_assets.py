# -*- coding: utf-8 -*-
# ============================================================
# normalize_event_assets.py — ก็อปไฟล์ art เหตุการณ์ (ที่ user ส่งมาชื่อไม่ตรง)
#   ให้ตรงกับ "asset contract" (EVENTS_SPEC ข้อ 11) — ก็อปเฉยๆ ไม่ย้าย/ไม่ลบต้นฉบับ
#   รันซ้ำได้ผลเดิม · ไฟล์ปลายทางที่มีอยู่แล้วจะถูกเขียนทับ (idempotent)
#   id ไหนไม่มีไฟล์ต้นฉบับ (เช่น goldHeist / tower_broken/fin) = ปล่อยให้ fallback emoji/ความสว่างทำงาน
# ============================================================
import os, shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EV = os.path.join(ROOT, 'assets', 'events')

# icons/<src> -> icons/<dest>  (ชื่อที่ user ส่ง → id ใน catalog)
ICONS = {
    'bottoilet.png': 'botToilet.png',
    'crytocrackdown.png': 'cryptoCrackdown.png',
    'Keyboard.png': 'catKeyboard.png',
    'property bubble.png': 'propertyBubble.png',
    'roadcollasp.png': 'roadCollapse.png',
    'tax audit.png': 'taxAudit.png',
    'touristboom.png': 'tourismBoom.png',
    'earningbeat.png': 'earningsBeat.png',
    'earningMiss.png': 'earningsMiss.png',
    'ratehike.png': 'rateHike.png',
    'calmtown.png': 'calmTown.png',
    'dogsteal.png': 'dogSteal.png',
    'oldpants.png': 'oldPants.png',
    'phonedrop.png': 'phoneDrop.png',
    'pigeonbank.png': 'pigeonBank.png',
    'ratlive.png': 'ratLive.png',
    'supplierhike.png': 'supplierHike.png',
    'greencontest.png': 'greenContest.png',
    'greeninfluencer.png': 'greenInfluencer.png',
    'fortuneteller.png': 'fortuneTeller.png',
    'floodrecovery.png': 'floodRecovery.png',
    'megaproject.png': 'megaProject.png',
    'newstypo.png': 'newsTypo.png',
    'oilshock.png': 'oilShock.png',
    'taxrefund.png': 'taxRefund.png',
    # ตัวที่ตรงแล้วก็อปทับตัวเอง = ไม่ต้องทำ (dogeTweet/dogeDelete/blackout/festival/flood/geoTension/
    #   inflation/lottery/memeDump/memeSqueeze/meteor/rateCut/recession/stimulus/ufo/uncleTip/whaleDump)
}

# tower_broken/<src> -> tower_broken/<dest>  (towerId ในเกม)
TOWERS = {
    'bonds.png': 'bond.png',
    'chart_stock market.png': 'chart.png',
    'cryto.png': 'crypto.png',
    # green/news/realestate/startup ตรงแล้ว · fin ไม่มี (fallback brightness) · gold ไม่ต้องมี (ปิดไม่ได้)
}

# fx/<src> -> fx/<dest>  (contract มี robber.png — user ส่ง robber_run.png)
FX = {
    'robber_run.png': 'robber.png',
}


def cp(folder, mapping):
    d = os.path.join(EV, folder)
    if not os.path.isdir(d):
        print('  ข้าม (ไม่มีโฟลเดอร์):', folder)
        return
    for src, dest in mapping.items():
        sp = os.path.join(d, src)
        dp = os.path.join(d, dest)
        if not os.path.exists(sp):
            print('  ไม่พบต้นฉบับ:', folder + '/' + src)
            continue
        if src == dest:
            continue
        if src.lower() == dest.lower():
            # ต่างแค่ตัวพิมพ์ (Windows มองเป็นไฟล์เดียวกัน) → rename ผ่าน temp เพื่อบังคับ OS อัปเดต case ที่เก็บ
            #   (สำคัญตอน deploy บนเซิร์ฟเวอร์ case-sensitive — URL ในเกมใช้ camelCase)
            tmp = os.path.join(d, '__tmp_' + dest)
            os.replace(sp, tmp)
            os.replace(tmp, dp)
            print('  แก้ case', folder + '/' + src, '->', dest)
            continue
        shutil.copyfile(sp, dp)
        print('  ก็อป', folder + '/' + src, '->', dest)


def main():
    print('normalize event assets ->', EV)
    cp('icons', ICONS)
    cp('tower_broken', TOWERS)
    cp('fx', FX)
    print('เสร็จ (ต้นฉบับไม่ถูกลบ)')


if __name__ == '__main__':
    main()
