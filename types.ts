
export interface AiReference {
  id: string;
  lawNumber?: string;
  title: string;
  fragment: string;
  publicationDate: string;
  effectiveDate: string;
  link: string;
  sourceQueries: string[];
}

export interface FetchedItem {
  id: string;
  title: string;
  publicationDate: string;
  effectiveDate: string;
  link: string;
  lawNumber?: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  references?: AiReference[];
  isLoading?: boolean;
  isAwaitingConfirmation?: boolean;
  isClarificationRequest?: boolean;
}

export interface ResultItem extends FetchedItem {
    sourceQueries: string[];
}

// Tipos para la planificación del modelo PRO
export type PlanType = 'RESPOND' | 'CLARIFY' | 'PROPOSE_PLAN' | 'SEARCH_MORE';

export interface RespondPlan {
  plan: 'RESPOND';
  answer: string;
  references: AiReference[];
}

export interface ClarifyPlan {
  plan: 'CLARIFY';
  clarificationQuestion: string;
}

export interface ProposePlan {
  plan: 'PROPOSE_PLAN';
  searchQuery: string;
  reasoning: string;
}

export interface SearchMorePlan {
  plan: 'SEARCH_MORE';
  searchQuery: string;
  reasoning: string;
}


export type AiPlanningResponse = RespondPlan | ClarifyPlan | ProposePlan | SearchMorePlan;
