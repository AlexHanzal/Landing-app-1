// Configure API URL - will be set by config.js
const API_BASE_URL = window.API_BASE_URL || `http://${window.location.hostname}:3000`;
const API_URL = `${API_BASE_URL}/reservation/api`;

const translations = {
    cs: {
        weekdays: ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota', 'Neděle'],
        months: ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen',
            'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'],
    }
};

const currentLanguage = 'cs';

let currentUser = { name: null, abbreviation: null, isLoggedIn: false, isAdmin: false };
let currentDate = new Date();
let currentMonth = currentDate.getMonth();
let currentYear = currentDate.getFullYear();
let isAdminMode = false;
let currentTimetableName = '';
let isEditMode = false;
let customDate = null;
let permanentHourModeEnabled = false;
let timetables = {};

// ─── DATE HELPERS ────────────────────────────────────────────────────────────

function getCurrentDate() {
    return customDate || new Date();
}

function getStartOfWeek(date) {
    const result = new Date(date);
    const day = result.getDay();
    result.setDate(result.getDate() - day + (day === 0 ? -6 : 1));
    return result;
}

function getDateString(date) {
    return date.toISOString().split('T')[0];
}

// ─── CALENDAR ────────────────────────────────────────────────────────────────

function generateCalendar() {
    const currentRealDate = getCurrentDate();
    const calendar = document.getElementById('timetable-calendar');
    const calendarTitle = document.getElementById('timetable-calendar-title');

    calendarTitle.textContent = `${translations[currentLanguage].months[currentMonth]} ${currentYear}`;

    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const firstDayOfWeek = new Date(currentYear, currentMonth, 1).getDay();
    const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();
    const adjustedFirstDay = (firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1);

    const table = document.createElement('table');
    table.className = 'calendar-table';
    const tbody = document.createElement('tbody');

    // Header row
    const headerRow = document.createElement('tr');
    translations[currentLanguage].weekdays.forEach(day => {
        const th = document.createElement('th');
        th.textContent = day;
        headerRow.appendChild(th);
    });
    tbody.appendChild(headerRow);

    let row = document.createElement('tr');

    // Previous month filler
    for (let i = adjustedFirstDay; i > 0; i--) {
        const cell = document.createElement('td');
        cell.textContent = daysInPrevMonth - i + 1;
        cell.classList.add('prev-month', 'month-dates');
        row.appendChild(cell);
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
        const cell = document.createElement('td');
        cell.textContent = day;
        cell.classList.add('hoverable');

        if (day === currentRealDate.getDate() &&
            currentMonth === currentRealDate.getMonth() &&
            currentYear === currentRealDate.getFullYear()) {
            cell.classList.add('current-day');
        }

        if (currentTimetableName && timetables[currentTimetableName]) {
            const saved = new Date(timetables[currentTimetableName].currentWeek);
            if (day === saved.getDate() &&
                currentMonth === saved.getMonth() &&
                currentYear === saved.getFullYear()) {
                cell.classList.add('selected');
            }
        }

        cell.addEventListener('click', (e) => selectDate(day, e));
        row.appendChild(cell);

        if ((adjustedFirstDay + day) % 7 === 0) {
            tbody.appendChild(row);
            row = document.createElement('tr');
        }
    }

    // Next month filler
    if (row.children.length > 0) {
        let nextDay = 1;
        while (row.children.length < 7) {
            const cell = document.createElement('td');
            cell.textContent = nextDay++;
            cell.classList.add('next-month', 'month-dates');
            row.appendChild(cell);
        }
        tbody.appendChild(row);
    }

    table.appendChild(tbody);
    calendar.innerHTML = '';
    calendar.appendChild(table);
}

function navigateMonth(direction) {
    currentMonth += direction;
    if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    else if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    generateCalendar();
}

function selectDate(day = currentDate.getDate(), event) {
    if (!currentTimetableName) {
        showCustomAlert('Chyba', 'Není vybrán žádný rozvrh', 'error');
        return;
    }

    const selectedDate = new Date(currentYear, currentMonth, day);

    document.querySelectorAll('.calendar-table td.selected').forEach(c => c.classList.remove('selected'));

    if (event && event.target) {
        event.target.classList.add('selected');
    } else {
        document.querySelectorAll('.calendar-table td.hoverable').forEach(c => {
            if (parseInt(c.textContent) === day) c.classList.add('selected');
        });
    }

    if (timetables[currentTimetableName]) {
        timetables[currentTimetableName].currentWeek = selectedDate.toISOString();
    }

    updateTimetableForWeek(selectedDate);
}

// ─── TIMETABLE DISPLAY ───────────────────────────────────────────────────────

function showTimetable(name) {
    if (!timetables[name]) {
        showCustomAlert('Chyba', 'Rozvrh nenalezen', 'error');
        return;
    }

    const timeTable = document.querySelector('.time-table');
    timeTable.querySelector('h2').textContent = timetables[name].className;
    timeTable.style.display = 'block';
    currentTimetableName = name;

    updateClassInfo(timetables[name]);

    document.querySelectorAll('.week-table tbody td').forEach(cell => {
        cell.classList.remove('permanent-hour');
        delete cell.dataset.permanent;
    });

    const savedData = timetables[name];
    const today = new Date();
    let selectedDate;

    if (!savedData.currentWeek) {
        selectedDate = today;
        savedData.currentWeek = today.toISOString();
    } else {
        const parsed = new Date(savedData.currentWeek);
        selectedDate = isNaN(parsed.getTime()) ? today : parsed;
        if (isNaN(parsed.getTime())) savedData.currentWeek = today.toISOString();
    }

    currentMonth = selectedDate.getMonth();
    currentYear = selectedDate.getFullYear();

    generateCalendar();
    selectDate(selectedDate.getDate());
    updateTimetableForWeek(selectedDate);

    localStorage.setItem('currentTimetable', name);
}

function updateClassInfo(timetableData) {
    const content = document.getElementById('class-info-content');
    const box = document.getElementById('class-info-box');
    if (!content || !box) return;

    box.querySelector('h4').textContent = 'Info';

    const attrs = timetableData.attributes || [];
    const attrHTML = attrs.length > 0
        ? `<div class="info-attr-tags">${attrs.map(a => `<span class="attr-tag">${a}</span>`).join('')}</div>`
        : '';

    content.innerHTML = `
        <div class="class-name"><strong>${timetableData.className}</strong></div>
        ${attrHTML}
        <div class="class-description"><p>${timetableData.info?.trim() || '<em>Popis není k dispozici</em>'}</p></div>
    `;
}

function updateTimetableForWeek(date) {
    if (!currentTimetableName) return;
    const startOfWeek = getStartOfWeek(date);
    timetables[currentTimetableName].currentWeek = startOfWeek.toISOString();
    updateWeekdayHeaders(startOfWeek);
    displayTimetableDataForWeek(startOfWeek);
}

