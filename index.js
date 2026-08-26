const crypto = require('crypto');
const sql = require("mssql");
const config = require("./dbconfig")
global.crypto = crypto.webcrypto;

const makeWASocket = require('@whiskeysockets/baileys').default;
const {
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason
} = require('@whiskeysockets/baileys');

const express        = require('express');
const cors           = require('cors');
const QRCode         = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const fs             = require('fs-extra');
const multer         = require('multer');
const path           = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'JS')));

// ------ API HIT Registration POST code start

// 👇 NEW LINE (register route use karo)
const registerRoute = require("./register");
const loginRoute = require("./login");
const userprofileroute = require("./userprofile");
const dashboardroute = require("./dashboard");
app.use("/", registerRoute);
app.use("/", loginRoute);
app.use("/", userprofileroute);
app.use("/", dashboardroute);
// API HIT Registration POST code END
   
/* ============================================================
   CONFIG & FILE PATHS
============================================================ */
const AUTH_BASE_DIR       = './baileys_auth';  // har session ka alag subfolder
const SESSIONS_FILE       = './sessions.json'; // session metadata (label, createdAt etc.)
const PHONE_TOKENS_FILE   = './phone_tokens.json'; // phoneNumber -> token mapping (NEVER cleared)
const SESSION_EXPIRY_DAYS = 30;

fs.ensureDirSync(AUTH_BASE_DIR);
if (!fs.existsSync(SESSIONS_FILE))     fs.writeFileSync(SESSIONS_FILE,     '{}');
if (!fs.existsSync(PHONE_TOKENS_FILE)) fs.writeFileSync(PHONE_TOKENS_FILE, '{}');

const sessions = {};

function readPhoneTokens() {
    try { return JSON.parse(fs.readFileSync(PHONE_TOKENS_FILE, 'utf8')); }
    catch { return {}; }
}

function writePhoneTokens(data) {
    fs.writeFileSync(PHONE_TOKENS_FILE, JSON.stringify(data, null, 2));
}

function getOrCreateTokenForPhone(phoneNumber) {
    const tokens = readPhoneTokens();
    if (tokens[phoneNumber]) {
        console.log(`[TOKEN] ${phoneNumber} → reused: ${tokens[phoneNumber]}`);
        return tokens[phoneNumber];
    }
    const newToken      = uuidv4();
    tokens[phoneNumber] = newToken;
    writePhoneTokens(tokens);
    console.log(`[TOKEN] ${phoneNumber} → new: ${newToken}`);
    return newToken;
}

function readSessions() {
    try { return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8')); }
    catch { return {}; }
}

function writeSessions(data) {
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(data, null, 2));
}

function saveSessionMeta(sessionId) {
    const s = sessions[sessionId];
    if (!s) return;
    const all       = readSessions();
    all[sessionId]  = {
        sessionId,
        phoneNumber : s.phoneNumber,
        createdAt   : s.createdAt,
        lastActiveAt: s.lastActiveAt,
        label       : s.label || ''
        // NOTE: token is NOT stored here — it lives in phone_tokens.json
    };
    writeSessions(all);
}

function removeSessionMeta(sessionId) {
    const all = readSessions();
    delete all[sessionId];
    writeSessions(all);
}

async function destroySession(sessionId) {
    const s = sessions[sessionId];
    if (s) {
        s.destroyed = true;
        if (s.reconnectTimer) {
            clearTimeout(s.reconnectTimer);
            s.reconnectTimer = null;
        }
        if (s.sock) {
            try { s.sock.ev.removeAllListeners(); } catch {}
            try { s.sock.end();                   } catch {}
            s.sock = null;
        }
        delete sessions[sessionId];
    }
    await fs.remove(path.join(AUTH_BASE_DIR, sessionId));
    removeSessionMeta(sessionId);
    console.log(`[${sessionId}] Destroyed completely`);
}

function scheduleReconnect(sessionId, delayMs) {
    const s = sessions[sessionId];
    if (!s || s.destroyed) return;
    if (s.reconnectTimer) clearTimeout(s.reconnectTimer);
    s.reconnectTimer = setTimeout(() => {
        const cur = sessions[sessionId];
        if (!cur || cur.destroyed) return;
        startSession(sessionId, cur.label || '');
    }, delayMs);
}

