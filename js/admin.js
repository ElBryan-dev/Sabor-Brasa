/* ==========================================================================
   Sabor a Brasa - Panel de reservas para el personal
   ========================================================================== */
(() => {
    const S = ReservasStore;
    const $ = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
    const escapeHTML = str => String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // OJO: esto solo evita que un cliente entre por curiosidad. No es seguridad real:
    // cualquier persona puede leer este archivo. Con un backend, usa autenticación de verdad.
    const ADMIN_PIN = '1234';
    const SESSION_KEY = 'sb_admin_session';

    const state = {
        view: 'day',
        date: S.todayISO(),
        search: '',
        status: '',
        zone: ''
    };

    // ------------------------------------------------------------------
    // Toast
    // ------------------------------------------------------------------
    let toastTimer;
    function toast(msg) {
        const el = $('#toast');
        el.textContent = msg;
        el.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
    }

    // ------------------------------------------------------------------
    // Login
    // ------------------------------------------------------------------
    function isLogged() {
        try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch (e) { return false; }
    }

    function showApp() {
        $('#login-screen').hidden = true;
        $('#admin-app').hidden = false;
        render();
    }

    $('#login-form').addEventListener('submit', e => {
        e.preventDefault();
        if ($('#pin').value === ADMIN_PIN) {
            try { sessionStorage.setItem(SESSION_KEY, '1'); } catch (err) { /* sin storage: solo esta vista */ }
            showApp();
        } else {
            $('#login-error').textContent = 'PIN incorrecto.';
            $('#pin').select();
        }
    });

    $('#logout-btn').addEventListener('click', () => {
        try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
        location.reload();
    });

    // ------------------------------------------------------------------
    // Filtros y controles
    // ------------------------------------------------------------------
    Object.entries(S.STATUS).forEach(([k, label]) => $('#status-filter').add(new Option(label, k)));
    Object.entries(S.CONFIG.zones).forEach(([k, z]) => {
        $('#zone-filter').add(new Option(z.label, k));
        $('#e-zone').add(new Option(z.label, k));
    });
    S.allSlots().forEach(t => $('#e-time').add(new Option(S.formatTime(t), t)));

    $('#admin-date').value = state.date;
    $('#admin-date').addEventListener('change', e => { state.date = e.target.value || S.todayISO(); render(); });
    $('#prev-day').addEventListener('click', () => { state.date = S.addDaysISO(state.date, -1); render(); });
    $('#next-day').addEventListener('click', () => { state.date = S.addDaysISO(state.date, 1); render(); });
    $('#today-btn').addEventListener('click', () => { state.date = S.todayISO(); render(); });

    $$('.view-btn').forEach(btn => btn.addEventListener('click', () => {
        state.view = btn.dataset.view;
        $$('.view-btn').forEach(b => b.classList.toggle('active', b === btn));
        render();
    }));

    $('#search').addEventListener('input', e => { state.search = e.target.value.trim().toLowerCase(); renderTable(); });
    $('#status-filter').addEventListener('change', e => { state.status = e.target.value; renderTable(); });
    $('#zone-filter').addEventListener('change', e => { state.zone = e.target.value; renderTable(); });

    // Si se crea una reserva en otra pestaña (ej. el sitio público), el panel se actualiza solo
    window.addEventListener('storage', () => { if (isLogged()) render(); });

    // ------------------------------------------------------------------
    // Datos filtrados
    // ------------------------------------------------------------------
    const sortByDateTime = (a, b) => (a.date + a.time).localeCompare(b.date + b.time);

    function filtered() {
        const today = S.todayISO();
        let list = S.load();
        if (state.view === 'day') list = list.filter(r => r.date === state.date);
        if (state.view === 'upcoming') list = list.filter(r => r.date >= today && S.ACTIVE.includes(r.status));
        if (state.status) list = list.filter(r => r.status === state.status);
        if (state.zone) list = list.filter(r => r.zone === state.zone);
        if (state.search) {
            const q = state.search;
            const qDigits = q.replace(/\D/g, '');
            list = list.filter(r =>
                r.name.toLowerCase().includes(q) ||
                r.code.toLowerCase().includes(q) ||
                (qDigits && r.phone.includes(qDigits)));
        }
        list.sort(sortByDateTime);
        if (state.view === 'all') list.reverse();
        return list;
    }

    // ------------------------------------------------------------------
    // Render
    // ------------------------------------------------------------------
    function render() {
        $('#admin-date').value = state.date;
        $('#date-nav').style.visibility = state.view === 'day' ? 'visible' : 'hidden';
        $('#occupancy-panel').hidden = state.view !== 'day';

        const titles = {
            day: S.formatDate(state.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + (state.date === S.todayISO() ? ' · Hoy' : ''),
            upcoming: 'Próximas reservas activas',
            all: 'Historial completo'
        };
        $('#admin-title').textContent = titles[state.view];

        renderKPIs();
        if (state.view === 'day') renderOccupancy();
        renderTable();
    }

    function renderKPIs() {
        const all = S.load();
        const scope = state.view === 'day'
            ? all.filter(r => r.date === state.date)
            : all.filter(r => r.date >= S.todayISO());
        const active = scope.filter(r => S.ACTIVE.includes(r.status));
        $('#kpi-res').textContent = active.length;
        $('#kpi-guests').textContent = active.reduce((s, r) => s + r.guests, 0);
        $('#kpi-pending').textContent = scope.filter(r => r.status === 'pendiente').length;

        if (state.view === 'day') {
            const totalCap = Object.values(S.CONFIG.zones).reduce((s, z) => s + z.capacity, 0);
            const peak = Math.max(0, ...S.allSlots().map(t =>
                Object.keys(S.CONFIG.zones).reduce((s, z) => s + S.occupiedSeats(state.date, t, z, null, all), 0)));
            $('#kpi-peak').textContent = `${Math.round((peak / totalCap) * 100)}%`;
        } else {
            $('#kpi-peak').textContent = '—';
        }
    }

    function renderOccupancy() {
        const all = S.load();
        const slots = S.allSlots();
        let html = '<thead><tr><th>Zona</th>' + slots.map(t => `<th>${t}</th>`).join('') + '</tr></thead><tbody>';
        Object.entries(S.CONFIG.zones).forEach(([zone, z]) => {
            html += `<tr><th>${escapeHTML(z.label)}<small>${z.capacity} pax</small></th>`;
            slots.forEach(t => {
                const used = S.occupiedSeats(state.date, t, zone, null, all);
                const pct = used / z.capacity;
                const level = used === 0 ? 0 : pct < 0.5 ? 1 : pct < 0.85 ? 2 : 3;
                html += `<td class="occ occ-${level}" title="${z.label} ${t}: ${used}/${z.capacity}">${used || ''}</td>`;
            });
            html += '</tr>';
        });
        $('#occupancy-table').innerHTML = html + '</tbody>';
    }

    function actionsFor(r) {
        const b = (action, label, cls = '') => `<button type="button" class="row-btn ${cls}" data-action="${action}" data-id="${r.id}">${label}</button>`;
        const out = [];
        if (r.status === 'pendiente') out.push(b('confirmada', 'Confirmar', 'ok'));
        if (r.status === 'confirmada' || r.status === 'pendiente') out.push(b('sentada', 'Llegó', 'info'));
        if (r.status === 'confirmada') out.push(b('noshow', 'No vino', 'warn'));
        if (r.status === 'sentada') out.push(b('completada', 'Finalizar', 'ok'));
        if (S.ACTIVE.includes(r.status) && r.status !== 'sentada') out.push(b('cancelada', 'Cancelar', 'warn'));
        if (!S.ACTIVE.includes(r.status)) out.push(b('reopen', 'Reabrir'));
        out.push(b('whatsapp', 'WhatsApp'));
        out.push(b('edit', 'Editar'));
        out.push(b('delete', 'Eliminar', 'danger'));
        return out.join('');
    }

    function renderTable() {
        const list = filtered();
        const tbody = $('#res-tbody');
        $('#empty-state').hidden = list.length > 0;
        $('#seed-btn').hidden = S.load().length > 0;

        tbody.innerHTML = list.map(r => `
            <tr class="row-${r.status}">
                <td data-label="Fecha / Hora">
                    <strong>${S.formatTime(r.time)}</strong>
                    ${state.view !== 'day' ? `<span class="muted">${S.formatDate(r.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span>` : ''}
                    <span class="code">${escapeHTML(r.code)}</span>
                </td>
                <td data-label="Cliente">
                    <strong>${escapeHTML(r.name)}</strong>
                    <span class="muted">${escapeHTML(r.phone)}</span>
                    ${r.source === 'staff' ? '<span class="source">Tomada por personal</span>' : ''}
                </td>
                <td data-label="Pax"><strong>${r.guests}</strong></td>
                <td data-label="Zona">${escapeHTML(r.zone)}</td>
                <td data-label="Detalle">
                    <span>${escapeHTML(r.occasion)}</span>
                    ${r.message ? `<span class="note">“${escapeHTML(r.message)}”</span>` : ''}
                </td>
                <td data-label="Estado"><span class="status-badge status-${r.status}">${S.STATUS[r.status]}</span></td>
                <td class="td-actions">${actionsFor(r)}</td>
            </tr>`).join('');
    }

    // ------------------------------------------------------------------
    // Acciones de fila
    // ------------------------------------------------------------------
    $('#res-tbody').addEventListener('click', e => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const r = S.load().find(x => x.id === btn.dataset.id);
        if (!r) return;
        const action = btn.dataset.action;

        if (action === 'edit') return openEditor(r);
        if (action === 'whatsapp') {
            const phone = r.phone.length === 9 ? '51' + r.phone : r.phone;
            const msg = `Hola ${r.name.split(' ')[0]}, te escribimos de Sabor a Brasa sobre tu reserva ${r.code} ` +
                `para el ${S.formatDate(r.date)} a las ${S.formatTime(r.time)} (${r.guests} pax). `;
            window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
            return;
        }
        if (action === 'delete') {
            if (!confirm(`¿Eliminar definitivamente la reserva ${r.code} de ${r.name}?`)) return;
            S.remove(r.id);
            toast('Reserva eliminada');
            return render();
        }
        if (action === 'cancelada' && !confirm(`¿Cancelar la reserva ${r.code}?`)) return;

        const newStatus = action === 'reopen' ? 'confirmada' : action;
        S.setStatus(r.id, newStatus, 'Cambio desde el panel');
        toast(`${r.code}: ${S.STATUS[newStatus]}`);
        render();
    });

    // ------------------------------------------------------------------
    // Crear / editar
    // ------------------------------------------------------------------
    const editModal = $('#edit-modal');
    const editForm = $('#edit-form');

    function openEditor(r = null) {
        editForm.reset();
        showEditErrors({});
        $('#edit-title').textContent = r ? `Editar ${r.code}` : 'Nueva reserva (teléfono / presencial)';
        const v = r || { date: state.view === 'day' ? state.date : S.todayISO(), zone: Object.keys(S.CONFIG.zones)[0], guests: 2, time: S.allSlots()[0], occasion: 'Cena Casual' };
        ['id', 'name', 'phone', 'email', 'guests', 'zone', 'date', 'time', 'occasion', 'message'].forEach(k => {
            const el = editForm.elements[k];
            if (el && v[k] !== undefined) el.value = v[k];
        });

        const hist = $('#edit-history');
        if (r && r.history && r.history.length) {
            hist.hidden = false;
            hist.innerHTML = '<h4>Historial</h4><ul>' + r.history.slice().reverse().map(h =>
                `<li><span>${new Date(h.at).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })}</span> ${S.STATUS[h.status] || h.status}${h.note ? ' · ' + escapeHTML(h.note) : ''}</li>`).join('') + '</ul>';
        } else {
            hist.hidden = true;
        }

        editModal.classList.add('active');
        editModal.setAttribute('aria-hidden', 'false');
        setTimeout(() => editForm.elements.name.focus(), 50);
    }

    function closeEditor() {
        editModal.classList.remove('active');
        editModal.setAttribute('aria-hidden', 'true');
    }

    function showEditErrors(errors) {
        $$('.field-error', editForm).forEach(el => { el.textContent = errors[el.dataset.errorFor] || ''; });
        $('#edit-general').textContent = errors.general || '';
    }

    $('#new-res-btn').addEventListener('click', () => openEditor());
    $('#edit-close').addEventListener('click', closeEditor);
    $('#edit-cancel').addEventListener('click', closeEditor);
    editModal.addEventListener('click', e => { if (e.target === editModal) closeEditor(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && editModal.classList.contains('active')) closeEditor(); });

    editForm.addEventListener('submit', e => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(editForm).entries());
        const id = data.id;
        delete data.id;
        const res = id ? S.update(id, data, { staff: true }) : S.create(data, { staff: true });
        if (!res.ok) return showEditErrors(res.errors);
        closeEditor();
        toast(id ? 'Reserva actualizada' : `Reserva ${res.reserva.code} creada`);
        if (!id && state.view === 'day') state.date = res.reserva.date;
        render();
    });

    // ------------------------------------------------------------------
    // Exportar / datos de ejemplo
    // ------------------------------------------------------------------
    $('#export-btn').addEventListener('click', () => {
        const list = filtered();
        if (!list.length) return toast('No hay reservas para exportar');
        const suffix = state.view === 'day' ? state.date : state.view;
        S.download(`reservas-${suffix}.csv`, S.toCSV(list), 'text/csv;charset=utf-8');
    });

    $('#seed-btn').addEventListener('click', () => {
        const names = ['María Quispe', 'Carlos Rojas', 'Lucía Fernández', 'Jorge Huamán', 'Ana Torres', 'Diego Salazar', 'Valeria Ríos', 'Luis Mendoza', 'Rosa Chávez', 'Pedro Castillo'];
        const zones = Object.keys(S.CONFIG.zones);
        const occasions = ['Cena Casual', 'Aniversario', 'Cumpleaños', 'Reunión de Negocios', 'Reunión Familiar'];
        const slots = S.allSlots();
        let created = 0;
        for (let d = 0; d < 4; d++) {
            const date = S.addDaysISO(S.todayISO(), d);
            for (let i = 0; i < 7; i++) {
                const zone = zones[(i + d) % zones.length];
                const z = S.CONFIG.zones[zone];
                const guests = Math.max(z.minGuests || 1, Math.min(z.maxGuests || 8, 2 + ((i * 3 + d) % 6)));
                const res = S.create({
                    name: names[(i + d * 3) % names.length],
                    phone: '9' + String(10000000 + Math.floor(Math.random() * 89999999)),
                    date, zone, guests,
                    time: slots[(i * 2 + d + 6) % slots.length],
                    occasion: occasions[(i + d) % occasions.length],
                    message: i % 4 === 0 ? 'Sin ají, por favor' : ''
                }, { staff: true });
                if (res.ok) {
                    created++;
                    if (i % 3 === 0) S.setStatus(res.reserva.id, 'pendiente', 'Ejemplo');
                }
            }
        }
        toast(`${created} reservas de ejemplo creadas`);
        render();
    });

    if (isLogged()) showApp();
})();