function updateWeekdayHeaders(startOfWeek) {
    const headerCells = document.querySelectorAll('.week-table thead th:not(:first-child)');
    const weekdays = translations[currentLanguage].weekdays.slice(0, 5);

    const firstTh = document.querySelector('.week-table thead th:first-child');
    if (firstTh) firstTh.textContent = 'Čas';

    headerCells.forEach((th, i) => {
        if (i < weekdays.length) {
            const dayDate = new Date(startOfWeek);
            dayDate.setDate(startOfWeek.getDate() + i);
            th.innerHTML = `<strong>${weekdays[i]}</strong><br><small>${dayDate.getDate()}.${dayDate.getMonth() + 1}.</small>`;
            th.style.display = '';
        } else {
            th.style.display = 'none';
        }
    });

    updateDayCells(startOfWeek);
}

function updateDayCells(startOfWeek) {
    const hours = [
        '8:00-9:00', '9:00-10:00', '10:00-11:00', '11:00-12:00',
        '12:00-13:00', '13:00-14:00', '14:00-15:00', '15:00-16:00', '16:00-17:00', '17:00-18:00','18:00-19:00', '19:00-20:00'
    ];
    const dayCells = document.querySelectorAll('.week-table tbody tr td:first-child');

    dayCells.forEach((cell, index) => {
        if (index < hours.length) {
            cell.innerHTML = `<strong>${hours[index]}</strong>`;
            cell.style.display = '';
            const row = cell.parentElement;
            if (row) row.style.display = '';
        } else {
            const row = cell.parentElement;
            if (row) row.style.display = 'none';
        }
    });
}

function displayTimetableDataForWeek(startOfWeek) {
    if (!currentTimetableName || !timetables[currentTimetableName]) return;

    const timetableData = timetables[currentTimetableName];
    const dateString = getDateString(startOfWeek);

    // Clear cells
    document.querySelectorAll('.week-table tbody td:not(:first-child)').forEach(cell => {
        cell.innerHTML = '';
        cell.classList.remove('has-data', 'permanent-hour');
        delete cell.dataset.permanent;
    });

    // Apply permanent hours from past/current weeks
    if (timetableData.data) {
        for (const weekDate in timetableData.data) {
            if (new Date(weekDate) > startOfWeek) continue;
            applyWeekData(timetableData.data[weekDate], true);
        }
    }

    // Apply specific week data (overwrites permanents for this week)
    if (timetableData.data?.[dateString]) {
        applyWeekData(timetableData.data[dateString], false);
    }
}

function applyWeekData(weekData, permanentOnly) {
    const processDay = (dayIdx, dayData) => {
        if (dayIdx >= 5 || !dayData) return;
        if (!dayData || Object.keys(dayData).length === 0) return;

        Object.entries(dayData).forEach(([hourIndex, hourObj]) => {
            if (!hourObj?.content) return;
            if (permanentOnly && !hourObj.isPermanent) return;

            const hourIdx = parseInt(hourIndex) - 1;  // Hour index (0-11)
            const rows = document.querySelectorAll('.week-table tbody tr');
            const row = rows[hourIdx];
            if (!row) return;
            
            const cells = row.querySelectorAll('td:not(:first-child)');
            const cell = cells[dayIdx];  // Column index based on day
            if (!cell) return;

            // Don't overwrite non-permanent cells with permanent data
            if (permanentOnly && cell.textContent) return;

            renderCell(cell, hourObj);
        });
    };

    if (Array.isArray(weekData)) {
        weekData.forEach((dayData, i) => processDay(i, dayData));
    } else {
        Object.entries(weekData).forEach(([dayIdx, dayData]) => processDay(parseInt(dayIdx), dayData));
    }
}

function renderCell(cell, hourObj) {
    cell.innerHTML = '';
    cell.appendChild(document.createTextNode(hourObj.content));

    if (!hourObj.isPermanent && hourObj.abbreviation) {
        const span = document.createElement('span');
        span.className = 'user-abbreviation';
        span.textContent = hourObj.abbreviation;
        span.setAttribute('contenteditable', 'false');
        ['keydown', 'keypress', 'input'].forEach(e => span.addEventListener(e, ev => ev.stopPropagation()));
        ['paste', 'cut', 'copy'].forEach(e => span.addEventListener(e, ev => ev.preventDefault()));
        ['mousedown', 'mouseup'].forEach(e => span.addEventListener(e, ev => ev.stopPropagation()));
        span.addEventListener('focus', e => { e.target.blur(); e.stopPropagation(); });
        cell.appendChild(document.createElement('br'));
        cell.appendChild(span);
    }

    cell.classList.add('has-data');
    if (hourObj.isPermanent) {
        cell.classList.add('permanent-hour');
        cell.dataset.permanent = 'true';
    }
}

// ─── CELL EDITING ────────────────────────────────────────────────────────────

function getCellContent(cell) {
    const span = cell.querySelector('.user-abbreviation');
    let content = cell.textContent.trim();
    if (span) content = content.replace(span.textContent, '').trim();
    return content;
}

function setCellContentWithAbbreviation(cell, content, abbrev) {
    cell.innerHTML = '';
    cell.appendChild(document.createTextNode(content));
    if (abbrev) {
        const span = document.createElement('span');
        span.className = 'user-abbreviation';
        span.textContent = abbrev;
        span.setAttribute('contenteditable', 'false');
        cell.appendChild(document.createElement('br'));
        cell.appendChild(span);
    }
}

function setupCellEditing() {
    document.querySelectorAll('.week-table tbody td:not(:first-child)').forEach(cell => {
        const newCell = cell.cloneNode(true);
        cell.parentNode.replaceChild(newCell, cell);

        const abbrevSpan = newCell.querySelector('.user-abbreviation');
        let canEdit = false;

        if (isAdminMode) {
            canEdit = true;
        } else if (!abbrevSpan && !newCell.classList.contains('permanent-hour')) {
            canEdit = true;
        } else if (abbrevSpan && currentUser.abbreviation && abbrevSpan.textContent === currentUser.abbreviation) {
            canEdit = true;
        }

        newCell.setAttribute('contenteditable', canEdit ? 'true' : 'false');
        newCell.classList.toggle('locked-cell', !canEdit);

        // Block interaction on abbreviation span
        const span = newCell.querySelector('.user-abbreviation');
        if (span) {
            span.setAttribute('contenteditable', 'false');
            ['keydown', 'keypress', 'input'].forEach(e => span.addEventListener(e, ev => ev.stopPropagation()));
            ['paste', 'cut', 'copy'].forEach(e => span.addEventListener(e, ev => ev.preventDefault()));
            ['mousedown', 'mouseup'].forEach(e => span.addEventListener(e, ev => ev.stopPropagation()));
            span.addEventListener('focus', e => { e.target.blur(); e.stopPropagation(); });
        }

        newCell.addEventListener('input', function () { this.classList.add('edited-cell'); });

        newCell.addEventListener('blur', function () {
            const content = getCellContent(this);
            if (!content) return;

            if (isAdminMode && permanentHourModeEnabled) {
                setCellContentWithAbbreviation(this, content, null);
                this.classList.add('permanent-hour');
                this.dataset.permanent = 'true';
                return;
            }

            if (currentUser.isLoggedIn && currentUser.abbreviation && !this.classList.contains('permanent-hour')) {
                if (!this.querySelector('.user-abbreviation')) {
                    setCellContentWithAbbreviation(this, content, currentUser.abbreviation);
                }
            }
        });

        if (isAdminMode) {
            newCell.addEventListener('click', function (e) {
                if (permanentHourModeEnabled && e.ctrlKey) {
                    e.preventDefault();
                    if (this.classList.contains('permanent-hour')) {
                        this.classList.remove('permanent-hour');
                        delete this.dataset.permanent;
                    } else if (getCellContent(this)) {
                        setCellContentWithAbbreviation(this, getCellContent(this), null);
                        this.classList.add('permanent-hour');
                        this.dataset.permanent = 'true';
                    }
                }
            });
        }

        newCell.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') e.preventDefault();
            if ((e.key === 'Backspace' || e.key === 'Delete') && this.classList.contains('permanent-hour')) {
                setTimeout(() => {
                    if (!getCellContent(this)) {
                        this.classList.remove('permanent-hour');
                        delete this.dataset.permanent;
                    }
                }, 0);
            }
        });
    });
}

