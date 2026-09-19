/**
 * Lógica Remota de Scraping BCV
 * Recibe el HTML crudo y el objeto de configuración.
 * Devuelve los valores procesados.
 */
(html, config) => {
    const r2 = (n) => Math.round(n * 100) / 100;
    const lineas = html.split('\n');

    // Limpieza de etiquetas y extracción de valores
    const usd = r2(parseFloat(lineas[config.LINEA_USD]?.replace(/<[^>]*>/g, '').trim().replace(/\./g, '').replace(',', '.')));
    const eur = r2(parseFloat(lineas[config.LINEA_EUR]?.replace(/<[^>]*>/g, '').trim().replace(/\./g, '').replace(',', '.')));

    if (usd && eur && usd > 1) {
        return {
            usd,
            eur,
            error: false
        };
    }

    return {
        usd: 0,
        eur: 0,
        error: true,
        msg: "No se detectaron valores válidos en las líneas configuradas."
    };
}
