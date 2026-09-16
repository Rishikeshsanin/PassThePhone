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
  category: GameCategory;
  intensity: 1 | 2 | 3 | 4 | 5;
  popularity: number;
  relatability: number;
  allowSelf: boolean;
  awardCategory: string;
  tags: string[];
};

export type Room = {
  id: string;
  code: string;
  host_user_id: string;
  status: RoomStatus;
  categories: GameCategory[];
  heat: 1 | 2 | 3 | 4 | 5;
  session_length: SessionLength;
  question_limit: number | null;
  allow_self: boolean;
  chat_enabled: boolean;
  round_number: number;
  current_turn_player_id: string | null;
  current_question: Question | null;
  question_history: string[];
  created_at: string;
  updated_at: string;
};

export type Player = {
  id: string;
  room_id: string;
  user_id: string;
  name: string;
  color: string;
  join_order: number;
  connected: boolean;
  created_at: string;
};

export type Choice = {
  id: string;
  room_id: string;
  round_number: number;
  question_id: string;
  question_text: string;
  category: GameCategory;
  intensity: number;
  chooser_player_id: string;
  chosen_player_id: string;
  created_at: string;
};

export type ChatMessage = {
  id: string;
  room_id: string;
  player_id: string;
  body: string;
  created_at: string;
};

export type SessionAwards = {
  mostChosen?: { playerId: string; count: number };
  heatSurvivor?: { playerId: string; count: number };
  strongestChain?: { from: string; to: string; count: number };
  categoryWinners: Array<{ category: string; playerId: string; count: number }>;
};
