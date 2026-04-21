export type EntryStage = "initial" | "clarifying" | "ready_for_routing";

export type EntryClarifyingAnswer = {
  questionKey: string;
  questionText: string;
  answerText: string;
};

export interface EntrySessionState {
  telegramUserId: number;
  stage: EntryStage;
  initialMessage: string;
  clarifyingAnswers: EntryClarifyingAnswer[];
  turnCount: number;
  createdAt: string;
  updatedAt: string;
  lastQuestionKey: string | null;
  lastQuestionText: string | null;
}

export interface InternalEntrySessionState extends EntrySessionState {}

export type EntryRoutingDecision =
  | {
      action: "ask_question";
      reason: string;
      nextQuestion?: { key: string; text: string };
    }
  | {
      action: "route_to_website_screening";
      reason: string;
    }
  | {
      action: "route_to_diagnosis";
      reason: string;
    }
  | {
      action: "route_to_tool";
      reason: string;
      toolSuggestion: {
        slug: string;
        title: string;
        url: string;
      };
    };

export type TelegramEntryReply = {
  text: string;
  stage: EntryStage;
  cta?: {
    label: string;
    url: string;
  };
};
