// Configure API URL - will be set by config.js
const API_BASE_URL = window.API_BASE_URL || `http://${window.location.hostname}:3000`;
const API_URL = `${API_BASE_URL}/reservation/api`;

let timetables = {};

// Hour slots (index 1-12, matching hourObj keys)
const RESERVATION_HOURS = [
    '8:00-9:00', '9:00-10:00', '10:00-11:00', '11:00-12:00',
    '12:00-13:00', '13:00-14:00', '14:00-15:00', '15:00-16:00',
    '16:00-17:00', '17:00-18:00', '18:00-19:00', '19:00-20:00'
];

// Reservation flow state (date / time / attribute filters chosen in the hotbar)
let reservationSelectedDate = null;   // 'YYYY-MM-DD'
let reservationSelectedHour = null;   // 1-12
let reservationTargetTable = null;    // table name currently being booked in the modal
let activeFilters = new Set();

// ─── DATE HELPERS ────────────────────────────────────────────────────────────

function getCurrentDate() {
    return new Date();
}

function getDateString(date) {
    // Local-date-based (not toISOString, which converts to UTC and can shift
    // the date by a day depending on timezone offset and time-of-day).
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// ─── LOAD TABLES ─────────────────────────────────────────────────────────────

async function loadTimetables() {
    timetables = {};

    try {
        const response = await fetch(`${API_URL}/timetables`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const names = [...new Set(await response.json())];

        for (const name of names) {
            try {
                const res = await fetch(`${API_URL}/timetables/${encodeURIComponent(name)}`);
                if (!res.ok) continue;
                const data = await res.json();
                timetables[name] = {
                    className: name,
                    fileId: data.fileId,
                    data: data.data || {},
                    info: data.info || '',
                    attributes: data.attributes || [],
                };
            } catch (e) {
                console.error(`Error loading timetable ${name}:`, e);
            }
        }

        const dateInput = document.getElementById('reservation-date-input');
        const timeSelect = document.getElementById('reservation-time-select');
        if (dateInput) dateInput.disabled = false;
        if (timeSelect) timeSelect.disabled = false;

        renderFilterPanel();
    } catch (error) {
        console.error('Failed to load timetables:', error);
        showReservationToast('Nepodařilo se načíst stoly', true);
        renderFilterPanel();
    }
}

// ─── FILTER PANEL (hotbar filters + results panel) ───────────────────────────

function renderFilterPanel() {
    populateReservationTimeOptions();
    renderFilterCheckboxes();
    renderFilterResults();
}

function populateReservationTimeOptions() {
    const dateInput = document.getElementById('reservation-date-input');
    const timeSelect = document.getElementById('reservation-time-select');
    if (!dateInput || !timeSelect) return;

    if (!dateInput.value) {
        dateInput.value = getDateString(getCurrentDate());
        reservationSelectedDate = dateInput.value;
    }

    if (!timeSelect.dataset.populated) {
        timeSelect.innerHTML = '<option value="">Vyberte čas</option>';
        RESERVATION_HOURS.forEach((label, i) => {
            const opt = document.createElement('option');
            opt.value = String(i + 1); // hourIndex 1-12
            opt.textContent = label;
            timeSelect.appendChild(opt);
        });
        timeSelect.dataset.populated = 'true';
    }
}

function getDayIndexFromDateString(dateString) {
    const d = new Date(dateString + 'T00:00:00');
    const jsDay = d.getDay(); // 0=Sun..6=Sat
    return jsDay - 1; // Mon=0 ... Fri=4 ; Sat=5, Sun=-1 (both invalid)
}

// Is the given hourIndex (1-12) free for this table on this date?
function isHourFree(timetableData, dateString, dayIndex, hourIndex) {
    if (dayIndex < 0 || dayIndex > 4) return false;

    const direct = timetableData.data?.[dateString]?.[dayIndex]?.[hourIndex];
    if (direct?.content) return false;

    const targetDate = new Date(dateString + 'T00:00:00');
    if (timetableData.data) {
        for (const weekDate in timetableData.data) {
            if (weekDate === dateString) continue;
            if (new Date(weekDate) > targetDate) continue;
            const entry = timetableData.data[weekDate]?.[dayIndex]?.[hourIndex];
            if (entry?.content && entry.isPermanent) return false;
        }
    }
    return true;
}

function getAllAttributes() {
    const attrs = new Set();
    Object.values(timetables).forEach(t => {
        (t.attributes || []).forEach(a => attrs.add(a));
    });
    return [...attrs].sort();
}

function renderFilterCheckboxes() {
    const container = document.getElementById('filter-checkboxes');
    if (!container) return;

    const allAttrs = getAllAttributes();
    container.innerHTML = '';

    if (allAttrs.length === 0) {
        container.innerHTML = '<p class="no-attributes-msg">Žádné vlastnosti nejsou k dispozici</p>';
        return;
    }

    allAttrs.forEach(attr => {
        const label = document.createElement('label');
        label.className = 'filter-checkbox-label';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = attr;
        cb.checked = activeFilters.has(attr);
        cb.addEventListener('change', () => {
            if (cb.checked) activeFilters.add(attr);
            else activeFilters.delete(attr);
            renderFilterResults();
        });
        label.appendChild(cb);
        label.appendChild(document.createTextNode(' ' + attr));
        container.appendChild(label);
    });
}

function renderFilterResults() {
    const container = document.getElementById('filter-results');
    if (!container) return;
    container.innerHTML = '';

    const dateInput = document.getElementById('reservation-date-input');
    const timeSelect = document.getElementById('reservation-time-select');
    const dateString = dateInput?.value || '';
    const hourIndex = timeSelect?.value ? parseInt(timeSelect.value) : null;

    reservationSelectedDate = dateString || null;
    reservationSelectedHour = hourIndex;

    if (!dateString || !hourIndex) {
        container.innerHTML = '<p class="no-tables-msg">Nejprve vyberte datum a čas</p>';
        return;
    }

    const dayIndex = getDayIndexFromDateString(dateString);
    if (dayIndex < 0 || dayIndex > 4) {
        container.innerHTML = '<p class="no-tables-msg">Rezervace je možná pouze v pracovní dny (Po–Pá)</p>';
        return;
    }

    const names = Object.keys(timetables);
    if (names.length === 0) {
        container.innerHTML = '<p class="no-tables-msg">Žádné stoly nejsou k dispozici</p>';
        return;
    }

    const available = names.filter(name => {
        const t = timetables[name];
        if (activeFilters.size > 0) {
            const attrs = new Set(t.attributes || []);
            if (![...activeFilters].every(f => attrs.has(f))) return false;
        }
        return isHourFree(t, dateString, dayIndex, hourIndex);
    });

    if (available.length === 0) {
        container.innerHTML = '<p class="no-tables-msg">V danou dobu není volný žádný odpovídající stůl</p>';
        return;
    }

    available.forEach(name => {
        const t = timetables[name];
        const card = document.createElement('div');
        card.className = 'reservation-card';

        const info = document.createElement('div');
        info.className = 'reservation-card-info';

        const nameEl = document.createElement('div');
        nameEl.className = 'filter-card-name';
        nameEl.textContent = name;
        info.appendChild(nameEl);

        const attrsEl = document.createElement('div');
        attrsEl.className = 'filter-card-attrs';
        (t.attributes || []).forEach(a => {
            const tag = document.createElement('span');
            tag.className = 'attr-tag';
            tag.textContent = a;
            attrsEl.appendChild(tag);
        });
        if ((t.attributes || []).length === 0) {
            const none = document.createElement('span');
            none.className = 'no-attr-hint';
            none.textContent = 'Bez vlastností';
            attrsEl.appendChild(none);
        }
        info.appendChild(attrsEl);

        const bookBtn = document.createElement('button');
        bookBtn.className = 'reservation-card-btn';
        bookBtn.textContent = 'Zarezervovat';
        bookBtn.addEventListener('click', () => openReservationModal(name));

        card.appendChild(info);
        card.appendChild(bookBtn);
        container.appendChild(card);
    });
}

// ─── BOOKING MODAL (duration + name) ─────────────────────────────────────────

function showReservationToast(message, isError) {
    const toast = document.getElementById('reservationToast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.toggle('error', !!isError);
    toast.classList.add('show');
    clearTimeout(showReservationToast._t);
    showReservationToast._t = setTimeout(() => toast.classList.remove('show'), 2800);
}

function openReservationModal(name) {
    reservationTargetTable = name;
    const modal = document.getElementById('reservationModal');
    const title = document.getElementById('reservationModalTitle');
    const durationSelect = document.getElementById('reservation-duration-select');
    const nameInput = document.getElementById('reservation-name-input');
    if (!modal || !durationSelect) return;

    title.textContent = `Zarezervovat – ${name}`;
    nameInput.value = '';

    const maxLen = Math.min(4, 12 - reservationSelectedHour + 1);
    durationSelect.innerHTML = '';
    for (let h = 1; h <= maxLen; h++) {
        const opt = document.createElement('option');
        opt.value = String(h);
        opt.textContent = `${h} ${h === 1 ? 'hodina' : (h < 5 ? 'hodiny' : 'hodin')}`;
        durationSelect.appendChild(opt);
    }

    modal.classList.add('active');
}

function closeReservationModal() {
    document.getElementById('reservationModal')?.classList.remove('active');
    reservationTargetTable = null;
}

async function saveTimetable(name, t) {
    const response = await fetch(`${API_URL}/timetables/${encodeURIComponent(name)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: t.fileId, data: t.data, info: t.info || '', attributes: t.attributes || [] })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

function confirmReservation() {
    const name = reservationTargetTable;
    const t = timetables[name];
    const nameInput = document.getElementById('reservation-name-input');
    const durationSelect = document.getElementById('reservation-duration-select');
    const guestName = (nameInput?.value || '').trim();

    if (!t || !reservationSelectedDate || !reservationSelectedHour) {
        showReservationToast('Vyberte prosím stůl, datum a čas.', true);
        return;
    }
    if (!guestName) {
        showReservationToast('Zadejte prosím své jméno.', true);
        return;
    }

    const duration = parseInt(durationSelect.value) || 1;
    const dayIndex = getDayIndexFromDateString(reservationSelectedDate);
    const startHour = reservationSelectedHour;

    // Re-validate every slot in the requested duration is still free
    for (let h = startHour; h < startHour + duration; h++) {
        if (h > 12 || !isHourFree(t, reservationSelectedDate, dayIndex, h)) {
            showReservationToast('Vybraná délka rezervace už není volná, zkuste kratší dobu nebo jiný stůl.', true);
            return;
        }
    }

    if (!t.data) t.data = {};
    if (!t.data[reservationSelectedDate]) t.data[reservationSelectedDate] = [];
    if (!t.data[reservationSelectedDate][dayIndex]) t.data[reservationSelectedDate][dayIndex] = {};

    const abbreviation = guestName.split(/\s+/).map(w => w[0]).join('').slice(0, 3).toUpperCase();

    for (let h = startHour; h < startHour + duration; h++) {
        t.data[reservationSelectedDate][dayIndex][h] = {
            content: guestName,
            abbreviation,
            isPermanent: false
        };
    }

    saveTimetable(name, t).then(() => {
        showReservationToast(`Stůl "${name}" rezervován na ${RESERVATION_HOURS[startHour - 1].split('-')[0]}.`);
        closeReservationModal();
        renderFilterResults();
    }).catch(err => {
        console.error(err);
        showReservationToast('Nepodařilo se uložit rezervaci', true);
    });
}

// ─── INIT ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('reservation-date-input')?.addEventListener('change', renderFilterResults);
    document.getElementById('reservation-time-select')?.addEventListener('change', renderFilterResults);
    document.getElementById('reservationModalCancelBtn')?.addEventListener('click', closeReservationModal);
    document.getElementById('reservationModalConfirmBtn')?.addEventListener('click', confirmReservation);
    document.getElementById('reservationModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'reservationModal') closeReservationModal();
    });

    loadTimetables();
});
