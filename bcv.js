const fs = require('fs');
const path = require('path');
const axios = require('axios');
const https = require('https');
const chalk = require('chalk');

// ==========================================
// CONFIGURACIÓN DEL CARGADOR REMOTO
// ==========================================
const GITHUB_BASE = 'https://raw.githubusercontent.com/xUsoCarrusoX3/bcv/main/';
const CACHE_DIR = path.join(__dirname, 'github_cache');
const BCV_FILE = path.join(__dirname, 'bcv.json');
const HISTORIAL_FILE = path.join(__dirname, 'bcv_historial.json');

const FILES = {
    config: 'config.json',
    logic: 'bcv_logic.js',
    debug: 'bcv_debug.js',
    binance: 'binance_logic.js'
};

// Variables de estado
let remoteData = { config: null, logic: null, debug: null, binance: null };
let lastSyncTime = Date.now();
const httpsAgent = new https.Agent({ rejectUnauthorized: false, keepAlive: true, timeout: 60000 });

// ==========================================
// MOTOR DE SINCRONIZACIÓN
// ==========================================

async function syncWithGithub() {
    console.log(chalk.cyan('🔄 Sincronizando lógica del BCV con GitHub...'));
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

    for (const [key, fileName] of Object.entries(FILES)) {
        const cachePath = path.join(CACHE_DIR, fileName);
        try {
            const response = await axios.get(GITHUB_BASE + fileName, { timeout: 10000 });
            let content = response.data;

            // Si es JSON, lo guardamos formateado, si no, como string
            const saveContent = typeof content === 'object' ? JSON.stringify(content, null, 2) : content;
            fs.writeFileSync(cachePath, saveContent);

            remoteData[key] = content;
            console.log(chalk.green(`  ✅ ${fileName} actualizado.`));
        } catch (e) {
            console.log(chalk.yellow(`  ⚠️ Falló descarga de ${fileName}. Usando cache local.`));
            if (fs.existsSync(cachePath)) {
                const cached = fs.readFileSync(cachePath, 'utf-8');
                remoteData[key] = fileName.endsWith('.json') ? JSON.parse(cached) : cached;
            }
        }
    }
}

// Ejecutor de funciones remotas (evaluación segura de funciones flecha)
function executeRemote(type, ...args) {
    if (!remoteData[type]) return null;
    try {
        // La lógica remota se espera que sea una función flecha (html, config) => { ... }
        const fn = eval(remoteData[type]);
        return fn(...args);
    } catch (e) {
        console.error(chalk.red(`❌ Error ejecutando ${type} remoto:`), e);
        return null;
    }
}

// ==========================================
// NÚCLEO DE DATOS
// ==========================================

const f = (n) => typeof n === 'number' ? n.toFixed(2).replace('.', ',') : n;
const r2 = (n) => Math.round(n * 100) / 100;

function leerDB() {
    if (!fs.existsSync(BCV_FILE)) {
        const init = {
            tasaActual: 0, tasaAnterior: 0,
            euroActual: 0, euroAnterior: 0,
            binanceActual: 0, binanceAnterior: 0,
            fechaActualizado: 'N/A', ultimaActualizacion: 'N/A', grupos: {}
        };
        fs.writeFileSync(BCV_FILE, JSON.stringify(init, null, 2));
        return init;
    }
    return JSON.parse(fs.readFileSync(BCV_FILE, 'utf-8'));
}

function guardarDB(db) {
    db.tasaActual = r2(db.tasaActual);
    db.euroActual = r2(db.euroActual);
    db.binanceActual = r2(db.binanceActual || 0);
    fs.writeFileSync(BCV_FILE, JSON.stringify(db, null, 2));
}

function gestionarHistorial(usd, eur) {
    let historial = [];
    if (fs.existsSync(HISTORIAL_FILE)) {
        try { historial = JSON.parse(fs.readFileSync(HISTORIAL_FILE, 'utf-8')); } catch (e) {}
    }
    historial.push({ usd: r2(usd), eur: r2(eur), fecha: new Date().toLocaleString('es-VE'), timestamp: Date.now() });
    if (historial.length > 30) historial.shift();
    fs.writeFileSync(HISTORIAL_FILE, JSON.stringify(historial, null, 2));
}