// ─── SAVE ────────────────────────────────────────────────────────────────────

async function saveTimeTable() {
    if (!currentTimetableName || !timetables[currentTimetableName]) {
        showCustomAlert('Chyba', 'Není vybrán žádný rozvrh', 'error');
        return;
    }

    const rows = document.querySelectorAll('.week-table tbody tr');
    const currentWeekDate = new Date(timetables[currentTimetableName].currentWeek);
    const dateString = getDateString(currentWeekDate);

    if (!timetables[currentTimetableName].data) timetables[currentTimetableName].data = {};
    if (!timetables[currentTimetableName].data[dateString]) timetables[currentTimetableName].data[dateString] = [];

    // Initialize data structure with 5 days (Monday-Friday)
    for (let day = 0; day < 5; day++) {
        if (!timetables[currentTimetableName].data[dateString][day]) {
            timetables[currentTimetableName].data[dateString][day] = {};
        }
    }

    // NEW FORMAT: hours are rows, days are columns
    rows.forEach((row, hourIndex) => {
        const cells = row.querySelectorAll('td:not(:first-child)');

        cells.forEach((cell, dayIndex) => {
            if (dayIndex >= 5) return; // Only 5 days (Monday-Friday)

            const abbrevSpan = cell.querySelector('.user-abbreviation');
            let content = cell.textContent.trim();
            let abbreviation = null;

            if (abbrevSpan) {
                content = content.replace(abbrevSpan.textContent, '').trim();
                abbreviation = abbrevSpan.textContent;
            }

            if (!content) return;

            const isPermanent = cell.classList.contains('permanent-hour');
            const hourObj = { content, isPermanent };
            if (abbreviation && !isPermanent) hourObj.abbreviation = abbreviation;
            
            // Store by day and hour index
            timetables[currentTimetableName].data[dateString][dayIndex][hourIndex + 1] = hourObj;

            // Propagate permanent hours to future weeks
            if (isPermanent) {
                let weekCursor = new Date(currentWeekDate);
                weekCursor.setHours(0, 0, 0, 0);
                for (let i = 0; i < 52; i++) {
                    const iso = getDateString(weekCursor);
                    if (!timetables[currentTimetableName].data[iso]) timetables[currentTimetableName].data[iso] = [];
                    if (!timetables[currentTimetableName].data[iso][dayIndex]) timetables[currentTimetableName].data[iso][dayIndex] = {};
                    timetables[currentTimetableName].data[iso][dayIndex][hourIndex + 1] = { content, isPermanent: true };
                    weekCursor.setDate(weekCursor.getDate() + 7);
                }
            }
        });
    });

    // Rebuild permanentHours for backward compat
    timetables[currentTimetableName].permanentHours = {};
    for (let day = 0; day < 5; day++) {
        timetables[currentTimetableName].permanentHours[day] = {};
    }

    rows.forEach((row, hourIndex) => {
        row.querySelectorAll('td:not(:first-child)').forEach((cell, dayIndex) => {
            if (dayIndex >= 5) return;
            if (cell.classList.contains('permanent-hour')) {
                timetables[currentTimetableName].permanentHours[dayIndex][hourIndex + 1] = getCellContent(cell);
            }
        });
    });

    await saveTimetable(currentTimetableName, timetables[currentTimetableName]);
}

