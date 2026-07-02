// ════════════════════════════════════════════════════════════════════════
// CONFIG / STATE
// ════════════════════════════════════════════════════════════════════════

const urlParams = new URLSearchParams(window.location.search);
let API_BASE_URL = urlParams.get('api') || window.API_BASE_URL || `http://${window.location.hostname}:3000`;
let API_URL = `${API_BASE_URL}/reservation/api`;

let tables = {};          // name -> timetable object (as returned by API, plus fileId)
let selectedTableName = null;
let currentView = 'overview'; // 'overview' | 'detail'
let loggedInUser = null;  // { name, abbreviation, isAdmin }

const WEEKDAYS = ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek'];
const HOUR_LABELS = ['8:00-9:00','9:00-10:00','10:00-11:00','11:00-12:00','12:00-13:00',
                      '13:00-14:00','14:00-15:00','15:00-16:00','16:00-17:00','17:00-18:00',
                      '18:00-19:00','19:00-20:00'];

// ════════════════════════════════════════════════════════════════════════
// FUTURE-PROOFING NOTE
// ────────────────────────────────────────────────────────────────────────
// Each booking object currently looks like: { content, isPermanent, abbreviation }
// In the future, bookings will also carry order + payment info, e.g.:
//   {
//     content, isPermanent, abbreviation,
//     order: [{ item, qty, price }, ...],
//     orderTotal: number,
//     isPaid: boolean,
//     paidAt: ISOString
//   }
// The rendering functions below (renderOverviewCard, renderBookingsTable)
// are intentionally written to read booking.order / booking.isPaid if present
// and fall back gracefully when absent, so wiring up real order data later
// should not require restructuring this file — just populate those fields
// server-side and the "Objednávka" / "Platba" columns will start showing
// real data instead of the neutral placeholder shown now.
// ════════════════════════════════════════════════════════════════════════

function generateFileId(length = 12) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ════════════════════════════════════════════════════════════════════════
// TOAST
// ════════════════════════════════════════════════════════════════════════

function showToast(msg, isError = false) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'inn-toast show' + (isError ? ' error' : '');
    setTimeout(() => t.classList.remove('show'), 2600);
}

// ════════════════════════════════════════════════════════════════════════
// CONNECTION / GATE
// ════════════════════════════════════════════════════════════════════════

async function tryConnect(url) {
    API_BASE_URL = url.replace(/\/$/, '');
    API_URL = `${API_BASE_URL}/reservation/api`;
    try {
        const res = await fetch(`${API_BASE_URL}/`);
        if (!res.ok) throw new Error('bad status');
        document.getElementById('gateOverlay').style.display = 'none';
        document.getElementById('connDot').classList.remove('bad');
        document.getElementById('connText').textContent = API_BASE_URL;
        await showLoginGate();
        return true;
    } catch (e) {
        document.getElementById('connDot').classList.add('bad');
        document.getElementById('connText').textContent = 'Nepřipojeno';
        return false;
    }
}

// ════════════════════════════════════════════════════════════════════════
// LOGIN GATE (moved here from the customer-facing app — this is now the
// only place login/admin-account credentials are needed)
// ════════════════════════════════════════════════════════════════════════

async function showLoginGate() {
    await loadUserOptions();
    document.getElementById('loginGateOverlay').style.display = 'flex';
}

async function loadUserOptions() {
    try {
        const response = await fetch(`${API_URL}/users`);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const users = await response.json();

        const select = document.getElementById('loginUserSelect');
        if (!select) return;
        select.innerHTML = '<option value="">Vyberte uživatele</option>';
        users.forEach(user => {
            const option = document.createElement('option');
            option.value = user.abbreviation;
            option.textContent = user.name;
            select.appendChild(option);
        });
    } catch (e) {
        console.error('Nepodařilo se načíst uživatele:', e);
    }
}

