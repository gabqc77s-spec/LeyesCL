
import { GoogleGenAI, Type } from "@google/genai";
import type { ResultItem, ChatMessage, AiPlanningResponse } from '../types.ts';
import { logger } from './loggerService.ts';

const API_KEY = process.env.API_KEY;
if (!API_KEY) throw new Error("API key for Gemini is not configured.");
const ai = new GoogleGenAI({ apiKey: API_KEY });

const FLASH_MODEL_NAME = 'gemini-flash-lite-latest';

/**
 * "Modelo Investigador" (Flash): Recibe órdenes y extrae fragmentos.
 */
export const extractRelevantSnippets = async (
  query: string,
  law: { id: string; fullText: string }
): Promise<string[]> => {
  const prompt = `
    Eres un asistente de investigación legal. Tu tarea es analizar el texto completo de una ley y extraer textualmente todos los fragmentos que sean relevantes para la consulta del usuario.

    CONSULTA DEL USUARIO: "${query}"
    TEXTO COMPLETO DE LA LEY (ID: ${law.id}):
    <document>${law.fullText}</document>

    INSTRUCCIONES:
    1. Lee la consulta y el texto.
    2. Extrae todos los párrafos o artículos que respondan directamente a la consulta.
    3. Si no encuentras nada relevante, devuelve un array vacío.
    4. Tu respuesta DEBE ser un array de strings en formato JSON. No incluyas nada más.

    JSON DE SALIDA: ["Fragmento 1...", "Fragmento 2..."]
  `;

  logger.debug(`[Gemini] Solicitando extracción de fragmentos para ley ${law.id}.`, { query });
  let responseText = '';
  try {
    const response = await ai.models.generateContent({
      model: FLASH_MODEL_NAME,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
    });
    
    responseText = response.text || '';
    if (!responseText) {
        logger.debug(`[Gemini] La extracción para ley ${law.id} no devolvió texto.`);
        return [];
    }
    
    const snippets = JSON.parse(responseText);
    logger.info(`[Gemini] Se extrajeron ${snippets.length} fragmentos para ley ${law.id}.`);
    return snippets;

  } catch (e) {
    logger.error(`[Gemini] Error al extraer fragmentos para la ley ${law.id}.`, { error: e, responseText: responseText.substring(0, 300) });

    // Intento de recuperación: A veces el modelo envuelve el JSON en markdown.
    if (responseText.includes('```json')) {
      const cleanedText = responseText.replace(/```json\n|```/g, '').trim();
      try {
        logger.debug("[Gemini] Intentando parsear JSON limpiado de markdown...");
        const snippets = JSON.parse(cleanedText);
        logger.info(`[Gemini] Recuperación exitosa. Se extrajeron ${snippets.length} fragmentos.`);
        return snippets;
      } catch (cleanError) {
        logger.error("[Gemini] Falló el intento de limpiar y parsear el JSON de la IA.");
        return [];
      }
    }
    return [];
  }
};

/**
 * "Modelo Director" (PRO): Analiza, planifica y decide el siguiente paso.
 */
