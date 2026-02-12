import React, { useState, useEffect, useRef } from 'react';
import { logger, LogEntry, LogLevel } from '../services/loggerService.ts';

const levelColors: Record<LogLevel, string> = {
  INFO: 'text-gray-500',
  DEBUG: 'text-purple-500',
  ERROR: 'text-red-500 font-bold',
  AI_PLAN: 'text-blue-600 font-bold',
  SEARCH: 'text-green-600 font-bold',
};

const levelIcons: Record<LogLevel, string> = {
  INFO: 'ℹ️',
  DEBUG: '🐞',
  ERROR: '❌',
  AI_PLAN: '🤖',
  SEARCH: '🔍',
};

export const LogViewer: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = logger.subscribe((newLog) => {
      setLogs(prevLogs => [...prevLogs, newLog]);
    });
    // FIX: The useEffect cleanup function must return void or undefined.
    // The `unsubscribe` function returned a boolean, causing a type error
    // because arrow functions implicitly return the result of the expression.
    // Wrapping it in a block ensures the cleanup function returns void.
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (isOpen && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, isOpen]);

  const formatTimestamp = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString('es-CL', { hour12: false });
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="bg-gray-800 text-white px-4 py-2 rounded-full shadow-lg hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500"
      >
        {isOpen ? 'Cerrar Logs' : 'Ver Logs del Proceso'}
      </button>
      {isOpen && (
        <div className="absolute bottom-14 right-0 w-96 h-[32rem] bg-white border border-gray-300 rounded-lg shadow-2xl flex flex-col">
          <header className="p-2 border-b font-bold text-center text-gray-700 bg-gray-50 rounded-t-lg">
            Registro de Procesos
          </header>
          <div ref={logContainerRef} className="flex-1 overflow-y-auto p-2 text-xs font-mono">
            {logs.map((log, index) => (
              <div key={index} className="flex items-start mb-1">
                <span className="text-gray-400 mr-2">{formatTimestamp(log.timestamp)}</span>
                <span className={`mr-2 flex-shrink-0 w-16 text-right ${levelColors[log.level]}`}>
                  {levelIcons[log.level]} [{log.level}]
                </span>
                <span className="flex-1 break-words">
                  {log.message}
                  {log.details && (
                    <pre className="mt-1 p-1 bg-gray-100 rounded text-gray-600 text-[10px] overflow-x-auto">
                      {typeof log.details === 'object' ? JSON.stringify(log.details, null, 2) : String(log.details)}
                    </pre>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