async function handleLogin() {
    const select = document.getElementById('loginUserSelect');
    const passwordInput = document.getElementById('loginPasswordInput');
    const errorEl = document.getElementById('loginGateError');
    errorEl.style.display = 'none';

    if (!select.value || !passwordInput.value) {
        errorEl.textContent = 'Prosím vyplňte všechna pole';
        errorEl.style.display = 'block';
        return;
    }

    try {
        const response = await fetch(`${API_URL}/users/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ abbreviation: select.value, password: passwordInput.value })
        });
        const data = await response.json();

        if (!response.ok) {
            errorEl.textContent = data.error || 'Neplatné heslo';
            errorEl.style.display = 'block';
            return;
        }

        loggedInUser = { name: data.name, abbreviation: select.value, isAdmin: !!data.isAdmin };
        passwordInput.value = '';
        document.getElementById('loginGateOverlay').style.display = 'none';

        const userText = document.getElementById('loggedInUserText');
        if (userText) userText.textContent = loggedInUser.name;
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) logoutBtn.style.display = 'inline-block';

        await loadAllTables();
        showToast(`Přihlášen jako ${loggedInUser.name}`);
    } catch (e) {
        errorEl.textContent = 'Chyba připojení. Prosím zkuste to znovu.';
        errorEl.style.display = 'block';
    }
}

function performLogout() {
    loggedInUser = null;
    tables = {};
    selectedTableName = null;

    const userText = document.getElementById('loggedInUserText');
    if (userText) userText.textContent = '';
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.style.display = 'none';

    document.getElementById('loginPasswordInput').value = '';
    showLoginGate();
}

document.getElementById('loginSubmitBtn').addEventListener('click', handleLogin);
document.getElementById('loginPasswordInput').addEventListener('keypress', e => {
    if (e.key === 'Enter') handleLogin();
});
document.getElementById('logoutBtn').addEventListener('click', performLogout);

// ════════════════════════════════════════════════════════════════════════
// ACCOUNT CREATION (admin-only)
// ════════════════════════════════════════════════════════════════════════

document.getElementById('newAccountBtn').addEventListener('click', () => {
    document.getElementById('newAccountName').value = '';
    document.getElementById('newAccountAbbr').value = '';
    document.getElementById('newAccountPassword').value = '';
    document.getElementById('newAccountIsAdmin').checked = false;
    document.getElementById('newAccountError').style.display = 'none';
    document.getElementById('newAccountModal').classList.add('active');
});
document.getElementById('newAccountCancelBtn').addEventListener('click', () => {
    document.getElementById('newAccountModal').classList.remove('active');
});
document.getElementById('newAccountModal').addEventListener('click', e => {
    if (e.target.id === 'newAccountModal') document.getElementById('newAccountModal').classList.remove('active');
});

document.getElementById('newAccountCreateBtn').addEventListener('click', async () => {
    const name = document.getElementById('newAccountName').value.trim();
    const abbreviation = document.getElementById('newAccountAbbr').value.trim();
    const password = document.getElementById('newAccountPassword').value.trim();
    const isAdmin = document.getElementById('newAccountIsAdmin').checked;
    const errorEl = document.getElementById('newAccountError');
    errorEl.style.display = 'none';

    if (!name || !abbreviation || !password) {
        errorEl.textContent = 'Všechna pole jsou povinná';
        errorEl.style.display = 'block';
        return;
    }

    try {
        const response = await fetch(`${API_URL}/users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, abbreviation, password, isAdmin })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Chyba při vytváření účtu');

        document.getElementById('newAccountModal').classList.remove('active');
        showToast('Účet byl úspěšně vytvořen');
    } catch (e) {
        errorEl.textContent = e.message || 'Chyba připojení. Prosím zkuste to znovu.';
        errorEl.style.display = 'block';
    }
});

document.getElementById('gateConnectBtn').addEventListener('click', () => {
    const val = document.getElementById('gateApiInput').value.trim();
    if (val) tryConnect(val);
});
document.getElementById('gateApiInput').addEventListener('keypress', e => {
    if (e.key === 'Enter') document.getElementById('gateConnectBtn').click();
});

// ════════════════════════════════════════════════════════════════════════
// DATA LOADING
// ════════════════════════════════════════════════════════════════════════

async function loadAllTables() {
    try {
        const res = await fetch(`${API_URL}/timetables`);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const names = [...new Set(await res.json())];

        const loaded = {};
        for (const name of names) {
            try {
                const r = await fetch(`${API_URL}/timetables/${encodeURIComponent(name)}`);
                if (!r.ok) continue;
                const data = await r.json();
                loaded[name] = data;
            } catch (e) { console.error('Failed to load', name, e); }
        }
        tables = loaded;
        renderSidebar();
        if (currentView === 'overview') renderOverview();
        else if (selectedTableName && tables[selectedTableName]) renderDetail(selectedTableName);
        else { currentView = 'overview'; switchView('overview'); }
    } catch (e) {
        console.error(e);
        showToast('Nepodařilo se načíst stoly', true);
    }
}

