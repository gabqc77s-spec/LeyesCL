
import React, { useState, useEffect, useRef } from 'react';
import type { ChatMessage } from '../types.ts';
import { PaperAirplaneIcon, SpinnerIcon, BrainIcon } from './icons.tsx';
import { ModelResponse } from './ModelResponse.tsx';

interface ChatInterfaceProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  onConfirm: () => void;
  isLoading: boolean;
  error: string | null;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ messages, onSendMessage, onConfirm, isLoading, error }) => {
  const [currentInput, setCurrentInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isAtBottom = useRef(true);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (isAtBottom.current && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleScroll = () => {
    if (!chatContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    if (scrollHeight - scrollTop <= clientHeight + 5) {
      isAtBottom.current = true;
    } else {
      isAtBottom.current = false;
    }
  };

  const handleSend = (message?: string) => {
    const messageToSend = typeof message === 'string' ? message : currentInput;
    if (!messageToSend.trim() || isLoading) return;
    onSendMessage(messageToSend);
    setCurrentInput('');
    isAtBottom.current = true;
  };
  
  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };
  
  const lastMessage = messages[messages.length - 1];
  const isAwaitingUserConfirmation = lastMessage?.role === 'model' && lastMessage.isAwaitingConfirmation;

  return (
    <div className="bg-white rounded-xl shadow-lg flex flex-col flex-1 h-full">
      <main ref={chatContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.map((msg, index) => (
          <div key={index}>
            <div className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
              {msg.role === 'model' && (
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <BrainIcon className="w-5 h-5 text-blue-600" />
                </div>
              )}
              <div className={`max-w-md md:max-w-2xl p-4 rounded-2xl ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-gray-100 text-gray-800 rounded-bl-none'}`}>
                {msg.references && msg.references.length > 0 ? (
                  <ModelResponse content={msg.content} references={msg.references} />
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}
                
                {msg.isAwaitingConfirmation && !isLoading && (
                  <div className="mt-4 pt-3 border-t border-gray-200 flex gap-2">
                    <button onClick={onConfirm} className="px-4 py-1.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700">
                      Sí, procede
                    </button>
                    <button onClick={() => setCurrentInput('No, quiero modificar el plan...')} className="px-4 py-1.5 text-sm font-semibold text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300">
                      No, quiero modificar
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
              <BrainIcon className="w-5 h-5 text-blue-600" />
            </div>
            <div className="p-3 rounded-2xl bg-gray-100 text-gray-800 rounded-bl-none flex items-center">
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0s'}}></div>
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce ml-1.5" style={{animationDelay: '0.1s'}}></div>
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce ml-1.5" style={{animationDelay: '0.2s'}}></div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </main>

      <footer className="p-4 border-t border-gray-200 bg-white rounded-b-xl">
        <div className="relative">
          <textarea
            value={currentInput}
            onChange={(e) => setCurrentInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={isAwaitingUserConfirmation ? "Responde a la propuesta o escribe para modificar..." : "Escribe tu consulta legal aquí..."}
            className="w-full pl-4 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition resize-none"
            rows={1}
            disabled={isLoading}
          />
          <button onClick={() => handleSend()} disabled={isLoading || !currentInput.trim()} className="absolute bottom-2.5 right-2 flex items-center justify-center w-10 h-10 text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:bg-gray-400 disabled:hover:bg-gray-400">
            {isLoading ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <PaperAirplaneIcon className="w-5 h-5" />}
          </button>
        </div>
      </footer>
    </div>
  );
};
