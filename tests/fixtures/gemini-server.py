"""Explicit local HTTP test provider. Never used by application setup or startup."""
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args): pass
    def do_POST(self):
        payload = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))))
        checklist = json.loads(payload['contents'][0]['parts'][0]['text'].split(': ', 1)[1])
        inventory = {'summary': 'No people visible in this test image.', 'findings': [], 'warnings': []}
        if checklist:
            inventory = {'summary': 'Explicit test fixture: worker with welding equipment.', 'warnings': [], 'findings': [{
                'personId': 'P1', 'description': 'Test worker at the centre.',
                'equipment': [
                    {'name': 'Welding helmet', 'category': 'ppe', 'status': 'worn', 'evidence': 'Test fixture welding shield.'},
                    {'name': 'Protective gloves', 'category': 'ppe', 'status': 'worn', 'evidence': 'Test fixture gloves.'},
                    {'name': 'Boots', 'category': 'workwear', 'status': 'worn', 'evidence': 'Test fixture boots; protection unverifiable.'},
                    {'name': 'Welding torch', 'category': 'equipment', 'status': 'carried', 'evidence': 'Test fixture carried torch.'},
                ],
                'requiredChecks': [{'name': name, 'status': 'observed', 'evidence': 'Explicit fixture observation.'} for name in checklist],
                'limitations': ['Test response, not live image recognition.'],
            }]}
        inventory['machines'] = []
        response = {'candidates': [{'finishReason': 'STOP', 'content': {'parts': [{'text': json.dumps(inventory)}]}}]}
        self.send_response(200); self.send_header('Content-Type', 'application/json'); self.end_headers()
        self.wfile.write(json.dumps(response).encode())
HTTPServer(('127.0.0.1', 8270), Handler).serve_forever()
