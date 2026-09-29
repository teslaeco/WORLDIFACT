from pathlib import Path
p=Path('ops/private-game-lab-finished.json')
if p.exists(): raise SystemExit(0)
def edit(path,old,new,count=1):
    f=Path(path);s=f.read_text()
    if s.count(old)!=count: raise RuntimeError('Unexpected finishing context: '+path+' :: '+old[:80])
    f.write_text(s.replace(old,new))
edit('src/components/EighteenCrystal.tsx', "export const CRYSTAL_FACES = [...Array.from({length:8},(_,i)=>[i,(i+1)%8,8+i]),...Array.from({length:8},(_,i)=>[8+i,(i+1)%8,8+(i+1)%8]),Array.from({length:8},(_,i)=>7-i),Array.from({length:8},(_,i)=>8+i)]", "import { CRYSTAL_FACES } from '../lib/crystal18'")
edit('src/pages/CreditsPage.tsx', "['creator','Creator SOL','$29.99','1,500 credits','30 SOL or 100 LUNA generations','SOL 50 credits · LUNA 15 credits']", "['creator','Creator SOL','$29.99','1,500 credits','2 ASTRA + 20 SOL, or up to 6 ASTRA attempts after activation','LUNA 15 · SOL 50 · ASTRA 250 credits']")
edit('src/pages/CreditsPage.tsx', 'Astra is blocked on this plan so a Sol subscription cannot accidentally spend Astra rates.', 'Creator can try Astra after runtime activation: budget 500 of the included points for two attempts; maximum six Astra attempts per paid period. These are not extra credits or guaranteed successful outputs.')
edit('src/pages/CreditsPage.tsx', 'On active Pro/Studio, the same credits may fund up to 6 ASTRA generations', 'Astra needs active membership and runtime availability. Creator stays limited to six attempts per paid period, including top-ups.')
edit('src/pages/CreditsPage.tsx', 'Detailed ASTRA generation is reserved for Pro and Studio and costs 250 credits per generation.', 'Detailed ASTRA generation costs 250 credits per attempt on eligible Creator, Pro and Studio accounts after runtime activation. The existing 1,500-credit Creator grant can fund two Astra attempts plus twenty Sol attempts, not thirty Sol plus free Astra.')
edit('src/pages/CreditsPage.tsx', '        <h2>{name}</h2>', '        <h2>{name}</h2>\n        {id === \'creator\' && billing?.plans?.pro?.blockedReason === \'ASTRA_COST_GUARD_REQUIRED\' && <p className="credits-method-note">Creator ASTRA access is prepared, but is not live until the updated generator passes its end-to-end test. Luna and Sol remain separate available paths.</p>}')
for path in ['src/pages/AccountPage.tsx','src/pages/InfoPage.tsx','src/pages/ShopPage.tsx','src/components/GenerationCostNotice.tsx']:
    f=Path(path);s=f.read_text()
    for old,new in [
        ('Astra requires Pro or Studio.', 'Astra requires eligible membership and verified runtime activation.'),
        ('Astra requires Pro or Studio and costs 250 points.', 'Astra costs 250 points on eligible Creator, Pro and Studio accounts after verified runtime activation.'),
        ('Astra generation requires Pro or Studio and costs 250 credits.', 'Astra costs 250 credits on eligible Creator, Pro and Studio accounts after activation.'),
        ('Astra uses 250 credits and requires Pro or Studio.', 'Astra uses 250 credits on eligible memberships after runtime activation.'),
        ('ASTRA requires Pro or Studio', 'ASTRA requires eligible membership and runtime activation'),
        ('Pro and Studio plans unlock ASTRA at 250 credits per generation.', 'Creator, Pro and Studio prepare ASTRA at 250 credits per attempt after runtime activation.'),
        ('Pro and Studio unlock ASTRA at 250 credits per generation.', 'Creator, Pro and Studio prepare ASTRA at 250 credits per attempt after runtime activation.'),
    ]:s=s.replace(old,new)
    f.write_text(s)
# Intentional catalogue expansion is separately tested against the disabled runtime gate,
# six-attempt period cap, unchanged dollar reserves, refunds and invoice replay.
edit('tests/account-entry.test.mjs', '/ASTRA at 250 credits per generation/', '/ASTRA at 250 credits per attempt after runtime activation/')
edit('tests/affordable-models.test.ts', "modelAllowed('creator','astra'),false", "modelAllowed('creator','astra'),true")
p.write_text('{"revision":"private-game-lab-v1","paidCalls":0}\n')
