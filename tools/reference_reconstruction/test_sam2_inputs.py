"""Pure input tests: no model download, GPU, source upload or paid generation."""
import copy,unittest
from sam2_reference_mask import FOREGROUND,BACKGROUND,point_inputs

def depth(value):
    return 1+max((depth(x) for x in value),default=0) if isinstance(value,list) else 0

class PointContractTests(unittest.TestCase):
    def test_original_tuple_form_reproduces_processor_regression(self):
        self.assertEqual(depth([[FOREGROUND+BACKGROUND]]),3)
    def test_normalized_points_have_the_documented_four_list_levels(self):
        p=point_inputs()
        self.assertEqual(depth(p['input_points']),4)
        self.assertEqual(depth(p['input_labels']),3)
        self.assertEqual(len(p['input_points'][0][0]),24)
        self.assertEqual(len(p['input_labels'][0][0]),24)
        self.assertTrue(all(type(x) is list for x in p['input_points'][0][0]))
    def test_normalization_does_not_mutate_or_move_source_coordinates(self):
        before=copy.deepcopy((FOREGROUND,BACKGROUND))
        p=point_inputs()
        self.assertEqual([tuple(v) for v in p['input_points'][0][0]],FOREGROUND+BACKGROUND)
        self.assertEqual((FOREGROUND,BACKGROUND),before)
        self.assertEqual(p['input_labels'],[[[1]*14+[0]*10]])
    def test_invalid_coordinates_fail_before_any_model_load(self):
        for pair in ((-1,2),(1122,3),(3,1402),(True,3),(1.5,2),('3',4),(1,),None):
            with self.subTest(pair=pair),self.assertRaises(ValueError):
                point_inputs([pair],[(5,5)])
    def test_background_and_foreground_must_both_exist(self):
        for fg,bg in (([],[(1,1)]),([(1,1)],[])):
            with self.assertRaises(ValueError):point_inputs(fg,bg)
    def test_conflicting_labels_for_same_pixel_are_rejected(self):
        with self.assertRaisesRegex(ValueError,'DUPLICATE_OR_CONTRADICTORY_PROMPT'):
            point_inputs([(2,2)],[(2,2)])
    def test_multiple_calls_return_fresh_lists(self):
        a=point_inputs();a['input_points'][0][0][0][0]=-9
        self.assertEqual(point_inputs()['input_points'][0][0][0],[530,80])

if __name__=='__main__':unittest.main(verbosity=2)