async function saveTimetable(name, data) {
    try {
        const response = await fetch(`${API_URL}/timetables/${encodeURIComponent(name)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileId: data.fileId, data: data.data, info: data.info || '', attributes: data.attributes || [] })
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        showCustomAlert('Úspěch', 'Změny byly úspěšně uloženy', 'success');
    } catch (error) {
        console.error('Nepodařilo se uložit rozvrh:', error);
        showCustomAlert('Chyba', 'Nepodařilo se uložit změny', 'error');
    }
}

// ─── ADMIN MODE ───────────────────────────────────────────────────────────────

function enableAdminMode() {
    isAdminMode = true;

    document.querySelectorAll('.gear-icon').forEach(icon => icon.classList.add('visible'));
    document.getElementById('create-new')?.classList.add('admin-visible');
    document.getElementById('accounts-button')?.classList.add('admin-visible');
    const innerBtn = document.getElementById('inner-site-btn');
    if (innerBtn) innerBtn.style.display = 'inline-block';

    let toggleBtn = document.getElementById('toggle-permanent-btn');
    if (!toggleBtn) {
        toggleBtn = document.createElement('button');
        toggleBtn.id = 'toggle-permanent-btn';
        toggleBtn.className = 'toggle-permanent-btn';
        toggleBtn.textContent = 'Trvalé hodiny: OFF';
        toggleBtn.addEventListener('click', togglePermanentHourMode);
        document.querySelector('.time-table-buttons')?.appendChild(toggleBtn);
    }
    toggleBtn.style.display = 'none'; // Only show when in edit mode
}

function disableAdminMode() {
    isAdminMode = false;
    permanentHourModeEnabled = false;

    document.querySelectorAll('.gear-icon').forEach(icon => icon.classList.remove('visible'));
    document.getElementById('create-new')?.classList.remove('admin-visible');
    document.getElementById('accounts-button')?.classList.remove('admin-visible');
    const innerBtn = document.getElementById('inner-site-btn');
    if (innerBtn) innerBtn.style.display = 'none';

    // If currently in edit mode, cancel it
    if (isEditMode) {
        isEditMode = false;
        const editBtn = document.querySelector('.edit-button');
        if (editBtn) editBtn.textContent = 'Zamluvit stůl';
        document.querySelectorAll('.week-table tbody td:not(:first-child)').forEach(cell => {
            cell.setAttribute('contenteditable', 'false');
            cell.classList.remove('editable');
        });
        document.querySelector('.save-button') && (document.querySelector('.save-button').style.display = 'none');
    }

    const toggleBtn = document.getElementById('toggle-permanent-btn');
    if (toggleBtn) {
        toggleBtn.style.display = 'none';
        toggleBtn.classList.remove('active');
        toggleBtn.textContent = 'Trvalé hodiny: OFF';
    }

    document.querySelectorAll('.button-group').forEach(g => g.classList.remove('admin-active'));
}

function togglePermanentHourMode() {
    permanentHourModeEnabled = !permanentHourModeEnabled;
    const btn = document.getElementById('toggle-permanent-btn');
    if (btn) {
        btn.classList.toggle('active', permanentHourModeEnabled);
        btn.textContent = permanentHourModeEnabled ? 'Trvalé hodiny: ON' : 'Trvalé hodiny: OFF';
    }
    showCustomAlert('Režim administrátora',
        permanentHourModeEnabled
            ? 'Režim trvalých hodin je nyní ZAPNUT.'
            : 'Režim trvalých hodin je nyní VYPNUT.',
        'info');
}

// ─── LOAD TIMETABLES ─────────────────────────────────────────────────────────

async function loadTimetables() {
    // Clear existing buttons and memory
    document.querySelectorAll('.button-group').forEach(g => g.remove());
    timetables = {};

    const vybratBtn = document.getElementById('vybrat-stul-btn');

    const container = document.getElementById('dynamic-links-container');
    if (container) container.innerHTML = '';

    if (!currentUser.isLoggedIn) {
        if (vybratBtn) vybratBtn.disabled = true;
        renderFilterPanel();
        return;
    }

    if (vybratBtn) vybratBtn.disabled = false;

    const deletedClasses = JSON.parse(localStorage.getItem('deletedClasses') || '[]');

    try {
        const response = await fetch(`${API_URL}/timetables`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        let names = await response.json();
        names = [...new Set(names.filter(n => !deletedClasses.includes(n)))];

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
                    permanentHours: data.permanentHours || {},
                    currentWeek: data.currentWeek || new Date().toISOString(),
                };
            } catch (e) {
                console.error(`Error loading timetable ${name}:`, e);
            }
        }

        renderFilterPanel();
    } catch (error) {
        console.error('Failed to load timetables:', error);
        showCustomAlert('Chyba', 'Nepodařilo se načíst rozvrhy', 'error');
    }
}

// ─── FILTER PANEL ────────────────────────────────────────────────────────────

let activeFilters = new Set();

function getAllAttributes() {
    const attrs = new Set();
    Object.values(timetables).forEach(t => {
        (t.attributes || []).forEach(a => attrs.add(a));
    });
    return [...attrs].sort();
}

function renderFilterPanel() {
    renderFilterCheckboxes();
    renderFilterResults();
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

    if (!currentUser.isLoggedIn) {
        container.innerHTML = '<p class="no-tables-msg">Přihlaste se pro zobrazení stolů</p>';
        return;
    }

    const names = Object.keys(timetables);
    if (names.length === 0) {
        container.innerHTML = '<p class="no-tables-msg">Žádné stoly nejsou k dispozici</p>';
        return;
    }

    const filtered = names.filter(name => {
        if (activeFilters.size === 0) return true;
        const attrs = new Set(timetables[name].attributes || []);
        return [...activeFilters].every(f => attrs.has(f));
    });

    if (filtered.length === 0) {
        container.innerHTML = '<p class="no-tables-msg">Žádný stůl neodpovídá filtrům</p>';
        return;
    }

    filtered.forEach(name => {
        const t = timetables[name];
        const card = document.createElement('div');
        card.className = 'filter-table-card' + (name === currentTimetableName ? ' selected' : '');

        const cardMain = document.createElement('div');
        cardMain.className = 'filter-card-main';

        const nameEl = document.createElement('div');
        nameEl.className = 'filter-card-name';
        nameEl.textContent = name;

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

        cardMain.appendChild(nameEl);
        cardMain.appendChild(attrsEl);
        cardMain.addEventListener('click', () => {
            showTimetable(name);
            closeFilterPanel();
        });

        card.appendChild(cardMain);

        // Admin edit button
        if (isAdminMode) {
            const editBtn = document.createElement('button');
            editBtn.className = 'filter-card-edit-btn';
            editBtn.title = 'Upravit stůl';
            editBtn.innerHTML = '✎';
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                closeFilterPanel();
                setTimeout(() => showClassEditMenu(name), 310);
            });
            card.appendChild(editBtn);
        }

        container.appendChild(card);
    });
}

function openFilterPanel() {
    const panel = document.getElementById('table-filter-panel');
    const overlay = document.getElementById('table-filter-overlay');
    if (!panel || !overlay) return;
    renderFilterPanel();
    panel.style.display = 'flex';
    overlay.style.display = 'block';
    requestAnimationFrame(() => {
        panel.classList.add('active');
        overlay.classList.add('active');
    });
}

function closeFilterPanel() {
    const panel = document.getElementById('table-filter-panel');
    const overlay = document.getElementById('table-filter-overlay');
    if (!panel || !overlay) return;
    panel.classList.remove('active');
    overlay.classList.remove('active');
    setTimeout(() => {
        panel.style.display = 'none';
        overlay.style.display = 'none';
    }, 300);
}

function createDynamicButton(name) {
    const container = document.createElement('div');
    container.className = 'button-group';

    const button = document.createElement('button');
    button.className = 'dynamic-button';
    button.textContent = name;
    button.addEventListener('click', () => showTimetable(name));

    const editBtn = document.createElement('button');
    editBtn.className = 'gear-icon' + (isAdminMode ? ' visible' : '');
    editBtn.innerHTML = '✎';
    editBtn.title = 'Upravit třídu';
    editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isAdminMode) showClassEditMenu(name);
    });

    container.appendChild(button);
    container.appendChild(editBtn);
    return container;
}

// ─── CREATE TIMETABLE ────────────────────────────────────────────────────────

document.getElementById('submit-button').addEventListener('click', async () => {
    const nameInput = document.getElementById('name-input');
    const descriptionInput = document.getElementById('description-input');
    const name = nameInput.value.trim();
    const info = descriptionInput.value.trim();

    if (!name) { showCustomAlert('Chyba', 'Prosím zadejte název třídy', 'error'); return; }

    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) { loadingOverlay.classList.add('active'); loadingOverlay.style.display = 'flex'; }

    try {
        const response = await fetch(`${API_URL}/timetables`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, info })
        });
        const result = await response.json();

        if (loadingOverlay) loadingOverlay.classList.remove('active');

        if (result.success) {
            timetables[name] = { className: name, fileId: result.fileId, data: {}, info };

            // Save info
            await fetch(`${API_URL}/timetables/${encodeURIComponent(name)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileId: result.fileId, data: {}, info })
            });

            const btn = createDynamicButton(name);
            btn.querySelector('.dynamic-button')?.setAttribute('data-name', name);
            document.getElementById('dynamic-links-container')?.appendChild(btn);

            showTimetable(name);
            document.getElementById('select-screen').style.display = 'none';
            nameInput.value = '';
            descriptionInput.value = '';
            showCustomAlert('Úspěch', 'Nová třída byla úspěšně vytvořena', 'success');
        } else {
            showCustomAlert('Chyba', result.error || 'Nepodařilo se vytvořit třídu', 'error');
        }
    } catch (error) {
        if (loadingOverlay) loadingOverlay.classList.remove('active');
        showCustomAlert('Chyba', 'Nepodařilo se vytvořit rozvrh', 'error');
    }
});

