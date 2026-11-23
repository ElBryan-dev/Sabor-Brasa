# Sabor a Brasa

Sitio web de restaurante de pollo a la brasa con carta tipo revista y sistema de reservas.

## Páginas

| Archivo | Para quién | Qué hace |
|---|---|---|
| `index.html` | Clientes | Landing, reserva de mesa con horarios disponibles en tiempo real y sección **Mi Reserva** (consultar, cambiar horario o cancelar con código + celular). |
| `menu.html` | Clientes | Carta completa a pantalla completa por categorías. |
| `admin.html` | Personal | Panel de reservas: vista por día, ocupación por zona, confirmar / llegó / no vino / cancelar, crear reservas telefónicas, editar, exportar CSV. PIN de demo: `1234`. |

## Reglas de reserva

Se configuran en `js/reservas-store.js` (objeto `CONFIG`):

- Horario 12:00 – 23:00, turnos cada 30 min, cada reserva ocupa la mesa 90 min (último turno 21:30).
- Capacidad por zona (Salón 60, Terraza 30, Barra 12 con máx. 4 por grupo, VIP 20 con mín. 6).
- Hasta 12 personas en línea; grupos mayores van por WhatsApp.
- Reservas desde 1 hora antes y hasta 60 días adelante.
- El cliente puede cambiar o cancelar hasta 2 horas antes.

## Importante

Las reservas se guardan en `localStorage`, o sea **solo en el navegador donde se hicieron**. Para que el
panel vea las reservas de todos los clientes hay que conectar `load()` / `save()` de
`js/reservas-store.js` a un backend (Firebase, Supabase o una API propia). También hay que reemplazar
`whatsappPhone` por el número real del restaurante y el PIN de `js/admin.js` por un login real.

## Ejecutar

Es un sitio estático: abre `index.html` en el navegador o sírvelo con cualquier servidor, por ejemplo:

```bash
python3 -m http.server 8000
```
