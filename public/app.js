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

    let historyChartInstance = null;
    let cachedHistoryData = null;
    let currentFilter = 'short';

    async function fetchHistory() {
        try {
            const response = await fetch('/api/history');
            if (!response.ok) throw new Error('Error en la respuesta de la API de historial');
            cachedHistoryData = await response.json();
            renderChart(cachedHistoryData);
        } catch (error) {
            console.error('Error obteniendo historial:', error);
        }
    }

    // Manejo de filtros
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Actualizar UI de botones
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Actualizar filtro y redibujar
            currentFilter = btn.getAttribute('data-filter');
            if (cachedHistoryData) {
                renderChart(cachedHistoryData);
            }
        });
    });

    function renderChart(data) {
        if (!data || data.length === 0) return;
        
        const chartContainer = document.getElementById('chart-container');
        if (chartContainer) chartContainer.classList.remove('hidden');

        // Group data by plazo
        let plazos = [...new Set(data.map(d => d.plazo))].sort((a, b) => a - b);
        
        // Aplicar filtro
        if (currentFilter === 'short') {
            plazos = plazos.filter(p => p <= 3);
        } else if (currentFilter === 'long') {
            plazos = plazos.filter(p => p > 3);
        }

        const fechas = [...new Set(data.map(d => d.fecha))];

        const datasets = plazos.map((plazo, index) => {
            const colors = [
                '#6366f1', // Indigo
                '#ec4899', // Pink
                '#10b981', // Emerald
                '#f59e0b', // Amber
                '#8b5cf6', // Violet
                '#3b82f6', // Blue
                '#ef4444', // Red
                '#06b6d4', // Cyan
                '#f97316', // Orange
                '#a855f7'  // Purple
            ];
            const color = colors[index % colors.length];

            const dataPoints = fechas.map(fecha => {
                const record = data.find(d => d.fecha === fecha && d.plazo === plazo);
                return record ? { tna: record.tna, hora: record.hora_max } : null;
            });

            return {
                label: `${plazo} Días`,
                data: dataPoints.map(p => p ? p.tna : null),
                horaMax: dataPoints.map(p => p ? p.hora : null),
                borderColor: color,
                backgroundColor: color,
                borderWidth: 3,
                pointBackgroundColor: color,
                pointRadius: 4,
                pointHoverRadius: 6,
                tension: 0.3,
                fill: false,
                spanGaps: true
            };
        });

        const ctx = document.getElementById('historyChart').getContext('2d');
        
        if (historyChartInstance) {
            historyChartInstance.destroy();
        }

        historyChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: fechas.map(f => {
                    const parts = f.split('-');
                    return `${parts[2]}/${parts[1]}`;
                }),
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                color: '#e2e8f0',
                plugins: {
                    legend: {
                        labels: { color: '#e2e8f0' }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        titleColor: '#e2e8f0',
                        bodyColor: '#94a3b8',
                        borderColor: 'rgba(56, 189, 248, 0.3)',
                        borderWidth: 1,
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) label += ': ';
                                if (context.parsed.y !== null) label += context.parsed.y + '%';
                                
                                const hora = context.dataset.horaMax[context.dataIndex];
                                if (hora) label += ` (Pico: ${hora}hs)`;
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: '#94a3b8' }
                    },
                    y: {
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: '#94a3b8' },
                        title: {
                            display: true,
                            text: 'TNA (%)',
                            color: '#e2e8f0'
                        }
                    }
                }
            }
        });

        // Scroll al final para ver la fecha más reciente
        setTimeout(() => {
            const wrapper = document.querySelector('.chart-scroll-wrapper');
            if (wrapper) wrapper.scrollLeft = wrapper.scrollWidth;
        }, 300);
    }

    // Obtener datos al inicio
    fetchCauciones();
    fetchHistory();

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
    setInterval(() => {
        fetchCauciones();
        fetchHistory();
    }, 60000);
});
