import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from matching import associate
class MatchingTests(unittest.TestCase):
    def person(self,box=None):return {'class':'person','confidence':.9,'box':box or [10,10,100,210],'personId':None}
    def equipment(self,cls,conf=.9):return {'class':cls,'confidence':conf,'box':[30,20,60,40],'personId':None}
    def test_absence_unknown(self):
        f=associate([self.person()],300,300)[0];self.assertEqual(f['helmet'],'unknown');self.assertEqual(f['vest'],'unknown')
    def test_no_person_not_compliant(self):self.assertEqual(associate([self.equipment('helmet')],300,300),[])
    def test_positive(self):self.assertEqual(associate([self.person(),self.equipment('helmet')],300,300)[0]['helmet'],'detected')
    def test_explicit_missing(self):self.assertEqual(associate([self.person(),self.equipment('no_helmet')],300,300)[0]['helmet'],'potential_missing')
    def test_crop_unknown(self):self.assertEqual(associate([self.person([0,0,100,210]),self.equipment('no_helmet')],300,300)[0]['helmet'],'unknown')
    def test_low_confidence_unknown(self):self.assertEqual(associate([self.person(),self.equipment('helmet',.3)],300,300)[0]['helmet'],'unknown')
    def test_ambiguous_unknown(self):self.assertTrue(all(f['helmet']=='unknown' for f in associate([self.person(),self.person(),self.equipment('helmet')],300,300)))
    def test_contradictory_unknown(self):self.assertEqual(associate([self.person(),self.equipment('helmet'),self.equipment('no_helmet')],300,300)[0]['helmet'],'unknown')