// ════════════════════════════════════════════════════════════════════════
// BOOKING EXTRACTION (handles both object-of-hours and legacy array shapes)
// ════════════════════════════════════════════════════════════════════════

// ─── DATE MATH (string-based, avoids timezone parsing bugs) ──────────────

function parseDateStr(dateStr) {
    const [y, m, d] = dateStr.split('-').map(n => parseInt(n, 10));
    return { y, m, d };
}

function addDaysToDateStr(dateStr, days) {
    // Builds a UTC-anchored Date purely as a calendar calculator (noon avoids
    // any DST/timezone edge rolling the day over), then re-serializes to
    // YYYY-MM-DD without ever reading local getDate()/getMonth() (which is
    // what caused the earlier timezone bug).
    const { y, m, d } = parseDateStr(dateStr);
    const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    dt.setUTCDate(dt.getUTCDate() + days);
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
}

function getUTCWeekday(dateStr) {
    // 0 = Sunday, 1 = Monday, ... 6 = Saturday
    const { y, m, d } = parseDateStr(dateStr);
    return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
}

function snapToMonday(dateStr) {
    // The customer app's older getDateString() implementation used
    // toISOString(), which converts to UTC before formatting and could
    // shift the stored "week start" key by a day depending on timezone —
    // some existing data on disk may be keyed by a Sunday instead of the
    // intended Monday. Snapping here means both old (slightly-off) and
    // newly-saved (correct) data resolve to the same real calendar dates.
    const weekday = getUTCWeekday(dateStr); // 0=Sun..6=Sat
    const offsetToMonday = weekday === 0 ? -6 : 1 - weekday;
    return offsetToMonday === 0 ? dateStr : addDaysToDateStr(dateStr, offsetToMonday);
}

function extractBookings(timetable) {
    const out = [];
    const data = timetable.data || {};
    for (const weekStartStr of Object.keys(data)) {
        const dayData = data[weekStartStr];
        if (!dayData) continue;
        const dayIndices = Array.isArray(dayData)
            ? dayData.map((_, i) => i)
            : Object.keys(dayData).map(k => parseInt(k, 10));

        dayIndices.forEach(dayIdx => {
            const hours = Array.isArray(dayData) ? dayData[dayIdx] : dayData[dayIdx];
            if (!hours || typeof hours !== 'object') return;

            // The stored key is supposed to be the Monday of that week, but
            // some legacy data may be keyed by a Sunday (see snapToMonday).
            // Snap first, then add the day-of-week offset (dayIdx).
            const realWeekStart = snapToMonday(weekStartStr);
            const actualDateStr = addDaysToDateStr(realWeekStart, dayIdx);

            Object.keys(hours).forEach(hourKey => {
                const booking = hours[hourKey];
                if (!booking || !booking.content) return;
                const hourIdx = parseInt(hourKey, 10) - 1; // stored 1-indexed, same convention as customer site
                out.push({
                    dateStr: actualDateStr,
                    weekStartStr,
                    dayIdx,
                    hourIdx,
                    hourKey: parseInt(hourKey, 10), // original stored key, needed for writes
                    dayLabel: WEEKDAYS[dayIdx] || `Den ${dayIdx}`,
                    timeLabel: HOUR_LABELS[hourIdx] || `Hodina ${hourKey}`,
                    content: booking.content,
                    abbreviation: booking.abbreviation || '',
                    isPermanent: !!booking.isPermanent,
                    // Future fields — read if present, otherwise undefined
                    order: booking.order,
                    orderTotal: booking.orderTotal,
                    isPaid: booking.isPaid,
                });
            });
        });
    }
    // Sort by actual date then time
    out.sort((a, b) => {
        if (a.dateStr !== b.dateStr) return a.dateStr.localeCompare(b.dateStr);
        return a.hourIdx - b.hourIdx;
    });
    return out;
}

function todayDateStr() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function isFutureOrToday(dateStr) {
    // Plain string comparison avoids timezone parsing bugs (new Date("YYYY-MM-DD")
    // parses as UTC midnight, which can fall on the "wrong side" of local midnight).
    return dateStr >= todayDateStr();
}

function isToday(dateStr) {
    return dateStr === todayDateStr();
}


// ════════════════════════════════════════════════════════════════════════
// SIDEBAR
// ════════════════════════════════════════════════════════════════════════

