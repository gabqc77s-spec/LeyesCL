
import type { FetchedItem } from '../types.ts';

const LEYCHILE_BASE_URL = 'https://www.leychile.cl/Consulta/obtxml';

/**
 * Intenta encontrar el ID de la norma en el nodo.
 */
const findId = (node: Element): string => {
  const idNormaTag = node.querySelector('IdNorma');
  if (idNormaTag && idNormaTag.textContent) {
    return idNormaTag.textContent.trim();
  }
  return node.getAttribute('id') || 'Desconocido';
};

/**
 * Intenta encontrar el número de la ley.
 */
const findLawNumber = (node: Element): string | undefined => {
    const numeroTag = node.querySelector('Numero');
    if (numeroTag && numeroTag.textContent) {
        return numeroTag.textContent.trim();
    }
    const numeroLeyAttr = node.querySelector('Identificador[tipo="Número Ley"]');
    if(numeroLeyAttr && numeroLeyAttr.textContent){
        return numeroLeyAttr.textContent.trim();
    }
    return undefined;
}

/**
 * Intenta encontrar el título de la norma.
 */
const findTitle = (node: Element): string => {
  const tituloNormaTag = node.querySelector('TituloNorma');
  if (tituloNormaTag && tituloNormaTag.textContent) {
    return tituloNormaTag.textContent.trim();
  }
  const metaTituloTag = node.querySelector('Metadatos > Norma > Titulo');
   if (metaTituloTag && metaTituloTag.textContent) {
    return metaTituloTag.textContent.trim();
  }
  return 'Título no encontrado';
};

/**
 * Busca una fecha asociada a una palabra clave (ej. "Publicación", "Vigencia") de forma robusta.
 */
const findDate = (node: Element, keyword: string): string => {
    const dateRegex = /\d{2}-\w{3}-\d{4}/i; 

    const tagNames: { [key: string]: string[] } = {
        'Publicación': ['FechaPublicacion'],
        'Vigencia|Inicio': ['InicioVigencia', 'FechaVigencia'],
    };

    const possibleTags = tagNames[keyword];
    if (possibleTags) {
        for (const tagName of possibleTags) {
            const tag = node.querySelector(tagName);
            if (tag && tag.textContent) {
                const match = tag.textContent.trim().match(dateRegex);
                if (match) return match[0];
            }
        }
    }

    const keywordRegex = new RegExp(keyword, 'i');
    const allElements = Array.from(node.querySelectorAll('*'));

    for (const el of allElements) {
        if (el.children.length === 0 && el.textContent && keywordRegex.test(el.textContent)) {
            let match = el.textContent.match(dateRegex);
            if (match) return match[0];

            const nextEl = el.nextElementSibling;
            if (nextEl && nextEl.textContent) {
                match = nextEl.textContent.match(dateRegex);
                if (match) return match[0];
            }

            if (el.parentElement && el.parentElement.textContent) {
                match = el.parentElement.textContent.match(dateRegex);
                if (match) return match[0];
            }
        }
    }
    
    return 'No informado';
}

/**
 * Busca en la lista de normas candidatas.
 */
export const fetchLawCandidates = async (searchString: string): Promise<FetchedItem[]> => {
  // CORRECCIÓN CRÍTICA: Se elimina encodeURIComponent. La API de LeyChile espera '+' literal, no '%2B'.
  // La cadena 'searchString' ya viene formateada con '+' desde App.tsx.
  const url = `${LEYCHILE_BASE_URL}?opt=61&cadena=${searchString}&cantidad=8`;
  console.log(`[DEBUG] Construida URL de destino directa: ${url}`);

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`La solicitud directa a LeyChile falló con estado: ${response.status}`);
    
    const xmlText = await response.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "application/xml");

    if (xmlDoc.querySelector('parsererror')) throw new Error("La respuesta de LeyChile no es un XML válido.");
    
    const rootNode = xmlDoc.documentElement;
    // Si la respuesta es una etiqueta <Normas fechaGeneracion="..."/> vacía, no tiene hijos.
    if (!rootNode.hasChildNodes() && rootNode.tagName === 'Normas') {
      return []; // Devuelve un array vacío si no hay resultados.
    }

    const items = xmlDoc.getElementsByTagName('Norma').length > 0
      ? xmlDoc.getElementsByTagName('Norma')
      : rootNode.children;

    const results: FetchedItem[] = Array.from(items).map(node => {
        const id = findId(node);
        const title = findTitle(node);
        const publicationDate = findDate(node, 'Publicación');
        const effectiveDate = findDate(node, 'Vigencia|Inicio');
        const lawNumber = findLawNumber(node);
        const link = `https://www.leychile.cl/navegar?idNorma=${id}`;
        
        return { id, title, publicationDate, effectiveDate, link, lawNumber };
    });

    return results;

  } catch (error) {
    console.error(`[DEBUG] Falló el fetch para la URL directa: ${url}`, error);
    if(error instanceof Error && error.message.toLowerCase().includes('failed to fetch')){
        throw new Error("No se pudo conectar con el servicio de LeyChile. Esto puede deberse a un problema de red o a una restricción de seguridad CORS impuesta por el servidor de destino. Revisa la consola del navegador para más detalles.");
    }
    throw error;
  }
};

/**
 * Obtiene el texto completo de una norma por su ID.
 */
export const fetchFullLawText = async (idNorma: string): Promise<string> => {
    if (!idNorma || idNorma === 'Desconocido') return '';
    const url = `${LEYCHILE_BASE_URL}?opt=7&idNorma=${idNorma}`;
    console.log(`[DEBUG] Construida URL directa para texto completo: ${url}`);
    
    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.warn(`No se pudo obtener el texto completo para la norma ${idNorma}. Estado: ${response.status}`);
            return '';
        }
        return await response.text();
    } catch (error) {
        console.error(`[DEBUG] Falló el fetch para la URL directa: ${url}`, error);
        return '';
    }
};
