#!/usr/bin/env python3
from http.server import HTTPServer, BaseHTTPRequestHandler
import json, subprocess, logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')

class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args): pass

    def do_POST(self):
        if self.path == "/api/setup-freepbx":
            length = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(length))
            ip = body.get("ip", "")
            ami_user = body.get("ami_user", "gvoip")
            ami_password = body.get("ami_password", "gvoip2024")
            ssh_user = body.get("ssh_user", "root")
            ssh_password = body.get("ssh_password", "")
            ssh_sudo_password = body.get("ssh_sudo_password", "")

            if not ip:
                self.send_response(400)
                self.end_headers()
                return

            logging.info(f"Configuration AMI sur {ip} (ssh_user={ssh_user})...")
            env = __import__('os').environ.copy()
            cmd = ["/opt/gvoip/bridge/setup-freepbx.sh", ip, ami_user, ami_password,
                   ssh_user, ssh_password, ssh_sudo_password]
            if ssh_password:
                env['SSHPASS'] = ssh_password
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=60, env=env)
            logging.info(result.stdout)

            if result.returncode == 0:
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"status": "ok", "output": result.stdout}).encode())
            else:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "output": result.stderr}).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

if __name__ == "__main__":
    server = HTTPServer(("0.0.0.0", 8081), Handler)
    logging.info("API server démarré sur port 8081")
    server.serve_forever()
