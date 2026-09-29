from pathlib import Path
p=Path('src/pages/PrivateGameLab.tsx')
s=p.read_text()
old="if(entityId)setTransformMode('move')};else"
new="if(entityId)setTransformMode('move')}else"
if old in s:
    assert s.count(old)==1
    p.write_text(s.replace(old,new))
elif new not in s:
    raise RuntimeError('Unexpected selection integration')
print('Selection branch syntax verified.')