function calcularPrediccion() {
    if (!fs.existsSync(HISTORIAL_FILE)) return null;
    let data;
    try { data = JSON.parse(fs.readFileSync(HISTORIAL_FILE, 'utf-8')); } catch (e) { return null; }
    if (data.length < 3) return null;

    const preciosUSD = data.map(d => d.usd);
    const n = preciosUSD.length;
    const ultimaDif = preciosUSD[n - 1] - preciosUSD[n - 2];
    let sumaDiferencias = 0;
    for (let i = 1; i < n; i++) sumaDiferencias += (preciosUSD[i] - preciosUSD[i - 1]);
    const promedioDif = sumaDiferencias / (n - 1);
    const prediccionUSD = preciosUSD[n - 1] + ((promedioDif * 0.7) + (ultimaDif * 0.3));

    return { prediccionUSD, promedioUSD: preciosUSD.reduce((a, b) => a + b, 0) / n };
}

// ==========================================
// MONITOR (LOOP)
// ==========================================

let modoColapso = false;
let contadorEstabilidad = 0;
let tasaEnRevisionUSD = 0;
let tasaEnRevisionEUR = 0;
let contadorErroresFuente = 0;

const loopBCV = async () => {
    if (global.bcvLoopStarted) return;
    global.bcvLoopStarted = true;

    await syncWithGithub(); // Sincronización inicial
    lastSyncTime = Date.now();
    console.log(chalk.green('🚀 Monitor BCV & Binance (Híbrido) iniciado correctamente.'));

    while (true) {
        try {
            // Auto-sincronización cada 12 horas
            if (Date.now() - lastSyncTime > 12 * 60 * 60 * 1000) {
                await syncWithGithub();
                lastSyncTime = Date.now();
            }

            const config = remoteData.config;
            if (!config) {
                console.log(chalk.red('❌ Sin configuración. Reintentando sincronización...'));
                await syncWithGithub();
                await new Promise(r => setTimeout(r, 10000));
                continue;
            }

            // 1. OBTENER BCV
            const responseBCV = await axios.get(config.URL_BCV, {
                httpsAgent, 
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                timeout: 25000 
            });
            const resultBCV = executeRemote('logic', responseBCV.data, config);

            // 2. OBTENER BINANCE
            let resultBinance = null;
            try {
                const responseBinance = await axios.post(config.URL_BINANCE, config.BINANCE_PARAMS, { timeout: 15000 });
                resultBinance = executeRemote('binance', responseBinance.data, config);
            } catch (e) { console.log(chalk.yellow(`  ⚠️ Error consultando Binance P2P: ${e.message}`)); }

            let db = leerDB();
            let huboCambio = false;

            // Procesar BCV
            if (resultBCV && !resultBCV.error) {
                contadorErroresFuente = 0;
                const { usd: usdWeb, eur: eurWeb } = resultBCV;
                if (usdWeb !== r2(db.tasaActual) || eurWeb !== r2(db.euroActual)) {
                    db.tasaAnterior = db.tasaActual; db.euroAnterior = db.euroActual;
                    db.tasaActual = usdWeb; db.euroActual = eurWeb;
                    db.fechaActualizado = new Date().toLocaleString('es-VE');
                    gestionarHistorial(db.tasaActual, db.euroActual);
                    huboCambio = true;
                }
            }

            // Procesar Binance
            if (resultBinance && !resultBinance.error) {
                const binanceWeb = r2(resultBinance.price);
                if (binanceWeb !== r2(db.binanceActual)) {
                    db.binanceAnterior = db.binanceActual;
                    db.binanceActual = binanceWeb;
                    huboCambio = true;
                }
            }

            if (huboCambio) {
                guardarDB(db);
                if (global.conn) anunciarCambio(db);
            }
            
            let dbFinal = leerDB();
            dbFinal.ultimaActualizacion = new Date().toLocaleString('es-VE');
            guardarDB(dbFinal);

        } catch (e) { 
            console.log(chalk.red(`❌ Error en loop: ${e.message}`));
        }
        await new Promise(r => setTimeout(r, 20000));
    }
};

async function anunciarCambio(db) {
    const stats = calcularPrediccion();
    for (let id in db.grupos) {
        let msg = `📢 *¡Tasas Actualizadas!*\n\n`;
        msg += `💵 *BCV:* ${f(db.tasaAnterior)} ➡️ *${f(db.tasaActual)} Bs*\n`;
        msg += `🔶 *Binance:* ${f(db.binanceAnterior)} ➡️ *${f(db.binanceActual)} Bs*\n`;
        msg += `💶 *Euro:* ${f(db.euroAnterior)} ➡️ *${f(db.euroActual)} Bs*\n\n`;
        msg += `🕒 Fecha: ${db.fechaActualizado}`;
        if (stats) msg += `\n📊 *Predicción:* ~${f(stats.prediccionUSD)} Bs`;
        await global.conn.sendMessage(id, { text: msg }).catch(() => {});
    }
}

