/* ==========================================================================
   Sabor a Brasa - Módulo de Reservas (datos + reglas de negocio)
   --------------------------------------------------------------------------
   Toda la lógica de reservas vive aquí, así index.html (clientes) y
   admin.html (personal del restaurante) usan exactamente las mismas reglas.

   IMPORTANTE: los datos se guardan en localStorage, es decir, SOLO en el
   navegador donde se creó la reserva. Sirve para demo / proyecto académico.
   Para producción, reemplaza las funciones load() y save() por llamadas a un
   backend (Firebase, Supabase, una API propia, etc.). El resto no cambia.
   ========================================================================== */
const ReservasStore = (() => {
    const STORAGE_KEY = 'sb_reservas_v1';

    // ---------------- Configuración del restaurante ----------------
    const CONFIG = {
        openHour: '12:00',          // apertura
        closeHour: '23:00',         // cierre
        slotMinutes: 30,            // cada cuánto hay un turno
        durationMinutes: 90,        // cuánto ocupa una mesa una reserva
        minAdvanceMinutes: 60,      // anticipación mínima para reservar hoy
        maxDaysAhead: 60,           // hasta cuántos días adelante se puede reservar
        maxGuestsOnline: 12,        // grupos más grandes -> contacto directo
        toleranceMinutes: 15,
        whatsappPhone: '51999999999', // Reemplazar con el número real del restaurante
        closedWeekdays: [],         // ej. [1] = cerrado los lunes (0 = domingo)
        zones: {
            'Salón Principal':   { label: 'Salón Principal', capacity: 60 },
            'Terraza Exclusiva': { label: 'Terraza Exclusiva', capacity: 30 },
            'Barra & Lounge':    { label: 'Barra & Lounge', capacity: 12, maxGuests: 4 },
            'Área Privada':      { label: 'Espacio Privado VIP', capacity: 20, minGuests: 6 }
        }
    };

    const STATUS = {
        pendiente:  'Pendiente',
        confirmada: 'Confirmada',
        sentada:    'En mesa',
        completada: 'Completada',
        noshow:     'No asistió',
        cancelada:  'Cancelada'
    };

    // Estados que ocupan mesa (cuentan para la disponibilidad)
    const ACTIVE = ['pendiente', 'confirmada', 'sentada'];

    // ---------------- Utilidades de fecha/hora ----------------
    const pad = n => String(n).padStart(2, '0');
    const toMinutes = hhmm => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
    const fromMinutes = min => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
    const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
    const addDaysISO = (iso, days) => {
        const [y, m, d] = iso.split('-').map(Number);
        const dt = new Date(y, m - 1, d + days);
        return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
    };
    const parseISO = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };

    function formatDate(iso, opts = { weekday: 'long', day: 'numeric', month: 'long' }) {
        if (!iso) return '';
        const txt = parseISO(iso).toLocaleDateString('es-PE', opts);
        return txt.charAt(0).toUpperCase() + txt.slice(1);
    }

    function formatTime(hhmm) {
        if (!hhmm) return '';
        let [h, m] = hhmm.split(':').map(Number);
        const suffix = h >= 12 ? 'PM' : 'AM';
        h = h % 12 || 12;
        return `${h}:${pad(m)} ${suffix}`;
    }

    // ---------------- Persistencia ----------------
    function load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            const list = raw ? JSON.parse(raw) : [];
            return Array.isArray(list) ? list : [];
        } catch (e) {
            return [];
        }
    }

    function save(list) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
            return true;
        } catch (e) {
            return false;
        }
    }

    function generateCode(existing) {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O/1/I para evitar confusiones
        let code;
        do {
            code = 'SB-';
            for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
        } while (existing.some(r => r.code === code));
        return code;
    }

    const normalizePhone = p => String(p || '').replace(/\D/g, '');

    // ---------------- Turnos y disponibilidad ----------------
    function allSlots() {
        const slots = [];
        const last = toMinutes(CONFIG.closeHour) - CONFIG.durationMinutes;
        for (let t = toMinutes(CONFIG.openHour); t <= last; t += CONFIG.slotMinutes) {
            slots.push(fromMinutes(t));
        }
        return slots;
    }

    function isClosedDay(dateISO) {
        return CONFIG.closedWeekdays.includes(parseISO(dateISO).getDay());
    }

    // Comensales que ya ocupan la zona en ese turno (reservas que se solapan)
    function occupiedSeats(dateISO, time, zone, ignoreId = null, list = load()) {
        const start = toMinutes(time);
        const end = start + CONFIG.durationMinutes;
        return list
            .filter(r => r.id !== ignoreId && r.date === dateISO && r.zone === zone && ACTIVE.includes(r.status))
            .filter(r => {
                const rs = toMinutes(r.time);
                const re = rs + CONFIG.durationMinutes;
                return rs < end && start < re;
            })
            .reduce((sum, r) => sum + Number(r.guests), 0);
    }

    /**
     * Devuelve los turnos del día con su estado:
     * { time, available, reason, remaining }
     */
    function getSlots(dateISO, guests, zone, { ignoreId = null, ignoreAdvance = false } = {}) {
        const zoneCfg = CONFIG.zones[zone];
        const list = load();
        const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
        const isToday = dateISO === todayISO();

        return allSlots().map(time => {
            const remaining = zoneCfg ? zoneCfg.capacity - occupiedSeats(dateISO, time, zone, ignoreId, list) : 0;
            let available = true;
            let reason = '';
            if (!ignoreAdvance && isToday && toMinutes(time) < nowMin + CONFIG.minAdvanceMinutes) {
                available = false; reason = 'pasado';
            } else if (guests && remaining < Number(guests)) {
                available = false; reason = 'lleno';
            }
            return { time, available, reason, remaining };
        });
    }

    // ---------------- Validación ----------------
    function validate(data, { ignoreId = null, staff = false } = {}) {
        const errors = {};
        const guests = Number(data.guests);
        const zoneCfg = CONFIG.zones[data.zone];

        if (!data.name || data.name.trim().length < 3) errors.name = 'Ingresa tu nombre completo.';
        const phone = normalizePhone(data.phone);
        if (phone.length < 9 || phone.length > 12) errors.phone = 'Ingresa un teléfono válido (9 dígitos).';
        if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errors.email = 'El correo no parece válido.';

        if (!guests || guests < 1) errors.guests = 'Selecciona el número de personas.';
        else if (!staff && guests > CONFIG.maxGuestsOnline) errors.guests = `Para más de ${CONFIG.maxGuestsOnline} personas contáctanos por WhatsApp.`;

        if (!zoneCfg) errors.zone = 'Selecciona una zona.';
        else if (guests) {
            if (zoneCfg.minGuests && guests < zoneCfg.minGuests) errors.zone = `${zoneCfg.label} requiere mínimo ${zoneCfg.minGuests} personas.`;
            if (zoneCfg.maxGuests && guests > zoneCfg.maxGuests) errors.zone = `${zoneCfg.label} admite máximo ${zoneCfg.maxGuests} personas.`;
        }

        const today = todayISO();
        if (!data.date) errors.date = 'Selecciona una fecha.';
        else if (!staff && data.date < today) errors.date = 'La fecha ya pasó.';
        else if (!staff && data.date > addDaysISO(today, CONFIG.maxDaysAhead)) errors.date = `Solo aceptamos reservas hasta ${CONFIG.maxDaysAhead} días de anticipación.`;
        else if (isClosedDay(data.date)) errors.date = 'Ese día el restaurante está cerrado.';

        if (!data.time) errors.time = 'Elige un horario.';
        else if (data.date && !errors.date && !errors.zone && !errors.guests) {
            const slot = getSlots(data.date, guests, data.zone, { ignoreId, ignoreAdvance: staff }).find(s => s.time === data.time);
            if (!slot) errors.time = 'Horario fuera de atención.';
            else if (!slot.available) errors.time = slot.reason === 'pasado'
                ? 'Ese horario ya no está disponible.'
                : 'Ya no hay mesas para ese horario. Elige otro.';
        }

        return errors;
    }

    // ---------------- CRUD ----------------
    function create(data, { staff = false } = {}) {
        const errors = validate(data, { staff });
        if (Object.keys(errors).length) return { ok: false, errors };

        const list = load();
        const now = new Date().toISOString();
        const reserva = {
            id: (crypto.randomUUID && crypto.randomUUID()) || String(Date.now() + Math.random()),
            code: generateCode(list),
            name: data.name.trim(),
            phone: normalizePhone(data.phone),
            email: (data.email || '').trim(),
            date: data.date,
            time: data.time,
            guests: Number(data.guests),
            zone: data.zone,
            occasion: data.occasion || 'Cena Casual',
            message: (data.message || '').trim(),
            status: staff ? 'confirmada' : 'pendiente',
            source: staff ? 'staff' : 'web',
            createdAt: now,
            updatedAt: now,
            history: [{ at: now, status: staff ? 'confirmada' : 'pendiente', note: staff ? 'Creada por el personal' : 'Creada desde la web' }]
        };
        list.push(reserva);
        if (!save(list)) return { ok: false, errors: { general: 'No se pudo guardar la reserva en este navegador.' } };
        return { ok: true, reserva };
    }

    function update(id, changes, { staff = false } = {}) {
        const list = load();
        const idx = list.findIndex(r => r.id === id);
        if (idx === -1) return { ok: false, errors: { general: 'Reserva no encontrada.' } };

        const merged = { ...list[idx], ...changes };
        const scheduleChanged = ['date', 'time', 'zone', 'guests'].some(k => k in changes && String(changes[k]) !== String(list[idx][k]));
        if (scheduleChanged || 'name' in changes || 'phone' in changes) {
            const errors = validate(merged, { ignoreId: id, staff });
            if (Object.keys(errors).length) return { ok: false, errors };
        }

        merged.guests = Number(merged.guests);
        merged.phone = normalizePhone(merged.phone);
        merged.updatedAt = new Date().toISOString();
        list[idx] = merged;
        save(list);
        return { ok: true, reserva: merged };
    }

    function setStatus(id, status, note = '') {
        if (!STATUS[status]) return { ok: false };
        const list = load();
        const r = list.find(x => x.id === id);
        if (!r) return { ok: false };
        r.status = status;
        r.updatedAt = new Date().toISOString();
        r.history = r.history || [];
        r.history.push({ at: r.updatedAt, status, note });
        save(list);
        return { ok: true, reserva: r };
    }

    function remove(id) {
        save(load().filter(r => r.id !== id));
    }

    // Búsqueda pública: el cliente necesita código + teléfono (evita que cualquiera vea reservas ajenas)
    function findByCodeAndPhone(code, phone) {
        const c = String(code || '').trim().toUpperCase();
        const p = normalizePhone(phone);
        return load().find(r => r.code === c && (r.phone.endsWith(p.slice(-9)) && p.length >= 9)) || null;
    }

    function canCustomerModify(r) {
        if (!r || !ACTIVE.includes(r.status) || r.status === 'sentada') return false;
        const start = parseISO(r.date);
        const [h, m] = r.time.split(':').map(Number);
        start.setHours(h, m, 0, 0);
        return start.getTime() - Date.now() > 2 * 60 * 60 * 1000; // hasta 2 horas antes
    }

    // ---------------- Extras ----------------
    function whatsappLink(r, phone = CONFIG.whatsappPhone) {
        const msg =
            `*RESERVA ${r.code} - SABOR A BRASA*\n\n` +
            `• *Titular:* ${r.name}\n` +
            `• *Teléfono:* ${r.phone}\n` +
            `• *Mesa para:* ${r.guests} ${r.guests === 1 ? 'persona' : 'personas'}\n` +
            `• *Fecha:* ${formatDate(r.date)}\n` +
            `• *Hora:* ${formatTime(r.time)}\n` +
            `• *Zona:* ${r.zone}\n` +
            `• *Ocasión:* ${r.occasion}\n` +
            (r.message ? `• *Petición:* ${r.message}\n` : '') +
            `\n_Por favor, confirmar disponibilidad. Muchas gracias._`;
        return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
    }

    function icsFile(r) {
        const [y, mo, d] = r.date.split('-');
        const startMin = toMinutes(r.time);
        const endMin = startMin + CONFIG.durationMinutes;
        const dt = min => `${y}${mo}${d}T${pad(Math.floor(min / 60))}${pad(min % 60)}00`;
        const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        return [
            'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Sabor a Brasa//Reservas//ES', 'BEGIN:VEVENT',
            `UID:${r.id}@saborabrasa`, `DTSTAMP:${stamp}`,
            `DTSTART:${dt(startMin)}`, `DTEND:${dt(endMin)}`,
            `SUMMARY:Reserva Sabor a Brasa (${r.code})`,
            `DESCRIPTION:Mesa para ${r.guests} - ${r.zone}. Tolerancia de ${CONFIG.toleranceMinutes} minutos.`,
            'LOCATION:Av. Principal 123\\, Miraflores\\, Lima',
            'END:VEVENT', 'END:VCALENDAR'
        ].join('\r\n');
    }

    function toCSV(list) {
        const cols = ['code', 'date', 'time', 'name', 'phone', 'email', 'guests', 'zone', 'occasion', 'status', 'message', 'createdAt'];
        const head = ['Código', 'Fecha', 'Hora', 'Nombre', 'Teléfono', 'Correo', 'Personas', 'Zona', 'Ocasión', 'Estado', 'Nota', 'Creada'];
        const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const rows = list.map(r => cols.map(c => esc(c === 'status' ? STATUS[r.status] : r[c])).join(','));
        return '﻿' + [head.map(esc).join(','), ...rows].join('\n');
    }

    function download(filename, content, type) {
        const blob = new Blob([content], { type });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    }

    return {
        CONFIG, STATUS, ACTIVE,
        load, save, create, update, setStatus, remove,
        getSlots, allSlots, occupiedSeats, validate, isClosedDay,
        findByCodeAndPhone, canCustomerModify,
        whatsappLink, icsFile, toCSV, download,
        todayISO, addDaysISO, formatDate, formatTime, normalizePhone
    };
})();