function renderSidebar() {
    const names = Object.keys(tables).sort((a,b) => a.localeCompare(b, 'cs'));
    document.getElementById('statTableCount').textContent = names.length;

    let totalUpcoming = 0;
    names.forEach(n => {
        totalUpcoming += extractBookings(tables[n]).filter(b => isFutureOrToday(b.dateStr)).length;
    });
    document.getElementById('statBookingCount').textContent = totalUpcoming;

    const query = (document.getElementById('tableSearchInput').value || '').toLowerCase();
    const list = document.getElementById('tableNavList');
    list.innerHTML = '';

    names.filter(n => n.toLowerCase().includes(query)).forEach(name => {
        const bookings = extractBookings(tables[name]).filter(b => isFutureOrToday(b.dateStr));
        const item = document.createElement('div');
        item.className = 'inn-table-nav-item' + (name === selectedTableName && currentView === 'detail' ? ' active' : '');
        item.innerHTML = `<span class="tn-name">${escapeHtml(name)}</span><span class="tn-count">${bookings.length}</span>`;
        item.addEventListener('click', () => {
            selectedTableName = name;
            switchView('detail');
        });
        list.appendChild(item);
    });

    if (names.length === 0) {
        list.innerHTML = '<p style="color:var(--muted); font-size:0.85em; padding:8px 4px;">Žádné stoly</p>';
    }
}

document.getElementById('tableSearchInput').addEventListener('input', renderSidebar);

// ════════════════════════════════════════════════════════════════════════
// VIEW SWITCHING
// ════════════════════════════════════════════════════════════════════════

function switchView(view) {
    currentView = view;
    document.getElementById('viewOverviewBtn').classList.toggle('active', view === 'overview');
    document.getElementById('viewDetailBtn').classList.toggle('active', view === 'detail');
    document.getElementById('viewDetailBtn').disabled = !selectedTableName;
    document.getElementById('overviewView').style.display = view === 'overview' ? 'block' : 'none';
    document.getElementById('detailView').style.display = view === 'detail' ? 'block' : 'none';

    if (view === 'overview') renderOverview();
    else if (selectedTableName) renderDetail(selectedTableName);

    renderSidebar();
}

document.getElementById('viewOverviewBtn').addEventListener('click', () => switchView('overview'));
document.getElementById('viewDetailBtn').addEventListener('click', () => { if (selectedTableName) switchView('detail'); });

// ════════════════════════════════════════════════════════════════════════
// OVERVIEW (ALL TABLES)
// ════════════════════════════════════════════════════════════════════════

function renderOverview() {
    const container = document.getElementById('overviewView');
    const names = Object.keys(tables).sort((a, b) => {
        const aToday = extractBookings(tables[a]).some(bk => isToday(bk.dateStr));
        const bToday = extractBookings(tables[b]).some(bk => isToday(bk.dateStr));
        if (aToday !== bToday) return aToday ? -1 : 1;
        return a.localeCompare(b, 'cs');
    });

    if (names.length === 0) {
        container.innerHTML = `<div class="inn-empty-state"><div class="big">Zatím žádné stoly</div>Vytvořte první stůl v levém panelu.</div>`;
        return;
    }

    const grid = document.createElement('div');
    grid.className = 'inn-overview-grid';

    names.forEach(name => {
        grid.appendChild(renderOverviewCard(name));
    });

    container.innerHTML = '';
    container.appendChild(grid);
}

