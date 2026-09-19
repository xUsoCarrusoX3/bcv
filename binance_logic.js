/**
 * Lógica Remota de Scraping Binance P2P
 * Recibe el JSON de respuesta de BAPI y el objeto de configuración.
 * Devuelve el precio más bajo detectado.
 */
(json, config) => {
    try {
        if (!json || !json.data || !Array.isArray(json.data) || json.data.length === 0) {
            return { price: 0, error: true, msg: "No se encontraron anuncios en Binance P2P." };
        }

        // Filtramos y obtenemos el precio más bajo del primer anuncio válido
        const firstAd = json.data[0];
        const price = parseFloat(firstAd.adv.price);

        if (price && price > 0) {
            return {
                price,
                user: firstAd.advertiser.nickName,
                error: false
            };
        }

        return { price: 0, error: true, msg: "Precio inválido detectado." };
    } catch (e) {
        return { price: 0, error: true, msg: "Error procesando JSON de Binance: " + e.message };
    }
}
