#!/usr/bin/env python3
"""
WebSSH proxy — proxifie HTTP + WebSocket ttyd sans exposer de ports supplémentaires
Flux: navigateur -> nginx:APP_PORT/webssh/ -> webssh.py:9061 -> ttyd:9100+ (127.0.0.1 uniquement)

CORRECTIONS v2.2 :
  - Routing par chemin (/ssh/{ip}/) au lieu de query param (/ssh?ip=) :
    → tous les assets statiques de ttyd (ttyd.js, base.css…) sont correctement proxifiés
    → le chemin WebSocket (/ssh/{ip}/ws) est toujours résolu sans ambiguïté
  - get_or_create_ttyd() est maintenant async (asyncio.sleep au lieu de time.sleep bloquant)
  - Suppression du flag --once : ttyd reste vivant pour les reconnexions du terminal
  - proxy_read/send_timeout à ajouter côté nginx (voir README)

Usage frontend :
  iframe src="/webssh/ssh/1.2.3.4/"  (trailing slash important pour les assets relatifs)
  ou WebSocket direct : ws://SERVER/webssh/ssh/1.2.3.4/ws
"""
import asyncio, subprocess, re, time, logging, sys

try:
    from aiohttp import web, ClientSession, WSMsgType, ClientConnectorError
except ImportError:
    subprocess.run([sys.executable, "-m", "pip", "install", "aiohttp",
                    "--break-system-packages", "-q"], check=True)
    from aiohttp import web, ClientSession, WSMsgType, ClientConnectorError

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger(__name__)

procs    = {}   # ip -> {proc, port, last_used}
port_map = {}   # ip -> port
PORT_BASE = 9100

THEME = ('{"background":"#0d1117","foreground":"#e6edf3","cursor":"#58a6ff",'
         '"cursorAccent":"#0d1117","selection":"rgba(88,166,255,0.3)",'
         '"black":"#484f58","red":"#ff7b72","green":"#3fb950","yellow":"#d29922",'
         '"blue":"#58a6ff","magenta":"#bc8cff","cyan":"#39c5cf","white":"#b1bac4",'
         '"brightBlack":"#6e7681","brightRed":"#ffa198","brightGreen":"#56d364",'
         '"brightYellow":"#e3b341","brightBlue":"#79c0ff","brightMagenta":"#d2a8ff",'
         '"brightCyan":"#56d4dd","brightWhite":"#f0f6fc"}')

IP_RE   = re.compile(r"^\d{1,3}(\.\d{1,3}){3}$")
USER_RE = re.compile(r"^[a-zA-Z0-9_\-]{1,32}$")


