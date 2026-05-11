/**
 * ami-stats-server.js
 * ─────────────────────────────────────────────────────────────────
 * Proxy Node.js qui se connecte à l'AMI Asterisk (TCP 5038) et
 * expose un endpoint REST pour IPBXStats.tsx
 *
 * Installation :
 *   npm install express cors net
 *   node ami-stats-server.js
 *
 * Endpoints :
 *   POST /api/ipbx/stats
 *        Body: { host, ami_port, ami_user, ami_password }
 *        → SystemStats (cpu, ram, storage, temperature, uptime, load_avg, channels, peers, …)
 *
 * Variables d'env (optionnelles) :
 *   PORT          Port d'écoute (défaut : 3001)
 *   AMI_TIMEOUT   Timeout connexion AMI en ms (défaut : 8000)
 * ─────────────────────────────────────────────────────────────────
 */

const net = require("net");
const { Client: SSHClient } = require("ssh2");
const express = require("express");
const cors = require("cors");

const PORT        = process.env.PORT        || 3001;
const AMI_TIMEOUT = parseInt(process.env.AMI_TIMEOUT || "8000");

const app = express();
app.use(cors());
app.use(express.json());

/* ─────────────────────────────────────────────────────────────────
 * AMI Client (TCP brut, sans dépendance externe)
 * - Envoie des actions séquentiellement
 * - Attend la "fin" logique de chaque action
 *   (ex: SIPpeers => PeerlistComplete)
 * ───────────────────────────────────────────────────────────────── */