// ─── LOGIN ───────────────────────────────────────────────────────────────────

async function loadUserOptions() {
    try {
        const response = await fetch(`${API_URL}/users`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const users = await response.json();

        const userSelect = document.getElementById('user-select');
        if (!userSelect) return;
        userSelect.innerHTML = '<option value="">Vyberte uživatele</option>';
        users.forEach(user => {
            const option = document.createElement('option');
            option.value = user.abbreviation;
            option.textContent = user.name;
            userSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Nepodařilo se načíst uživatele:', error);
    }
}

async function handleLogin() {
    const userSelect = document.getElementById('user-select');
    const passwordInput = document.getElementById('password-input');
    const loginError = document.getElementById('login-error');

    loginError.style.display = 'none';

    if (!userSelect.value || !passwordInput.value) {
        loginError.textContent = 'Prosím vyplňte všechna pole';
        loginError.style.display = 'block';
        return;
    }

    try {
        const response = await fetch(`${API_URL}/users/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ abbreviation: userSelect.value, password: passwordInput.value })
        });
        const data = await response.json();

        if (response.ok) {
            currentUser = { name: data.name, abbreviation: userSelect.value, isLoggedIn: true, isAdmin: !!data.isAdmin };

            const loginButton = document.getElementById('login-button');
            loginButton.textContent = data.name;
            loginButton.classList.add('logged-in');

            // Close login menu
            const loginMenu = document.getElementById('login-menu');
            const loginOverlay = document.getElementById('login-overlay');
            loginMenu.classList.remove('active');
            loginOverlay.classList.remove('active');
            loginMenu.style.display = 'none';
            loginOverlay.style.display = 'none';
            passwordInput.value = '';

            if (data.isAdmin) {
                enableAdminMode();
                showCustomAlert('Režim administrátora', 'Administrátorská oprávnění aktivována', 'success');
            }

            await loadTimetables();
            const savedTimetable = localStorage.getItem('currentTimetable');
            if (savedTimetable && timetables[savedTimetable]) {
                showTimetable(savedTimetable);
            }

            showCustomAlert('Úspěch', 'Úspěšně přihlášen', 'success');
        } else {
            loginError.textContent = data.error || 'Neplatné heslo';
            loginError.style.display = 'block';
        }
    } catch (error) {
        loginError.textContent = 'Chyba připojení. Prosím zkuste to znovu.';
        loginError.style.display = 'block';
    }
}

function setupLoginHandlers() {
    const loginButton = document.getElementById('login-button');
    const loginMenu = document.getElementById('login-menu');
    const loginOverlay = document.getElementById('login-overlay');
    const closeLoginButton = document.getElementById('close-login');

    loginButton?.addEventListener('click', () => {
        if (!loginButton.classList.contains('logged-in')) {
            loginMenu.style.display = 'block';
            loginOverlay.style.display = 'block';
            loginMenu.classList.add('active');
            loginOverlay.classList.add('active');
            loadUserOptions();
        } else {
            showLogoutConfirmation();
        }
    });

    closeLoginButton?.addEventListener('click', (e) => {
        e.preventDefault();
        loginMenu.style.display = 'none';
        loginOverlay.style.display = 'none';
        loginMenu.classList.remove('active');
        loginOverlay.classList.remove('active');
        document.getElementById('password-input').value = '';
        document.getElementById('login-error').style.display = 'none';
    });

    document.getElementById('submit-login')?.addEventListener('click', handleLogin);
    document.getElementById('password-input')?.addEventListener('keypress', e => {
        if (e.key === 'Enter') handleLogin();
    });
}

function performLogout() {
    currentUser = { name: null, abbreviation: null, isLoggedIn: false, isAdmin: false };
    if (isAdminMode) disableAdminMode();

    const loginButton = document.getElementById('login-button');
    loginButton.textContent = 'Přihlášení';
    loginButton.classList.remove('logged-in');

    document.querySelector('.time-table').style.display = 'none';
    timetables = {};
    currentTimetableName = '';
    document.querySelectorAll('.button-group').forEach(g => g.remove());

    const container = document.getElementById('dynamic-links-container');
    if (container) {
        container.innerHTML = '';
        const msg = document.createElement('div');
        msg.className = 'login-required-message';
        msg.textContent = 'Přihlaste se, abyste zobrazil/a učebny';
        msg.style.cssText = 'text-align:center;padding:20px;color:#777;';
        container.appendChild(msg);
    }

    hideLogoutConfirmation();
    showCustomAlert('Úspěch', 'Byli jste úspěšně odhlášeni', 'success');
}

function showLogoutConfirmation() {
    let popup = document.getElementById('logout-confirm');
    if (!popup) {
        popup = document.createElement('div');
        popup.id = 'logout-confirm';
        popup.className = 'logout-confirm';
        popup.innerHTML = `
            <div class="logout-confirm-content">
                <h3>Potvrďte odhlášení</h3>
                <p>Opravdu chcete odhlásit?</p>
                <div class="logout-buttons">
                    <button id="confirm-logout">Ano, odhlásit</button>
                    <button id="cancel-logout">Zrušit</button>
                </div>
            </div>`;
        document.body.appendChild(popup);

        let overlay = document.getElementById('logout-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'logout-overlay';
            overlay.className = 'logout-overlay';
            overlay.addEventListener('click', hideLogoutConfirmation);
            document.body.appendChild(overlay);
        }

        document.getElementById('confirm-logout').addEventListener('click', performLogout);
        document.getElementById('cancel-logout').addEventListener('click', hideLogoutConfirmation);
    }
    popup.style.display = 'flex';
    document.getElementById('logout-overlay').style.display = 'block';
}

function hideLogoutConfirmation() {
    document.getElementById('logout-confirm') && (document.getElementById('logout-confirm').style.display = 'none');
    document.getElementById('logout-overlay') && (document.getElementById('logout-overlay').style.display = 'none');
}

// ─── ACCOUNT CREATION ────────────────────────────────────────────────────────

function showAccountCreatePopup() {
    let popup = document.getElementById('account-create-popup');
    if (!popup) {
        popup = document.createElement('div');
        popup.id = 'account-create-popup';
        popup.className = 'account-create-popup';
        popup.innerHTML = `
            <h2>Vytvořit nový účet</h2>
            <div class="input-group"><label>Celé jméno</label><input type="text" id="account-name" placeholder="Zadejte celé jméno"></div>
            <div class="input-group"><label>Zkratka</label><input type="text" id="account-abbreviation" placeholder="Zadejte zkratku"></div>
            <div class="input-group"><label>Heslo</label><input type="password" id="account-password" placeholder="Zadejte heslo"></div>
            <div class="input-group"><label><input type="checkbox" id="account-is-admin"> Administrátorský účet</label></div>
            <div class="account-create-error" id="account-create-error"></div>
            <div class="account-create-actions">
                <button id="create-account-btn">Vytvořit účet</button>
                <button id="cancel-account-btn">Zrušit</button>
            </div>`;
        document.body.appendChild(popup);
        document.getElementById('create-account-btn').addEventListener('click', createNewAccount);
        document.getElementById('cancel-account-btn').addEventListener('click', hideAccountCreatePopup);
        popup.addEventListener('keydown', e => { if (e.key === 'Escape') hideAccountCreatePopup(); else if (e.key === 'Enter') createNewAccount(); });

        let overlay = document.getElementById('account-create-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'account-create-overlay';
            overlay.className = 'accounts-overlay';
            overlay.addEventListener('click', hideAccountCreatePopup);
            document.body.appendChild(overlay);
        }
    }

    popup.style.display = 'block';
    document.getElementById('account-create-overlay').style.display = 'block';
    setTimeout(() => {
        popup.classList.add('active');
        document.getElementById('account-create-overlay').classList.add('active');
    }, 10);

    ['account-name', 'account-abbreviation', 'account-password'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    document.getElementById('account-is-admin').checked = false;
    document.getElementById('account-create-error').style.display = 'none';
    document.getElementById('account-name').focus();
}

function hideAccountCreatePopup() {
    const popup = document.getElementById('account-create-popup');
    const overlay = document.getElementById('account-create-overlay');
    popup?.classList.remove('active');
    overlay?.classList.remove('active');
    if (popup) popup.style.display = 'none';
    if (overlay) overlay.style.display = 'none';
}

async function createNewAccount() {
    const name = document.getElementById('account-name').value.trim();
    const abbreviation = document.getElementById('account-abbreviation').value.trim();
    const password = document.getElementById('account-password').value.trim();
    const isAdmin = document.getElementById('account-is-admin').checked;
    const errorElement = document.getElementById('account-create-error');

    errorElement.style.display = 'none';

    if (!name || !abbreviation || !password) {
        errorElement.textContent = 'Všechna pole jsou povinná';
        errorElement.style.display = 'block';
        return;
    }

    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) { loadingOverlay.classList.add('active'); loadingOverlay.querySelector('.loading-text').textContent = 'Vytváření účtu...'; }

    try {
        const response = await fetch(`${API_URL}/users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, abbreviation, password, isAdmin })
        });
        const data = await response.json();
        if (loadingOverlay) loadingOverlay.classList.remove('active');

        if (response.ok) {
            showCustomAlert('Úspěch', 'Účet byl úspěšně vytvořen', 'success');
            hideAccountCreatePopup();
        } else {
            errorElement.textContent = data.error || 'Chyba při vytváření účtu';
            errorElement.style.display = 'block';
        }
    } catch (error) {
        if (loadingOverlay) loadingOverlay.classList.remove('active');
        errorElement.textContent = 'Chyba připojení. Prosím zkuste to znovu.';
        errorElement.style.display = 'block';
    }
}

