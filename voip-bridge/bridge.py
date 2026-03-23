#!/usr/bin/env python3
import requests
import json
import subprocess
import time
import logging
import socket
import threading
import re
import os
import sys
from datetime import datetime, timezone
from supabase import create_client

# --- CONFIGURATION via config.py ---
_config_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.py")
if not os.path.exists(_config_path):
    print(f"ERREUR: config.py introuvable dans {os.path.dirname(_config_path)}")
    sys.exit(1)

_cfg = {}
with open(_config_path) as _f:
    exec(_f.read(), _cfg)

SUPABASE_URL = _cfg.get("SUPABASE_URL", "")
SUPABASE_KEY = _cfg.get("SUPABASE_SERVICE_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERREUR: SUPABASE_URL ou SUPABASE_SERVICE_KEY manquant dans config.py")
    sys.exit(1)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s'
)

def notify_sse(event: dict):
    """Notifie l'api-server local pour diffuser via SSE."""
    try:
        import urllib.request
        body = json.dumps(event).encode()
        req = urllib.request.Request(
            "http://127.0.0.1:8081/api/notify",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        urllib.request.urlopen(req, timeout=1)
    except Exception:
        pass  # SSE non critique — ne bloque pas

# Initialisation Supabase
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# --- UTILS ---
def ping_host(ip):
    """Vérifie si l'hôte est joignable."""
    res = subprocess.run(["ping", "-c", "1", "-W", "2", ip], 
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return res.returncode == 0

def get_token(base_url, client_id, client_secret):
    """Récupère le token OAuth2 pour l'API PBX."""
    r = requests.post(f"{base_url}/token", timeout=5, data={
        "grant_type": "client_credentials",
        "client_id": client_id,
        "client_secret": client_secret
    })
    return r.json()["access_token"]

# --- CLASSE AMI CLIENT ---
class AMIClient:
    DISPOSITION_PRIORITY = {"ANSWERED": 4, "BUSY": 3, "NO ANSWER": 2, "FAILED": 1}

    def __init__(self, host, port, username, secret, ipbx_id, ipbx_name,
                 ssh_user="root", ssh_password="", ssh_sudo_password=""):
        self.host = host
        self.port = port
        self.username = username
        self.secret = secret
        self.ipbx_id = ipbx_id
        self.ipbx_name = ipbx_name
        self.ssh_user = ssh_user or "root"
        self.ssh_password = ssh_password or ""
        self.ssh_sudo_password = ssh_sudo_password or ""
        self.sock = None
        self.active_calls = {}
        self.running = False

    def send(self, **kwargs):
        """Envoie une commande AMI."""
        try:
            msg = "".join(f"{k}: {v}\r\n" for k, v in kwargs.items()) + "\r\n"
            self.sock.sendall(msg.encode())
        except Exception as e:
            logging.error(f"Erreur d'envoi AMI: {e}")

    def connect(self):
        """Initialise la connexion socket et login."""
        try:
            self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.sock.settimeout(10)
            self.sock.connect((self.host, self.port))
            
            banner = b""
            while b"\n" not in banner:
                banner += self.sock.recv(256)
            
            self.send(Action="Login", Username=self.username, Secret=self.secret)
            time.sleep(0.5)
            logging.info(f"AMI {self.ipbx_name} ({self.host}) connecté avec succès")
            return True
        except Exception as e:
            logging.error(f"Connexion AMI échouée pour {self.ipbx_name}: {e}")
            return False

    def parse_event(self, raw):
        """Parse les blocs de texte AMI en dictionnaire."""
        event = {}
        output_lines = []
        for line in raw.strip().split("\r\n"):
            if ":" in line:
                k, v = line.split(":", 1)
                k = k.strip(); v = v.strip()
                if k == "Output":
                    output_lines.append(v)
                else:
                    event[k] = v
        if output_lines:
            event["_output"] = "\n".join(output_lines)
        return event

    def _get_ext_name(self, number):
        """Cherche le nom d'une extension dans Supabase."""
        try:
            res = supabase.table("extensions").select("name").eq("number", number).eq("ipbx_id", self.ipbx_id).execute()
            if res.data and res.data[0]["name"] != number:
                return res.data[0]["name"]
        except: pass
        return number

    def upsert_call(self, uniqueid, caller, callee, caller_name="", callee_name="", codec=""):
        """Enregistre un appel actif dans Supabase immédiatement, résout les noms en arrière-plan."""
        try:
            # INSERT immédiat avec numéros bruts — aucun SELECT bloquant avant
            supabase.table("calls").insert({
                "caller": caller,
                "caller_name": caller_name or caller,
                "callee": callee,
                "callee_name": callee_name or callee,
                "status": "active",
                "codec": codec or "unknown",
                "trunk_name": uniqueid,
                "ipbx_id": self.ipbx_id,
            }).execute()
            logging.info(f"Nouveau appel: {caller} -> {callee} (uid={uniqueid})")

            # Push SSE immédiat — le frontend reçoit l'appel sans attendre Supabase realtime
            notify_sse({
                "type": "call_start",
                "ipbx_id": self.ipbx_id,
                "uniqueid": uniqueid,
                "caller": caller,
                "caller_name": caller_name or caller,
                "callee": callee,
                "callee_name": callee_name or callee,
                "codec": codec or "unknown",
                "started_at": datetime.now(timezone.utc).isoformat(),
            })

            # Résolution des noms en arrière-plan — ne bloque pas l'affichage
            def resolve_names():
                try:
                    rc = caller_name if (caller_name and caller_name != caller) else self._get_ext_name(caller)
                    rd = callee_name if (callee_name and callee_name != callee) else self._get_ext_name(callee)
                    if rc != caller or rd != callee:
                        supabase.table("calls").update({
                            "caller_name": rc,
                            "callee_name": rd,
                        }).eq("trunk_name", uniqueid).eq("status", "active").execute()
                except Exception as e:
                    logging.error(f"Erreur résolution noms: {e}")
            threading.Thread(target=resolve_names, daemon=True).start()
        except Exception as e:
            logging.error(f"Erreur upsert call: {e}")

    def end_call(self, uniqueid, duration=0, billsec=0, disposition="ANSWERED"):
        """Clôture un appel et archive dans cdr_history."""
        try:
            res = supabase.table("calls").update({
                "status": "ended",
                "ended_at": datetime.now(timezone.utc).isoformat(),
                "duration": duration,
            }).eq("trunk_name", uniqueid).eq("status", "active").execute()

            if res.data:
                call = res.data[0]
                supabase.table("cdr_history").upsert({
                    "uniqueid": uniqueid,
                    "ipbx_id": self.ipbx_id,
                    "caller": call.get("caller"),
                    "caller_name": call.get("caller_name"),
                    "callee": call.get("callee"),
                    "callee_name": call.get("callee_name"),
                    "calldate": call.get("started_at"),
                    "duration": duration,
                    "billsec": billsec,
                    "disposition": disposition,
                    "codec": call.get("codec"),
                }, on_conflict="uniqueid").execute()
                logging.info(f"Appel {uniqueid} archivé. Durée: {duration}s")
                notify_sse({
                    "type": "call_end",
                    "ipbx_id": self.ipbx_id,
                    "uniqueid": uniqueid,
                    "duration": duration,
                })
        except Exception as e:
            logging.error(f"Erreur fin d'appel: {e}")

    def handle_event(self, event):
        """Logique de traitement des événements Asterisk."""
        etype = event.get("Event", "")
        rtype = event.get("Response", "")

        if rtype == "Success" and "Authentication accepted" in event.get("Message", ""):
            self.send(Action="CoreShowChannels")
            self.send(Action="PJSIPShowEndpoints")
            self.send(Action="Command", Command="pjsip show endpoints")
            # Sync noms extensions via SSH MySQL
            import threading
            threading.Thread(target=self._sync_extension_names, daemon=True).start()
            threading.Thread(target=self._sync_trunk_details, daemon=True).start()
            return

        if etype == "EndpointList":
            number = event.get("ObjectName") or event.get("Endpoint", "")
            if not number or number == "<none>": return
            device_state = event.get("DeviceState", "")
            if not number.isdigit():
                status = "up" if device_state in ["Not in use", "Inuse", "Ringing"] else "down"
                self._sync_trunk(number, status)
            else:
                status = "registered" if device_state == "Not in use" else "busy" if device_state in ["In use", "Busy"] else "unregistered"
                self._sync_extension(number, status)

        elif etype == "EndpointListComplete":
            self.send(Action="PJSIPShowContacts")
            self.send(Action="Command", Command="pjsip show contacts")
            logging.info(f"EndpointListComplete recu sur {self.ipbx_name}")
            # Récupérer CallerID de chaque extension connue
            try:
                exts = supabase.table("extensions").select("number").eq("ipbx_id", self.ipbx_id).execute()
                for ext in (exts.data or []):
                    self.send(Action="Command", Command=f"pjsip show endpoint {ext['number']}")
            except Exception as e:
                logging.error(f"CallerID fetch error: {e}")

        elif etype == "ContactList":
            name = event.get("Endpoint", "")
            contact_status = event.get("Status", "")
            uri = event.get("Uri", "")
            rtt_usec = event.get("RoundtripUsec", "0") or "0"
            try: latency = round(int(rtt_usec) / 1000, 2)
            except: latency = None
            if name and not name.isdigit():
                status = "up" if contact_status in ["Reachable", "NonQualified", "Created"] else "down"
                self._sync_trunk(name, status, uri, latency)
                logging.info(f"Trunk ContactList {name} -> {status} latency={latency}ms uri={uri} raw={event}")

        elif etype == "ContactStatus":
            number = event.get("EndpointName", "")
            c_status = event.get("ContactStatus", "")
            if number.isdigit():
                status = "registered" if c_status in ["Reachable", "Created", "NonQualified"] else "unregistered"
                self._sync_extension(number, status)
            else:
                status = "up" if c_status in ["Reachable", "Created", "NonQualified"] else "down"
                self._sync_trunk(number, status, event.get("URI"), None)

        elif etype == "RTCPReceived":
            uniqueid = event.get("Uniqueid", "")
            linkedid = event.get("Linkedid", uniqueid)
            if not uniqueid:
                return
            try:
                # Jitter en ms
                jitter = float(event.get("IAJitter", 0) or 0) / 1000
                # RTT en ms
                rtt = float(event.get("DLSR", 0) or 0)
                # Packet loss %
                lost = int(event.get("PacketsLost", 0) or 0)
                rcvd = int(event.get("ReceivedPackets", 0) or 0)
                total = lost + rcvd
                packet_loss = round((lost / total * 100), 2) if total > 0 else 0.0

                # Calcul MOS simplifié (E-model)
                r = 93.2 - (jitter * 0.5) - (rtt * 0.1) - (packet_loss * 2.5)
                r = max(0, min(100, r))
                if r < 0: mos = 1.0
                elif r > 100: mos = 4.5
                else: mos = 1 + 0.035 * r + r * (r - 60) * (100 - r) * 7e-6
                mos = round(max(1.0, min(4.5, mos)), 2)

                # Stocker dans quality_metrics
                supabase.table("quality_metrics").insert({
                    "ipbx_id": self.ipbx_id,
                    "call_uniqueid": linkedid,
                    "mos": mos,
                    "jitter": round(jitter, 2),
                    "packet_loss": packet_loss,
                    "rtt": round(rtt, 2),
                }).execute()

                # Mettre à jour l'appel actif
                if linkedid in self.active_calls:
                    self.active_calls[linkedid]["mos"] = mos
                    self.active_calls[linkedid]["jitter"] = round(jitter, 2)

                logging.info(f"RTCP {linkedid} MOS={mos} Jitter={jitter}ms Loss={packet_loss}%")
            except Exception as e:
                logging.error(f"Erreur RTCP: {e}")

        elif etype == "Newchannel":
            uid = event.get("Uniqueid")
            caller_num = event.get("CallerIDNum", "")
            caller_name = event.get("CallerIDName", "")
            # Mettre a jour le nom de l'extension si on a un vrai nom
            if caller_num and caller_num.isdigit() and caller_name and caller_name != caller_num:
                try:
                    supabase.table("extensions").update({"name": caller_name}).eq("number", caller_num).eq("ipbx_id", self.ipbx_id).execute()
                    logging.info(f"Extension {caller_num} nom mis a jour: {caller_name}")
                except Exception as e:
                    logging.error(f"Update ext name error: {e}")
            self.active_calls[uid] = {
                "caller": caller_num,
                "linkedid": event.get("Linkedid", uid),
                "start": time.time()
            }

        elif etype == "DialBegin":
            uid = event.get("Uniqueid")
            if uid in self.active_calls:
                callee = event.get("DestCallerIDNum") or event.get("Dialstring")
                self.active_calls[uid]["callee"] = callee
                self.upsert_call(uid, self.active_calls[uid]["caller"], callee)

        elif etype == "Hangup":
            uid = event.get("Uniqueid")
            if uid in self.active_calls:
                data = self.active_calls.pop(uid)
                duration = int(time.time() - data["start"])
                cause = event.get("Cause", "0")
                disp = "ANSWERED" if cause == "16" else "BUSY" if cause in ["17", "21"] else "NO ANSWER"
                self.end_call(uid, duration, duration if disp == "ANSWERED" else 0, disp)

    def _sync_extension(self, number, status):
        try:
            old = supabase.table("extensions").select("status, name").eq("number", number).eq("ipbx_id", self.ipbx_id).execute()
            old_status = old.data[0]["status"] if old.data else None
            name = old.data[0].get("name", number) if old.data else number

            supabase.table("extensions").upsert({
                "number": number, "name": name if name != number else number, "ipbx_id": self.ipbx_id, "status": status
            }, on_conflict="number,ipbx_id").execute()

            if old_status and old_status != status:
                if status == "unregistered":
                    self._create_alert("warning", f"Extension {name} non enregistree",
                        f"L extension {number} ({name}) n est plus enregistree sur {self.ipbx_name}.", self.ipbx_name)
                elif status == "registered" and old_status == "unregistered":
                    self._create_alert("info", f"Extension {name} enregistree",
                        f"L extension {number} ({name}) est de nouveau enregistree sur {self.ipbx_name}.", self.ipbx_name)
        except Exception as e: logging.error(f"Sync Ext Error: {e}")

    def _ssh_cmd(self, cmd):
        """Construit la commande SSH adaptée selon l'utilisateur (root ou non-root via su)."""
        ssh_opts = ['ssh', '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=10',
                    '-o', 'BatchMode=yes' if not self.ssh_password else 'BatchMode=no',
                    f'{self.ssh_user}@{self.host}']
        if self.ssh_user == "root":
            return ssh_opts + [cmd]
        else:
            # Via su : echo PASSWORD | su -c "CMD"
            sudo_pass = self.ssh_sudo_password or self.ssh_password
            wrapped = f'echo {sudo_pass!r} | su -c {cmd!r}'
            return ssh_opts + [wrapped]

    def _ssh_run(self, cmd, timeout=15):
        """Execute une commande SSH et retourne le résultat."""
        import subprocess
        full_cmd = self._ssh_cmd(cmd)
        env = None
        if self.ssh_password:
            import os
            env = os.environ.copy()
            env['SSHPASS'] = self.ssh_password
            full_cmd = ['sshpass', '-e'] + full_cmd
        return subprocess.run(full_cmd, capture_output=True, text=True, timeout=timeout, env=env)

    def _sync_trunk_details(self):
        """Synchronise les details des trunks via SSH asterisk CLI."""
        import subprocess, re as _re
        ssh_base = self._ssh_cmd("")[:- 1]  # base sans la commande
        try:
            # 1. Recuperer contacts (statut + RTT)
            result = self._ssh_run("asterisk -rx 'pjsip show contacts' 2>/dev/null", timeout=15)
            trunk_data = {}
            for line in result.stdout.split("\n"):
                line = line.strip()
                if not line.startswith("Contact:"): continue
                parts = line.split()
                if len(parts) < 4: continue
                aor_uri = parts[1]
                slash = aor_uri.find("/")
                if slash < 0: continue
                t_name = aor_uri[:slash].strip()
                if not t_name or t_name.isdigit() or "<" in t_name: continue
                t_status_str = parts[3]
                t_rtt_raw = parts[4] if len(parts) > 4 else "nan"
                status = "up" if t_status_str == "Avail" else "down"
                try: latency = int(float(t_rtt_raw)) if t_rtt_raw not in ("nan",) else None
                except: latency = None
                trunk_data[t_name] = {"status": status, "latency": latency, "ip": None}

            # 2. Pour chaque trunk, recuperer IP via pjsip show aor
            for t_name in trunk_data:
                try:
                    aor_result = self._ssh_run(f"asterisk -rx 'pjsip show aor {t_name}' 2>/dev/null", timeout=5)
                    for aor_line in aor_result.stdout.split("\n"):
                        if "contact" in aor_line.lower() and "sip:" in aor_line:
                            m = _re.search(r'@([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)', aor_line)
                            if not m:
                                m = _re.search(r'sip:([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)', aor_line)
                            if m:
                                trunk_data[t_name]["ip"] = m.group(1)
                                break
                except: pass

            # 2b. IPs des extensions depuis contacts
            for line in result.stdout.split("\n"):
                line = line.strip()
                if not line.startswith("Contact:"): continue
                parts = line.split()
                if len(parts) < 4: continue
                aor_uri = parts[1]
                slash = aor_uri.find("/")
                if slash < 0: continue
                ext_num = aor_uri[:slash].strip()
                if not ext_num.isdigit(): continue
                import re as _re2
                ip_m = _re2.search(r'@([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)', aor_uri)
                if not ip_m: ip_m = _re2.search(r'sip:([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)', aor_uri)
                if ip_m:
                    ext_ip = ip_m.group(1)
                    try:
                        supabase.table("extensions").update({"ip_address": ext_ip}).eq("number", ext_num).eq("ipbx_id", self.ipbx_id).execute()
                    except: pass

            # 3. Canaux actifs par trunk via core show channels
            try:
                ch_result = self._ssh_run("asterisk -rx 'core show channels concise' 2>/dev/null", timeout=5)
                for ch_line in ch_result.stdout.split("\n"):
                    for t_name in trunk_data:
                        if t_name.upper() in ch_line.upper():
                            trunk_data[t_name]["channels"] = trunk_data[t_name].get("channels", 0) + 1
            except: pass

            # 4. Uptime IPBX
            uptime_pct = None
            try:
                up_result = self._ssh_run("asterisk -rx 'core show uptime' 2>/dev/null", timeout=5)
                for up_line in up_result.stdout.split("\n"):
                    if "System uptime" in up_line or "Last reload" in up_line:
                        logging.info(f"Uptime {self.ipbx_name}: {up_line.strip()}")
                        break
            except: pass

            # 5. Upsert
            for t_name, d in trunk_data.items():
                self._sync_trunk(t_name, d["status"], None, d["latency"], d["ip"], d.get("channels", 0))
                logging.info(f"Trunk {t_name} {d['status']} ip={d['ip']} rtt={d['latency']}ms ch={d.get('channels',0)}")
        except Exception as e:
            logging.error(f"Sync trunk details error: {e}")

    def _sync_extension_names(self):
        """Synchronise les noms des extensions depuis MySQL FreePBX via SSH."""
        logging.info(f"Debut sync noms {self.ipbx_name} host={self.host}")
        try:
            import subprocess
            mysql_cmd = "mysql -u root asterisk -sN -e \"SELECT id, description FROM devices WHERE id REGEXP '^[0-9]+';\""
            logging.info(f'SSH cmd to {self.ssh_user}@{self.host}: {mysql_cmd}')
            result = self._ssh_run(mysql_cmd, timeout=30)
            if result.returncode != 0 or not result.stdout.strip():
                logging.warning(f"SSH MySQL {self.ipbx_name}: {result.stderr.strip()}")
                return
            updates = 0
            for line in result.stdout.strip().split("\n"):
                parts = line.strip().split("\t", 1)
                if len(parts) == 2:
                    number, name = parts[0].strip(), parts[1].strip()
                    if number and name and name != number:
                        supabase.table("extensions").update({"name": name}).eq("number", number).eq("ipbx_id", self.ipbx_id).execute()
                        updates += 1
            logging.info(f"Sync noms extensions {self.ipbx_name}: {updates} mises a jour")
        except Exception as e:
            logging.error(f"Sync extension names error: {e}")

    def _create_alert(self, alert_type, title, message, source):
        try:
            supabase.table("alerts").insert({
                "type": alert_type,
                "title": title,
                "message": message,
                "source": source,
                "ipbx_id": self.ipbx_id,
                "acknowledged": False,
            }).execute()
        except Exception as e:
            logging.error(f"Alert Error: {e}")

    def _sync_trunk(self, name, status, uri="unknown", latency=None, remote_ip=None, channels=0):
        try:
            # Verifier ancien statut pour generer alerte
            old = supabase.table("sip_trunks").select("status").eq("name", name).eq("ipbx_id", self.ipbx_id).execute()
            old_status = old.data[0]["status"] if old.data else None

            upsert_data = {
                "name": name, "ipbx_id": self.ipbx_id, "status": status,
                "host": uri or name or "unknown",
                "last_check": datetime.now().isoformat()
            }
            if latency is not None: upsert_data["latency"] = latency
            if remote_ip is not None: upsert_data["remote_ip"] = remote_ip
            upsert_data["channels"] = channels
            supabase.table("sip_trunks").upsert(upsert_data, on_conflict="name,ipbx_id").execute()

            if old_status != status:
                if status == "down":
                    self._create_alert("critical", f"Trunk {name} hors ligne",
                        f"Le trunk SIP {name} ({uri}) est devenu inaccessible.", self.ipbx_name)
                elif status == "up" and old_status == "down":
                    self._create_alert("info", f"Trunk {name} retabli",
                        f"Le trunk SIP {name} est de nouveau operationnel.", self.ipbx_name)
        except Exception as e: logging.error(f"Sync Trunk Error: {e}")

    def listen(self):
        self.running = True
        buffer = ""
        while self.running:
            try:
                self.sock.settimeout(120)
                chunk = self.sock.recv(4096).decode("utf-8", errors="ignore")
                if not chunk: break
                buffer += chunk
                while "\r\n\r\n" in buffer:
                    msg, buffer = buffer.split("\r\n\r\n", 1)
                    event = self.parse_event(msg)
                    self.handle_event(event)
            except socket.timeout:
                self.send(Action="Ping")
            except Exception as e:
                logging.error(f"Erreur socket {self.ipbx_name}: {e}")
                break
        self.running = False

    def run(self):
        while True:
            if self.connect():
                self.listen()
            logging.warning(f"AMI {self.ipbx_name} déconnecté, tentative dans 10s...")
            time.sleep(10)

def sync_ipbx_api(ipbx):
    iid = ipbx["id"]
    ip = ipbx.get("ip_address") or ipbx.get("host")
    if ip and not ping_host(ip):
        logging.warning(f"PBX {ipbx['name']} injoignable (ping)")
        supabase.table("ipbx").update({"status": "offline"}).eq("id", iid).execute()
        return
    supabase.table("ipbx").update({"status": "online"}).eq("id", iid).execute()


def cleanup_old_alerts():
    """Supprime les alertes acquittées de plus de 24h."""
    try:
        from datetime import timedelta
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
        res = supabase.table("alerts").delete()            .eq("acknowledged", True)            .lt("acknowledged_at", cutoff)            .execute()
        if res.data:
            logging.info(f"Nettoyage alertes: {len(res.data)} alertes supprimees")
    except Exception as e:
        logging.error(f"Erreur nettoyage alertes: {e}")

def cleanup_quality_metrics():
    """Supprime les métriques qualité de plus de 24h."""
    try:
        from datetime import timedelta
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
        res = supabase.table("quality_metrics").delete()            .lt("recorded_at", cutoff)            .execute()
        if res.data:
            logging.info(f"Nettoyage quality_metrics: {len(res.data)} lignes supprimees")
    except Exception as e:
        logging.error(f"Erreur nettoyage quality_metrics: {e}")

def cleanup_sip_flows():
    """Supprime les traces SIP de plus de 24h."""
    try:
        from datetime import timedelta
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
        res = supabase.table("sip_flows").delete()            .lt("created_at", cutoff)            .execute()
        if res.data:
            logging.info(f"Nettoyage sip_flows: {len(res.data)} lignes supprimees")
    except Exception as e:
        logging.error(f"Erreur nettoyage sip_flows: {e}")

def main():
    logging.info("Démarrage du Bridge FreePBX -> Supabase")
    ami_threads = {}
    while True:
        try:
            ipbx_list = supabase.table("ipbx").select("*").execute().data
            for ipbx in ipbx_list:
                iid = ipbx["id"]
                host = ipbx.get("ip_address") or ipbx.get("host")
                sync_ipbx_api(ipbx)
                if host:
                    if iid not in ami_threads or not ami_threads[iid].is_alive():
                        ami = AMIClient(
                            host=host,
                            port=ipbx.get("ami_port") or 5038,
                            username=ipbx.get("ami_user") or "admin",
                            secret=ipbx.get("ami_password") or "secret",
                            ipbx_id=iid,
                            ipbx_name=ipbx["name"],
                            ssh_user=ipbx.get("ssh_user") or "root",
                            ssh_password=ipbx.get("ssh_password") or "",
                            ssh_sudo_password=ipbx.get("ssh_sudo_password") or ""
                        )
                        t = threading.Thread(target=ami.run, daemon=True)
                        t.start()
                        ami_threads[iid] = t
                        logging.info(f"Thread AMI lancé pour {ipbx['name']}")
        except Exception as e:
            logging.error(f"Erreur boucle principale: {e}")

        # Nettoyage toutes les heures
        if int(time.time()) % 3600 < 60:
            cleanup_old_alerts()
            cleanup_quality_metrics()
            cleanup_sip_flows()

        time.sleep(60)

if __name__ == "__main__": main()
