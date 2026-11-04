import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

class NavigationCardIntegration(unittest.TestCase):
    def execute(self,script,*args):
        result=subprocess.run([sys.executable,'app/skill_runner.py','execute','--script',script,'--',*args],capture_output=True,text=True,cwd=ROOT,timeout=15)
        return result,json.loads(result.stdout)

    def test_all_platforms_use_registered_tools_and_three_field_observations(self):
        for script,fid,iid in [('ainvest_android_entry.py','chart.quote','aapl-nasdaq'),('ainvest_ios_entry.py','chart.quote','ios:185:AAPL'),('ainvest_web_entry.py','chart.security','stocks:NASDAQ-AAPL')]:
            with self.subTest(script=script):
                result,receipt=self.execute(script,'--feature-id',fid,'--instrument-id',iid)
                self.assertEqual(result.returncode,0,result.stderr)
                self.assertTrue(receipt['ok'])
                self.assertEqual(set(receipt['observation']),{'title','icon','url'})
                self.assertEqual(receipt['artifacts'],[])

    def test_old_entry_tools_are_not_allowlisted(self):
        for name in ('app_feature_entry.py','ios_feature_entry.py','web_feature_entry.py'):
            result,receipt=self.execute(name,'--ia')
            self.assertNotEqual(result.returncode,0)
            self.assertFalse(receipt['ok'])

    def test_no_direct_binding_never_generates_a_parent_card(self):
        result,receipt=self.execute('ainvest_android_entry.py','--feature-id','chart.financials','--instrument-id','aapl-nasdaq')
        self.assertNotEqual(result.returncode,0)
        self.assertFalse(receipt['ok'])
        self.assertIsNone(receipt['observation'])

    def test_bridge_routes_removed_and_resources_exist(self):
        presentation=(ROOT/'app/presentation.py').read_text()
        for name in ('app_navigation_router','app_web_navigation_router','app_ios_navigation_router'):
            self.assertNotIn(name,presentation)
        for name in ('app_navigation.py','app_ios_navigation.py','app_web_navigation.py'):
            self.assertFalse((ROOT/'app'/name).exists())
        icons=json.loads((ROOT/'app/skills/ainvest-ios-navigation/references/icon-registry.json').read_text())['icons']
        for name in icons:self.assertTrue((ROOT/f'app/static/assets/ainvest-navigation/icons/{name}.svg').is_file())

    def test_registry_contract_returns_card_schema(self):
        result=subprocess.run([sys.executable,'app/skill_runner.py','contract','--script','ainvest_ios_entry.py'],capture_output=True,text=True,cwd=ROOT,timeout=15)
        receipt=json.loads(result.stdout)
        self.assertTrue(receipt['ok'])
        self.assertEqual(set(receipt['schema']['required']),{'title','icon','url'})

    def test_diagnostics_must_stay_in_output_directory(self):
        result,receipt=self.execute('ainvest_ios_entry.py','--feature-id','profile.settings','--diagnostics-output','/tmp/ainvest-forbidden-diagnostics.json')
        self.assertNotEqual(result.returncode,0)
        self.assertFalse(receipt['ok'])
        self.assertIn('outputs/',receipt['error'])

if __name__=='__main__':unittest.main()
