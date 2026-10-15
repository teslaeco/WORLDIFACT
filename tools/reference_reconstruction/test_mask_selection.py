"""Selection contracts with marked synthetic masks and existing real evidence.
Fixture masks are not new robot segmentation or evidence of 3D quality.
"""
import hashlib,json,os,tempfile,unittest
from pathlib import Path
import numpy as np
from mask_selection import PROTECTED_REGIONS,evaluate_masks,replay
FG=[(530,80)];BG=[(970,520)];HOLD=[(510,1060)]

def fixture():
    m=np.zeros((1402,1122),dtype=bool);m[:800,100:500]=True
    for x0,y0,x1,y1 in PROTECTED_REGIONS.values():m[y0:y1,x0:x1]=True
    for x,y in FG:m[y,x]=True
    return m

def choose(masks,scores):
    return evaluate_masks(masks,[{'index':i,'modelPredictedIoU':v} for i,v in enumerate(scores)],FG,BG,HOLD)

class MaskSelectionTests(unittest.TestCase):
    def test_high_score_cannot_hide_missing_foot(self):
        good=fixture();bad=good.copy();x0,y0,x1,y1=PROTECTED_REGIONS['front_foot'];bad[y0:y1,x0:x1]=False
        chosen,rows=choose([bad,good],[.99,.4])
        self.assertTrue(rows[0]['passesAnchorScreen'])
        self.assertFalse(rows[0]['passesIntegrityScreen']);self.assertEqual(chosen['index'],1)
    def test_no_candidate_is_selected_when_all_erase_forearm(self):
        m=fixture();x0,y0,x1,y1=PROTECTED_REGIONS['exposed_forearm'];m[y0:y1,x0:x1]=False
        chosen,rows=choose([m],[.99]);self.assertIsNone(chosen)
        self.assertIn('exposed_forearm',rows[0]['failedProtectedRegions'])
    def test_background_holdout_is_not_waived(self):
        m=fixture();m[1060,510]=True
        self.assertIsNone(choose([m],[.99])[0])
    def test_selection_never_mutates_original_masks(self):
        m=fixture();old=m.copy();choose([m],[.4]);np.testing.assert_array_equal(m,old)
    def test_dimensions_types_and_scores_are_validated(self):
        for m,s in [(np.zeros((512,512),bool),.9),(fixture().astype(float),.9),(fixture(),float('nan')),(fixture(),True)]:
            with self.subTest(score=s),self.assertRaises(ValueError):choose([m],[s])
    def test_forged_candidate_pass_flag_is_recomputed(self):
        chosen,rows=evaluate_masks([np.zeros((1402,1122),bool)],[{'index':0,'modelPredictedIoU':1.,'passesAnchorScreen':True,'passesIntegrityScreen':True}],FG,BG,HOLD)
        self.assertIsNone(chosen);self.assertFalse(rows[0]['passesIntegrityScreen'])
    def test_original_archived_masks_replay_without_new_inference(self):
        directory=os.getenv('ECOMECH_MASK_ARCHIVE')
        if not directory:self.skipTest('Dedicated replay workflow supplies the actual archived SAM result')
        root=Path(directory)
        before={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in root.iterdir() if p.is_file()}
        with tempfile.TemporaryDirectory() as tmp:
            out=Path(tmp)/'replayed';r=replay(root,out)
            self.assertEqual(r['previousSelectedIndex'],5);self.assertEqual(r['selectedIndex'],3)
            old=r['candidates'][5];new=r['candidates'][3]
            self.assertTrue(old['passesAnchorScreen']);self.assertFalse(old['passesIntegrityScreen'])
            self.assertIn('front_foot',old['failedProtectedRegions'])
            self.assertIn('exposed_forearm',old['failedProtectedRegions'])
            self.assertTrue(new['passesIntegrityScreen'])
            self.assertGreaterEqual(min(new['protectedRegionRetention'].values()),.95)
            self.assertTrue(r['originalRgbUnchanged']);self.assertEqual(r['newInferenceCalls'],0)
            self.assertFalse(r['printReady']);self.assertFalse(r['visual3DQualityApproved'])
            np.testing.assert_array_equal(np.asarray(__import__('PIL.Image',fromlist=['open']).open(out/'mask.png')),
                np.asarray(__import__('PIL.Image',fromlist=['open']).open(root/'candidate-mask-3.png')))
        after={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in root.iterdir() if p.is_file()}
        self.assertEqual(before,after)

if __name__=='__main__':unittest.main(verbosity=2)