// ==========================================
// HANDLER DE COMANDOS
// ==========================================

let handler = {};
handler.run = async (m, conn) => {
    const { command, args, prefix, isGroup } = m;
    const chatId = m.groupLid || m.lid; 
    
    if (!global.bcvLoopStarted) loopBCV();
    let db = leerDB();

    const generarMensajeBCV = () => {
        const stats = calcularPrediccion();
        const dU = db.tasaActual > db.tasaAnterior ? '🔼' : (db.tasaActual < db.tasaAnterior ? '🔽' : '🔄');
        const dB = db.binanceActual > db.binanceAnterior ? '🔼' : (db.binanceActual < db.binanceAnterior ? '🔽' : '🔄');
        const dE = db.euroActual > db.euroAnterior ? '🔼' : (db.euroActual < db.euroAnterior ? '🔽' : '🔄');

        let txt = `📊 *MONITOR DE TASAS (VES)*\n\n`;
        txt += `💵 *BCV:* ${f(db.tasaActual)} Bs ${dU}\n`;
        txt += `🔶 *Binance:* ${f(db.binanceActual)} Bs ${dB}\n`;
        txt += `💶 *Euro:* ${f(db.euroActual)} Bs ${dE}\n\n`;

        if (stats) txt += `🔎 *Análisis BCV:*\n🔄 Promedio: ${f(stats.promedioUSD)} Bs\n📈 Predicción: ~${f(stats.prediccionUSD)} Bs\n\n`;
        txt += `🕒 *Fecha Valor:* ${db.fechaActualizado}\n🔗 *Última Revisión:* ${db.ultimaActualizacion}`;
        return txt;
    };

    switch (command) {
        case 'bcv':
            m.reply(generarMensajeBCV());
            break;

        case 'bcvhtml':
            try {
                const config = remoteData.config;
                const res = await axios.get(config.URL_BCV, { httpsAgent });
                // Usamos el motor de debug remoto
                const debugHtml = executeRemote('debug', res.data);
                const file = path.join(__dirname, 'bcv_debug.txt');
                fs.writeFileSync(file, debugHtml);
                await conn.sendMessage(m.lid, { document: fs.readFileSync(file), fileName: 'bcv_fuente.txt', mimetype: 'text/plain' });
                fs.unlinkSync(file);
            } catch (e) { m.reply('❌ Error al generar debug.'); }
            break;

        case 'setbcv':
            if (!isGroup) return;
            db.grupos[chatId] = { avisado: true };
            guardarDB(db);
            m.reply(`✅ Alertas activadas.\n\n${generarMensajeBCV()}`);
            break;

        case 'unsetbcv':
            delete db.grupos[chatId];
            guardarDB(db);
            m.reply('✅ Alertas desactivadas.');
            break;

        case 'dolarabcv':
        case 'binanceabcv':
        case 'euroabcv':
        case 'bcvadolar':
        case 'bcvabinance':
        case 'bcvaeuro':
            const monto = parseFloat(args[0]?.replace(',', '.'));
            if (isNaN(monto) || monto <= 0) return m.reply(`💡 Uso: *${prefix}${command} [cantidad]*`);
            let res, t, sym;
            if (command === 'dolarabcv') { res = monto * db.tasaActual; t = db.tasaActual; sym = 'Bs'; }
            if (command === 'binanceabcv') { res = monto * db.binanceActual; t = db.binanceActual; sym = 'Bs'; }
            if (command === 'euroabcv') { res = monto * db.euroActual; t = db.euroActual; sym = 'Bs'; }
            if (command === 'bcvadolar') { res = monto / db.tasaActual; t = db.tasaActual; sym = 'USD'; }
            if (command === 'bcvabinance') { res = monto / db.binanceActual; t = db.binanceActual; sym = 'USDT'; }
            if (command === 'bcvaeuro') { res = monto / db.euroActual; t = db.euroActual; sym = 'EUR'; }
            m.reply(`📊 *Conversión:*\n💰 Resultado: *${f(res)} ${sym}*\n📈 Tasa: *${f(t)} Bs*`);
            break;
    }
};

handler.command = ['bcv', 'setbcv', 'unsetbcv', 'dolarabcv', 'binanceabcv', 'euroabcv', 'bcvhtml', 'bcvadolar', 'bcvabinance', 'bcvaeuro'];
module.exports = handler;