// ─── CLASS EDIT / DELETE ─────────────────────────────────────────────────────

function showClassEditMenu(name) {
    let popup = document.getElementById('class-edit-popup');
    if (!popup) {
        popup = document.createElement('div');
        popup.id = 'class-edit-popup';
        popup.className = 'class-edit-popup';
        popup.innerHTML = `
            <h2>Upravit třídu</h2>
            <div class="input-group"><label>Název třídy</label><input type="text" id="class-name-edit"></div>
            <div class="input-group"><label>Popis třídy</label><textarea id="class-description-edit" rows="3"></textarea></div>
            <div class="attributes-admin-section">
                <label>Vlastnosti stolu</label>
                <div class="attr-input-row">
                    <input type="text" id="attr-new-input" placeholder="Např. U okna, 4 místa...">
                    <button id="attr-add-btn" class="attr-add-btn">+ Přidat</button>
                </div>
                <div class="attr-tags-edit" id="attr-tags-edit"></div>
            </div>
            <div class="class-edit-error" id="class-edit-error"></div>
            <div class="class-edit-actions">
                <button id="rename-class-btn" class="primary-btn">Přejmenovat</button>
                <button id="delete-class-btn" class="danger-btn">Smazat třídu</button>
                <button id="cancel-class-edit-btn">Zrušit</button>
            </div>`;
        document.body.appendChild(popup);
        document.getElementById('cancel-class-edit-btn').addEventListener('click', hideClassEditMenu);
        document.getElementById('attr-add-btn').addEventListener('click', () => addAttributeFromInput(popup._editingName));
        document.getElementById('attr-new-input').addEventListener('keypress', e => {
            if (e.key === 'Enter') { e.preventDefault(); addAttributeFromInput(popup._editingName); }
        });

        let overlay = document.getElementById('class-edit-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'class-edit-overlay';
            overlay.className = 'accounts-overlay';
            overlay.addEventListener('click', hideClassEditMenu);
            document.body.appendChild(overlay);
        }
    }

    popup._editingName = name;
    document.getElementById('class-name-edit').value = name;
    document.getElementById('class-description-edit').value = timetables[name]?.info || '';
    document.getElementById('class-edit-error').style.display = 'none';
    document.getElementById('attr-new-input').value = '';
    renderAttrTagsEdit(name);
    document.getElementById('rename-class-btn').onclick = () => renameClass(name);
    document.getElementById('delete-class-btn').onclick = () => deleteClass(name);

    popup.style.display = 'block';
    document.getElementById('class-edit-overlay').style.display = 'block';
}

function renderAttrTagsEdit(name) {
    const container = document.getElementById('attr-tags-edit');
    if (!container) return;
    container.innerHTML = '';
    const attrs = timetables[name]?.attributes || [];
    attrs.forEach(attr => {
        const tag = document.createElement('span');
        tag.className = 'attr-tag editable-tag';
        tag.textContent = attr;
        const removeBtn = document.createElement('button');
        removeBtn.className = 'attr-remove-btn';
        removeBtn.textContent = '×';
        removeBtn.title = 'Odebrat vlastnost';
        removeBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            timetables[name].attributes = (timetables[name].attributes || []).filter(a => a !== attr);
            await saveTimetableAttributes(name);
            renderAttrTagsEdit(name);
            renderFilterPanel();
        });
        tag.appendChild(removeBtn);
        container.appendChild(tag);
    });
    if (attrs.length === 0) {
        container.innerHTML = '<span class="no-attr-hint">Žádné vlastnosti</span>';
    }
}

async function addAttributeFromInput(name) {
    const input = document.getElementById('attr-new-input');
    if (!input || !name) return;
    const val = input.value.trim();
    if (!val) return;
    if (!timetables[name]) return;
    if (!timetables[name].attributes) timetables[name].attributes = [];
    if (timetables[name].attributes.includes(val)) {
        showCustomAlert('Info', 'Tato vlastnost již existuje', 'info');
        return;
    }
    timetables[name].attributes.push(val);
    input.value = '';
    await saveTimetableAttributes(name);
    renderAttrTagsEdit(name);
    renderFilterPanel();
}