async function startSession(sessionId, label = '') {
    if (sessions[sessionId]?.destroyed) return;
    const authDir = path.join(AUTH_BASE_DIR, sessionId);
    fs.ensureDirSync(authDir);
    if (sessions[sessionId]?.sock) {
        try { sessions[sessionId].sock.ev.removeAllListeners(); } catch {}
        try { sessions[sessionId].sock.end();                   } catch {}
        sessions[sessionId].sock = null;
    }
    const savedMeta = readSessions();
    const saved     = savedMeta[sessionId] || {};

    if (!sessions[sessionId]) {
        sessions[sessionId] = {
            sock          : null,
            isReady       : false,
            phoneNumber   : saved.phoneNumber || '',
            token         : null, 
            qrCode        : '',
            authDir,
            createdAt     : saved.createdAt    || new Date().toISOString(),
            lastActiveAt  : saved.lastActiveAt || new Date().toISOString(),
            label         : saved.label        || label,
            destroyed     : false,
            reconnectTimer: null
        };
    } else {
        sessions[sessionId].destroyed      = false;
        sessions[sessionId].authDir        = authDir;
        sessions[sessionId].reconnectTimer = null;
    }

    const s = sessions[sessionId];
    let state, saveCreds;
    try {
        ({ state, saveCreds } = await useMultiFileAuthState(authDir));
    } catch (err) {
        console.error(`[${sessionId}] Auth state error:`, err.message);
        scheduleReconnect(sessionId, 5000);
        return;
    }

    // Baileys version
    let version;
    try   { ({ version } = await fetchLatestBaileysVersion()); }
    catch { version = [2, 3000, 1015901307]; }

    // Create socket
    const sock = makeWASocket({
        auth                 : state,
        version,
        printQRInTerminal    : false,
        syncFullHistory      : false,
        markOnlineOnConnect  : false,
        connectTimeoutMs     : 60_000,
        defaultQueryTimeoutMs: 60_000,
        retryRequestDelayMs  : 2000,
        browser              : ['Windows', 'Chrome', '120.0.0']
    });

    s.sock = sock;
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {

        // Safety: ignore events for destroyed sessions
        if (s.destroyed) return;

        const { connection, qr, lastDisconnect } = update;

        /* ── QR received ── */
        if (qr) {
            try {
                const dataURL = await QRCode.toDataURL(qr);
                if (dataURL !== s.qrCode) {
                    s.qrCode  = dataURL;
                    s.isReady = false;
                    console.log(`[${sessionId}] QR ready`);
                }
            } catch {}
        }

        /* ── Connected ── */
        if (connection === 'open') {
            const phone    = sock.user?.id?.split(':')[0] || '';
            s.isReady      = true;
            s.qrCode       = '';
            s.phoneNumber  = phone;
            s.lastActiveAt = new Date().toISOString();

            // FIX: Token always from phone_tokens.json
            // Same phone = same token, no matter how many times they login/logout
            s.token = getOrCreateTokenForPhone(phone);

            saveSessionMeta(sessionId);
            console.log(`[${sessionId}] Connected  phone=+${phone}  token=${s.token}`);
        }

        /* ── Disconnected ── */
        if (connection === 'close') {
            if (s.destroyed) return;
            s.isReady = false;

            const statusCode = lastDisconnect?.error?.output?.statusCode;
            console.log(`[${sessionId}] Closed  code=${statusCode}`);

            // 401 = logged out from phone / 403 = banned
            // Auto-delete this session entirely (user removed device from WA settings)
            if (statusCode === 401 || statusCode === 403) {
                console.log(`[${sessionId}] Revoked from phone → auto-deleting`);
                await destroySession(sessionId);
                return;
            }

            // 515 = stream error / restart needed
            if (statusCode === 515) {
                s.qrCode = '';
                scheduleReconnect(sessionId, 1500);
                return;
            }

            // 408 = timeout
            if (statusCode === 408) {
                s.qrCode = '';
                scheduleReconnect(sessionId, 4000);
                return;
            }

            // All other (network drop, server restart, etc.) → silent reconnect
            s.qrCode = '';
            scheduleReconnect(sessionId, 3000);
        }
    });
}
/* ============================================================
   STARTUP: RESTORE ALL SESSIONS FROM sessions.json
============================================================ */
async function restoreAllSessions() {
    const all = readSessions();
    const ids = Object.keys(all);
    console.log(`Restoring ${ids.length} session(s) from sessions.json...`);
    for (const id of ids) {
        await startSession(id, all[id]?.label || '');
    }
}
restoreAllSessions();
/* ============================================================
   EXPIRY CLEANUP  (every 6 hours)
   Sessions inactive for SESSION_EXPIRY_DAYS days → auto-delete
============================================================ */
async function cleanupExpired() {
    const all   = readSessions();
    const limit = SESSION_EXPIRY_DAYS * 86400 * 1000;
    for (const [id, meta] of Object.entries(all)) {
        const last = new Date(meta.lastActiveAt || meta.createdAt).getTime();
        if (Date.now() - last > limit) {
            console.log(`[${id}] Expired (${SESSION_EXPIRY_DAYS}d inactive) → auto-delete`);
            await destroySession(id);
        }
    }
}
cleanupExpired();
setInterval(cleanupExpired, 6 * 3600 * 1000);


/* ============================================================
   ROUTES ─ DASHBOARD
============================================================ */
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

/* ============================================================
   ROUTES ─ MULTER (file uploads)
============================================================ */
const UPLOAD_DIR = './uploads';
fs.ensureDirSync(UPLOAD_DIR);
const upload = multer({
    dest  : UPLOAD_DIR,
    limits: { fileSize: 20 * 1024 * 1024 }   // 20 MB
});

