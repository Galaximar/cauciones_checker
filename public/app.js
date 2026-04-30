document.addEventListener('DOMContentLoaded', () => {
    const grid = document.getElementById('cauciones-grid');
    const loader = document.getElementById('loader');

    async function fetchCauciones() {
        try {
            const response = await fetch('/api/cauciones');
            if (!response.ok) throw new Error('Error en la respuesta de la API');
            
            const data = await response.json();
            renderCauciones(data);
        } catch (error) {
            console.error('Error obteniendo cauciones:', error);
        }
    }

    function renderCauciones(data) {
        // Lógica de banner de mercado cerrado
        const banner = document.getElementById('market-closed-banner');
        if (data.closed) {
            if (banner) banner.classList.remove('hidden');
        } else {
            if (banner) banner.classList.add('hidden');
        }

        const cauciones = data.cauciones || [];
        const caucionesFiltradas = cauciones.filter(c => c.tnaNumber > 0);

        if (caucionesFiltradas.length === 0) {
            loader.classList.add('hidden');
            grid.innerHTML = '<p style="text-align: center; color: var(--text-muted); width: 100%; grid-column: 1 / -1;">No hay operaciones activas en este momento.</p>';
            return;
        }

        loader.classList.add('hidden');
        grid.classList.remove('hidden');
        
        // Limpiamos el grid
        grid.innerHTML = '';

        caucionesFiltradas.forEach((caucion, index) => {
            const card = document.createElement('div');
            card.className = 'card';
            card.style.animationDelay = `${index * 0.1}s`;

            card.innerHTML = `
                <div class="card-header">
                    <div class="plazo">${caucion.plazo}<span>Días</span></div>
                    <div class="badge">${caucion.moneda}</div>
                </div>
                <div class="tna-container">
                    <div class="tna-label">TNA (Anual)</div>
                    <div class="tna-value">${caucion.tna}</div>
                </div>
                <div class="card-footer">
                    <div>Tomado: $${caucion.montoTomado.split(',')[0]}</div>
                    <div>Colocado: $${caucion.montoColocado.split(',')[0]}</div>
                </div>
            `;
            grid.appendChild(card);
        });

        // Actualizar fecha de última actualización
        const lastUpdateEl = document.getElementById('last-update');
        if (lastUpdateEl) {
            const now = new Date();
            lastUpdateEl.textContent = `Última actualización: ${now.toLocaleDateString()} a las ${now.toLocaleTimeString()}`;
        }
    }

    // Obtener datos al inicio
    fetchCauciones();

    // Obtener configuración (Link de Telegram)
    fetch('/api/config')
        .then(res => res.json())
        .then(config => {
            const btn = document.querySelector('.telegram-btn');
            if (btn && config.telegramGroupLink) {
                btn.href = config.telegramGroupLink;
            }
            
            const umbralText = document.getElementById('umbral-text');
            if (umbralText && config.umbralTNA) {
                umbralText.innerHTML = `
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                        <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z"/>
                    </svg>
                    Notificando al superar: ${config.umbralTNA}% TNA
                `;
            }
        })
        .catch(err => console.error('Error cargando config:', err));

    // Actualizar cada 60 segundos (60000 ms)
    setInterval(fetchCauciones, 60000);
});
