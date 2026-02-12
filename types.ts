
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
  isClarificationRequest?: boolean;
  isAwaitingConfirmation?: boolean;
}

export interface ResultItem extends FetchedItem {
    sourceQueries: string[];
}

// Tipos para la planificación del modelo PRO
export type PlanType = 'RESPOND' | 'CLARIFY' | 'SEARCH_MORE' | 'PROPOSE_PLAN';

export interface RespondPlan {
  plan: 'RESPOND';
  answer: string;
  references: AiReference[];
}

export interface ClarifyPlan {
  plan: 'CLARIFY';
  clarificationQuestion: string;
}

export interface SearchMorePlan {
  plan: 'SEARCH_MORE';
  newSearchQueries: string[];
  reasoning: string;
}

export interface ProposePlan {
    plan: 'PROPOSE_PLAN';
    proposal: string;
    newSearchQueries: string[];
}

export type AiPlanningResponse = RespondPlan | ClarifyPlan | SearchMorePlan | ProposePlan;
