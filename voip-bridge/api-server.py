#!/usr/bin/env python3
from http.server import HTTPServer, BaseHTTPRequestHandler
import json, subprocess, logging, os, socket
from urllib.parse import urlparse, parse_qs

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')

def ssh_cmd(ip, ssh_user, ssh_password, cmd):
    if ssh_user != "root" and ssh_password:
        base = ["sshpass", "-p", ssh_password, "ssh",
                "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=10",
                f"{ssh_user}@{ip}", cmd]
    else:
        base = ["ssh", "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=10",
                f"root@{ip}", cmd]
    result = subprocess.run(base, capture_output=True, text=True, timeout=30)
    return result.stdout.strip(), result.returncode

def ami_query(ip, ami_user, ami_password, action_lines):
    try:
        s = socket.socket()
        s.settimeout(10)
        s.connect((ip, 5038))
        s.recv(1024)
        s.send(f"Action: Login\r\nUsername: {ami_user}\r\nSecret: {ami_password}\r\n\r\n".encode())
        s.recv(4096)
        s.send(("\r\n".join(action_lines) + "\r\n\r\n").encode())
        data = b""
        s.settimeout(5)
        try:
            while True:
                chunk = s.recv(4096)
                if not chunk: break
                data += chunk
        except: pass
        s.close()
        return data.decode(errors="replace")
    except Exception as e:
        return f"ERROR: {e}"

