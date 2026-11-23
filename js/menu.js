/* Sabor a Brasa - Carta tipo revista */
(() => {
    document.documentElement.classList.add('js');
    const container = document.querySelector('.magazine-container');
    const slides = [...document.querySelectorAll('.menu-slide')];
    const pills = [...document.querySelectorAll('.cat-pill')];
    const nav = document.querySelector('.magazine-nav');
    if (!container || !slides.length) return;

    let current = 0;

    // Índice de inicio de cada categoría (según el slide al que apunta cada pill)
    const pillStarts = pills.map(p => slides.findIndex(s => s.id === p.dataset.target));
    const ctaIndex = slides.findIndex(s => s.classList.contains('cta-slide'));

    // ---- Dots generados automáticamente (si agregas un plato, aparece solo) ----
    const dots = slides.map((slide, i) => {
        const title = slide.querySelector('.slide-title');
        const label = title ? title.innerText.replace(/\s+/g, ' ').trim() : `Sección ${i + 1}`;
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'dot';
        dot.setAttribute('aria-label', label);
        dot.dataset.label = label;
        dot.addEventListener('click', () => goTo(i));
        nav.appendChild(dot);
        return dot;
    });

    function goTo(i) {
        const target = slides[Math.max(0, Math.min(slides.length - 1, i))];
        target.scrollIntoView({ behavior: 'smooth' });
    }

    function setActive(i) {
        current = i;
        slides.forEach((s, j) => s.classList.toggle('in-view', j === i));
        dots.forEach((d, j) => {
            d.classList.toggle('active', j === i);
            d.setAttribute('aria-current', j === i ? 'true' : 'false');
        });

        let activePill = -1;
        if (i !== ctaIndex) {
            pillStarts.forEach((start, p) => { if (start !== -1 && i >= start) activePill = p; });
        }
        pills.forEach((p, j) => {
            p.classList.toggle('active', j === activePill);
            if (j === activePill) p.setAttribute('aria-current', 'true');
            else p.removeAttribute('aria-current');
        });

        // En móvil, mantener visible la categoría activa en la barra
        if (activePill !== -1 && pills[activePill].scrollIntoView && window.innerWidth < 768) {
            pills[activePill].scrollIntoView({ block: 'nearest', inline: 'center' });
        }
    }

    // ---- Detecta el slide visible (más fiable que dividir por innerHeight) ----
    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) setActive(slides.indexOf(entry.target));
        });
    }, { root: container, threshold: 0.55 });
    slides.forEach(s => observer.observe(s));

    // ---- Pills de categoría ----
    pills.forEach(pill => {
        pill.addEventListener('click', () => {
            const target = document.getElementById(pill.dataset.target);
            if (target) target.scrollIntoView({ behavior: 'smooth' });
        });
    });

    // ---- Teclado: flechas, AvPág/RePág, Inicio/Fin ----
    document.addEventListener('keydown', e => {
        if (e.target.closest('input, textarea, select')) return;
        const keys = {
            ArrowDown: current + 1, PageDown: current + 1, ' ': current + 1,
            ArrowUp: current - 1, PageUp: current - 1,
            Home: 0, End: slides.length - 1
        };
        if (e.key in keys) {
            if (e.key === ' ' && e.target.closest('button, a')) return;
            e.preventDefault();
            goTo(keys[e.key]);
        }
    });

    const backTop = document.getElementById('back-to-top');
    if (backTop) backTop.addEventListener('click', () => goTo(0));

    // Si se entra con un #hash (ej. menu.html#bife), ir directo a ese plato
    if (location.hash) {
        const target = document.querySelector(location.hash);
        if (target && slides.includes(target)) target.scrollIntoView();
    }

    // Imágenes que no cargan: mostrar un fondo elegante en vez de un ícono roto
    document.querySelectorAll('.slide-image img').forEach(img => {
        img.addEventListener('error', () => img.closest('.slide-image').classList.add('img-fallback'));
    });

    setActive(0);
})();
