
export type LogLevel = 'INFO' | 'DEBUG' | 'ERROR' | 'AI_PLAN' | 'SEARCH';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  details?: any;
}

type LogListener = (entry: LogEntry) => void;

/**
 * Replacer para JSON.stringify que convierte objetos Error en objetos planos
 * para que puedan ser serializados y mostrados correctamente en los logs.
 */
const serializeErrorReplacer = (key: string, value: any) => {
  if (value instanceof Error) {
    // Convierte el objeto Error a un objeto plano con sus propiedades más importantes
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }
  return value;
};

class LoggerService {
  private listeners: Set<LogListener> = new Set();

  public subscribe(listener: LogListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private log(level: LogLevel, message: string, details?: any) {
    // Procesa los detalles para asegurar que cualquier objeto Error anidado
    // sea serializado correctamente y no aparezca como '{}' en el log.
    const serializableDetails = details
      ? JSON.parse(JSON.stringify(details, serializeErrorReplacer))
      : details;
      
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      details: serializableDetails,
    };

    this.listeners.forEach(listener => listener(entry));
    
    switch(level) {
        case 'ERROR':
            console.error(`[${level}] ${message}`, serializableDetails || '');
            break;
        case 'DEBUG':
            console.debug(`[${level}] ${message}`, serializableDetails || '');
            break;
        default:
            console.log(`[${level}] ${message}`, serializableDetails || '');
            break;
    }
  }

  info(message: string, details?: any) {
    this.log('INFO', message, details);
  }

  debug(message: string, details?: any) {
    this.log('DEBUG', message, details);
  }

  error(message: string, details?: any) {
    this.log('ERROR', message, details);
  }
  
  aiPlan(message: string, details?: any) {
      this.log('AI_PLAN', message, details);
  }

  search(message: string, details?: any) {
      this.log('SEARCH', message, details);
  }
}

export const logger = new LoggerService();