class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args): pass

    def send_json(self, code, data):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)

        # ── CDR depuis MySQL FreePBX ──────────────────────────────
        if parsed.path == "/api/cdr":
            ip           = params.get("ip", [""])[0]
            ssh_user     = params.get("ssh_user", ["root"])[0]
            ssh_password = params.get("ssh_password", [""])[0]
            date_from    = params.get("date_from", [""])[0]
            date_to      = params.get("date_to",   [""])[0]
            # rétrocompat : ancien paramètre "date"
            date_single  = params.get("date", [""])[0]
            if date_single and not date_from:
                date_from = date_single
            if not date_to:
                date_to = date_from
            limit        = params.get("limit", ["200"])[0]

            if not ip:
                self.send_json(400, {"error": "ip requis"}); return

            if date_from and date_to:
                where = f"WHERE DATE(calldate) BETWEEN '{date_from}' AND '{date_to}'"
            elif date_from:
                where = f"WHERE DATE(calldate) = '{date_from}'"
            else:
                where = "WHERE DATE(calldate) = CURDATE()"
            q = (f"SELECT c.calldate, c.src, c.dst, c.dcontext, c.duration, c.billsec, c.disposition,"
                 f"c.channel, c.dstchannel, c.uniqueid,"
                 f"COALESCE(us.description, us.name, '') AS src_name,"
                 f"COALESCE(ud.description, ud.name, '') AS dst_name"
                 f" FROM asteriskcdrdb.cdr c"
                 f" LEFT JOIN asterisk.users us ON us.extension = c.src"
                 f" LEFT JOIN asterisk.users ud ON ud.extension = c.dst"
                 f" {where}"
                 f" ORDER BY c.calldate DESC LIMIT {limit};")

            # Essai root sans password, puis avec password FreePBX commun
            cmd = (f"mysql -u root --silent -e \"{q}\" 2>/dev/null || "
                   f"mysql -u root -pjftenbd3 --silent -e \"{q}\" 2>/dev/null || "
                   f"mysql -u asteriskuser -pjftenbd3 --silent -e \"{q}\" 2>/dev/null")
            stdout, rc = ssh_cmd(ip, ssh_user, ssh_password, cmd)

            calls = []
            for line in stdout.splitlines():
                parts = line.split("\t")
                if len(parts) >= 7:
                    calls.append({
                        "calldate":    parts[0],
                        "src":         parts[1],
                        "dst":         parts[2],
                        "context":     parts[3],
                        "duration":    int(parts[4]) if parts[4].isdigit() else 0,
                        "billsec":     int(parts[5]) if parts[5].isdigit() else 0,
                        "disposition": parts[6],
                        "channel":     parts[7] if len(parts) > 7  else "",
                        "dstchannel":  parts[8] if len(parts) > 8  else "",
                        "uniqueid":    parts[9] if len(parts) > 9  else "",
                        "src_name":    parts[10].strip() if len(parts) > 10 else "",
                        "dst_name":    parts[11].strip() if len(parts) > 11 else "",
                    })

            logging.info(f"CDR {ip} ({date_from}→{date_to}): {len(calls)} enregistrements")
            self.send_json(200, {"calls": calls, "total": len(calls), "date_from": date_from, "date_to": date_to, "ip": ip})

        # -- Capture PCAP d'un appel
        elif parsed.path == "/api/pcap":
            ip           = params.get("ip", [""])[0]
            ssh_user     = params.get("ssh_user", ["root"])[0]
            ssh_password = params.get("ssh_password", [""])[0]
            uniqueid     = params.get("uniqueid", [""])[0]

            if not ip or not uniqueid:
                self.send_json(400, {"error": "ip et uniqueid requis"}); return

            pcap_path = f"/tmp/pcap_{uniqueid}.pcap"
            out, _ = ssh_cmd(ip, ssh_user, ssh_password, f"test -f {pcap_path} && echo EXISTS || echo MISSING")

            if "MISSING" in out:
                self.send_json(404, {
                    "error": "Aucun fichier PCAP trouve pour cet appel",
                    "hint":  f"Fichier attendu sur le FreePBX : {pcap_path}",
                    "uniqueid": uniqueid,
                }); return

            b64, rc = ssh_cmd(ip, ssh_user, ssh_password, f"base64 -w 0 {pcap_path}")
            if rc != 0 or not b64:
                self.send_json(500, {"error": "Impossible de lire le fichier PCAP"}); return

            logging.info(f"PCAP {ip} uniqueid={uniqueid}: {len(b64)} bytes")
            self.send_json(200, {"uniqueid": uniqueid, "ip": ip, "pcap_b64": b64, "filename": f"call_{uniqueid}.pcap"})

        # -- Appels actifs via AMI────
        elif parsed.path == "/api/active-calls":
            ip           = params.get("ip", [""])[0]
            ami_user     = params.get("ami_user", ["gvoip"])[0]
            ami_password = params.get("ami_password", ["gvoip2024"])[0]

            if not ip:
                self.send_json(400, {"error": "ip requis"}); return

            raw = ami_query(ip, ami_user, ami_password,
                            ["Action: CoreShowChannels", "ActionID: gvoip-active"])

            active, current = [], {}
            for line in raw.splitlines():
                line = line.strip()
                if not line:
                    if current.get("Event") == "CoreShowChannel":
                        active.append({
                            "channel":     current.get("Channel", ""),
                            "caller_id":   current.get("CallerIDNum", ""),
                            "caller_name": current.get("CallerIDName", ""),
                            "destination": current.get("Exten", ""),
                            "context":     current.get("Context", ""),
                            "state":       current.get("ChannelStateDesc", ""),
                            "duration":    current.get("Duration", "0:00:00"),
                            "application": current.get("Application", ""),
                        })
                    current = {}
                elif ": " in line:
                    k, v = line.split(": ", 1)
                    current[k] = v

            logging.info(f"Appels actifs {ip}: {len(active)}")
            self.send_json(200, {"active_calls": active, "total": len(active), "ip": ip})

        else:
            self.send_json(404, {"error": "route inconnue"})

    def do_POST(self):
        if self.path == "/api/setup-freepbx":
            length = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(length))
            ip                = body.get("ip", "")
            ami_user          = body.get("ami_user", "gvoip")
            ami_password      = body.get("ami_password", "gvoip2024")
            ssh_user          = body.get("ssh_user", "root")
            ssh_password      = body.get("ssh_password", "")
            ssh_sudo_password = body.get("ssh_sudo_password", "")

            if not ip:
                self.send_json(400, {"error": "ip requis"}); return

            logging.info(f"Configuration AMI sur {ip} (ssh_user={ssh_user})...")
            env = os.environ.copy()
            if ssh_password:
                env['SSHPASS'] = ssh_password
            result = subprocess.run(
                ["/opt/gvoip/bridge/setup-freepbx.sh", ip, ami_user, ami_password,
                 ssh_user, ssh_password, ssh_sudo_password],
                capture_output=True, text=True, timeout=90, env=env)
            logging.info(result.stdout)

            if result.returncode == 0:
                self.send_json(200, {"status": "ok", "output": result.stdout})
            else:
                self.send_json(500, {"status": "error", "output": result.stderr or result.stdout})
        else:
            self.send_json(404, {"error": "route inconnue"})

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

if __name__ == "__main__":
    logging.info("API server démarré sur port 8081")
    HTTPServer(("0.0.0.0", 8081), Handler).serve_forever()
