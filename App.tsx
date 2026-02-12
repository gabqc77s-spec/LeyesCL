
import React, { useState, useCallback, useRef } from 'react';
import { analyzeAndPlanNextStep, extractRelevantSnippets } from './services/geminiService.ts';
import { fetchLawCandidates, fetchFullLawText } from './services/leyChileService.ts';
import type { ResultItem, ChatMessage, AiPlanningResponse } from './types.ts';
import { ChatInterface } from './components/ChatInterface.tsx';

type DossierItem = ResultItem & { fullText: string; snippets: string[] };

const MAX_SEARCH_LOOPS = 2; // Prevenir bucles infinitos

const App: React.FC = () => {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: 'model', content: '¡Hola! Soy tu asistente legal de LeyChile. ¿Qué consulta tienes hoy?' }
  ]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const dossierRef = useRef<Map<string, DossierItem>>(new Map());
  const clarificationAttemptRef = useRef(0);
  const proposedPlanRef = useRef<string[] | null>(null);

  const executeSearchLoop = async (initialSearchQueries: string[], currentMessages: ChatMessage[]) => {
    let searchQueries = initialSearchQueries;
    let loops = 0;

    while (loops < MAX_SEARCH_LOOPS) {
        const uniqueCandidates = new Map<string, ResultItem>();
        for (const sq of searchQueries) {
          // FIX: Asegura que la cadena de búsqueda use '+' en lugar de espacios.
          const formattedQuery = sq.trim().replace(/\s+/g, '+');
          console.log(`[DEBUG] Formatted search query: "${formattedQuery}"`);
          const candidates = await fetchLawCandidates(formattedQuery);
          candidates.forEach(newItem => {
            if (newItem.id !== 'Desconocido' && !dossierRef.current.has(newItem.id)) {
              // Se guarda la consulta original (sq) para mantener el contexto para la IA.
              uniqueCandidates.set(newItem.id, { ...newItem, sourceQueries: [sq] });
            }
          });
        }
        
        const newLawsToProcess = Array.from(uniqueCandidates.values());
        for (const law of newLawsToProcess) {
          const fullText = await fetchFullLawText(law.id);
          if (fullText) {
            const snippets = await extractRelevantSnippets(currentMessages[currentMessages.length - 1]!.content, { id: law.id, fullText });
            dossierRef.current.set(law.id, { ...law, fullText, snippets });
          }
        }
        
        const plan = await analyzeAndPlanNextStep(currentMessages, Array.from(dossierRef.current.values()), 0); // Clarification attempts irrelevant here

        if (plan.plan === 'RESPOND') {
          setChatMessages(prev => [...prev, { role: 'model', content: plan.answer, references: plan.references }]);
          return;
        }

        if (plan.plan === 'SEARCH_MORE') {
          setChatMessages(prev => [...prev, { role: 'model', content: `Investigación inicial completada. Profundizando sobre: "${plan.reasoning}"...`, isLoading: true }]);
          searchQueries = plan.newSearchQueries;
          loops++;
        } else {
            // If the model wants to clarify or propose again, we assume we have enough and try to respond.
            const finalPlan = await analyzeAndPlanNextStep(currentMessages, Array.from(dossierRef.current.values()), 99); // Force RESPOND or best guess
            if(finalPlan.plan === 'RESPOND') {
                 setChatMessages(prev => [...prev, { role: 'model', content: finalPlan.answer, references: finalPlan.references }]);
            } else {
                 throw new Error("No pude formular una respuesta con la información encontrada.");
            }
            return;
        }
    }
     throw new Error("No pude encontrar una respuesta satisfactoria después de múltiples búsquedas.");
  };

  const handleSendMessage = useCallback(async (newMessage: string) => {
    setError(null);
    const lastMessage = chatMessages[chatMessages.length - 1];
    const newMessages: ChatMessage[] = [...chatMessages, { role: 'user', content: newMessage }];
    setChatMessages(newMessages);
    setIsLoading(true);

    try {
        // STATE: Awaiting user confirmation for a proposed plan
        if (lastMessage?.isAwaitingConfirmation) {
            // FIX: Stricter confirmation check. Must START with a confirmation word.
            const isConfirmed = /^(s[ií]|procede|correcto|acepto|dale|ok)/i.test(newMessage.trim());
            if (isConfirmed && proposedPlanRef.current) {
                setChatMessages(prev => [...prev, { role: 'model', content: "¡Entendido! Iniciando investigación...", isLoading: true }]);
                await executeSearchLoop(proposedPlanRef.current, newMessages);
            } else {
                // User provided feedback, let the AI generate a new proposal
                const plan = await analyzeAndPlanNextStep(newMessages, Array.from(dossierRef.current.values()), clarificationAttemptRef.current);
                handleAiPlan(plan, newMessages);
            }
            return;
        }

        const isClarificationResponse = lastMessage?.isClarificationRequest === true;

        if (isClarificationResponse) {
            clarificationAttemptRef.current++;
        } else {
            dossierRef.current.clear();
            clarificationAttemptRef.current = 0;
            proposedPlanRef.current = null;
        }
        
        const plan = await analyzeAndPlanNextStep(newMessages, Array.from(dossierRef.current.values()), clarificationAttemptRef.current);
        handleAiPlan(plan, newMessages);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Ocurrió un error desconocido.';
      setError(errorMessage);
      setChatMessages(prev => [...prev, { role: 'model', content: `Lo siento, ocurrió un error: ${errorMessage}` }]);
    } finally {
      setIsLoading(false);
    }
  }, [chatMessages]);
  
  const handleAiPlan = (plan: AiPlanningResponse, currentMessages: ChatMessage[]) => {
      switch (plan.plan) {
          case 'CLARIFY':
              setChatMessages(prev => [...prev, { role: 'model', content: plan.clarificationQuestion, isClarificationRequest: true }]);
              break;
          case 'PROPOSE_PLAN':
              proposedPlanRef.current = plan.newSearchQueries;
              setChatMessages(prev => [...prev, { role: 'model', content: plan.proposal, isAwaitingConfirmation: true }]);
              break;
          case 'SEARCH_MORE':
              // CRITICAL FIX: Do not execute search directly. Convert it into a new proposal for user confirmation.
              // This prevents the AI from searching without permission after feedback is given.
              proposedPlanRef.current = plan.newSearchQueries;
              setChatMessages(prev => [...prev, { 
                  role: 'model', 
                  content: `Entendido. Basado en tu respuesta, he ajustado el plan. Propongo investigar lo siguiente:\n\n*   ${plan.reasoning}\n\n¿Procedemos con esta nueva búsqueda?`, 
                  isAwaitingConfirmation: true 
              }]);
              break;
          case 'RESPOND':
               setChatMessages(prev => [...prev, { role: 'model', content: plan.answer, references: plan.references }]);
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
            isLoading={isLoading}
            error={error}
          />
      </main>
      
      <footer className="text-center py-4 text-sm text-gray-500">
        <p>Powered by Gemini API y la base de datos de LeyChile.</p>
        <p>Esta es una herramienta de demostración y no reemplaza la asesoría legal profesional.</p>
      </footer>
    </div>
  );
};

export default App;