function renderOverviewCard(name) {
    const t = tables[name];
    const bookings = extractBookings(t).filter(b => isFutureOrToday(b.dateStr));
    const todayBookings = bookings.filter(b => isToday(b.dateStr));
    const laterBookings = bookings.filter(b => !isToday(b.dateStr)).slice(0, 3);

    const card = document.createElement('div');
    card.className = 'inn-overview-card' + (todayBookings.length > 0 ? ' has-today' : '');

    const header = document.createElement('div');
    header.className = 'inn-oc-header';
    header.innerHTML = `
        <span class="inn-oc-title">${escapeHtml(name)}</span>
        ${todayBookings.length > 0 ? `<span class="inn-oc-today-badge">Dnes: ${todayBookings.length}</span>` : ''}
    `;
    const editBtn = document.createElement('button');
    editBtn.className = 'inn-oc-edit-btn';
    editBtn.textContent = '✎ Upravit';
    editBtn.addEventListener('click', () => { selectedTableName = name; switchView('detail'); });
    header.appendChild(editBtn);
    card.appendChild(header);

    const attrsRow = document.createElement('div');
    attrsRow.className = 'inn-oc-attrs';
    (t.attributes || []).forEach(a => {
        const tag = document.createElement('span');
        tag.className = 'inn-oc-tag';
        tag.textContent = a;
        attrsRow.appendChild(tag);
    });
    card.appendChild(attrsRow);

    const body = document.createElement('div');
    body.className = 'inn-oc-body';

    const statRow = document.createElement('div');
    statRow.className = 'inn-oc-stat-row';
    statRow.innerHTML = `<span>Nadcházející rezervace</span><b>${bookings.length}</b>`;
    body.appendChild(statRow);

    // ─── TODAY'S RESERVATIONS ───────────────────────────────────────────
    const todayLabel = document.createElement('div');
    todayLabel.className = 'inn-oc-upcoming-label inn-oc-today-label';
    todayLabel.textContent = 'Dnešní rezervace';
    body.appendChild(todayLabel);

    if (todayBookings.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'inn-oc-empty-note';
        empty.textContent = 'Dnes žádná rezervace';
        body.appendChild(empty);
    } else {
        todayBookings.forEach(b => body.appendChild(renderOverviewBookingRow(b, true)));
    }

    // ─── LATER RESERVATIONS ──────────────────────────────────────────────
    if (laterBookings.length > 0) {
        const label = document.createElement('div');
        label.className = 'inn-oc-upcoming-label';
        label.textContent = 'Další rezervace';
        body.appendChild(label);
        laterBookings.forEach(b => body.appendChild(renderOverviewBookingRow(b, false)));
    }

    card.appendChild(body);
    return card;
}

function renderOverviewBookingRow(b, highlightToday) {
    const row = document.createElement('div');
    row.className = 'inn-oc-booking-row' + (highlightToday ? ' inn-oc-booking-today' : '');

    const dateLabel = isToday(b.dateStr) ? 'Dnes' : formatDateShort(b.dateStr);
    row.innerHTML = `
        <span class="inn-oc-booking-time">${dateLabel}<br><small>${escapeHtml(b.timeLabel)}</small></span>
        <span class="inn-oc-booking-who">${escapeHtml(b.content)}</span>
        ${statusPillHTML(b)}
    `;
    return row;
}

function statusPillHTML(booking) {
    // Future-proofed: shows real payment status once `isPaid`/`order` exist on the booking,
    // otherwise shows a neutral "no order data yet" pill.
    if (booking.order !== undefined || booking.isPaid !== undefined) {
        if (booking.isPaid) return `<span class="inn-status-pill paid">Zaplaceno</span>`;
        return `<span class="inn-status-pill unpaid">Nezaplaceno</span>`;
    }
    return `<span class="inn-status-pill noorder">Bez objednávky</span>`;
}

function formatDateShort(dateStr) {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const [y, m, d] = parts;
    return `${parseInt(d, 10)}.${parseInt(m, 10)}.`;
}

// ════════════════════════════════════════════════════════════════════════
// DETAIL VIEW (SINGLE TABLE — FULL EDIT)
// ════════════════════════════════════════════════════════════════════════

