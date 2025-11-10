export interface Match {
    p1: string;
    p2: string;
    result: 'p1_win' | 'p2_win' | 'draw' | null;
}

export interface Standing {
    name: string;
    points: number;
    wins: number;
    draws: number;
    losses: number;
}

export interface GroupData {
    players: string[];
    schedule: Record<string, Match[]>; // Changed from Match[][]
    standings: Record<string, Standing>;
    previousRankOrder?: string[];
}

export interface FinalMatch {
    type: 'final_match';
    p1: string | null;
    p2: string | null;
    result: 'p1_win' | 'p2_win' | 'draw' | null;
    p1Source: string; 
    p2Source: string;
}

export interface FinalRoundRobin {
    type: 'round_robin';
    players: string[];
    schedule: Record<string, Match[]>; // Changed from Match[][]
    standings: Record<string, Standing>;
    previousRankOrder?: string[];
}

export interface NoFinalStage {
    type: 'none';
}

export type FinalStage = FinalMatch | FinalRoundRobin | NoFinalStage;

export interface Tournament {
    id: string;
    name:string;
    players: string[];
    groups: Record<string, GroupData>; // Key is group name e.g. "A", "B"
    finalStage: FinalStage;
    startTime: number; // Timestamp of when the tournament started
    roundDuration: number; // Duration of a round in milliseconds
}