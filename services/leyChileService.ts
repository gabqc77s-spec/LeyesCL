import type { FetchedItem } from '../types.ts';
import { logger } from './loggerService.ts';

const LEYCHILE_BASE_URL = 'https://www.leychile.cl/Consulta/obtxml';

/**
 * Helper para extraer texto de un string XML usando regex.
 * @param xmlString El string XML donde buscar.
 * @param regex La expresión regular para encontrar el valor. Debe tener un grupo de captura.
 * @returns El valor encontrado o undefined.
 */
const findValueByRegex = (xmlString: string, regex: RegExp): string | undefined => {
    const match = xmlString.match(regex);
    // Decodifica entidades HTML básicas que podrían estar en el texto.
    if (match && match[1]) {
        return match[1]
            .trim()
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&nbsp;/g, ' ');
    }
    return undefined;
};

/**
 * Intenta encontrar el ID de la norma en el bloque de texto XML.
 */
const findId = (normaBlock: string): string => {
  return (
    findValueByRegex(normaBlock, /<IdNorma>([\s\S]*?)<\/IdNorma>/) ||
    findValueByRegex(normaBlock, /<Norma\s+id="([^"]+)"/) ||
    'Desconocido'
  );
};

/**
 * Intenta encontrar el número de la ley.
 */
const findLawNumber = (normaBlock: string): string | undefined => {
  return (
    findValueByRegex(normaBlock, /<Numero>([\s\S]*?)<\/Numero>/) ||
    findValueByRegex(normaBlock, /<Identificador\s+tipo="Número Ley">([\s\S]*?)<\/Identificador>/)
  );
};

/**
 * Intenta encontrar el título de la norma.
 */
const findTitle = (normaBlock: string): string => {
  return (
    findValueByRegex(normaBlock, /<TituloNorma>([\s\S]*?)<\/TituloNorma>/) ||
    findValueByRegex(normaBlock, /<Metadatos>[\s\S]*?<Norma>[\s\S]*?<Titulo>([\s\S]*?)<\/Titulo>[\s\S]*?<\/Norma>[\s\S]*?<\/Metadatos>/) ||
    'Título no encontrado'
  );
};

/**
 * Busca una fecha asociada a una palabra clave (ej. "Publicación", "Vigencia").
 * Esta implementación es más simple y depende de etiquetas XML estructuradas.
 */
const findDate = (normaBlock: string, keyword: string): string => {
    const dateRegex = /(\d{2}-\w{3}-\d{4})/i;

    const tagMap: { [key: string]: RegExp[] } = {
        'Publicación': [/<FechaPublicacion>([\s\S]*?)<\/FechaPublicacion>/],
        'Vigencia|Inicio': [/<InicioVigencia>([\s\S]*?)<\/InicioVigencia>/, /<FechaVigencia>([\s\S]*?)<\/FechaVigencia>/],
    };

    const regexes = tagMap[keyword];
    if (regexes) {
        for (const regex of regexes) {
            const content = findValueByRegex(normaBlock, regex);
            if (content) {
                const match = content.match(dateRegex);
                if (match) return match[0];
            }
        }
    }
    
    return 'No informado';
}

/**
 * Busca en la lista de normas candidatas.
 * Esta función utiliza 'fetch' y parsea el XML con expresiones regulares para evitar el uso del DOM.
 */