function renderDetail(name) {
    const t = tables[name];
    if (!t) { switchView('overview'); return; }

    const container = document.getElementById('detailView');
    container.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.className = 'inn-detail-header';
    header.innerHTML = `
        <div class="inn-detail-title-block">
            <h2>${escapeHtml(name)}</h2>
        </div>
        <div class="inn-detail-actions">
            <button class="inn-btn" id="backToOverviewBtn">← Zpět na přehled</button>
            <button class="inn-btn danger" id="deleteTableBtn">Smazat stůl</button>
        </div>
    `;
    container.appendChild(header);

    // Panels: basic info + attributes
    const panels = document.createElement('div');
    panels.className = 'inn-detail-panels';

    // Info panel
    const infoPanel = document.createElement('div');
    infoPanel.className = 'inn-panel';
    infoPanel.innerHTML = `
        <h3>Základní informace</h3>
        <div class="inn-field-group">
            <label for="detailNameInput">Název stolu</label>
            <input type="text" id="detailNameInput" value="${escapeHtmlAttr(name)}">
        </div>
        <div class="inn-field-group">
            <label for="detailDescInput">Popis</label>
            <textarea id="detailDescInput">${escapeHtml(t.info || '')}</textarea>
        </div>
        <button class="inn-btn primary" id="saveInfoBtn" style="margin-top:4px;">Uložit informace</button>
    `;
    panels.appendChild(infoPanel);

    // Attributes panel
    const attrPanel = document.createElement('div');
    attrPanel.className = 'inn-panel';
    attrPanel.innerHTML = `
        <h3>Vlastnosti stolu</h3>
        <div class="inn-attr-edit-row">
            <input type="text" id="newAttrInput" placeholder="Např. U okna, 4 místa…">
            <button class="inn-attr-add-btn-small" id="addAttrBtn">+ Přidat</button>
        </div>
        <div class="inn-attr-tag-edit-list" id="attrTagList"></div>
    `;
    panels.appendChild(attrPanel);

    container.appendChild(panels);

    // Bookings panel
    const bookingsPanel = document.createElement('div');
    bookingsPanel.className = 'inn-bookings-panel';
    bookingsPanel.innerHTML = `<h3 style="font-family:var(--mono); font-size:0.75em; text-transform:uppercase; letter-spacing:0.12em; color:var(--muted); margin:0 0 14px;">Rezervace tohoto stolu</h3>`;

    const bookings = extractBookings(t);
    const table = document.createElement('table');
    table.className = 'inn-bookings-table';
    table.innerHTML = `
        <thead>
            <tr>
                <th>Datum</th>
                <th>Den</th>
                <th>Čas</th>
                <th>Rezervace</th>
                <th>Objednávka</th>
                <th>Platba</th>
                <th></th>
            </tr>
        </thead>
        <tbody id="bookingsTbody"></tbody>
    `;
    bookingsPanel.appendChild(table);

    if (bookings.length === 0) {
        const p = document.createElement('p');
        p.className = 'inn-oc-empty-note';
        p.style.marginTop = '6px';
        p.textContent = 'Tento stůl zatím nemá žádné rezervace.';
        bookingsPanel.appendChild(p);
    }

    const futureNote = document.createElement('div');
    futureNote.className = 'inn-future-note';
    futureNote.innerHTML = `<b>Poznámka:</b> Sloupce „Objednávka“ a „Platba“ jsou připraveny pro budoucí funkci objednávek u stolu. Zatím zobrazují pouze stav „bez objednávky“ — jakmile bude funkce objednávek implementována, tyto sloupce se automaticky naplní reálnými daty.`;
    bookingsPanel.appendChild(futureNote);

    container.appendChild(bookingsPanel);

    // Wire up tbody rows
    const tbody = table.querySelector('#bookingsTbody');
    bookings.forEach(b => tbody.appendChild(renderBookingRow(name, b)));

    renderAttrTagList(name);

    // Event listeners
    document.getElementById('backToOverviewBtn').addEventListener('click', () => switchView('overview'));
    document.getElementById('deleteTableBtn').addEventListener('click', () => deleteTable(name));
    document.getElementById('saveInfoBtn').addEventListener('click', () => saveInfo(name));
    document.getElementById('addAttrBtn').addEventListener('click', () => addAttribute(name));
    document.getElementById('newAttrInput').addEventListener('keypress', e => {
        if (e.key === 'Enter') { e.preventDefault(); addAttribute(name); }
    });
}

function renderBookingRow(tableName, booking) {
    const tr = document.createElement('tr');

    const permBadge = booking.isPermanent ? `<span class="inn-perm-badge">trvalá</span>` : '';

    tr.innerHTML = `
        <td class="inn-bk-date">${escapeHtml(booking.dateStr)}</td>
        <td>${escapeHtml(booking.dayLabel)}</td>
        <td class="inn-bk-time">${escapeHtml(booking.timeLabel)}</td>
        <td>
            <input type="text" class="inn-bk-content-input" value="${escapeHtmlAttr(booking.content)}${permBadge ? '' : ''}">
            ${permBadge}
        </td>
        <td>${orderCellHTML(booking)}</td>
        <td>${statusPillHTML(booking)}</td>
        <td><button class="inn-bk-delete-btn" title="Smazat rezervaci">✕</button></td>
    `;

    const input = tr.querySelector('.inn-bk-content-input');
    input.addEventListener('change', () => {
        updateBookingContent(tableName, booking, input.value);
    });

    tr.querySelector('.inn-bk-delete-btn').addEventListener('click', () => {
        deleteBooking(tableName, booking);
    });

    return tr;
}