async function saveTimetableAttributes(name) {
    if (!timetables[name]) return;
    try {
        await fetch(`${API_URL}/timetables/${encodeURIComponent(name)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fileId: timetables[name].fileId,
                data: timetables[name].data || {},
                info: timetables[name].info || '',
                attributes: timetables[name].attributes || []
            })
        });
    } catch (e) {
        console.error('Failed to save attributes:', e);
    }
}

function hideClassEditMenu() {
    document.getElementById('class-edit-popup') && (document.getElementById('class-edit-popup').style.display = 'none');
    document.getElementById('class-edit-overlay') && (document.getElementById('class-edit-overlay').style.display = 'none');
}

async function renameClass(oldName) {
    const newName = document.getElementById('class-name-edit').value.trim();
    const newDescription = document.getElementById('class-description-edit').value.trim();
    const errorElement = document.getElementById('class-edit-error');

    errorElement.style.display = 'none';
    if (!newName) { errorElement.textContent = 'Prosím zadejte název třídy'; errorElement.style.display = 'block'; return; }
    if (newName === oldName && newDescription === (timetables[oldName]?.info || '')) { hideClassEditMenu(); return; }
    if (newName !== oldName && timetables[newName]) { errorElement.textContent = 'Třída s tímto názvem již existuje'; errorElement.style.display = 'block'; return; }

    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) { loadingOverlay.classList.add('active'); loadingOverlay.style.display = 'flex'; }

    try {
        const timetableData = { ...timetables[oldName] };

        if (newName !== oldName) {
            // Create new timetable with new name
            const res = await fetch(`${API_URL}/timetables`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName })
            });
            if (!res.ok) throw new Error('Nepodařilo se vytvořit novou třídu');
            const result = await res.json();

            await fetch(`${API_URL}/timetables/${encodeURIComponent(newName)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileId: result.fileId, data: timetableData.data || {}, info: newDescription, attributes: timetableData.attributes || [], permanentHours: timetableData.permanentHours || {}, currentWeek: timetableData.currentWeek || new Date().toISOString() })
            });

            await fetch(`${API_URL}/timetables`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: oldName }) });

            timetables[newName] = { ...timetableData, className: newName, fileId: result.fileId, info: newDescription };
            delete timetables[oldName];

            // Update button
            document.querySelector(`.dynamic-button[data-name="${oldName}"]`)?.closest('.button-group')?.remove();
            const btn = createDynamicButton(newName);
            btn.querySelector('.dynamic-button')?.setAttribute('data-name', newName);
            document.getElementById('dynamic-links-container')?.appendChild(btn);

            if (currentTimetableName === oldName) {
                currentTimetableName = newName;
                localStorage.setItem('currentTimetable', newName);
                document.querySelector('.time-table h2').textContent = newName;
            }
        } else {
            // Just update description
            timetables[oldName].info = newDescription;
            await fetch(`${API_URL}/timetables/${encodeURIComponent(oldName)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileId: timetableData.fileId, data: timetableData.data || {}, info: newDescription, attributes: timetableData.attributes || [] })
            });
            if (currentTimetableName === oldName) updateClassInfo(timetables[oldName]);
        }

        if (loadingOverlay) { loadingOverlay.classList.remove('active'); loadingOverlay.style.display = 'none'; }
        hideClassEditMenu();
        showCustomAlert('Úspěch', 'Třída byla úspěšně upravena', 'success');
    } catch (error) {
        if (loadingOverlay) { loadingOverlay.classList.remove('active'); loadingOverlay.style.display = 'none'; }
        errorElement.textContent = `Nepodařilo se upravit třídu: ${error.message}`;
        errorElement.style.display = 'block';
    }
}

async function deleteClass(name) {
    if (!confirm(`Opravdu chcete smazat třídu "${name}"? Tato akce je nevratná.`)) return;

    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) { loadingOverlay.classList.add('active'); loadingOverlay.style.display = 'flex'; }

    // Background server delete (best-effort)
    const fileId = timetables[name]?.fileId;
    if (fileId) {
        fetch(`${API_URL}/timetables/file/${fileId}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' } }).catch(() => {});
    }

    delete timetables[name];

    const deletedClasses = JSON.parse(localStorage.getItem('deletedClasses') || '[]');
    deletedClasses.push(name);
    localStorage.setItem('deletedClasses', JSON.stringify(deletedClasses));

    document.querySelector(`.dynamic-button[data-name="${name}"]`)?.closest('.button-group')?.remove();

    if (currentTimetableName === name) {
        document.querySelector('.time-table').style.display = 'none';
        currentTimetableName = '';
        localStorage.removeItem('currentTimetable');
    }

    if (loadingOverlay) { loadingOverlay.classList.remove('active'); loadingOverlay.style.display = 'none'; }
    hideClassEditMenu();
    showCustomAlert('Úspěch', 'Třída byla úspěšně smazána', 'success');
}

// ─── RESET ALL ───────────────────────────────────────────────────────────────

async function resetAllTimetables() {
    if (!confirm('Opravdu chcete smazat všechny rozvrhy? Tato akce je nevratná.')) return;

    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) { loadingOverlay.classList.add('active'); loadingOverlay.style.display = 'flex'; }

    try {
        const response = await fetch(`${API_URL}/timetables`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        timetables = {};
        currentTimetableName = '';
        localStorage.removeItem('currentTimetable');
        localStorage.removeItem('deletedClasses');

        document.querySelectorAll('.button-group').forEach(g => g.remove());
        document.getElementById('dynamic-links-container') && (document.getElementById('dynamic-links-container').innerHTML = '');
        document.querySelector('.time-table').style.display = 'none';

        if (loadingOverlay) { loadingOverlay.classList.remove('active'); loadingOverlay.style.display = 'none'; }
        showCustomAlert('Úspěch', 'Všechny rozvrhy byly smazány', 'success');
    } catch (error) {
        if (loadingOverlay) { loadingOverlay.classList.remove('active'); loadingOverlay.style.display = 'none'; }
        showCustomAlert('Chyba', 'Nepodařilo se resetovat rozvrhy', 'error');
    }
}

// ─── ALERTS ──────────────────────────────────────────────────────────────────

function showCustomAlert(title, message, type = 'info') {
    let alert = document.getElementById('custom-alert');
    if (!alert) {
        alert = document.createElement('div');
        alert.id = 'custom-alert';
        alert.className = 'custom-alert';
        alert.innerHTML = '<h2></h2><p></p><button>OK</button>';
        document.body.appendChild(alert);

        let overlay = document.getElementById('custom-alert-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'custom-alert-overlay';
            overlay.className = 'custom-alert-overlay';
            document.body.appendChild(overlay);
        }

        alert.querySelector('button').addEventListener('click', () => {
            alert.classList.remove('active');
            document.getElementById('custom-alert-overlay')?.classList.remove('active');
        });
    }

    alert.querySelector('h2').textContent = title;
    alert.querySelector('p').textContent = message;
    alert.className = `custom-alert ${type} active`;
    document.getElementById('custom-alert-overlay')?.classList.add('active');

    if (type === 'success') {
        setTimeout(() => {
            alert.classList.remove('active');
            document.getElementById('custom-alert-overlay')?.classList.remove('active');
        }, 3000);
    }
}

// ─── SELECT SCREEN ───────────────────────────────────────────────────────────

