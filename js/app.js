document.addEventListener('DOMContentLoaded', () => {
    // 1. Mobile Menu Toggle & Auto-close on link click
    const menuToggle = document.querySelector('.menu-toggle');
    const nav = document.querySelector('.nav');

    if (menuToggle && nav) {
        menuToggle.addEventListener('click', () => {
            nav.classList.toggle('active');
            menuToggle.classList.toggle('open');
        });

        // Close mobile menu when a navigation item is clicked
        const navLinks = nav.querySelectorAll('a');
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                nav.classList.remove('active');
                menuToggle.classList.remove('open');
            });
        });
    }

    // 3. Reservation Form & VIP Modal Handling
    const reservationForm = document.getElementById('reservation-form');
    const modalOverlay = document.getElementById('reservation-modal');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const modalAcceptBtn = document.getElementById('modal-accept-btn');
    const whatsappBtn = document.getElementById('modal-whatsapp-btn');

    function openModal() {
        if (!modalOverlay) return;
        modalOverlay.classList.add('active');
        modalOverlay.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        if (!modalOverlay) return;
        modalOverlay.classList.remove('active');
        modalOverlay.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    }

    if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);
    if (modalAcceptBtn) modalAcceptBtn.addEventListener('click', closeModal);
    
    if (modalOverlay) {
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) closeModal();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modalOverlay.classList.contains('active')) {
                closeModal();
            }
        });
    }

    if (reservationForm) {
        reservationForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const formData = new FormData(reservationForm);
            const data = Object.fromEntries(formData.entries());

            const submitBtn = reservationForm.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerText;
            
            submitBtn.innerText = 'Procesando Mesa...';
            submitBtn.disabled = true;

            setTimeout(() => {
                // Populate Modal Data
                const summaryName = document.getElementById('summary-name');
                const summaryGuests = document.getElementById('summary-guests');
                const summaryDatetime = document.getElementById('summary-datetime');
                const summaryZoneOccasion = document.getElementById('summary-zone-occasion');
                const summaryNotes = document.getElementById('summary-notes');
                const notesContainer = document.getElementById('summary-notes-container');

                if (summaryName) summaryName.textContent = data.name;
                
                // Format guest label
                const guestCount = data.guests;
                if (summaryGuests) {
                    summaryGuests.textContent = `Mesa para ${guestCount} ${guestCount === '1' ? 'Persona' : 'Personas'}`;
                }

                // Format date nicely
                if (summaryDatetime) {
                    let formattedDate = data.date;
                    try {
                        const dateParts = data.date.split('-');
                        if (dateParts.length === 3) {
                            const dateObj = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
                            formattedDate = dateObj.toLocaleDateString('es-PE', { 
                                weekday: 'short', 
                                day: 'numeric', 
                                month: 'short' 
                            });
                        }
                    } catch (err) {
                        formattedDate = data.date;
                    }
                    summaryDatetime.textContent = `${formattedDate} • ${data.time}`;
                }

                if (summaryZoneOccasion) {
                    summaryZoneOccasion.textContent = `${data.zone || 'Salón Principal'} • ${data.occasion || 'Cena Casual'}`;
                }

                if (notesContainer && summaryNotes) {
                    if (data.message && data.message.trim()) {
                        summaryNotes.textContent = data.message.trim();
                        notesContainer.style.display = 'block';
                    } else {
                        notesContainer.style.display = 'none';
                    }
                }

                // Prepare WhatsApp Hostess Link
                if (whatsappBtn) {
                    const phone = '51999999999'; // Reemplazar con el número del restaurante
                    const msg = encodeURIComponent(
                        `*SOLICITUD DE RESERVA - SABOR A BRASA*\n\n` +
                        `• *Titular:* ${data.name}\n` +
                        `• *Mesa para:* ${data.guests} personas\n` +
                        `• *Fecha:* ${data.date}\n` +
                        `• *Hora:* ${data.time}\n` +
                        `• *Zona:* ${data.zone || 'Salón Principal'}\n` +
                        `• *Ocasión:* ${data.occasion || 'Cena Casual'}\n` +
                        (data.message ? `• *Petición:* ${data.message}\n` : '') +
                        `\n_Por favor, confirmar disponibilidad. Muchas gracias._`
                    );
                    whatsappBtn.href = `https://wa.me/${phone}?text=${msg}`;
                }

                // Reset button state & show luxury modal
                submitBtn.innerText = originalText;
                submitBtn.disabled = false;
                reservationForm.reset();

                openModal();
            }, 600);
        });
    }

    // 4. Navbar background change on scroll
    window.addEventListener('scroll', () => {
        const header = document.querySelector('.header');
        if (window.scrollY > 50) {
            header.style.padding = '10px 0';
            header.style.backgroundColor = 'rgba(10, 10, 10, 0.98)';
        } else {
            header.style.padding = '15px 0';
            header.style.backgroundColor = 'rgba(26, 26, 26, 0.95)';
        }
    });
});