function orderCellHTML(booking) {
    // Placeholder until order data exists — reads booking.order if present so
    // this slots in automatically once the ordering feature is built.
    if (Array.isArray(booking.order) && booking.order.length > 0) {
        const items = booking.order.map(i => escapeHtml(i.item || '')).join(', ');
        return `<span style="font-size:0.85em;">${items}</span>`;
    }
    return `<span style="color:var(--muted); font-size:0.85em; font-style:italic;">—</span>`;
}

function renderAttrTagList(name) {
    const list = document.getElementById('attrTagList');
    if (!list) return;
    list.innerHTML = '';
    const attrs = tables[name].attributes || [];
    if (attrs.length === 0) {
        list.innerHTML = '<span style="color:var(--muted); font-size:0.85em; font-style:italic;">Žádné vlastnosti</span>';
        return;
    }
    attrs.forEach(attr => {
        const tag = document.createElement('span');
        tag.className = 'inn-attr-tag-removable';
        tag.innerHTML = `${escapeHtml(attr)} <button title="Odebrat">×</button>`;
        tag.querySelector('button').addEventListener('click', () => removeAttribute(name, attr));
        list.appendChild(tag);
    });
}

// ════════════════════════════════════════════════════════════════════════
// MUTATIONS (PUT to API)
// ════════════════════════════════════════════════════════════════════════

async function persistTimetable(name, overrides = {}) {
    const t = tables[name];
    if (!t) return false;
    const payload = {
        fileId: t.fileId,
        data: overrides.data !== undefined ? overrides.data : t.data,
        info: overrides.info !== undefined ? overrides.info : (t.info || ''),
        attributes: overrides.attributes !== undefined ? overrides.attributes : (t.attributes || []),
        calendar: t.calendar,
        currentWeek: t.currentWeek,
        permanentHours: t.permanentHours,
    };
    try {
        const res = await fetch(`${API_URL}/timetables/${encodeURIComponent(name)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        Object.assign(t, payload, { className: name });
        return true;
    } catch (e) {
        console.error(e);
        showToast('Uložení se nezdařilo', true);
        return false;
    }
}

async function saveInfo(name) {
    const newName = document.getElementById('detailNameInput').value.trim();
    const newDesc = document.getElementById('detailDescInput').value;

    if (!newName) { showToast('Název nesmí být prázdný', true); return; }

    if (newName !== name) {
        // Rename: create under new name, delete old
        const t = tables[name];
        try {
            const createRes = await fetch(`${API_URL}/timetables`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName, info: newDesc })
            });
            const created = await createRes.json();
            if (!createRes.ok) throw new Error(created.error || 'Vytvoření se nezdařilo');

            await fetch(`${API_URL}/timetables/${encodeURIComponent(newName)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fileId: created.fileId,
                    data: t.data || {},
                    info: newDesc,
                    attributes: t.attributes || [],
                    permanentHours: t.permanentHours || {},
                    currentWeek: t.currentWeek || new Date().toISOString()
                })
            });

            delete tables[name];
            if (selectedTableName === name) selectedTableName = newName;
            await loadAllTables();
            showToast('Stůl přejmenován');
        } catch (e) {
            console.error(e);
            showToast('Přejmenování se nezdařilo', true);
        }
        return;
    }

    const ok = await persistTimetable(name, { info: newDesc });
    if (ok) {
        showToast('Informace uloženy');
        renderSidebar();
        if (currentView === 'overview') renderOverview();
    }
}

async function addAttribute(name) {
    const input = document.getElementById('newAttrInput');
    const val = input.value.trim();
    if (!val) return;
    const t = tables[name];
    const attrs = t.attributes || [];
    if (attrs.includes(val)) { showToast('Tato vlastnost už existuje', true); return; }
    const updated = [...attrs, val];
    const ok = await persistTimetable(name, { attributes: updated });
    if (ok) {
        input.value = '';
        renderAttrTagList(name);
        renderSidebar();
    }
}

async function removeAttribute(name, attr) {
    const t = tables[name];
    const updated = (t.attributes || []).filter(a => a !== attr);
    const ok = await persistTimetable(name, { attributes: updated });
    if (ok) renderAttrTagList(name);
}