# ── Création / réutilisation d'une session ttyd ───────────────────────────────
async def get_or_create_ttyd(ip: str, ssh_user: str = "root") -> int:
    """Retourne le port loopback du processus ttyd pour cet IP (créé si absent/mort)."""
    if ip in procs and procs[ip]["proc"].poll() is None:
        procs[ip]["last_used"] = time.time()
        return procs[ip]["port"]

    if ip not in port_map:
        port_map[ip] = PORT_BASE + len(port_map)
    port = port_map[ip]

    # Terminer proprement l'éventuel processus zombie
    if ip in procs:
        try:
            procs[ip]["proc"].terminate()
        except Exception:
            pass

    proc = subprocess.Popen([
        "ttyd",
        "-p", str(port),
        "-i", "127.0.0.1",
        "--writable",
        # PAS de --once : ttyd reste vivant pour les reconnexions du terminal
        "-t", f"theme={THEME}",
        "-t", "fontSize=13",
        "-t", "fontFamily=JetBrains Mono,Fira Code,monospace",
        "ssh",
        "-o", "StrictHostKeyChecking=no",
        "-o", "UserKnownHostsFile=/dev/null",
        "-o", "ConnectTimeout=10",
        f"{ssh_user}@{ip}",
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    procs[ip] = {"proc": proc, "port": port, "last_used": time.time()}
    log.info(f"ttyd démarré pour {ssh_user}@{ip} sur 127.0.0.1:{port}")

    # CORRECTION : asyncio.sleep au lieu de time.sleep (non bloquant)
    await asyncio.sleep(1.0)
    return port


# ── Nettoyage périodique des sessions inactives ──────────────────────────────
async def cleanup_loop():
    while True:
        await asyncio.sleep(60)
        now = time.time()
        for ip in list(procs.keys()):
            if now - procs[ip].get("last_used", 0) > 600:
                try:
                    procs[ip]["proc"].terminate()
                except Exception:
                    pass
                del procs[ip]
                port_map.pop(ip, None)
                log.info(f"Session ttyd {ip} nettoyée (inactivité)")


# ── Handler principal : /ssh/{ip}  et  /ssh/{ip}/{path:.*} ───────────────────
async def handle_ssh(request: web.Request) -> web.StreamResponse:
    """
    CORRECTION : l'IP est maintenant dans le chemin, pas dans le query string.
    Cela garantit que :
      - /ssh/1.2.3.4/        → page HTML ttyd (proxifiée depuis ttyd:910x/)
      - /ssh/1.2.3.4/ttyd.js → asset statique ttyd (proxifié depuis ttyd:910x/ttyd.js)
      - /ssh/1.2.3.4/ws      → WebSocket ttyd (proxifié vers ws://127.0.0.1:910x/ws)
    Le navigateur calcule les URLs relatives à partir de /webssh/ssh/1.2.3.4/,
    donc tous les assets et le WS arrivent avec l'IP dans le chemin → routing correct.
    """
    ip   = request.match_info.get("ip", "").strip()
    user = request.query.get("user", "root").strip()

    if not IP_RE.match(ip):
        return web.Response(status=400, text="Paramètre ip invalide (doit être dans le chemin : /ssh/{ip}/)")
    if not USER_RE.match(user):
        return web.Response(status=400, text="Paramètre user invalide")

    port = await get_or_create_ttyd(ip, user)

    # Chemin à transmettre à ttyd (tout ce qui vient après /ssh/{ip})
    sub_path = request.match_info.get("path", "")
    if not sub_path:
        sub_path = "/"
    elif not sub_path.startswith("/"):
        sub_path = "/" + sub_path

    # ── Proxy WebSocket ──────────────────────────────────────────────────────
    if request.headers.get("Upgrade", "").lower() == "websocket":
        ws_client = web.WebSocketResponse()
        await ws_client.prepare(request)
        # sub_path est typiquement "/ws" ici — toujours correct car l'IP est dans le chemin
        ws_target = f"ws://127.0.0.1:{port}{sub_path}"
        try:
            async with ClientSession() as session:
                async with session.ws_connect(
                    ws_target,
                    protocols=["tty"],
                    headers={"Origin": f"http://127.0.0.1:{port}"},
                ) as ws_server:
                    async def fwd(src, dst):
                        async for msg in src:
                            if msg.type == WSMsgType.TEXT:
                                await dst.send_str(msg.data)
                            elif msg.type == WSMsgType.BINARY:
                                await dst.send_bytes(msg.data)
                            elif msg.type in (WSMsgType.CLOSE, WSMsgType.ERROR):
                                break
                    await asyncio.gather(fwd(ws_client, ws_server), fwd(ws_server, ws_client))
        except Exception as e:
            log.error(f"Erreur WS {ip}: {e}")
        return ws_client

    # ── Proxy HTTP (page principale + assets statiques ttyd) ─────────────────
    try:
        async with ClientSession() as session:
            async with session.get(
                f"http://127.0.0.1:{port}{sub_path}",
                headers={k: v for k, v in request.headers.items()
                         if k.lower() not in ("host", "connection")},
                allow_redirects=False,
            ) as resp:
                body = await resp.read()
                ct = resp.headers.get("Content-Type", "text/html")
                return web.Response(
                    status=resp.status,
                    body=body,
                    content_type=ct.split(";")[0].strip(),
                )
    except ClientConnectorError:
        return web.Response(status=503,
                            text=f"ttyd non disponible pour {ip} — vérifiez SSH et clé ed25519")
    except Exception as e:
        log.error(f"Erreur HTTP {ip}: {e}")
        return web.Response(status=500, text=str(e))


# ── Health check ─────────────────────────────────────────────────────────────
async def handle_health(request: web.Request) -> web.Response:
    import json
    sessions = [
        {"ip": ip, "port": d["port"], "running": d["proc"].poll() is None}
        for ip, d in procs.items()
    ]
    return web.Response(
        text=json.dumps({"status": "ok", "sessions": sessions}),
        content_type="application/json",
    )


# ── Démarrage ─────────────────────────────────────────────────────────────────
async def main():
    app = web.Application()
    # CORRECTION : routing par chemin — l'IP fait partie de l'URL
    app.router.add_get("/ssh/{ip}",           handle_ssh)
    app.router.add_get("/ssh/{ip}/",          handle_ssh)
    app.router.add_get("/ssh/{ip}/{path:.*}", handle_ssh)
    app.router.add_get("/health",             handle_health)
    app.router.add_get("/",                   handle_health)
    asyncio.ensure_future(cleanup_loop())
    runner = web.AppRunner(app)
    await runner.setup()
    await web.TCPSite(runner, "0.0.0.0", 9061).start()
    log.info("WebSSH proxy démarré sur port 9061")
    log.info(f"ttyd sessions sur 127.0.0.1:{PORT_BASE}+ (loopback uniquement)")
    log.info("URL pattern : /webssh/ssh/<ip>/ ou /webssh/ssh/<ip>/ws")
    log.info("Aucun port supplémentaire requis dans le firewall")
    await asyncio.Event().wait()


if __name__ == "__main__":
    asyncio.run(main())
