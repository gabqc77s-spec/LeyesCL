
import React, { useState, useCallback, useRef } from 'react';
// FIX: Import `extractRelevantSnippets` to resolve the 'Cannot find name' error.
import { analyzeAndPlanNextStep, extractRelevantSnippets } from './services/geminiService.ts';
import { fetchLawCandidates, fetchFullLawText } from './services/leyChileService.ts';
import type { ResultItem, ChatMessage, AiPlanningResponse, AiReference, ProposePlan, SearchMorePlan } from './types.ts';
import { ChatInterface } from './components/ChatInterface.tsx';
import { logger } from './services/loggerService.ts';
import { LogViewer } from './components/LogViewer.tsx';

type DossierItem = ResultItem & { snippets: string[] };

const App: React.FC = () => {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: 'model', content: '¡Hola! Soy tu asistente legal de LeyChile. ¿Qué consulta tienes hoy?' }
  ]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const dossierRef = useRef<Map<string, DossierItem>>(new Map());
  const clarificationAttemptRef = useRef(0);
  const proposedPlanRef = useRef<ProposePlan | SearchMorePlan | null>(null);

  const executeSearch = async (searchQuery: string) => {
      logger.info('Iniciando ejecución de búsqueda.', { query: searchQuery });
      setIsLoading(true);

      const formattedQuery = searchQuery.trim().replace(/\s+/g, '+');
      logger.search(`Ejecutando búsqueda en LeyChile: "${searchQuery}"`);

      setChatMessages(prev => [
          ...prev, 
          { role: 'model', content: `Buscando "${searchQuery}"...`, isLoading: true }
      ]);
      
      const candidates = await fetchLawCandidates(formattedQuery);
      logger.info(`Búsqueda para "${searchQuery}" encontró ${candidates.length} candidatos.`);

      if (candidates.length === 0) {
          setChatMessages(prev => [
              ...prev,
              { role: 'model', content: `No encontré resultados para "${searchQuery}". Intentaré reformular la estrategia.` }
          ]);
          const nextPlan = await analyzeAndPlanNextStep(chatMessages, Array.from(dossierRef.current.values()), clarificationAttemptRef.current);
          handleAiPlan(nextPlan);
          return;
      }
      
      const newLaws = candidates.filter(c => c.id !== 'Desconocido' && !dossierRef.current.has(c.id));

      if (newLaws.length > 0) {
          setChatMessages(prev => [
              ...prev,
              { role: 'model', content: `Encontré ${newLaws.length} normativas nuevas. Analizando...`, isLoading: true }
          ]);

          for (const law of newLaws) {
              logger.info(`Analizando ley: "${law.title}" (ID: ${law.id})`);
              const fullText = await fetchFullLawText(law.id);
              const snippets = fullText ? await extractRelevantSnippets(chatMessages[0].content, { id: law.id, fullText }) : [];
              dossierRef.current.set(law.id, { ...law, sourceQueries: [searchQuery], snippets });
              logger.info(`Ley "${law.title}" añadida al dossier.`);
          }
      }

      logger.info('Análisis completado. Solicitando siguiente plan a la IA.');
      const finalPlan = await analyzeAndPlanNextStep(chatMessages, Array.from(dossierRef.current.values()), clarificationAttemptRef.current);
      handleAiPlan(finalPlan);
  };

  const handleUserConfirmation = async () => {
    if (proposedPlanRef.current) {
      const planToExecute = proposedPlanRef.current;
      proposedPlanRef.current = null;
      
      // Elimina el mensaje de confirmación
      setChatMessages(prev => prev.filter(m => !m.isAwaitingConfirmation));

      await executeSearch(planToExecute.searchQuery);
    }
  };

  const handleSendMessage = useCallback(async (newMessage: string) => {
    logger.info('Nuevo mensaje de usuario recibido.', { message: newMessage });
    setError(null);
    const lastMessage = chatMessages[chatMessages.length - 1];
    
    // Si el usuario confirma con "sí" o un mensaje similar
    if (lastMessage?.isAwaitingConfirmation && (newMessage.toLowerCase().startsWith('sí') || newMessage.toLowerCase().startsWith('si'))) {
        handleUserConfirmation();
        return;
    }

    const newMessages: ChatMessage[] = [...chatMessages.filter(m => !m.isAwaitingConfirmation), { role: 'user', content: newMessage }];
    setChatMessages(newMessages);
    setIsLoading(true);
    proposedPlanRef.current = null; // Cancela cualquier plan anterior

    try {
        const isClarificationResponse = lastMessage?.isClarificationRequest === true;

        if (isClarificationResponse) {
            logger.info('El mensaje del usuario es una respuesta a una clarificación.');
            clarificationAttemptRef.current++;
        } else {
            logger.info('Nueva consulta iniciada. Limpiando dossier y contadores.');
            dossierRef.current.clear();
            clarificationAttemptRef.current = 0;
        }
        
        logger.info('Solicitando plan a la IA.');
        const plan = await analyzeAndPlanNextStep(newMessages, Array.from(dossierRef.current.values()), clarificationAttemptRef.current);
        handleAiPlan(plan);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Ocurrió un error desconocido.';
      logger.error('Error en el manejador de mensajes.', { error: errorMessage });
      setError(errorMessage);
      setChatMessages(prev => [...prev, { role: 'model', content: `Lo siento, ocurrió un error: ${errorMessage}` }]);
    } finally {
      setIsLoading(false);
    }
  }, [chatMessages]);
  
  const handleAiPlan = (plan: AiPlanningResponse) => {
      logger.aiPlan('Plan recibido de la IA.', { plan });
      setIsLoading(false);

      switch (plan.plan) {
          case 'CLARIFY':
              setChatMessages(prev => [...prev, { role: 'model', content: plan.clarificationQuestion, isClarificationRequest: true }]);
              break;
          case 'PROPOSE_PLAN':
          case 'SEARCH_MORE':
              proposedPlanRef.current = plan;
              const message = `${plan.reasoning}\n\nPropongo buscar: **"${plan.searchQuery}"**. ¿Procedo?`;
              setChatMessages(prev => [...prev, { role: 'model', content: message, isAwaitingConfirmation: true }]);
              break;
          case 'RESPOND':
               const finalAnswer = plan.answer.length > 0 ? plan.answer : "He completado la búsqueda. Si necesitas algo más, no dudes en preguntar.";
               setChatMessages(prev => [...prev, { role: 'model', content: finalAnswer, references: plan.references }]);
               break;
      }
  }

  return (
    <div className="min-h-screen bg-gray-100 font-sans text-gray-800 flex flex-col">
      <header className="text-center py-6">
        <h1 className="text-4xl md:text-5xl font-bold text-gray-800 mb-2">
          Asistente Legal IA <span className="text-blue-600">LeyChile</span>
        </h1>
        <p className="text-lg text-gray-600">
          Inicia una conversación para obtener respuestas a tus consultas legales.
        </p>
      </header>
      
      <main className="flex-1 container mx-auto p-4 max-w-4xl flex flex-col">
          <ChatInterface 
            messages={chatMessages} 
            onSendMessage={handleSendMessage} 
            onConfirm={handleUserConfirmation}
            isLoading={isLoading}
            error={error}
          />
      </main>
      
      <LogViewer />

      <footer className="text-center py-4 text-sm text-gray-500">
        <p>Powered by Gemini API y la base de datos de LeyChile.</p>
        <p>Esta es una herramienta de demostración y no reemplaza la asesoría legal profesional.</p>
      </footer>
    </div>
  );
};

export default App;
