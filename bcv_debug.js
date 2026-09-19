/**
 * Motor de Debug Remoto
 * Formatea el HTML para facilitar la identificación de líneas.
 */
(html) => {
    return html.split('\n')
        .map((line, index) => `[${index}] ${line.trim()}`)
        .join('\n');
}
