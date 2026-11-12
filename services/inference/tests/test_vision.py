import copy
import io
import json
import os
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from unittest.mock import patch
from PIL import Image
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from vision import analyze, configuration, parse_response, provider_schema

INVENTORY = {'machines': [], 'summary': 'A worker wears welding equipment.', 'warnings': [], 'findings': [
    {'personId': 'P1', 'description': 'Worker in the centre, wearing dark coveralls.',
     'equipment': [{'name': 'Welding helmet', 'category': 'ppe', 'status': 'worn', 'evidence': 'Full face welding shield is lowered.'},
                   {'name': 'Protective gloves', 'category': 'ppe', 'status': 'worn', 'evidence': 'Long gloves cover both hands.'},
                   {'name': 'Boots', 'category': 'workwear', 'status': 'worn', 'evidence': 'Boots visible; toe protection cannot be verified.'},
                   {'name': 'Welding torch', 'category': 'equipment', 'status': 'carried', 'evidence': 'Torch held in right hand.'},
                   {'name': 'Possible ear plugs', 'category': 'ppe', 'status': 'uncertain', 'evidence': 'Ears are partially obscured.'}],
     'requiredChecks': [{'name': 'Protective gloves', 'status': 'observed', 'evidence': 'Gloves visible on both hands.'}],
     'limitations': ['Ear protection and boot certification are not verifiable.']}]}

def response(inventory=INVENTORY, finish='STOP'):
    return {'candidates': [{'finishReason': finish, 'content': {'parts': [{'text': json.dumps({'machines': [], **inventory})}]}}]}

class VisionTests(unittest.TestCase):
    def test_inventory_preserves_all_items_and_uncertainty(self):
        data = parse_response(response(), ['Protective gloves'])
        self.assertEqual(len(data['findings'][0]['equipment']), 5)
        self.assertEqual(data['findings'][0]['equipment'][3]['status'], 'carried')
        self.assertEqual(data['findings'][0]['equipment'][4]['status'], 'uncertain')

    def test_no_person_is_valid_without_a_compliance_claim(self):
        self.assertEqual(parse_response(response({'summary': 'No people visible.', 'findings': [], 'warnings': []}), [])['findings'], [])

    def test_incomplete_blocked_invalid_and_duplicate_responses_fail(self):
        for data in [response(finish='MAX_TOKENS'), {}, {'candidates': []}, response({'summary': 'Missing data'}), response({**INVENTORY, 'findings': INVENTORY['findings'] * 2})]:
            with self.subTest(data=data), self.assertRaises(ValueError):
                parse_response(data, ['Protective gloves'])

    def test_missing_or_duplicate_required_checks_fail(self):
        for checklist in [[], INVENTORY['findings'][0]['requiredChecks'] * 2]:
            data = copy.deepcopy(INVENTORY)
            data['findings'][0]['requiredChecks'] = checklist
            with self.assertRaisesRegex(ValueError, 'checklist'):
                parse_response(response(data), ['Protective gloves'])

    def test_no_key_and_paid_model_are_not_ready(self):
        with patch.dict(os.environ, {'GEMINI_API_KEY': ''}):
            with self.assertRaisesRegex(ValueError, 'free-tier GEMINI_API_KEY'): configuration()
        with patch.dict(os.environ, {'GEMINI_API_KEY': 'test-only', 'GEMINI_MODEL': 'gemini-2.5-pro'}):
            with self.assertRaisesRegex(ValueError, 'free-tier'): configuration()

    def test_schema_is_expanded_and_has_inventory_categories(self):
        schema = provider_schema()
        self.assertNotIn('$ref', json.dumps(schema))
        self.assertEqual(schema['properties']['findings']['items']['properties']['equipment']['items']['properties']['status']['enum'], ['worn', 'carried', 'uncertain'])

    def test_provider_schema_avoids_rejected_limits_but_response_limits_remain(self):
        schema = json.dumps(provider_schema())
        for keyword in ('minLength', 'maxLength', 'minItems', 'maxItems'):
            self.assertNotIn(keyword, schema)
        for change in ({'summary': 'x' * 1501}, {'findings': INVENTORY['findings'] * 101}):
            with self.subTest(change=next(iter(change))), self.assertRaisesRegex(ValueError, 'invalid equipment inventory'):
                parse_response(response({**INVENTORY, **change}), ['Protective gloves'])

    def test_real_http_adapter_sends_image_private_key_and_handles_quota(self):
        captured = {}
        class Handler(BaseHTTPRequestHandler):
            status = 200
            def log_message(self, *args): pass
            def do_POST(self):
                captured['path'] = self.path
                captured['key'] = self.headers.get('x-goog-api-key')
                captured['body'] = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                self.send_response(self.status)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(response()).encode())
        server = HTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
        try:
            with patch.dict(os.environ, {'GEMINI_API_KEY': 'test-only', 'GEMINI_MODEL': 'gemini-2.5-flash', 'GEMINI_BASE_URL': f'http://127.0.0.1:{server.server_port}'}):
                context = 'Lathe turning steel; model unknown.'
                data, model = analyze(Image.new('RGB', (300, 200)), ['Protective gloves'], context)
                self.assertEqual(data, INVENTORY)
                self.assertEqual(model, 'gemini-2.5-flash')
                self.assertEqual(captured['key'], 'test-only')
                self.assertEqual(captured['path'], '/models/gemini-2.5-flash:generateContent')
                body = captured['body']
                self.assertEqual(body['generationConfig']['responseMimeType'], 'application/json')
                self.assertTrue(body['contents'][0]['parts'][1]['inlineData']['data'])
                self.assertEqual(json.loads(body['contents'][0]['parts'][2]['text'].split(': ', 1)[1]), context)
                Handler.status = 429
                with self.assertRaisesRegex(ValueError, 'no paid fallback'): analyze(Image.new('RGB', (300, 200)), [])
        finally:
            server.shutdown(); server.server_close(); thread.join()

