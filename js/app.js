document.addEventListener('DOMContentLoaded', () => {
    const S = ReservasStore;
    const $ = (sel, root = document) => root.querySelector(sel);
    const escapeHTML = str => String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // ------------------------------------------------------------------
    // 1. Menú móvil
    // ------------------------------------------------------------------
    const menuToggle = $('.menu-toggle');
    const nav = $('.nav');
    if (menuToggle && nav) {
        const setOpen = open => {
            nav.classList.toggle('active', open);
            menuToggle.classList.toggle('open', open);
            menuToggle.setAttribute('aria-expanded', String(open));
        };
        menuToggle.addEventListener('click', () => setOpen(!nav.classList.contains('active')));
        nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setOpen(false)));
    }

    // ------------------------------------------------------------------
    // 2. Header al hacer scroll
    // ------------------------------------------------------------------
    const header = $('.header');
    const onScroll = () => header && header.classList.toggle('scrolled', window.scrollY > 50);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // ------------------------------------------------------------------
    // 3. Toast
    // ------------------------------------------------------------------
    const toastEl = $('#toast');
    let toastTimer;
    function toast(msg) {
        if (!toastEl) return;
        toastEl.textContent = msg;
        toastEl.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3200);
    }

    // ------------------------------------------------------------------
    // 4. Turnos (componente reutilizable: formulario y "cambiar horario")
    // ------------------------------------------------------------------
    function renderSlots(container, { date, guests, zone, selected, ignoreId, onSelect }) {
        container.innerHTML = '';
        if (!date || !guests || !zone) {
            container.innerHTML = '<p class="slot-empty">Selecciona personas, zona y fecha para ver los horarios disponibles.</p>';
            return;
        }
        if (S.isClosedDay(date)) {
            container.innerHTML = '<p class="slot-empty">Ese día el restaurante está cerrado. Elige otra fecha.</p>';
            return;
        }
        const slots = S.getSlots(date, guests, zone, { ignoreId });
        if (!slots.some(s => s.available)) {
            container.innerHTML = '<p class="slot-empty">No quedan horarios disponibles para esta combinación. Prueba otra zona u otra fecha.</p>';
        }
        const cap = S.CONFIG.zones[zone].capacity;
        slots.forEach(slot => {
            if (slot.reason === 'pasado') return; // no mostramos horas que ya pasaron
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'slot';
            btn.textContent = S.formatTime(slot.time);
            btn.dataset.time = slot.time;
            btn.setAttribute('role', 'radio');
            btn.setAttribute('aria-checked', String(slot.time === selected));
            if (!slot.available) {
                btn.disabled = true;
                btn.classList.add('full');
                btn.title = 'Sin mesas disponibles';
            } else if (slot.remaining - Number(guests) < cap * 0.25) {
                btn.classList.add('few');
                btn.title = 'Últimas mesas';
            }
            if (slot.time === selected && slot.available) btn.classList.add('selected');
            btn.addEventListener('click', () => {
                container.querySelectorAll('.slot').forEach(b => { b.classList.remove('selected'); b.setAttribute('aria-checked', 'false'); });
                btn.classList.add('selected');
                btn.setAttribute('aria-checked', 'true');
                onSelect(slot.time);
            });
            container.appendChild(btn);
        });
    }

    function fillGuestOptions(select, max) {
        for (let i = 1; i <= max; i++) {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = `${i} ${i === 1 ? 'Persona' : 'Personas'}`;
            select.appendChild(opt);
        }
    }

    function fillZoneOptions(select) {
        Object.entries(S.CONFIG.zones).forEach(([value, z], i) => {
            const opt = document.createElement('option');
            opt.value = value;
            opt.textContent = z.label;
            if (i === 0) opt.selected = true;
            select.appendChild(opt);
        });
    }

    function zoneHint(zone) {
        const z = S.CONFIG.zones[zone];
        if (!z) return '';
        if (z.minGuests) return `Mínimo ${z.minGuests} personas.`;
        if (z.maxGuests) return `Máximo ${z.maxGuests} personas.`;
        return '';
    }

    // ------------------------------------------------------------------
    // 5. Formulario de reserva
    // ------------------------------------------------------------------
    const form = $('#reservation-form');
    let lastReserva = null;

    if (form) {
        const f = {
            guests: $('#guests'), zone: $('#zone'), date: $('#date'),
            time: $('#time'), grid: $('#slot-grid'), zoneHint: $('#zone-hint'),
            general: $('#form-general-error')
        };

        fillGuestOptions(f.guests, S.CONFIG.maxGuestsOnline);
        fillZoneOptions(f.zone);
        f.date.min = S.todayISO();
        f.date.max = S.addDaysISO(S.todayISO(), S.CONFIG.maxDaysAhead);

        const showErrors = errors => {
            form.querySelectorAll('.field-error').forEach(el => {
                const key = el.dataset.errorFor;
                el.textContent = errors[key] || '';
                const input = form.querySelector(`[name="${key}"]`);
                if (input && input.type !== 'hidden') input.classList.toggle('invalid', Boolean(errors[key]));
            });
            f.general.textContent = errors.general || '';
        };

        const refreshSlots = () => {
            f.zoneHint.textContent = zoneHint(f.zone.value);
            // Si el turno elegido ya no sirve, lo limpiamos
            const current = f.time.value;
            renderSlots(f.grid, {
                date: f.date.value, guests: f.guests.value, zone: f.zone.value, selected: current,
                onSelect: t => { f.time.value = t; showErrors({}); }
            });
            if (current && !f.grid.querySelector(`.slot.selected`)) f.time.value = '';
            // Error de zona en vivo (mínimos/máximos)
            const errs = S.validate({ ...Object.fromEntries(new FormData(form)), name: 'xxx', phone: '999999999' });
            const zoneErr = form.querySelector('[data-error-for="zone"]');
            zoneErr.textContent = f.guests.value ? (errs.zone || '') : '';
        };

        ['change', 'input'].forEach(ev => {
            f.guests.addEventListener(ev, refreshSlots);
            f.zone.addEventListener(ev, refreshSlots);
            f.date.addEventListener(ev, refreshSlots);
        });

        // Limpia el error de un campo cuando el usuario lo corrige
        form.addEventListener('input', e => {
            if (!e.target.name) return;
            const el = form.querySelector(`[data-error-for="${e.target.name}"]`);
            if (el && e.target.name !== 'zone') el.textContent = '';
            e.target.classList.remove('invalid');
        });

        form.addEventListener('submit', e => {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(form).entries());
            const errors = S.validate(data);
            if (!$('#policy').checked) errors.policy = 'Debes aceptar la política de tolerancia.';
            if (Object.keys(errors).length) {
                showErrors(errors);
                const first = form.querySelector('.field-error:not(:empty)');
                if (first) first.closest('.form-group, fieldset').scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }

            const submitBtn = form.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            submitBtn.textContent = 'Procesando Mesa...';
            submitBtn.disabled = true;

            setTimeout(() => {
                const result = S.create(data);
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;

                if (!result.ok) {
                    showErrors(result.errors);
                    refreshSlots();
                    return;
                }
                lastReserva = result.reserva;
                showErrors({});
                form.reset();
                f.time.value = '';
                refreshSlots();
                openConfirmation(result.reserva);
            }, 500);
        });

        const bigGroup = $('#big-group-link');
        if (bigGroup) {
            bigGroup.href = `https://wa.me/${S.CONFIG.whatsappPhone}?text=${encodeURIComponent('Hola, quisiera reservar para un grupo grande / evento privado en Sabor a Brasa.')}`;
            bigGroup.target = '_blank';
            bigGroup.rel = 'noopener noreferrer';
        }

        refreshSlots();
    }

    // ------------------------------------------------------------------
    // 6. Modal de confirmación
    // ------------------------------------------------------------------
    const modal = $('#reservation-modal');
    let lastFocus = null;

    function openModal() {
        if (!modal) return;
        lastFocus = document.activeElement;
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        setTimeout(() => $('#modal-close-btn').focus(), 50);
    }

    function closeModal() {
        if (!modal) return;
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        if (lastFocus) lastFocus.focus();
    }

    function openConfirmation(r) {
        $('#summary-code').textContent = r.code;
        $('#summary-name').textContent = r.name;
        $('#summary-guests').textContent = `Mesa para ${r.guests} ${r.guests === 1 ? 'Persona' : 'Personas'}`;
        $('#summary-datetime').textContent = `${S.formatDate(r.date, { weekday: 'short', day: 'numeric', month: 'short' })} • ${S.formatTime(r.time)}`;
        $('#summary-zone-occasion').textContent = `${r.zone} • ${r.occasion}`;
        const notes = $('#summary-notes-container');
        notes.style.display = r.message ? 'block' : 'none';
        $('#summary-notes').textContent = r.message;
        $('#modal-whatsapp-btn').href = S.whatsappLink(r);
        openModal();
    }

    if (modal) {
        $('#modal-close-btn').addEventListener('click', closeModal);
        $('#modal-accept-btn').addEventListener('click', closeModal);
        modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && modal.classList.contains('active')) closeModal();
        });
        $('#copy-code-btn').addEventListener('click', async () => {
            const code = $('#summary-code').textContent;
            try {
                await navigator.clipboard.writeText(code);
                toast('Código copiado');
            } catch (err) {
                toast(`Tu código es ${code}`);
            }
        });
        $('#modal-ics-btn').addEventListener('click', () => {
            if (lastReserva) S.download(`reserva-${lastReserva.code}.ics`, S.icsFile(lastReserva), 'text/calendar');
        });
    }

    // ------------------------------------------------------------------
    // 7. Gestionar mi reserva (consultar / cambiar horario / cancelar)
    // ------------------------------------------------------------------
    const lookupForm = $('#lookup-form');
    const lookupResult = $('#lookup-result');
    const lookupError = $('#lookup-error');

    function renderLookup(r) {
        const modifiable = S.canCustomerModify(r);
        lookupResult.hidden = false;
        lookupResult.innerHTML = `
            <div class="res-card">
                <div class="res-card-head">
                    <div>
                        <span class="summary-label">Reserva</span>
                        <h3>${escapeHTML(r.code)}</h3>
                    </div>
                    <span class="status-badge status-${r.status}">${S.STATUS[r.status]}</span>
                </div>
                <dl class="res-details">
                    <div><dt>Titular</dt><dd>${escapeHTML(r.name)}</dd></div>
                    <div><dt>Personas</dt><dd>${r.guests}</dd></div>
                    <div><dt>Fecha</dt><dd>${S.formatDate(r.date)}</dd></div>
                    <div><dt>Hora</dt><dd>${S.formatTime(r.time)}</dd></div>
                    <div><dt>Zona</dt><dd>${escapeHTML(r.zone)}</dd></div>
                    <div><dt>Ocasión</dt><dd>${escapeHTML(r.occasion)}</dd></div>
                    ${r.message ? `<div class="full"><dt>Nota</dt><dd>${escapeHTML(r.message)}</dd></div>` : ''}
                </dl>
                ${modifiable ? `
                <div class="res-actions">
                    <button type="button" class="btn-outline" data-action="reschedule">Cambiar fecha u hora</button>
                    <button type="button" class="btn-danger" data-action="cancel">Cancelar reserva</button>
                </div>
                <div class="reschedule" hidden>
                    <div class="form-group">
                        <label for="re-date">Nueva fecha</label>
                        <input type="date" id="re-date" value="${r.date}" min="${S.todayISO()}" max="${S.addDaysISO(S.todayISO(), S.CONFIG.maxDaysAhead)}">
                    </div>
                    <div class="slot-grid" id="re-slots"></div>
                    <p class="form-general-error" id="re-error"></p>
                    <button type="button" class="btn-primary full-width" data-action="save-reschedule" disabled>Guardar nuevo horario</button>
                </div>` : `
                <p class="res-locked">${['cancelada', 'noshow', 'completada'].includes(r.status)
                    ? 'Esta reserva ya no está activa.'
                    : 'Los cambios en línea se permiten hasta 2 horas antes. Para cualquier ajuste escríbenos por WhatsApp.'}</p>`}
                <div class="res-links">
                    <a href="${S.whatsappLink(r)}" target="_blank" rel="noopener noreferrer">Escribir por WhatsApp</a>
                    ${S.ACTIVE.includes(r.status) ? '<button type="button" class="link-btn" data-action="ics">Agregar al calendario</button>' : ''}
                </div>
            </div>`;

        let newTime = '';
        const reBox = $('.reschedule', lookupResult);
        const reDate = $('#re-date', lookupResult);
        const reSlots = $('#re-slots', lookupResult);
        const saveBtn = $('[data-action="save-reschedule"]', lookupResult);

        const drawReSlots = () => {
            newTime = '';
            if (saveBtn) saveBtn.disabled = true;
            renderSlots(reSlots, {
                date: reDate.value, guests: r.guests, zone: r.zone,
                selected: reDate.value === r.date ? r.time : '', ignoreId: r.id,
                onSelect: t => { newTime = t; saveBtn.disabled = false; }
            });
        };

        lookupResult.onclick = e => {
            const action = e.target.dataset.action;
            if (!action) return;
            if (action === 'cancel') {
                if (!confirm(`¿Seguro que deseas cancelar la reserva ${r.code}?`)) return;
                const res = S.setStatus(r.id, 'cancelada', 'Cancelada por el cliente');
                if (res.ok) { renderLookup(res.reserva); toast('Reserva cancelada'); }
            }
            if (action === 'reschedule') {
                reBox.hidden = !reBox.hidden;
                if (!reBox.hidden) drawReSlots();
            }
            if (action === 'save-reschedule') {
                const res = S.update(r.id, { date: reDate.value, time: newTime });
                if (!res.ok) {
                    $('#re-error', lookupResult).textContent = Object.values(res.errors)[0];
                    return;
                }
                S.setStatus(r.id, 'pendiente', `Reprogramada a ${res.reserva.date} ${res.reserva.time}`);
                renderLookup(S.findByCodeAndPhone(r.code, r.phone));
                toast('Horario actualizado. Te confirmaremos por WhatsApp.');
            }
            if (action === 'ics') S.download(`reserva-${r.code}.ics`, S.icsFile(r), 'text/calendar');
        };
        if (reDate) reDate.addEventListener('change', drawReSlots);
    }

    if (lookupForm) {
        lookupForm.addEventListener('submit', e => {
            e.preventDefault();
            const code = $('#lookup-code').value;
            const phone = $('#lookup-phone').value;
            lookupError.textContent = '';
            if (!code.trim() || S.normalizePhone(phone).length < 9) {
                lookupError.textContent = 'Ingresa tu código y el celular con el que reservaste.';
                lookupResult.hidden = true;
                return;
            }
            const r = S.findByCodeAndPhone(code, phone);
            if (!r) {
                lookupError.textContent = 'No encontramos una reserva con esos datos. Revisa el código (ej. SB-7KQ2M) y el celular.';
                lookupResult.hidden = true;
                return;
            }
            renderLookup(r);
        });
    }
});
