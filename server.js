const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Estado en memoria
let latestValidCauciones = {};
let isMarketClosed = false;
let lastNotifiedCauciones = {};

// Configuraciones de entorno
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TELEGRAM_GROUP_LINK = process.env.TELEGRAM_GROUP_LINK || 'https://t.me/';
const UMBRAL_TNA = parseFloat(process.env.UMBRAL_TNA) || 24.0;
const MAX_DIAS = parseInt(process.env.MAX_DIAS) || 5;
const VARIACION_MINIMA = parseFloat(process.env.VARIACION_MINIMA) || 0.0;

// Enviar notificación a Telegram
async function notifyTelegram(message) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        console.log('Faltan credenciales de Telegram en .env. Mensaje no enviado.');
        return;
    }

    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    try {
        await axios.post(url, {
            chat_id: TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: 'Markdown'
        });
        console.log('Notificación de Telegram enviada con éxito.');
    } catch (error) {
        console.error('Error enviando notificación a Telegram:', error.message);
    }
}

// Scrapear Cauciones
async function scrapeCauciones() {
    try {
        const response = await axios.get('https://iol.invertironline.com/mercado/cotizaciones/argentina/cauciones/todas');
        const html = response.data;
        const $ = cheerio.load(html);

        let hasChangesAboveThreshold = false;
        let messageToSend = `📈 *Actualización de Cauciones (> ${UMBRAL_TNA}% TNA)*\n\n`;

        let firstTwoTnas = [];
        let anyFound = false;

        $('tbody tr').each((i, element) => {
            const cells = $(element).find('td');
            if (cells.length > 0) {
                const plazoStr = $(cells[0]).text().trim();
                const plazo = parseInt(plazoStr);
                const moneda = $(cells[1]).text().trim();
                const montoTomado = $(cells[2]).text().trim();
                const montoColocado = $(cells[3]).text().trim();
                const tnaStr = $(cells[5]).text().trim();
                const fecha = $(cells[6]).text().trim();

                if (!isNaN(plazo) && plazo <= MAX_DIAS && moneda === 'PESOS') {
                    anyFound = true;
                    // Extraer TNA como número (ej: "23,30 %" -> 23.30)
                    const tnaNumber = parseFloat(tnaStr.replace('%', '').replace(',', '.').trim());

                    if (firstTwoTnas.length < 2) {
                        firstTwoTnas.push(tnaNumber);
                    }

                    // Solo guardamos si tiene valor, o si es la primera vez que lo vemos (aunque sea 0)
                    if (tnaNumber > 0 || !latestValidCauciones[plazo]) {
                        latestValidCauciones[plazo] = {
                            plazo,
                            moneda,
                            montoTomado,
                            montoColocado,
                            tna: tnaStr,
                            tnaNumber,
                            fecha
                        };
                    }

                    // Lógica de Notificación (solo si el TNA es mayor a 0)
                    if (tnaNumber > 0) {
                        const previousTnaNumber = lastNotifiedCauciones[plazo];
                        
                        if (tnaNumber >= UMBRAL_TNA) {
                            if (previousTnaNumber === undefined) {
                                // Primera vez que supera el umbral
                                hasChangesAboveThreshold = true;
                                messageToSend += `🔹 *${plazo} Días*: ${tnaStr}\n`;
                                lastNotifiedCauciones[plazo] = tnaNumber;
                            } else if (tnaNumber !== previousTnaNumber) {
                                // Si cambió, verificamos si el cambio es mayor a la variación mínima
                                const diff = Math.abs(tnaNumber - previousTnaNumber);
                                if (diff >= VARIACION_MINIMA) {
                                    hasChangesAboveThreshold = true;
                                    const diffSign = tnaNumber > previousTnaNumber ? '+' : '';
                                    const diffVal = (tnaNumber - previousTnaNumber).toFixed(2);
                                    messageToSend += `🔹 *${plazo} Días*: ${tnaStr} (${diffSign}${diffVal}%)\n`;
                                    lastNotifiedCauciones[plazo] = tnaNumber;
                                }
                            }
                        } else {
                            // Si el TNA cayó por debajo del umbral, reseteamos el estado notificado
                            if (previousTnaNumber !== undefined) {
                               delete lastNotifiedCauciones[plazo];
                            }
                        }
                    }
                }
            }
        });

        // Actualizar estado de mercado cerrado (si los primeros 2 plazos dan 0, está cerrado)
        if (anyFound && firstTwoTnas.length > 0) {
            isMarketClosed = firstTwoTnas.every(tna => tna === 0);
        }

        console.log(`Scraping exitoso: Mercado cerrado: ${isMarketClosed}. Valores guardados.`);

        // Enviar notificación si hubo cambios significativos que superen el umbral
        if (hasChangesAboveThreshold) {
            await notifyTelegram(messageToSend);
        }

    } catch (error) {
        console.error('Error scrapeando cauciones:', error.message);
    }
}

// Endpoint para el Frontend
app.get('/api/cauciones', (req, res) => {
    // Ordenar los valores guardados
    const sortedCauciones = Object.values(latestValidCauciones).sort((a, b) => a.plazo - b.plazo);
    
    res.json({
        closed: isMarketClosed,
        cauciones: sortedCauciones
    });
});

// Endpoint para configuraciones públicas
app.get('/api/config', (req, res) => {
    res.json({
        telegramGroupLink: TELEGRAM_GROUP_LINK,
        umbralTNA: UMBRAL_TNA
    });
});

// Arrancar servidor y worker
app.listen(PORT, () => {
    console.log(`Servidor iniciado en http://localhost:${PORT}`);
    
    // Ejecutar scraping inicial
    scrapeCauciones();

    // Configurar intervalo (cada 60 segundos)
    setInterval(scrapeCauciones, 60000);
});