MACHINE = {'machineId': 'M1', 'name': 'Metalworking lathe', 'identification': 'likely',
           'description': 'Visible chuck, bed and carriage.', 'entanglementRisk': True,
           'hazards': [{'name': 'Rotating chuck', 'basis': 'visible', 'details': 'Chuck and spindle area are visible.'},
                       {'name': 'Flying swarf', 'basis': 'typical', 'details': 'Verify the machining task and guarding.'}],
           'precautions': [{'phase': 'before_use', 'action': 'Verify guards and operator training.', 'reason': 'Prevent access to moving parts.'},
                           {'phase': 'maintenance', 'action': 'Follow the approved energy-isolation procedure.', 'reason': 'Emergency stop alone does not isolate energy.'}],
           'recommendedWearables': [{'name': 'Safety glasses', 'category': 'ppe', 'usage': 'recommended', 'purpose': 'Protect eyes from chips.', 'condition': 'Select suitable protection for the material and task.'},
                                   {'name': 'Handling gloves', 'category': 'ppe', 'usage': 'task_dependent', 'purpose': 'Protect from sharp stock.', 'condition': 'Only for handling after safe stopping and isolation; never near rotating parts.'}],
           'limitations': ['Photo guidance is preliminary; verify the machine manual and task risk assessment.'],
           'questions': ['What model and machining task are planned?']}

class MachineryTests(unittest.TestCase):
    def test_machinery_without_people_preserves_precautions_and_operator_ppe(self):
        data = parse_response(response({'summary': 'A lathe, without an operator.', 'findings': [], 'machines': [MACHINE], 'warnings': []}), [])
        self.assertEqual(data['findings'], [])
        self.assertEqual(data['machines'][0]['recommendedWearables'][1]['usage'], 'task_dependent')
        self.assertEqual(data['machines'][0]['hazards'][1]['basis'], 'typical')

    def test_duplicate_machines_and_unsafe_glove_recommendations_are_rejected(self):
        unsafe = copy.deepcopy(MACHINE)
        unsafe['recommendedWearables'][1]['usage'] = 'recommended'
        for machines in ([MACHINE, MACHINE], [unsafe]):
            with self.subTest(machines=machines), self.assertRaises(ValueError):
                parse_response(response({'summary': 'A lathe.', 'findings': [], 'machines': machines, 'warnings': []}), [])

    def test_missing_safety_content_and_oversized_context_notes_fail(self):
        for changed in ({'precautions': []}, {'recommendedWearables': []}, {'limitations': ['x' * 1001]}):
            with self.subTest(changed=changed), self.assertRaises(ValueError):
                parse_response(response({'summary': 'A lathe.', 'findings': [], 'machines': [{**MACHINE, **changed}], 'warnings': []}), [])

if __name__ == '__main__': unittest.main()