export const analyzeAndPlanNextStep = async (
  messages: ChatMessage[],
  dossier: (ResultItem & { snippets: string[] })[],
  clarificationAttempt: number,
): Promise<AiPlanningResponse> => {
  const model = 'gemini-3-pro-preview';

  const conversationHistory = messages.map(msg => 
    `<turn role="${msg.role}">${msg.content}</turn>`
  ).join('\n');

  const dossierContext = dossier.length > 0
    ? `INFORMACIÓN RECOPILADA HASTA AHORA (DOSSIER):
      ${dossier.map(item => `
        <document id="${item.id}" title="${item.title}">
          ${item.snippets.map(s => `<snippet>${s}</snippet>`).join('\n')}
        </document>
      `).join('\n')}`
    : "El dossier está vacío. Aún no se ha realizado ninguna búsqueda.";

  const prompt = `
    Eres un Director de Investigación Legal experto en leyes chilenas. Tu objetivo es seguir un proceso cíclico para responder las consultas del usuario: proponer una búsqueda, analizar los resultados y decidir el siguiente paso.

    HISTORIAL DE CONVERSACIÓN:
    ${conversationHistory}

    ${dossierContext}

    PROCESO DE INVESTIGACIÓN (CICLO):
    1.  **Analizar**: Lee la conversación y el dossier.
    2.  **Planificar**: Decide la acción MÁS importante y ÚNICA a realizar a continuación.
        -   Si la consulta es ambigua, pide una clarificación (PLAN "CLARIFY").
        -   Si necesitas buscar información, propón UN SOLO término de búsqueda (PLAN "PROPOSE_PLAN").
        -   Si ya has buscado, pero necesitas más detalles, propón OTRO término de búsqueda (PLAN "SEARCH_MORE").
        -   Si ya tienes suficiente información, responde la pregunta (PLAN "RESPOND").
    3.  **Esperar**: Después de proponer un plan, el sistema esperará la confirmación del usuario para ejecutar la búsqueda.

    REGLAS:
    -   Siempre debes proponer UN SOLO plan de búsqueda a la vez.
    -   REGLA ANTI-BUCLE: Si el contador 'clarificationAttempt' es mayor a 1, tienes PROHIBIDO usar "CLARIFY". Debes hacer tu mejor suposición y proceder con "PROPOSE_PLAN".

    TU TAREA - Elige UNA de las siguientes cuatro acciones y formatea tu respuesta como un ÚNICO objeto JSON.

    // PLAN 1: "CLARIFY"
    { "plan": "CLARIFY", "clarificationQuestion": "¿Podrías especificar a qué te refieres con 'vehículos'?" }

    // PLAN 2: "PROPOSE_PLAN" - Para proponer la PRIMERA búsqueda.
    { "plan": "PROPOSE_PLAN", "searchQuery": "ley de matrimonio civil", "reasoning": "Para responder sobre el divorcio, primero debo buscar la ley de matrimonio civil." }

    // PLAN 3: "SEARCH_MORE" - Para proponer búsquedas ADICIONALES.
    { "plan": "SEARCH_MORE", "searchQuery": "acuerdo completo y suficiente", "reasoning": "La ley menciona 'acuerdo completo y suficiente'. Buscaré este término para obtener más detalles." }

    // PLAN 4: "RESPOND" - Para responder cuando tengas la información.
    {
      "plan": "RESPOND",
      "answer": "Basado en la investigación, los tipos de sociedad más adecuados son la SpA y la Ltda. En la SpA (ID_XXXX), el artículo Y permite explícitamente...",
      "references": [ { "id": "202865", "title": "LEY DE MATRIMONIO CIVIL", "fragment": "El divorcio será decretado por el juez..." } ]
    }
  `;
  
  logger.debug('[Gemini] Solicitando plan de acción a la IA.', {
    messageCount: messages.length,
    dossierSize: dossier.length,
    clarificationAttempt
  });

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: { 
        responseMimeType: "application/json"
      }
    });
    if (!response.text) {
        logger.error('[Gemini] La IA no generó un plan (respuesta vacía).');
        throw new Error("La IA no generó un plan.");
    }

    const parsedPlan: AiPlanningResponse = JSON.parse(response.text);
    logger.info('[Gemini] Plan de acción recibido y parseado.', { plan: parsedPlan.plan });

    if (parsedPlan.plan === 'RESPOND') {
      parsedPlan.references = parsedPlan.references.map(ref => {
        const originalItem = dossier.find(item => item.id === ref.id);
        return originalItem ? {
          ...ref,
          lawNumber: originalItem.lawNumber,
          publicationDate: originalItem.publicationDate,
          effectiveDate: originalItem.effectiveDate,
          link: originalItem.link,
          sourceQueries: originalItem.sourceQueries,
        } : ref;
      });
    }

    return parsedPlan;
  } catch (e) {
    logger.error("[Gemini] Error al analizar y planificar.", { error: e });
    throw new Error("La IA no pudo decidir el siguiente paso.");
  }
};