function amiSession(opts, actions) {
  return new Promise((resolve, reject) => {
    const { host, port, username, secret } = opts;
    const socket = new net.Socket();
    let buffer = "";
    let loginOk = false;
    let pendingActions = [...actions];
    const results = {}; // actionId -> { blocks: string[][] }
    let current = null; // { action, actionId, blocks: string[][], done: (blockObj, lines) => boolean }
    let done = false;

    const timeout = setTimeout(() => {
      if (!done) { done = true; socket.destroy(); reject(new Error("AMI timeout")); }
    }, AMI_TIMEOUT);

    const encodeAction = (obj) =>
      Object.entries(obj).map(([k, v]) => `${k}: ${v}`).join("\r\n") + "\r\n\r\n";

    const actionIdOf = (a) => (a.ActionID ? String(a.ActionID) : "");

    const blockToObj = (lines) => {
      const obj = {};
      for (const l of lines) {
        const idx = l.indexOf(":");
        if (idx > 0) obj[l.slice(0, idx).trim()] = l.slice(idx + 1).trim();
      }
      return obj;
    };

    const makeDonePredicate = (action) => {
      const name = String(action.Action || "");
      if (name.toLowerCase() === "sippeers") {
        // Fin quand PeerlistComplete arrive
        return (obj) => obj.Event === "PeerlistComplete";
      }
      // Command / CoreStatus / autres: on considère fini sur Response (Success/Error/Follows)
      return (obj, lines) => {
        if (obj.Response) return true;
        // Certains retours "Follows" contiennent la fin "--end command--"
        return lines.some((l) => String(l).includes("--end command--"));
      };
    };

    const startNext = () => {
      if (pendingActions.length === 0) {
        if (!done) {
          done = true;
          clearTimeout(timeout);
          socket.end();
          resolve(results);
        }
        return;
      }

      const action = pendingActions.shift();
      const actionId = actionIdOf(action) || `auto_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      if (!action.ActionID) action.ActionID = actionId;
      current = { action, actionId, blocks: [], done: makeDonePredicate(action) };
      results[actionId] = { blocks: current.blocks, action: { ...action } };
      socket.write(encodeAction(action));
    };
    socket.connect(port, host, () => {
      // La bannière AMI arrive d'abord ; on attend le login
      socket.write(encodeAction({ Action: "Login", Username: username, Secret: secret }));
    });

    socket.on("data", (data) => {
      buffer += data.toString();
      // Les blocs AMI sont séparés par \r\n\r\n
      const parts = buffer.split(/\r\n\r\n/);
      buffer = parts.pop(); // garder le fragment incomplet

      for (const part of parts) {
        const lines = part.split(/\r\n/).filter(Boolean);
        if (!loginOk) {
          // Premier bloc après la bannière : réponse au Login
          const resp = lines.find((l) => l.startsWith("Response:"));
          if (resp && resp.includes("Success")) {
            loginOk = true;
            startNext();
          } else if (resp && resp.includes("Error")) {
            done = true; clearTimeout(timeout); socket.destroy();
            reject(new Error("AMI auth failed: " + lines.join(" | ")));
          }
          // Ignorer la bannière elle-même (Asterisk Call Manager/…)
          continue;
        }
        if (!current) continue;

        current.blocks.push(lines);
        const obj = blockToObj(lines);

        // Si on voit une erreur AMI sur une action, on stoppe net
        if (obj.Response === "Error") {
          done = true;
          clearTimeout(timeout);
          socket.destroy();
          reject(new Error(`AMI action error (${current.action.Action}): ${lines.join(" | ")}`));
          return;
        }

        // Fin logique de l'action courante
        if (current.done(obj, lines)) {
          current = null;
          startNext();
        }
      }
    });

    socket.on("error", (err) => {
      if (!done) { done = true; clearTimeout(timeout); reject(err); }
    });

    socket.on("close", () => {
      if (!done) { done = true; clearTimeout(timeout); resolve(responses); }
    });
  });
}

/* ─────────────────────────────────────────────────────────────────
 * Parseurs AMI
 * ───────────────────────────────────────────────────────────────── */

function parseBlock(lines) {
  const obj = {};
  for (const l of lines) {
    const idx = l.indexOf(":");
    if (idx > 0) obj[l.slice(0, idx).trim()] = l.slice(idx + 1).trim();
  }
  return obj;
}

/** Extrait le nombre d'appels actifs depuis la réponse CoreStatus */
function parseCoreStatus(blocks) {
  for (const b of blocks) {
    const obj = parseBlock(b);
    if (obj["Response"] === "Success" && obj["CoreCurrentCalls"] !== undefined) {
      return {
        active_calls:   parseInt(obj["CoreCurrentCalls"]) || 0,
        processed_calls:parseInt(obj["CoreCallsProcessed"]) || 0,
        uptime_raw:     obj["CoreUpTime"] || "",
        reload_date:    obj["CoreReloadDate"] || "",
        asterisk_version: obj["AsteriskVersion"] || "",
      };
    }
  }
  return { active_calls: 0, processed_calls: 0, uptime_raw: "", reload_date: "", asterisk_version: "" };
}

/** Compte les peers SIP enregistrés depuis la réponse SIPpeers */
function parseSIPPeers(blocks) {
  let online = 0, total = 0;
  for (const b of blocks) {
    const obj = parseBlock(b);
    if (obj["Event"] === "PeerEntry") {
      total++;
      if (obj["Status"] && obj["Status"].startsWith("OK")) online++;
    }
  }
  return { sip_peers_total: total, sip_peers_online: online };
}

/* ─────────────────────────────────────────────────────────────────
 * SSH (stats système)
 * ───────────────────────────────────────────────────────────────── */
function sshExec({ host, port = 22, username, password }, command, timeoutMs = 9000) {
  return new Promise((resolve, reject) => {
    const conn = new SSHClient();
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { conn.end(); } catch {}
      reject(new Error("SSH timeout"));
    }, timeoutMs);

    conn
      .on("ready", () => {
        conn.exec(command, { pty: false }, (err, stream) => {
          if (err) {
            clearTimeout(timer);
            if (!settled) {
              settled = true;
              conn.end();
              reject(err);
            }
            return;
          }

          let stdout = "";
          let stderr = "";
          stream.on("data", (d) => (stdout += d.toString()));
          stream.stderr.on("data", (d) => (stderr += d.toString()));
          stream.on("close", (code) => {
            clearTimeout(timer);
            if (settled) return;
            settled = true;
            conn.end();
            if (code !== 0 && stderr.trim()) return reject(new Error(stderr.trim()));
            resolve(stdout);
          });
        });
      })
      .on("error", (e) => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          reject(e);
        }
      })
      .connect({
        host,
        port,
        username,
        password,
        readyTimeout: timeoutMs,
        tryKeyboard: false,
      });
  });
}

function parseProcStats(raw) {
  // On envoie plusieurs commandes shell enchaînées dans une seule action Command
  const lines = raw.split("\n");

  // CPU depuis /proc/loadavg  → "0.12 0.34 0.56 1/345 12345"
  let load_avg = "— — —";
  let cpu = 0;
  const loadLine = lines.find((l) => /^\d+\.\d+\s+\d+\.\d+/.test(l.trim()));
  if (loadLine) {
    const parts = loadLine.trim().split(/\s+/);
    load_avg = `${parts[0]} ${parts[1]} ${parts[2]}`;
    cpu = Math.min(100, Math.round(parseFloat(parts[0]) * 50)); // approximation
  }

  // Mémoire depuis /proc/meminfo
  let ram_total = 0, ram_free = 0, ram_buffers = 0, ram_cached = 0;
  for (const l of lines) {
    const m = l.match(/^(\w+):\s+(\d+)/);
    if (!m) continue;
    const kb = parseInt(m[2]);
    if (m[1] === "MemTotal")   ram_total   = kb;
    if (m[1] === "MemFree")    ram_free    = kb;
    if (m[1] === "Buffers")    ram_buffers = kb;
    if (m[1] === "Cached")     ram_cached  = kb;
  }
  const ram_used_kb = ram_total - ram_free - ram_buffers - ram_cached;
  const ram_used_gb  = parseFloat((ram_used_kb  / 1024 / 1024).toFixed(2));
  const ram_total_gb = parseFloat((ram_total    / 1024 / 1024).toFixed(2));

  // Disque depuis df -h /
  let storage_used = 0, storage_total = 0;
  const dfLine = lines.find((l) => l.includes("/") && /\d+G/.test(l));
  if (dfLine) {
    const parts = dfLine.trim().split(/\s+/);
    // Format df : Filesystem Size Used Avail Use% Mountpoint
    const parse_gb = (s) => {
      if (!s) return 0;
      const n = parseFloat(s);
      if (s.endsWith("G")) return n;
      if (s.endsWith("M")) return n / 1024;
      if (s.endsWith("T")) return n * 1024;
      return n;
    };
    storage_total = parse_gb(parts[1]);
    storage_used  = parse_gb(parts[2]);
  }

  // Température (lm-sensors ou /sys/class/thermal)
  let temperature = 0;
  const tempLine = lines.find((l) => /°C|temp/i.test(l) && /\d+\.\d+/.test(l));
  if (tempLine) {
    const m = tempLine.match(/(\d+\.?\d*)\s*°?C/i);
    if (m) temperature = Math.round(parseFloat(m[1]));
  } else {
    // /sys/class/thermal/thermal_zone0/temp renvoie en millièmes
    const tLine = lines.find((l) => /^\d{4,6}$/.test(l.trim()));
    if (tLine) temperature = Math.round(parseInt(tLine.trim()) / 1000);
  }

  // Uptime
  let uptime = "—";
  const uptimeLine = lines.find((l) => /up\s+\d/.test(l) || /\d+\s+day/.test(l));
  if (uptimeLine) uptime = uptimeLine.replace(/.*up\s+/, "").replace(/,\s+\d+ user.*/i, "").trim();

  return { cpu, load_avg, ram_used: ram_used_gb, ram_total: ram_total_gb, storage_used, storage_total, temperature, uptime };
}

/* ─────────────────────────────────────────────────────────────────
 * Commande shell composite (exécutée via SSH)
 * ───────────────────────────────────────────────────────────────── */
const SYS_CMD = [
  "cat /proc/loadavg",
  "cat /proc/meminfo",
  "df -h /",
  "uptime",
  // Température (essaye plusieurs chemins)
  "cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null || sensors 2>/dev/null | grep -i temp | head -2 || true",
].join("; ");

/* ─────────────────────────────────────────────────────────────────
 * Route principale
 * ───────────────────────────────────────────────────────────────── */
app.post("/api/ipbx/stats", async (req, res) => {
  const {
    host,
    ami_port = 5038,
    ami_user,
    ami_password,
    ssh_user,
    ssh_password,
    ssh_port = 22,
  } = req.body;

  if (!host || !ami_user || !ami_password) {
    return res.status(400).json({ error: "host, ami_user, ami_password are required" });
  }
  if (!ssh_user || !ssh_password) {
    return res.status(400).json({ error: "ssh_user, ssh_password are required (for system stats)" });
  }

  try {
    const actions = [
      { Action: "CoreStatus", ActionID: "core_status" },
      { Action: "SIPpeers", ActionID: "sip_peers" },
    ];

    const amiByAction = await amiSession(
      { host, port: parseInt(ami_port), username: ami_user, secret: ami_password },
      actions
    );

    const coreBlocks = (amiByAction.core_status?.blocks) || [];
    const sipBlocks = (amiByAction.sip_peers?.blocks) || [];

    const coreInfo = parseCoreStatus(coreBlocks);
    const sipInfo = parseSIPPeers(sipBlocks);

    const sysRaw = await sshExec(
      { host, port: parseInt(ssh_port), username: ssh_user, password: ssh_password },
      SYS_CMD
    );
    const sysInfo = parseProcStats(sysRaw || "");

    const stats = {
      // Système
      cpu:           sysInfo.cpu,
      ram_used:      sysInfo.ram_used,
      ram_total:     sysInfo.ram_total || 8,
      storage_used:  sysInfo.storage_used,
      storage_total: sysInfo.storage_total || 100,
      temperature:   sysInfo.temperature,
      uptime:        sysInfo.uptime || coreInfo.uptime_raw,
      load_avg:      sysInfo.load_avg,
      // Asterisk
      active_calls:        coreInfo.active_calls,
      processed_calls:     coreInfo.processed_calls,
      asterisk_version:    coreInfo.asterisk_version,
      sip_peers_total:     sipInfo.sip_peers_total,
      sip_peers_online:    sipInfo.sip_peers_online,
      // Meta
      timestamp: new Date().toLocaleTimeString("fr-FR"),
    };

    res.json(stats);
  } catch (err) {
    console.error("[AMI]", err.message);
    res.status(502).json({ error: err.message });
  }
});

/* Health check */
app.get("/api/health", (_, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`✅  AMI Stats proxy running on http://localhost:${PORT}`));
