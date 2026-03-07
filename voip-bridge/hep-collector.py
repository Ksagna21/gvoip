#!/usr/bin/env python3
import socket, struct, logging, threading, time, sys, os
from supabase import create_client

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')

# Charger config depuis config.py (généré par install.sh)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    from config import SUPABASE_URL, SUPABASE_SERVICE_KEY
except ImportError:
    logging.error("config.py introuvable - lancer install.sh ou créer config.py manuellement")
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

def parse_hep3(data):
    if data[:4] != b'HEP3':
        return None
    pos = 6
    result = {}
    while pos + 6 <= len(data):
        vendor  = struct.unpack('!H', data[pos:pos+2])[0]
        ctype   = struct.unpack('!H', data[pos+2:pos+4])[0]
        clen    = struct.unpack('!H', data[pos+4:pos+6])[0]
        if clen < 6 or pos + clen > len(data):
            break
        cdata = data[pos+6:pos+clen]
        pos += clen
        if   ctype == 0x0001: result['ip_family'] = cdata[0] if cdata else 2
        elif ctype == 0x0002: result['ip_proto']  = cdata[0] if cdata else 17
        elif ctype == 0x0003 and len(cdata)==4:  result['src_ip']  = socket.inet_ntoa(cdata)
        elif ctype == 0x0004 and len(cdata)==4:  result['dst_ip']  = socket.inet_ntoa(cdata)
        elif ctype == 0x0005 and len(cdata)==16: result['src_ip']  = socket.inet_ntop(socket.AF_INET6, cdata)
        elif ctype == 0x0006 and len(cdata)==16: result['dst_ip']  = socket.inet_ntop(socket.AF_INET6, cdata)
        elif ctype == 0x0007 and len(cdata)==2:  result['src_port']= struct.unpack('!H', cdata)[0]
        elif ctype == 0x0008 and len(cdata)==2:  result['dst_port']= struct.unpack('!H', cdata)[0]
        elif ctype == 0x0009 and len(cdata)==4:  result['ts_sec']  = struct.unpack('!I', cdata)[0]
        elif ctype == 0x000a and len(cdata)==4:  result['ts_usec'] = struct.unpack('!I', cdata)[0]
        elif ctype == 0x000b: result['proto_type'] = cdata[0] if cdata else 0
        elif ctype == 0x000c and len(cdata)==4:  result['capture_id'] = struct.unpack('!I', cdata)[0]
        elif ctype == 0x000e: result['auth_key'] = cdata.decode('utf-8', errors='ignore')
        elif ctype == 0x000f: result['payload']  = cdata.decode('utf-8', errors='ignore')
        elif ctype == 0x0011: result['call_id']  = cdata.decode('utf-8', errors='ignore')
    return result

def extract_sip_method(payload):
    if not payload:
        return '', ''
    first = payload.split('\r\n')[0] if '\r\n' in payload else payload.split('\n')[0]
    if first.startswith('SIP/2.0'):
        parts = first.split(' ', 2)
        code = parts[1] if len(parts) > 1 else ''
        reason = parts[2] if len(parts) > 2 else ''
        return f"{code} {reason}".strip(), 'response'
    else:
        return first.split(' ')[0], 'request'

def extract_call_id(payload):
    for line in (payload or '').split('\r\n'):
        if line.lower().startswith('call-id:'):
            return line.split(':', 1)[1].strip()
    return ''

def handle_packet(data, addr):
    try:
        hep = parse_hep3(data)
        if not hep or 'payload' not in hep:
            return
        payload = hep.get('payload', '')
        method, sip_type = extract_sip_method(payload)
        call_id = hep.get('call_id') or extract_call_id(payload)
        if not call_id or not method:
            return
        if method in ['OPTIONS', 'REGISTER']:
            return
        code = method.split(' ')[0] if sip_type == 'response' else ''
        logging.info(f"SIP {method} | {hep.get('src_ip','?')}:{hep.get('src_port','?')} -> {hep.get('dst_ip','?')}:{hep.get('dst_port','?')} | {call_id[:30]}")
        supabase.table("sip_flows").insert({
            "call_id":  call_id,
            "src_ip":   hep.get('src_ip', ''),
            "dst_ip":   hep.get('dst_ip', ''),
            "src_port": hep.get('src_port', 0),
            "dst_port": hep.get('dst_port', 0),
            "method":   method,
            "sip_type": sip_type,
            "sip_code": code,
            "payload":  payload[:2000],
        }).execute()
    except Exception as e:
        logging.error(f"Erreur: {e}")

def run():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind(('0.0.0.0', 9060))
    logging.info("HEP Collector démarré sur port 9060 UDP")
    while True:
        try:
            data, addr = sock.recvfrom(65535)
            threading.Thread(target=handle_packet, args=(data, addr), daemon=True).start()
        except Exception as e:
            logging.error(f"Erreur recv: {e}")

if __name__ == '__main__':
    run()