function showSelectScreen() {
    const selectScreen = document.getElementById('select-screen');
    if (!selectScreen) return;
    document.getElementById('name-input').value = '';
    document.getElementById('description-input').value = '';
    selectScreen.style.cssText = 'display:flex;visibility:visible;opacity:1;z-index:2000;position:fixed;top:0;left:0;width:100%;height:100%;background-color:rgba(0,0,0,0.5);justify-content:center;align-items:center;';
}

// ─── VERIFICATION (debug admin) ───────────────────────────────────────────────

function setupVerificationWindow() {
    const verificationWindow = document.getElementById('verification-window');
    const verificationCode = document.getElementById('verification-code');
    const confirmVerification = document.getElementById('confirm-verification');
    const closeVerification = document.getElementById('close-verification');

    if (!verificationWindow || !verificationCode || !confirmVerification || !closeVerification) return;

    function verifyAdminCode() {
        if (verificationCode.value === '1918') {
            enableAdminMode();
            closeVerificationWindow();
            showCustomAlert('Úspěch', 'Režim administrátora aktivován', 'success');
        } else {
            showCustomAlert('Chyba', 'Neplatný ověřovací kód', 'error');
        }
        verificationCode.value = '';
    }

    function closeVerificationWindow() {
        verificationWindow.classList.remove('active');
        verificationWindow.style.display = 'none';
        verificationCode.value = '';
    }

    confirmVerification.addEventListener('click', verifyAdminCode);
    closeVerification.addEventListener('click', closeVerificationWindow);
    verificationCode.addEventListener('keypress', e => { if (e.key === 'Enter') verifyAdminCode(); });

    document.getElementById('admin-button')?.addEventListener('click', () => {
        if (!isAdminMode) {
            verificationWindow.classList.add('active');
            verificationWindow.style.display = 'flex';
            verificationCode.focus();
        }
    });
}

// ─── MOBILE TOUCH SUPPORT ────────────────────────────────────────────────────

function addMobileTouchSupport() {
    document.querySelectorAll('.close-menu, #close-login, .close-select, .close-verification-button, .close-permanent-date').forEach(btn => {
        btn.addEventListener('touchstart', e => { e.preventDefault(); btn.click(); });
    });

    let lastTouch = 0;
    document.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('touchend', e => {
            const now = Date.now();
            if (now - lastTouch < 350) e.preventDefault();
            lastTouch = now;
        });
    });
}

// ─── INIT (single DOMContentLoaded) ──────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    // Calendar navigation
    document.querySelector('.timetable-calendar .prev-button')?.addEventListener('click', () => navigateMonth(-1));
    document.querySelector('.timetable-calendar .next-button')?.addEventListener('click', () => navigateMonth(1));

    // Vybrat stůl button opens filter panel
    document.getElementById('vybrat-stul-btn')?.addEventListener('click', openFilterPanel);
    document.getElementById('close-filter-panel')?.addEventListener('click', closeFilterPanel);
    document.getElementById('inner-site-btn')?.addEventListener('click', () => {
        const url = `${API_BASE_URL}/reservation/inner.html?api=${encodeURIComponent(API_BASE_URL)}`;
        window.open(url, 'spravaStolu', 'width=1400,height=900,menubar=no,toolbar=no,location=no,status=no');
    });
    document.getElementById('table-filter-overlay')?.addEventListener('click', closeFilterPanel);

    // Select screen
    document.getElementById('create-new')?.addEventListener('click', showSelectScreen);
    document.getElementById('close-select')?.addEventListener('click', () => {
        const s = document.getElementById('select-screen');
        if (s) { s.style.display = 'none'; s.classList.remove('active'); }
    });

    // Accounts button
    document.getElementById('accounts-button')?.addEventListener('click', () => {
        if (isAdminMode) showAccountCreatePopup();
    });

    const editButton = document.querySelector('.edit-button');
    if (editButton) {
        editButton.addEventListener('click', function () {
            isEditMode = !isEditMode;
            this.textContent = isEditMode ? 'Zrušit' : 'Zamluvit stůl';

            document.querySelectorAll('.week-table tbody td:not(:first-child)').forEach(cell => {
                if (!cell.classList.contains('permanent-hour')) {
                    cell.setAttribute('contenteditable', isEditMode ? 'true' : 'false');
                    cell.classList.toggle('editable', isEditMode);
                }
            });

            if (isEditMode) {
                setupCellEditing();
                // Show permanent hours toggle for admins
                const toggleBtn = document.getElementById('toggle-permanent-btn');
                if (toggleBtn && isAdminMode) toggleBtn.style.display = 'block';
            } else {
                // Reset permanent hour mode when cancelling
                permanentHourModeEnabled = false;
                const toggleBtn = document.getElementById('toggle-permanent-btn');
                if (toggleBtn) {
                    toggleBtn.style.display = 'none';
                    toggleBtn.classList.remove('active');
                    toggleBtn.textContent = 'Trvalé hodiny: OFF';
                }
            }

            const saveBtn = document.querySelector('.save-button');
            if (saveBtn) saveBtn.style.display = isEditMode ? 'block' : 'none';
        });
    }

    // Save button
    document.querySelector('.save-button')?.addEventListener('click', () => {
        saveTimeTable();
        isEditMode = false;
        permanentHourModeEnabled = false;
        const editBtn = document.querySelector('.edit-button');
        if (editBtn) editBtn.textContent = 'Zamluvit stůl';
        document.querySelector('.save-button').style.display = 'none';
        const toggleBtn = document.getElementById('toggle-permanent-btn');
        if (toggleBtn) {
            toggleBtn.style.display = 'none';
            toggleBtn.classList.remove('active');
            toggleBtn.textContent = 'Trvalé hodiny: OFF';
        }
        document.querySelectorAll('.week-table tbody td:not(:first-child)').forEach(cell => {
            cell.setAttribute('contenteditable', 'false');
            cell.classList.remove('editable', 'edited-cell');
        });
    });

    // Debug menu
    document.getElementById('debug-reset-all')?.addEventListener('click', resetAllTimetables);
    document.getElementById('debug-create-new')?.addEventListener('click', showSelectScreen);
    document.getElementById('debug-accounts')?.addEventListener('click', () => { if (isAdminMode) showAccountCreatePopup(); });
    document.getElementById('close-debug')?.addEventListener('click', () => {
        document.getElementById('debug-menu')?.classList.remove('active');
        document.getElementById('debug-overlay')?.classList.remove('active');
    });
    document.getElementById('debug-overlay')?.addEventListener('click', () => {
        document.getElementById('debug-menu')?.classList.remove('active');
        document.getElementById('debug-overlay')?.classList.remove('active');
    });

    // Debug input (hidden trigger)
    document.getElementById('debug-input')?.addEventListener('click', () => {
        document.body.classList.toggle('debug-mode');
    });

    setupLoginHandlers();
    setupVerificationWindow();
    addMobileTouchSupport();
    generateCalendar();

    // Load timetables (will show login prompt if not logged in)
    loadTimetables().then(() => {
        const saved = localStorage.getItem('currentTimetable');
        if (saved && timetables[saved]) showTimetable(saved);
    }).catch(err => {
        console.error('Init error:', err);
        showCustomAlert('Chyba', 'Nepodařilo se inicializovat aplikaci', 'error');
    });
});