export const fetchLawCandidates = async (searchString: string): Promise<FetchedItem[]> => {
  const url = `${LEYCHILE_BASE_URL}?opt=61&cadena=${searchString}&cantidad=8`;
  logger.debug(`[LeyChile] Construida URL para candidatos: ${url}`);

  try {
    const response = await fetch(url);
    if (!response.ok) {
        logger.error(`[LeyChile] La solicitud de candidatos falló.`, { url, status: response.status });
        throw new Error(`La solicitud directa falló con estado: ${response.status}`);
    }
    
    const xmlText = await response.text();
    logger.debug(`[LeyChile] XML recibido para candidatos.`, { length: xmlText.length });
    
    // Verificación básica de error sin parsear el DOM
    if (!xmlText.trim().startsWith('<') || (!xmlText.includes('<Norma') && !xmlText.includes('<Listado'))) {
        logger.error("[LeyChile] La respuesta no parece ser un XML válido de normas.", { receivedText: xmlText.substring(0, 500) });
        if (xmlText.length < 200 && xmlText.toLowerCase().includes('error')) {
          throw new Error(`El servidor de LeyChile devolvió un error: ${xmlText}`);
        }
        return []; // Puede ser una respuesta vacía válida.
    }
    
    const normaBlocks = xmlText.match(/<Norma[\s\S]*?<\/Norma>/g) || [];

    const results: FetchedItem[] = normaBlocks.map(block => {
        const id = findId(block);
        const title = findTitle(block);
        const publicationDate = findDate(block, 'Publicación');
        const effectiveDate = findDate(block, 'Vigencia|Inicio');
        const lawNumber = findLawNumber(block);
        const link = `https://www.leychile.cl/navegar?idNorma=${id}`;
        
        return { id, title, publicationDate, effectiveDate, link, lawNumber };
    });

    logger.info(`[LeyChile] Se procesaron ${results.length} candidatos de la búsqueda.`);
    return results;

  } catch (error) {
    logger.error(`[LeyChile] Falló el fetch de candidatos.`, { url, error });
    if(error instanceof Error && error.message.toLowerCase().includes('failed to fetch')){
        throw new Error("No se pudo conectar con el servicio de LeyChile. Revisa tu conexión de red o posibles bloqueos de CORS.");
    }
    throw error;
  }
};

/**
 * Obtiene el texto completo de una norma por su ID.
 * Utiliza 'fetch' y parsea el XML con expresiones regulares para evitar el uso del DOM.
 */
export const fetchFullLawText = async (idNorma: string): Promise<string> => {
    if (!idNorma || idNorma === 'Desconocido') return '';
    
    const url = `${LEYCHILE_BASE_URL}?opt=7&idNorma=${idNorma}`;
    logger.debug(`[LeyChile] Intentando obtener texto completo desde: ${url}`);
    
    try {
        const response = await fetch(url);
        if (!response.ok) {
            logger.error(`[LeyChile] Falló la solicitud para texto completo de norma ${idNorma}.`, { status: response.status });
            throw new Error(`La solicitud para el texto completo de la norma ${idNorma} falló. Estado: ${response.status}`);
        }

        const responseText = await response.text();
        logger.debug(`[LeyChile] Texto recibido para norma ${idNorma}`, { length: responseText.length });

        // Se busca el contenido de la ley dentro del XML.
        const content = findValueByRegex(responseText, /<(?:Texto|Contenido)>([\s\S]*?)<\/(?:Texto|Contenido)>/);
        
        if (!content) {
            // FIX: The 'warn' method does not exist on LoggerService. Replaced with 'info'.
            logger.info(`[LeyChile] El XML para la norma ${idNorma} no contenía la etiqueta <Texto> o <Contenido>.`);
            // Como fallback, se intenta devolver el texto principal del documento si no se encuentra la etiqueta específica.
            const fallbackContent = responseText
                .replace(/<[^>]+(>|$)/g, " ") // Elimina todas las etiquetas
                .replace(/\s{2,}/g, ' ')       // Compacta espacios en blanco
                .trim();
            if (fallbackContent.length > 100) { // Un umbral para evitar devolver mensajes de error cortos
                 logger.info(`[LeyChile] Usando contenido de fallback para norma ${idNorma}.`);
                 return fallbackContent;
            }
            return ""; // No se encontró contenido relevante
        }
        
        // El contenido puede tener sus propias etiquetas HTML/XML, las eliminamos para obtener texto plano.
        const plainText = content.replace(/<[^>]+(>|$)/g, " ").replace(/\s{2,}/g, ' ').trim();
        
        logger.info(`[LeyChile] Texto completo extraído para norma ${idNorma}.`);
        return plainText;

    } catch (error) {
        logger.error(`[LeyChile] Falló el fetch para texto completo.`, { url, error });
        throw error;
    }
};