"""Finish the exact reviewed integration. No API, card or production mutation."""
from pathlib import Path
import json
marker = Path('ops/model-quality-v3-finished.json')
if marker.exists():
    print('Finishing edits already applied.'); raise SystemExit(0)
changes=[]
def change(path, old, new, count=1):
    p=Path(path);s=p.read_text()
    if s.count(old)!=count: raise RuntimeError(f'Unexpected finishing context: {path}: {old[:80]} count={s.count(old)}')
    p.write_text(s.replace(old,new));changes.append(path)
change('tests/shop-draft-lifecycle.test.mjs', "h.button('Generate FAST').props.disabled", "h.button('Generate GPT-6 Sol').props.disabled")
change('server/billing.ts', 'generationCosts: { sol: 50, astra: 250 }', 'generationCosts: { sol: 50, astra: 250, luna: 15 }')
change('src/components/AccountStatusBar.tsx', 'Free SOL: <b>', 'Free drafts: <b>')
change('src/pages/CreditsPage.tsx', '<h2>Free SOL</h2>', '<h2>Free SOL / LUNA</h2>')
change('src/pages/CreditsPage.tsx', '<b>2 SOL FAST generations</b>', '<b>2 shared SOL / LUNA draft attempts</b>')
change('src/pages/CreditsPage.tsx', 'Available now: {balance.free.fastRemaining} SOL FAST', 'Personal allowance: {balance.free.fastRemaining} shared drafts; funded capacity is checked at submission')
change('src/pages/CreditsPage.tsx', 'SOL only · 50 credits / generation', 'SOL 50 points · LUNA 15 points', 0)
# Remove the preceding zero-count assertion without manufacturing a replacement.
change('src/pages/ShopPage.tsx', 'Free accounts can use up to 2 Sol FAST drafts per rolling 24 hours when funded capacity and the verified Sol worker are available.', 'Free accounts can share up to 2 Sol or Luna drafts per rolling 24 hours when funded capacity is available.')
change('src/pages/ShopPage.tsx', 'Free Sol FAST includes downloads. Astra generation requires Pro or Studio and costs 250 credits.', 'Eligible free Sol or Luna drafts include GLB downloads. Astra requires Pro or Studio and costs 250 points.')
change('src/pages/ShopPage.tsx', 'Free: up to 2 Sol FAST drafts per rolling 24 hours when funded capacity is available. Creator SOL uses 50 credits per Sol generation. Astra uses 250 credits and requires Pro or Studio.', 'Free: up to 2 shared Sol/Luna drafts per rolling 24 hours when funded capacity is available. Paid Luna uses 15 points, Sol 50 and Astra 250. Astra requires Pro or Studio.')
change('src/pages/InfoPage.tsx', 'Sol generation costs 50 credits and Astra generation costs 250 credits.', 'Luna procedural generation costs 15 credits, Sol generation costs 50 credits and Astra generation costs 250 credits. Free Sol and Luna attempts share the same personal and revenue-funded allowance; selecting another model does not reset it.')
# Existing rendering test follows the newly explicit free-model description.
change('tests/shop-external.test.mjs', '/Free Sol FAST includes downloads/', '/Eligible free Sol or Luna drafts include GLB downloads/')
marker.write_text(json.dumps({'revision':'model-quality-v3-finish','files':sorted(set(changes)),'paidRequests':0},indent=2)+'\n')
print('Shared free allowance and point pricing are consistent. No paid request.')
