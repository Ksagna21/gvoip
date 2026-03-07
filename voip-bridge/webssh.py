#!/usr/bin/env python3
"""Mini proxy WebSSH - ouvre ttyd avec ssh vers l'IP demandée"""
from http.server import HTTPServer, BaseHTTPRequestHandler
import subprocess, socket, re

procs = {}  # ip -> {"proc": Popen, "port": int}

def free_port():
    s = socket.socket(); s.bind(('', 0)); p = s.getsockname()[1]; s.close(); return p

THEME = '{"background":"#0d1117","foreground":"#e6edf3","cursor":"#58a6ff","cursorAccent":"#0d1117","selection":"rgba(88,166,255,0.3)","black":"#484f58","red":"#ff7b72","green":"#3fb950","yellow":"#d29922","blue":"#58a6ff","magenta":"#bc8cff","cyan":"#39c5cf","white":"#b1bac4","brightBlack":"#6e7681","brightRed":"#ffa198","brightGreen":"#56d364","brightYellow":"#e3b341","brightBlue":"#79c0ff","brightMagenta":"#d2a8ff","brightCyan":"#56d4dd","brightWhite":"#f0f6fc"}'

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def do_GET(self):
        m = re.match(r'/ssh\?ip=([\d.]+)', self.path)
        if not m:
            self.send_response(404); self.end_headers(); return

        ip = m.group(1)

        # Réutiliser le process existant si toujours actif
        if ip in procs and procs[ip]["proc"].poll() is None:
            port = procs[ip]["port"]
        else:
            port = free_port()
            proc = subprocess.Popen([
                'ttyd', '-p', str(port), '--writable',
                '-t', f'theme={THEME}',
                '-t', 'fontSize=11',
                '-t', 'fontFamily=JetBrains Mono,Fira Code,monospace',
                'ssh', '-o', 'StrictHostKeyChecking=no',
                '-o', 'UserKnownHostsFile=/dev/null',
                f'root@{ip}'
            ])
            procs[ip] = {"proc": proc, "port": port}

        self.send_response(302)
        self.send_header('Location', f'http://192.168.1.157:{port}')
        self.end_headers()

HTTPServer(('0.0.0.0', 9061), Handler).serve_forever()
