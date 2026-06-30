// ============================================================================
// CONFIG (SAFE FOR RENDER + LOCAL)
// ============================================================================

const SERVER_CONFIG = {
    port: process.env.PORT || 3000,
    basePath: "/reservation",
    appName: "School Reservation System",
    apiVersion: "1.0",
    corsOrigins: "all",
    dataDirectories: {
        timetables: "data/timetables",
        users: "data/Users"
    },
    serveFrontend: true,
    frontendPath: "src",
};

// ============================================================================

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs").promises;

const app = express();

let DATA_DIR, USERS_DIR;

// ============================================================================
// CORS
// ============================================================================

function configureCors() {
    if (SERVER_CONFIG.corsOrigins === "all") {
        return cors({ origin: "*", credentials: true });
    }
    return cors();
}

// ============================================================================
// INIT DIRECTORIES
// ============================================================================

async function initializeDataDirectories() {
    const timetablesDir = path.resolve(process.cwd(), SERVER_CONFIG.dataDirectories.timetables);
    const usersDir = path.resolve(process.cwd(), SERVER_CONFIG.dataDirectories.users);

    await fs.mkdir(timetablesDir, { recursive: true });
    await fs.mkdir(usersDir, { recursive: true });

    return { DATA_DIR: timetablesDir, USERS_DIR: usersDir };
}

// ============================================================================
// UTIL
// ============================================================================

function generateFileId(length = 12) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    return Array.from({ length }, () =>
        chars[Math.floor(Math.random() * chars.length)]
    ).join("");
}

// ============================================================================
// MIDDLEWARE
// ============================================================================

function setupMiddleware() {
    app.use(configureCors());
    app.use(express.json());

    if (!SERVER_CONFIG.serveFrontend) return;

    const frontendPath = path.join(process.cwd(), SERVER_CONFIG.frontendPath);
    const base = SERVER_CONFIG.basePath;

    const innerHtmlRoute = async (req, res) => {
        const candidates = [
            path.join(frontendPath, "inner.html"),
            path.join(frontendPath, "html", "inner.html")
        ];

        for (const file of candidates) {
            try {
                await fs.access(file);
                return res.sendFile(file);
            } catch {}
        }

        res.status(404).send("inner.html not found");
    };

    if (base) {
        app.use(base, express.static(frontendPath));

        app.get(`${base}/app`, (req, res) => {
            res.sendFile(path.join(frontendPath, "html", "index.html"));
        });

        app.get(`${base}/inner.html`, innerHtmlRoute);
    } else {
        app.use(express.static(frontendPath));

        app.get("/app", (req, res) => {
            res.sendFile(path.join(frontendPath, "html", "index.html"));
        });

        app.get("/inner.html", innerHtmlRoute);
    }
}

// ============================================================================
// ROOT
// ============================================================================

app.get("/", (req, res) => {
    const host = req.get("host");

    res.json({
        message: SERVER_CONFIG.appName,
        version: SERVER_CONFIG.apiVersion,
        endpoints: {
            timetables: `${SERVER_CONFIG.basePath}/api/timetables`,
            users: `${SERVER_CONFIG.basePath}/api/users`
        },
        frontend: SERVER_CONFIG.serveFrontend
            ? { url: `${req.protocol}://${host}${SERVER_CONFIG.basePath}/app` }
            : undefined,
        status: "running"
    });
});

// ============================================================================
// API
// ============================================================================

