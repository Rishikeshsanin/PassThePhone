export type GameCategory =
  | "classic"
  | "funny"
  | "wholesome"
  | "personal"
  | "dark"
  | "adult"
  | "fantasy"
  | "popular";

export type SessionLength = "20" | "30" | "40" | "unlimited";
export type RoomStatus = "lobby" | "active" | "ended";

export type Question = {
  id: string;
  text: string;
  category: Exclude<GameCategory, "popular">;
  intensity: 1 | 2 | 3 | 4 | 5;
  popularity: number;
  relatability: number;
  allowSelf: boolean;
  awardCategory: string;
  tags: string[];
};

export type Player = {
  id: string;
  name: string;
  color: string;
  initial: string;
  isHost: boolean;
  joinOrder: number;
  connected: boolean;
};

export type Choice = {
  id: string;
  roundNumber: number;
  questionId: string;
  questionText: string;
  category: string;
  intensity: number;
  awardCategory: string | null;
  chooserPlayerId: string;
  chosenPlayerId: string;
  nextTurnPlayerId: string;
  turnShuffled: boolean;
  createdAt: string;
};

export type ChatMessage = {
  id: string;
  playerId: string;
  body: string;
  createdAt: string;
};

export type AwardWinner = {
  category: string;
  title: string;
  playerId: string;
  playerName: string;
  count: number;
};

export type FinalResults = {
  questionCount: number;
  mostChosen: { playerId: string; playerName?: string; count: number } | null;
  heatSurvivor: { playerId: string; playerName?: string; count: number } | null;
  strongestChain: {
    from: string;
    fromName?: string;
    to: string;
    toName?: string;
    count: number;
  } | null;
  awardWinners: AwardWinner[];
  receipts: string[];
};

export type RoomState = {
  room: {
    code: string;
    status: RoomStatus;
    categories: GameCategory[];
    heat: 1 | 2 | 3 | 4 | 5;
    sessionLength: SessionLength;
    questionLimit: number | null;
    allowSelf: boolean;
    chatEnabled: boolean;
    roundNumber: number;
    currentTurnPlayerId: string | null;
    currentQuestion: Question | null;
    questionHistoryCount: number;
    createdAt: string;
  };
  me: Player;
  players: Player[];
  choices: Choice[];
  messages: ChatMessage[];
  final: FinalResults | null;
  serverTime: string;
};
