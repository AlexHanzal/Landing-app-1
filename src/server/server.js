// ============================================================================
// SERVER CONFIGURATION
// ============================================================================

const isLocal = true; // true = force localhost for dev

const SERVER_CONFIG = {
    port: "3000",           // "automatic" or a number
    domain: "78.111.120.120",
    publicDomain: "78.111.120.120",
    usePublicDomain: true,
    basePath: "/reservation",
    appName: "School Reservation System",
    apiVersion: "1.0",
    corsOrigins: "all",     // "all" or array of origins
    dataDirectories: {
        timetables: "data/timetables",
        users: "data/Users"
    },
    serveFrontend: true,
    frontendPath: "src",
};

// ============================================================================

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const net = require('net');
const app = express();

async function findAvailablePort(startPort = 3000) {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.listen(startPort, '0.0.0.0', () => {
            const port = server.address().port;
            server.close(() => resolve(port));
        });
        server.on('error', err => {
            if (err.code === 'EADDRINUSE') resolve(findAvailablePort(startPort + 1));
            else reject(err);
        });
    });
}

function getLocalIpAddress() {
    const interfaces = os.networkInterfaces();
    const priority = ['Ethernet', 'Wi-Fi', 'Local Area Connection'];

    for (const name of priority) {
        for (const iface of Object.keys(interfaces)) {
            if (iface.includes(name)) {
                const addr = interfaces[iface].find(a => !a.internal && a.family === 'IPv4');
                if (addr) return addr.address;
            }
        }
    }

    for (const iface of Object.values(interfaces)) {
        const addr = iface.find(a => !a.internal && a.family === 'IPv4');
        if (addr) return addr.address;
    }

    return 'localhost';
}

async function resolveConfig() {
    const config = { ...SERVER_CONFIG };

    if (isLocal) {
        config.resolvedHost = 'localhost';
        config.resolvedPort = config.port === 'automatic' ? await findAvailablePort(3000) : config.port;
        return config;
    }

    config.resolvedPort = config.port === 'automatic' ? await findAvailablePort(3000) : config.port;
    config.resolvedHost = (config.usePublicDomain && config.publicDomain)
        ? config.publicDomain
        : config.domain === 'automatic' ? getLocalIpAddress() : config.domain;

    return config;
}

function generateFileId(length = 12) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function configureCors() {
    if (SERVER_CONFIG.corsOrigins === 'all') {
        return cors({ origin: (origin, cb) => cb(null, true), credentials: true });
    }
    if (Array.isArray(SERVER_CONFIG.corsOrigins)) {
        return cors({
            origin: (origin, cb) => {
                if (!origin || SERVER_CONFIG.corsOrigins.includes(origin)) cb(null, true);
                else cb(new Error('Not allowed by CORS'));
            },
            credentials: true
        });
    }
    return cors();
}

let resolvedConfig;
let DATA_DIR, USERS_DIR;

async function initializeDataDirectories() {
    const timetablesDir = path.resolve(process.cwd(), resolvedConfig.dataDirectories.timetables);
    const usersDir = path.resolve(process.cwd(), resolvedConfig.dataDirectories.users);
    await fs.mkdir(timetablesDir, { recursive: true });
    await fs.mkdir(usersDir, { recursive: true });
    return { DATA_DIR: timetablesDir, USERS_DIR: usersDir };
}

function setupMiddleware() {
    app.use(configureCors());
    app.use(express.json());

    if (resolvedConfig.serveFrontend) {
        const frontendPath = path.join(process.cwd(), resolvedConfig.frontendPath);
        const appPath = resolvedConfig.basePath ? resolvedConfig.basePath + '/app' : '/app';

        if (resolvedConfig.basePath) {
            app.get(resolvedConfig.basePath + '/html/index.html', (req, res) =>
                res.sendFile(path.join(frontendPath, 'html', 'index.html')));
            app.get(resolvedConfig.basePath + '/html/index', (req, res) =>
                res.sendFile(path.join(frontendPath, 'html', 'index.html')));
            app.use(resolvedConfig.basePath, express.static(frontendPath));
            app.get(resolvedConfig.basePath + '/app', (req, res) =>
                res.sendFile(path.join(frontendPath, 'html', 'index.html')));
            app.get(resolvedConfig.basePath, (req, res) =>
                res.redirect(resolvedConfig.basePath + '/app'));
        } else {
            app.get('/html/index.html', (req, res) =>
                res.sendFile(path.join(frontendPath, 'html', 'index.html')));
            app.get('/html/index', (req, res) =>
                res.sendFile(path.join(frontendPath, 'html', 'index.html')));
            app.use(express.static(frontendPath));
            app.get('/app', (req, res) =>
                res.sendFile(path.join(frontendPath, 'html', 'index.html')));
        }
    }
}