function setupAPIRoutes() {
    const api = SERVER_CONFIG.basePath + "/api";

    // GET timetables
    app.get(`${api}/timetables`, async (req, res) => {
        try {
            const files = await fs.readdir(DATA_DIR);

            const data = await Promise.all(
                files.filter(f => f.endsWith(".json")).map(async file => {
                    const content = await fs.readFile(path.join(DATA_DIR, file), "utf8");
                    return JSON.parse(content);
                })
            );

            const unique = [...new Set(data.map(d => d.className))];
            res.json(unique);
        } catch (e) {
            res.status(500).json({ error: "Failed to list timetables" });
        }
    });

    // POST timetable
    app.post(`${api}/timetables`, async (req, res) => {
        const { name, info } = req.body;
        if (!name) return res.status(400).json({ error: "Name required" });

        const fileId = generateFileId();

        const data = {
            className: name,
            fileId,
            data: {},
            calendar: "",
            currentWeek: new Date().toISOString(),
            info: info || "",
            attributes: [],
            permanentHours: { "0": {}, "1": {}, "2": {}, "3": {}, "4": {} }
        };

        await fs.writeFile(
            path.join(DATA_DIR, `${fileId}.json`),
            JSON.stringify(data, null, 2)
        );

        res.json({ success: true, fileId });
    });

    // GET by class
    app.get(`${api}/timetables/:name`, async (req, res) => {
        try {
            const files = await fs.readdir(DATA_DIR);

            for (const file of files) {
                const data = JSON.parse(
                    await fs.readFile(path.join(DATA_DIR, file), "utf8")
                );

                if (data.className === req.params.name) {
                    return res.json(data);
                }
            }

            res.status(404).json({ error: "Not found" });
        } catch {
            res.status(500).json({ error: "Server error" });
        }
    });

    // PUT update timetable by class name
    app.put(`${api}/timetables/:name`, async (req, res) => {
        try {
            const files = await fs.readdir(DATA_DIR);

            for (const file of files) {
                const filePath = path.join(DATA_DIR, file);
                const data = JSON.parse(await fs.readFile(filePath, "utf8"));

                if (data.className === req.params.name) {
                    const updated = {
                        ...data,
                        ...req.body,
                        className: data.className // never let body overwrite the name via this route
                    };
                    await fs.writeFile(filePath, JSON.stringify(updated, null, 2));
                    return res.json({ success: true });
                }
            }

            res.status(404).json({ error: "Not found" });
        } catch {
            res.status(500).json({ error: "Server error" });
        }
    });

    // DELETE a single timetable by its fileId
    app.delete(`${api}/timetables/file/:fileId`, async (req, res) => {
        try {
            await fs.unlink(path.join(DATA_DIR, `${req.params.fileId}.json`));
            res.json({ success: true });
        } catch {
            res.status(404).json({ error: "Not found" });
        }
    });

    // DELETE timetable by class name (body {name}), or ALL timetables if no body/name given
    app.delete(`${api}/timetables`, async (req, res) => {
        try {
            const { name } = req.body || {};
            const files = await fs.readdir(DATA_DIR);

            if (!name) {
                // No name provided: wipe all timetables (used by debug "reset all")
                await Promise.all(
                    files.filter(f => f.endsWith(".json"))
                        .map(f => fs.unlink(path.join(DATA_DIR, f)))
                );
                return res.json({ success: true, deleted: "all" });
            }

            for (const file of files) {
                const filePath = path.join(DATA_DIR, file);
                const data = JSON.parse(await fs.readFile(filePath, "utf8"));

                if (data.className === name) {
                    await fs.unlink(filePath);
                    return res.json({ success: true });
                }
            }

            res.status(404).json({ error: "Not found" });
        } catch {
            res.status(500).json({ error: "Server error" });
        }
    });

    // GET users (list, for login dropdown — passwords stripped)
    app.get(`${api}/users`, async (req, res) => {
        try {
            const files = await fs.readdir(USERS_DIR);

            const users = await Promise.all(
                files.filter(f => f.endsWith(".json")).map(async file => {
                    const content = await fs.readFile(path.join(USERS_DIR, file), "utf8");
                    const { password, ...safe } = JSON.parse(content);
                    return safe;
                })
            );

            res.json(users);
        } catch (e) {
            res.status(500).json({ error: "Failed to list users" });
        }
    });

    // POST login (check abbreviation + password)
    app.post(`${api}/users/login`, async (req, res) => {
        const { abbreviation, password } = req.body;

        if (!abbreviation || !password) {
            return res.status(400).json({ error: "Missing fields" });
        }

        try {
            const files = await fs.readdir(USERS_DIR);

            for (const file of files) {
                const data = JSON.parse(
                    await fs.readFile(path.join(USERS_DIR, file), "utf8")
                );

                if (data.abbreviation === abbreviation) {
                    if (data.password !== password) {
                        return res.status(401).json({ error: "Invalid password" });
                    }
                    const { password: _, ...safe } = data;
                    return res.json(safe);
                }
            }

            res.status(404).json({ error: "User not found" });
        } catch {
            res.status(500).json({ error: "Server error" });
        }
    });

    // USERS (unchanged but safe)
    app.post(`${api}/users`, async (req, res) => {
        const { name, abbreviation, password, isAdmin } = req.body;

        if (!name || !abbreviation || !password) {
            return res.status(400).json({ error: "Missing fields" });
        }

        const id = generateFileId();

        const user = {
            id,
            name,
            abbreviation,
            password,
            isAdmin: !!isAdmin,
            createdAt: new Date().toISOString()
        };

        await fs.writeFile(
            path.join(USERS_DIR, `${id}.json`),
            JSON.stringify(user, null, 2)
        );

        const { password: _, ...safe } = user;
        res.json(safe);
    });
}

// ============================================================================
// START
// ============================================================================

async function start() {
    console.log("Starting server...");

    const dirs = await initializeDataDirectories();
    DATA_DIR = dirs.DATA_DIR;
    USERS_DIR = dirs.USERS_DIR;

    setupMiddleware();
    setupAPIRoutes();

    app.listen(SERVER_CONFIG.port, "0.0.0.0", () => {
        console.log("Server running on port", SERVER_CONFIG.port);
    });
}

start();
