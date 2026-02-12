
import { GoogleGenAI, Type } from "@google/genai";
import type { ResultItem, ChatMessage, AiPlanningResponse } from '../types.ts';

const API_KEY = process.env.API_KEY;
if (!API_KEY) throw new Error("API key for Gemini is not configured.");
const ai = new GoogleGenAI({ apiKey: API_KEY });

const FLASH_MODEL_NAME = 'gemini-2.5-flash-lite';

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

  try {
    const response = await ai.models.generateContent({
      model: FLASH_MODEL_NAME,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
    });
    return response.text ? JSON.parse(response.text) : [];
  } catch (e) {
    console.error(`Error al extraer fragmentos para la ley ${law.id}:`, e);
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
    Eres un Director de Investigación Legal experto en leyes chilenas. Tu objetivo es orquestar un proceso de búsqueda SECUENCIAL y por etapas para responder a la consulta del usuario. Eres un colaborador: dialogas, propones un plan para CADA etapa, pides permiso y luego ejecutas.

    HISTORIAL DE CONVERSACIÓN:
    ${conversationHistory}

    ${dossierContext}

    PROCESO DE INVESTIGACIÓN SECUENCIAL OBLIGATORIO:
    Tu principal tarea es guiar al usuario a través de este proceso de 2 fases. No puedes saltarte fases.

    1.  **FASE DE DESCUBRIMIENTO (Dossier Vacío):** Si el dossier está vacío, tu ÚNICO objetivo es proponer un plan de búsqueda INICIAL y AMPLIO para identificar las leyes o conceptos clave relevantes. NO intentes responder la pregunta del usuario. Tu propuesta debe dejar claro que es un primer paso exploratorio. Usa el PLAN "PROPOSE_PLAN".

    2.  **FASE DE PROFUNDIZACIÓN (Dossier con Información):** Una vez que la Fase 1 ha encontrado documentos y están en el dossier, tu objetivo es proponer un plan para buscar DETALLES ESPECÍFICOS DENTRO de esos documentos o buscar leyes complementarias. Demuestra que has analizado el dossier. Usa el PLAN "PROPOSE_PLAN" o "SEARCH_MORE".

    3.  **FASE DE SÍNTESIS:** Solo cuando las fases anteriores hayan recopilado suficiente información, puedes usar el PLAN "RESPOND" para generar una respuesta final.

    REGLAS DE DECISIÓN ADICIONALES:
    -   Si la consulta del usuario es ambigua, puedes usar el PLAN "CLARIFY" antes de iniciar la Fase 1.
    -   REGLA ANTI-BUCLE: Si el contador 'clarificationAttempt' es mayor a 1, tienes PROHIBIDO usar "CLARIFY". Debes hacer tu mejor suposición y proceder con la Fase 1.


    TU TAREA - Elige UNA de las siguientes cuatro acciones y formatea tu respuesta como un ÚNICO objeto JSON, siguiendo estrictamente el proceso secuencial.

    // PLAN 1: "CLARIFY"
    { "plan": "CLARIFY", "clarificationQuestion": "¿Podrías especificar a qué te refieres con 'vehículos'?" }

    // PLAN 2: "PROPOSE_PLAN" - Para proponer el SIGUIENTE paso de la investigación.
    // Ejemplo para FASE DE DESCUBRIMIENTO (dossier vacío): La búsqueda es amplia.
    {
      "plan": "PROPOSE_PLAN",
      "proposal": "Entendido. Para comenzar, realizaré una búsqueda inicial y amplia para identificar las normativas chilenas que regulan la creación de sociedades comerciales y el concepto de 'aporte de capital'. ¿Te parece bien este primer paso?",
      "newSearchQueries": ["ley+general+sociedades+chile", "codigo+comercio+sociedades", "aporte+industrial+sociedades+chile"]
    }
    // Ejemplo para FASE DE PROFUNDIZACIÓN (dossier con información): La búsqueda es específica y se basa en hallazgos previos.
    {
      "plan": "PROPOSE_PLAN",
      "proposal": "He encontrado la Ley sobre Sociedades por Acciones (SpA) y el Código de Comercio. Ahora propongo investigar específicamente dentro de estas normas cómo se regula la situación de los socios que no aportan capital monetario y los requisitos para la constitución. ¿Procedemos con esta segunda fase?",
      "newSearchQueries": ["ley+spa+socios+aporte+trabajo", "codigo+comercio+sociedad+responsabilidad+limitada+capital"]
    }

    // PLAN 3: "SEARCH_MORE" - Para continuar la Fase de Profundización si la información es insuficiente.
    {
      "plan": "SEARCH_MORE",
      "newSearchQueries": ["ley+20659+empresa+en+un+dia+requisitos"],
      "reasoning": "El dossier actual menciona la 'Empresa en un Día', pero no detalla sus requisitos de constitución. Necesito buscar esa ley específica."
    }

    // PLAN 4: "RESPOND" - Para la Fase de Síntesis, una vez que la investigación está completa.
    {
      "plan": "RESPOND",
      "answer": "Basado en la investigación, los tipos de sociedad más adecuados son la SpA y la Ltda. En la SpA (ID_XXXX), el artículo Y permite explícitamente...",
      "references": [ { "id": "202865", "title": "LEY DE MATRIMONIO CIVIL", "fragment": "El divorcio será decretado por el juez..." } ]
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });
    if (!response.text) throw new Error("La IA no generó un plan.");

    const parsedPlan: AiPlanningResponse = JSON.parse(response.text);

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
    console.error("Error al analizar y planificar:", e);
    throw new Error("La IA no pudo decidir el siguiente paso.");
  }
};