app.get('/', (req, res) => {
    const base = `http://${resolvedConfig.resolvedHost}:${resolvedConfig.resolvedPort}${resolvedConfig.basePath || ''}`;
    res.json({
        message: resolvedConfig.appName + ' API',
        version: resolvedConfig.apiVersion,
        endpoints: {
            timetables: (resolvedConfig.basePath || '') + '/api/timetables',
            users: (resolvedConfig.basePath || '') + '/api/users'
        },
        frontend: resolvedConfig.serveFrontend ? { url: base + '/app' } : undefined,
        status: 'running'
    });
});

function setupAPIRoutes() {
    const api = (resolvedConfig.basePath || '') + '/api';

    // GET /timetables — returns unique class names (newest file per name)
    app.get(api + '/timetables', async (req, res) => {
        try {
            const files = await fs.readdir(DATA_DIR);
            const stats = await Promise.all(
                files.filter(f => f.endsWith('.json')).map(async file => {
                    const filePath = path.join(DATA_DIR, file);
                    const [stat, data] = await Promise.all([fs.stat(filePath), fs.readFile(filePath, 'utf8')]);
                    return { data: JSON.parse(data), mtime: stat.mtime };
                })
            );
            stats.sort((a, b) => b.mtime - a.mtime);
            const unique = new Map();
            stats.forEach(s => { if (!unique.has(s.data.className)) unique.set(s.data.className, s.data); });
            res.json([...unique.keys()]);
        } catch (error) {
            console.error('Failed to list timetables:', error);
            res.status(500).json({ success: false, error: 'Failed to list timetables' });
        }
    });

    // POST /timetables — create new timetable
    app.post(api + '/timetables', async (req, res) => {
        const { name, info } = req.body;
        if (!name) return res.status(400).json({ success: false, error: 'Name is required' });

        const fileId = generateFileId();
        const timetableData = {
            className: name,
            fileId,
            data: {},
            calendar: '',
            currentWeek: new Date().toISOString(),
            info: info || '',
            permanentHours: { "0": {}, "1": {}, "2": {}, "3": {}, "4": {} }
        };

        try {
            await fs.writeFile(path.join(DATA_DIR, `${fileId}.json`), JSON.stringify(timetableData, null, 2));
            res.json({ success: true, fileId, className: name });
        } catch (error) {
            res.status(500).json({ success: false, error: 'Failed to create timetable' });
        }
    });

    // PUT /timetables/:name — update timetable
    app.put(api + '/timetables/:name', async (req, res) => {
        const { name } = req.params;
        const { fileId, data, info, calendar, currentWeek, permanentHours } = req.body;
        if (!fileId) return res.status(400).json({ success: false, error: 'FileId is required' });

        const filePath = path.join(DATA_DIR, `${fileId}.json`);
        const tempPath = path.join(DATA_DIR, `${fileId}_temp.json`);

        let existing = {
            className: name, fileId, data: {}, calendar: '', currentWeek: new Date().toISOString(),
            info: '', permanentHours: { "0": {}, "1": {}, "2": {}, "3": {}, "4": {} }
        };

        try { existing = { ...existing, ...JSON.parse(await fs.readFile(filePath, 'utf8')) }; } catch {}

        const updated = {
            className: name, fileId,
            data: data !== undefined ? data : existing.data,
            calendar: calendar !== undefined ? calendar : existing.calendar,
            currentWeek: currentWeek !== undefined ? currentWeek : existing.currentWeek,
            info: info !== undefined ? info : existing.info,
            permanentHours: permanentHours !== undefined ? permanentHours : existing.permanentHours
        };

        try {
            await fs.writeFile(tempPath, JSON.stringify(updated, null, 2));
            await fs.rename(tempPath, filePath);
            res.json({ success: true, fileId });
        } catch (error) {
            try { await fs.unlink(tempPath); } catch {}
            res.status(500).json({ success: false, error: 'Failed to update timetable' });
        }
    });

    // GET /timetables/:name — fetch timetable by class name
    app.get(api + '/timetables/:name', async (req, res) => {
        try {
            const files = await fs.readdir(DATA_DIR);
            for (const file of files) {
                if (!file.endsWith('.json')) continue;
                const timetable = JSON.parse(await fs.readFile(path.join(DATA_DIR, file), 'utf8'));
                if (timetable.className === req.params.name) return res.json(timetable);
            }
            res.status(404).json({ success: false, error: 'Timetable not found' });
        } catch (error) {
            res.status(500).json({ success: false, error: 'Failed to read timetable' });
        }
    });

    // DELETE /timetables — delete all timetables
    app.delete(api + '/timetables', async (req, res) => {
        try {
            const files = await fs.readdir(DATA_DIR);
            await Promise.all(files.filter(f => f.endsWith('.json')).map(f => fs.unlink(path.join(DATA_DIR, f))));
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ success: false, error: 'Failed to reset timetables' });
        }
    });

    // POST /users — create user
    app.post(api + '/users', async (req, res) => {
        const { name, abbreviation, password, isAdmin } = req.body;
        if (!name?.trim() || !abbreviation?.trim() || !password?.trim()) {
            return res.status(400).json({ success: false, error: 'All fields are required' });
        }

        try {
            const files = await fs.readdir(USERS_DIR);
            for (const file of files) {
                if (!file.endsWith('.json')) continue;
                const user = JSON.parse(await fs.readFile(path.join(USERS_DIR, file), 'utf8'));
                if (user.abbreviation === abbreviation.trim()) {
                    return res.status(409).json({ success: false, error: 'User with this abbreviation already exists' });
                }
            }
        } catch (e) { if (e.code !== 'ENOENT') throw e; }

        const userId = generateFileId();
        const userData = {
            id: userId, name: name.trim(), abbreviation: abbreviation.trim(),
            password: password.trim(), isAdmin: isAdmin === true, createdAt: new Date().toISOString()
        };

        await fs.writeFile(path.join(USERS_DIR, `${userId}.json`), JSON.stringify(userData, null, 2));
        const { password: _, ...safe } = userData;
        res.status(201).json({ success: true, user: safe });
    });

    // GET /users — list users (no passwords)
    app.get(api + '/users', async (req, res) => {
        try {
            await fs.mkdir(USERS_DIR, { recursive: true });
            const files = await fs.readdir(USERS_DIR);
            const users = [];
            for (const file of files) {
                if (!file.endsWith('.json')) continue;
                try {
                    const { password, ...user } = JSON.parse(await fs.readFile(path.join(USERS_DIR, file), 'utf8'));
                    users.push(user);
                } catch {}
            }
            res.json(users);
        } catch (error) {
            res.status(500).json({ success: false, error: 'Failed to list users' });
        }
    });

    // POST /users/login — authenticate user
    app.post(api + '/users/login', async (req, res) => {
        const { abbreviation, password } = req.body;
        try {
            const files = await fs.readdir(USERS_DIR);
            for (const file of files) {
                if (!file.endsWith('.json')) continue;
                const user = JSON.parse(await fs.readFile(path.join(USERS_DIR, file), 'utf8'));
                if (user.abbreviation === abbreviation) {
                    if (user.password === password) {
                        const { password: _, ...safe } = user;
                        return res.json(safe);
                    }
                    return res.status(401).json({ success: false, error: 'Invalid password' });
                }
            }
            res.status(401).json({ success: false, error: 'User not found' });
        } catch (error) {
            res.status(500).json({ success: false, error: 'Server error during login' });
        }
    });
}

async function initialize() {
    console.log(`🚀 Starting ${SERVER_CONFIG.appName}...`);
    resolvedConfig = await resolveConfig();

    const dirs = await initializeDataDirectories();
    DATA_DIR = dirs.DATA_DIR;
    USERS_DIR = dirs.USERS_DIR;
    global.DATA_DIR = DATA_DIR;
    global.USERS_DIR = USERS_DIR;

    setupMiddleware();
    setupAPIRoutes();

    app.listen(resolvedConfig.resolvedPort, '0.0.0.0', err => {
        if (err) { console.error('❌ Failed to start server:', err); process.exit(1); }

        const base = `http://${resolvedConfig.resolvedHost}:${resolvedConfig.resolvedPort}`;
        console.log(`✅ Server started`);
        console.log(`   URL:      ${base}/`);
        console.log(`   API:      ${base}${resolvedConfig.basePath}/api`);
        console.log(`   Frontend: ${base}${resolvedConfig.basePath}/app`);
        console.log(`   Local IP: ${getLocalIpAddress()}`);
    });
}

initialize().catch(err => { console.error('Fatal error:', err); process.exit(1); });