/* ============================================================
   API ─ CREATE SESSION
============================================================ */
app.post('/session/create', async (req, res) => {
    const { label = '' } = req.body;
    const sessionId      = 'sess_' + uuidv4().replace(/-/g, '').slice(0, 8);
    await startSession(sessionId, label);
    console.log(`New session created: ${sessionId}  label="${label}"`);
    res.json({ success: true, sessionId, label });
});

/* ============================================================
   API ─ GET ALL SESSIONS  (polled by dashboard every 2s)
============================================================ */
app.post('/sessions', async (req, res) => {
    try {
        const userid = req.body.userid;
        const out = {};
         const [rows] = await config.promise().query(
            "CALL get_tblusersession(?)",
            [userid]
        );
       const userSessions = rows[0];
        const allowedTokens = userSessions.map(x => x.sessiontoken);
        for (const [id, s] of Object.entries(sessions)) {
            if (!allowedTokens.includes(id)) {
                continue;
            }
            out[id] = {
                sessionId: id,
                label: s.label || '',
                status      : s.isReady ? 'connected' : s.qrCode ? 'qr' : 'waiting',
                number: s.phoneNumber || '',
                token: s.token || null,
                qr: s.qrCode || '',
                createdAt: s.createdAt,
                lastActiveAt: s.lastActiveAt
            };
        }
        res.json(out);
    }
    catch (err) {
        console.log(err);
        res.status(500).json({
            success: false
        });
    }
});

/* ============================================================
   API ─ SINGLE SESSION STATUS
============================================================ */
app.get('/session/:id/status', (req, res) => {
    const s = sessions[req.params.id];
    if (!s) return res.status(404).json({ error: 'Session not found' });
    if (s.isReady) return res.json({ status: 'connected', number: s.phoneNumber, token: s.token });
    if (s.qrCode)  return res.json({ status: 'qr', qr: s.qrCode });
    res.json({ status: 'waiting' });
});

/* ============================================================
   API ─ LOGOUT SESSION
   Token is preserved in phone_tokens.json
   → Same phone = same token after re-login
============================================================ */
app.post('/session/:id/logout', async (req, res) => {
    const id = req.params.id;
    const s  = sessions[id];
    if (!s) return res.status(404).json({ error: 'Session not found' });
    const label = s.label || '';
    console.log(`[${id}] Logout requested → full session reset`);
    await destroySession(id);
    await startSession(id, label);
    const now = new Date().toISOString();
    if (sessions[id]) {
        sessions[id].label     = label;
        sessions[id].createdAt = now;
        saveSessionMeta(id);
    }

    res.json({ success: true });
});


/* ============================================================
   API ─ DELETE SESSION  (permanent)
============================================================ */
app.delete('/session/:id', async (req, res) => {
    const sessionid = req.params.id;
    const userid = req.body.userid;
    try {
        if (sessions[sessionid]) {
            await destroySession(sessionid);
        } else {
            removeSessionMeta(sessionid);
        }
        await config.promise().query(
            "CALL delete_tblusersession(?, ?)",
            [userid, sessionid]
        );
       res.json({
            success: true,
            message: "Session Deleted Successfully"
        });
    } catch (err) {
         console.log(err);
        res.status(500).json({
            success: false,
            message: "Delete failed"
        });
    }
});

/* ============================================================
   API ─ SEND TEXT / MEDIA / DOCUMENT
============================================================ */
app.post('/send', upload.single('file'), async (req, res) => {
    let { token, number, message } = req.body;

    if (!token || !number)
        return res.status(400).json({ error: 'token and number are required' });

    const entry = Object.entries(sessions)
        .find(([, s]) => s.token === token && s.isReady);

    if (!entry)
        return res.status(401).json({ error: 'Invalid token or session not connected' });

    const [sessionId, session] = entry;

    message = (message || '').replace(/\\n/g, '\n');

    try {

        if (req.file) {
            const buffer = fs.readFileSync(req.file.path);
            const media = req.file.mimetype.startsWith('image/')
                ? {
                    image: buffer,
                    caption: message || ''
                }
                : {
                    document: buffer,
                    mimetype: req.file.mimetype,
                    fileName: req.file.originalname,
                    caption: message || ''
                };
            await session.sock.sendMessage(
                `${number}@s.whatsapp.net`,
                media
            );
            fs.unlinkSync(req.file.path);
        } else {
            if (!message)
                return res.status(400).json({ error: 'Tempalte should not be blank' });
            await session.sock.sendMessage(
                `${number}@s.whatsapp.net`,
                { text: message }
            );
        }
        session.lastActiveAt = new Date().toISOString();
        saveSessionMeta(sessionId);
        res.json({
            success: true,
            message: 'Sent Successfully'
        });
    } catch (err) {
        console.error(`[${sessionId}] send error:`, err.message);
        res.status(500).json({
            error: 'Send failed',
            details: err.message
        });
    }
});


/* ============================================================
   START SERVER
============================================================ */
app.listen(3000, () => {
    console.log('');
    console.log('✅ Server running   → http://localhost:3000');
    console.log('📊 Dashboard        → http://localhost:3000/');
    console.log('');
});