async function updateBookingContent(name, booking, newContent) {
    const t = tables[name];
    const data = JSON.parse(JSON.stringify(t.data || {}));
    const dayData = data[booking.weekStartStr];
    if (!dayData) return;

    const hourSlot = Array.isArray(dayData) ? dayData[booking.dayIdx] : dayData[booking.dayIdx];
    if (!hourSlot) return;

    if (newContent.trim() === '') {
        delete hourSlot[booking.hourKey];
    } else {
        hourSlot[booking.hourKey] = { ...hourSlot[booking.hourKey], content: newContent.trim() };
    }

    const ok = await persistTimetable(name, { data });
    if (ok) {
        showToast('Rezervace upravena');
        renderDetail(name);
        renderSidebar();
    }
}

async function deleteBooking(name, booking) {
    if (!confirm(`Smazat rezervaci „${booking.content}“ (${formatDateShort(booking.dateStr)}, ${booking.timeLabel})?`)) return;

    const t = tables[name];
    const data = JSON.parse(JSON.stringify(t.data || {}));
    const dayData = data[booking.weekStartStr];
    if (!dayData) return;
    const hourSlot = Array.isArray(dayData) ? dayData[booking.dayIdx] : dayData[booking.dayIdx];
    if (!hourSlot) return;

    delete hourSlot[booking.hourKey];

    const ok = await persistTimetable(name, { data });
    if (ok) {
        showToast('Rezervace smazána');
        renderDetail(name);
        renderSidebar();
    }
}

async function deleteTable(name) {
    if (!confirm(`Opravdu smazat stůl „${name}“? Tuto akci nelze vrátit zpět.`)) return;
    const t = tables[name];
    try {
        // Mirror the customer app's soft-delete-by-name approach
        const deleted = JSON.parse(localStorage.getItem('deletedClasses') || '[]');
        if (!deleted.includes(name)) deleted.push(name);
        localStorage.setItem('deletedClasses', JSON.stringify(deleted));

        if (t.fileId) {
            fetch(`${API_URL}/timetables/file/${t.fileId}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' } }).catch(() => {});
        }

        delete tables[name];
        selectedTableName = null;
        showToast('Stůl smazán');
        switchView('overview');
    } catch (e) {
        console.error(e);
        showToast('Smazání se nezdařilo', true);
    }
}

// ════════════════════════════════════════════════════════════════════════
// NEW TABLE MODAL
// ════════════════════════════════════════════════════════════════════════

document.getElementById('newTableBtn').addEventListener('click', () => {
    document.getElementById('newTableName').value = '';
    document.getElementById('newTableDesc').value = '';
    document.getElementById('newTableModal').classList.add('active');
});
document.getElementById('newTableCancelBtn').addEventListener('click', () => {
    document.getElementById('newTableModal').classList.remove('active');
});
document.getElementById('newTableModal').addEventListener('click', e => {
    if (e.target.id === 'newTableModal') document.getElementById('newTableModal').classList.remove('active');
});

document.getElementById('newTableCreateBtn').addEventListener('click', async () => {
    const name = document.getElementById('newTableName').value.trim();
    const desc = document.getElementById('newTableDesc').value;
    if (!name) { showToast('Zadejte název stolu', true); return; }
    if (tables[name]) { showToast('Stůl s tímto názvem už existuje', true); return; }

    try {
        const res = await fetch(`${API_URL}/timetables`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, info: desc })
        });
        const created = await res.json();
        if (!res.ok) throw new Error(created.error || 'Chyba');

        document.getElementById('newTableModal').classList.remove('active');
        showToast('Stůl vytvořen');
        await loadAllTables();
        selectedTableName = name;
        switchView('detail');
    } catch (e) {
        console.error(e);
        showToast('Vytvoření se nezdařilo', true);
    }
});

// ════════════════════════════════════════════════════════════════════════
// UTIL
// ════════════════════════════════════════════════════════════════════════

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}
function escapeHtmlAttr(str) {
    return (str ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function updateClock() {
    const now = new Date();
    document.getElementById('clockText').textContent = now.toLocaleString('cs-CZ', { dateStyle: 'medium', timeStyle: 'short' });
}
setInterval(updateClock, 1000 * 30);
updateClock();

// ════════════════════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════════════════════

(async function init() {
    document.getElementById('gateApiInput').value = API_BASE_URL;
    const ok = await tryConnect(API_BASE_URL);
    if (!ok) {
        document.getElementById('gateOverlay').style.display = 'flex';
    }
})();
