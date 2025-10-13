import React, { useState } from 'react';
import { Tournament, Match, Standing, GroupData, FinalStage, FinalMatch, FinalRoundRobin } from './types';

// --- ICONS ---
const TrophyIcon = ({ style }: { style?: React.CSSProperties }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>;

// Helper function to generate a round-robin schedule
const generateRoundRobinSchedule = (playerNames: string[]): Match[][] => {
    const schedule: Match[][] = [];
    let players = [...playerNames];
    if (players.length % 2 !== 0) {
        players.push("BYE");
    }
    const numRounds = players.length - 1;
    const halfSize = players.length / 2;
    for (let round = 0; round < numRounds; round++) {
        const roundMatches: Match[] = [];
        for (let i = 0; i < halfSize; i++) {
            const p1 = players[i];
            const p2 = players[players.length - 1 - i];
            if (p1 !== "BYE" && p2 !== "BYE") {
                roundMatches.push({ p1, p2, result: null });
            }
        }
        schedule.push(roundMatches);
        const lastPlayer = players.pop();
        if (lastPlayer) {
            players.splice(1, 0, lastPlayer);
        }
    }
    return schedule;
};

const getGroupWinner = (group: GroupData): string => {
    return Object.values(group.standings).sort((a, b) => b.points - a.points)[0]?.name || '';
};

// Main App component
const App: React.FC = () => {
    const [tournaments, setTournaments] = useState<Record<string, Tournament>>({});
    const [activeTournamentId, setActiveTournamentId] = useState<string | null>(null);
    
    const calculateStandings = (players: string[], schedule: Match[][]): Record<string, Standing> => {
        const standings: Record<string, Standing> = players.reduce((acc, playerName) => {
            acc[playerName] = { name: playerName, points: 0, wins: 0, draws: 0, losses: 0 };
            return acc;
        }, {} as Record<string, Standing>);

        schedule.flat().forEach(match => {
            if (match.result) {
                if (match.result === 'p1_win') {
                    standings[match.p1].wins += 1;
                    standings[match.p2].losses += 1;
                } else if (match.result === 'p2_win') {
                    standings[match.p2].wins += 1;
                    standings[match.p1].losses += 1;
                } else if (match.result === 'draw') {
                    standings[match.p1].draws += 1;
                    standings[match.p2].draws += 1;
                }
            }
        });

        Object.values(standings).forEach(s => {
            s.points = (s.wins * 1) + (s.draws * 0.5);
        });

        return standings;
    };

    const checkAndAdvanceToFinalStage = (tournament: Tournament): Tournament => {
        // Check if all group matches are played
        const allGroupMatchesPlayed = Object.values(tournament.groups).every(group =>
            group.schedule.flat().every(match => match.result !== null)
        );

        if (!allGroupMatchesPlayed || tournament.finalStage.type === 'none') {
            return tournament;
        }

        // Get winners from each group
        const groupWinners = Object.keys(tournament.groups)
            .sort() // Ensure consistent order (A, B, C...)
            .map(groupId => getGroupWinner(tournament.groups[groupId]));

        const updatedTournament = JSON.parse(JSON.stringify(tournament));

        if (updatedTournament.finalStage.type === 'final_match' && groupWinners.length === 2) {
            // Avoid re-populating if already done
            if(updatedTournament.finalStage.p1 === null) {
                updatedTournament.finalStage.p1 = groupWinners[0];
                updatedTournament.finalStage.p2 = groupWinners[1];
            }
        } else if (updatedTournament.finalStage.type === 'round_robin' && groupWinners.length > 2) {
             // Avoid re-populating if already done
            if(updatedTournament.finalStage.players.length === 0) {
                updatedTournament.finalStage.players = groupWinners;
                updatedTournament.finalStage.schedule = generateRoundRobinSchedule(groupWinners);
                updatedTournament.finalStage.standings = groupWinners.reduce((acc, p) => ({ ...acc, [p]: { name: p, points: 0, wins: 0, draws: 0, losses: 0 } }), {});
            }
        }
        
        return updatedTournament;
    };

    const handleCreateTournament = (name: string, playerNames: string[]) => {
        const newId = `tourn_${Date.now()}`;
        
        const MAX_GROUP_SIZE = 6;
        const numPlayers = playerNames.length;
        const numGroups = Math.ceil(numPlayers / MAX_GROUP_SIZE);
        
        const groups: Record<string, GroupData> = {};
        const groupPlayerLists: string[][] = Array.from({ length: numGroups }, () => []);

        // Distribute players into groups
        playerNames.forEach((player, index) => {
            groupPlayerLists[index % numGroups].push(player);
        });

        const createGroupData = (players: string[]): GroupData => ({
            players,
            schedule: generateRoundRobinSchedule(players),
            standings: players.reduce((acc, p) => ({ ...acc, [p]: { name: p, points: 0, wins: 0, draws: 0, losses: 0 } }), {})
        });
        
        groupPlayerLists.forEach((players, index) => {
            const groupId = String.fromCharCode(65 + index); // A, B, C...
            groups[groupId] = createGroupData(players);
        });
        
        let finalStage: FinalStage;
        if (numGroups <= 1) {
            finalStage = { type: 'none' };
        } else if (numGroups === 2) {
            finalStage = { type: 'final_match', p1: null, p2: null, result: null, p1Source: 'Vencedor Grupo A', p2Source: 'Vencedor Grupo B' };
        } else {
            finalStage = { type: 'round_robin', players: [], schedule: [], standings: {} };
        }

        const newTournament: Tournament = {
            id: newId,
            name,
            players: playerNames,
            groups,
            finalStage
        };

        setTournaments(prev => ({ ...prev, [newId]: newTournament }));
        setActiveTournamentId(newId);
    };
    
    const handleRecordGroupResult = (tournamentId: string, groupId: string, roundIndex: number, matchIndex: number, result: 'p1_win' | 'p2_win' | 'draw') => {
        setTournaments(prev => {
            const updatedTournaments = { ...prev };
            let tournament = JSON.parse(JSON.stringify(updatedTournaments[tournamentId]));
            
            const group = tournament.groups[groupId];
            group.schedule[roundIndex][matchIndex].result = result;
            group.standings = calculateStandings(group.players, group.schedule);
            
            tournament = checkAndAdvanceToFinalStage(tournament);
            updatedTournaments[tournamentId] = tournament;
            return updatedTournaments;
        });
    };
    
    const handleRecordFinalStageResult = (tournamentId: string, result: 'p1_win' | 'p2_win' | 'draw', roundIndex?: number, matchIndex?: number) => {
        setTournaments(prev => {
            const updatedTournaments = { ...prev };
            let tournament = JSON.parse(JSON.stringify(updatedTournaments[tournamentId]));
            const { finalStage } = tournament;

            if (finalStage.type === 'final_match') {
                finalStage.result = result;
            } else if (finalStage.type === 'round_robin' && roundIndex !== undefined && matchIndex !== undefined) {
                finalStage.schedule[roundIndex][matchIndex].result = result;
                finalStage.standings = calculateStandings(finalStage.players, finalStage.schedule);
            }

            updatedTournaments[tournamentId] = tournament;
            return updatedTournaments;
        });
    };

    const styles = {
        mainContent: { flex: 1, color: '#e2e8f0', padding: '2rem', display: 'flex', flexDirection: 'column', width: '100%', maxWidth: '1200px', margin: '0 auto' } as React.CSSProperties,
        header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '1.5rem' } as React.CSSProperties,
        headerTitleContainer: { display: 'flex', alignItems: 'center', gap: '1rem' },
        headerTitle: { fontSize: '1.85rem', fontWeight: 800, color: '#f8fafc', margin: 0 },
        headerControls: { display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' } as React.CSSProperties,
        footer: { marginTop: 'auto', paddingTop: '2rem', textAlign: 'center', fontSize: '0.8rem', color: '#94a3b8' } as React.CSSProperties,
        styledSelect: {
            padding: '0.75rem',
            backgroundColor: 'rgba(0,0,0,0.2)',
            border: '1px solid #4b5563',
            borderRadius: '0.5rem',
            color: '#f1f5f9',
            fontSize: '0.9rem',
            minWidth: '200px'
        }
    };
    
    return (
        <div style={{minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            <main style={styles.mainContent}>
                <header style={styles.header}>
                    <div style={styles.headerTitleContainer}>
                        <TrophyIcon style={{color: '#a855f7'}}/>
                        <h1 style={styles.headerTitle}>TORNEIOS DE XADREZ</h1>
                    </div>
                    <div style={styles.headerControls}>
                        {Object.keys(tournaments).length > 0 && (
                             <select 
                                value={activeTournamentId || ''}
                                onChange={(e) => setActiveTournamentId(e.target.value)}
                                style={styles.styledSelect}
                             >
                                 <option value="" disabled>Selecione um torneio</option>
                                 {Object.values(tournaments).map((t: Tournament) => (
                                     <option key={t.id} value={t.id}>{t.name}</option>
                                 ))}
                             </select>
                        )}
                        <StyledButton onClick={() => setActiveTournamentId(null)}>
                            Criar Novo Torneio
                        </StyledButton>
                    </div>
                </header>
                
                <div style={{flex: 1}}>
                    <TournamentView 
                        activeTournamentId={activeTournamentId}
                        tournaments={tournaments}
                        onCreateTournament={handleCreateTournament}
                        onRecordGroupResult={handleRecordGroupResult}
                        onRecordFinalStageResult={handleRecordFinalStageResult}
                    />
                </div>

                <footer style={styles.footer}>
                    <p style={{ margin: 0 }}>Desenvolvido por André Brito</p>
                    <p style={{ margin: '0.25rem 0 0 0' }}>Versão 1.0</p>
                </footer>
            </main>
        </div>
    );
};

const Card: React.FC<{ children: React.ReactNode, className?: string, style?: React.CSSProperties }> = ({ children, style }) => (
    <div style={{ backgroundColor: 'rgba(0, 0, 0, 0.2)', borderRadius: '0.75rem', padding: '1.5rem', ...style }}>
        {children}
    </div>
);

const StyledInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
    <input
        {...props}
        style={{
            width: '100%',
            padding: '0.75rem 1rem',
            boxSizing: 'border-box',
            backgroundColor: 'rgba(0,0,0,0.2)',
            border: '1px solid #4b5563',
            borderRadius: '0.5rem',
            color: '#f1f5f9',
            fontSize: '1rem'
        }}
    />
);

const StyledButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' }> = ({ children, variant = 'primary', style, ...props }) => {
    const baseStyle: React.CSSProperties = {
        padding: '0.75rem 1.5rem',
        cursor: 'pointer',
        border: 'none',
        borderRadius: '0.5rem',
        fontWeight: 700,
        fontSize: '1rem',
        transition: 'all 0.2s ease-in-out',
    };
    
    const primaryStyle: React.CSSProperties = {
        background: 'linear-gradient(to right, #7c3aed, #a855f7)',
        color: '#ffffff',
    };

    const secondaryStyle: React.CSSProperties = {
        backgroundColor: '#475569',
        color: '#e2e8f0'
    };
    
    return (
        <button
            {...props}
            style={{
                ...baseStyle,
                ...(variant === 'primary' ? primaryStyle : secondaryStyle),
                ...style
            }}
        >
            {children}
        </button>
    );
};

const StandingsTable: React.FC<{standings: Record<string, Standing>}> = ({ standings }) => {
    const standingsArray = (Object.values(standings) as Standing[]).sort((a, b) => b.points - a.points);
    return (
        <div style={{overflowX: 'auto'}}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95rem', minWidth: '300px' }}>
                <thead>
                    <tr>
                        <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #4b5563', color: '#94a3b8', fontWeight: 600 }}>Jogador</th>
                        <th style={{ padding: '12px', textAlign: 'center', borderBottom: '2px solid #4b5563', color: '#94a3b8', fontWeight: 600 }}>P</th>
                        <th style={{ padding: '12px', textAlign: 'center', borderBottom: '2px solid #4b5563', color: '#94a3b8', fontWeight: 600 }}>V</th>
                        <th style={{ padding: '12px', textAlign: 'center', borderBottom: '2px solid #4b5563', color: '#94a3b8', fontWeight: 600 }}>E</th>
                        <th style={{ padding: '12px', textAlign: 'center', borderBottom: '2px solid #4b5563', color: '#94a3b8', fontWeight: 600 }}>D</th>
                    </tr>
                </thead>
                <tbody>
                    {standingsArray.map((s: Standing) => (
                        <tr key={s.name} style={{ borderBottom: '1px solid #4b5563' }}>
                            <td style={{ padding: '12px', fontWeight: 700 }}>{s.name}</td>
                            <td style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', color: '#a5b4fc' }}>{s.points}</td>
                            <td style={{ padding: '12px', textAlign: 'center', color: '#4ade80' }}>{s.wins}</td>
                            <td style={{ padding: '12px', textAlign: 'center' }}>{s.draws}</td>
                            <td style={{ padding: '12px', textAlign: 'center', color: '#f87171' }}>{s.losses}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};


// --- VIEWS ---

interface TournamentViewProps {
    activeTournamentId: string | null;
    tournaments: Record<string, Tournament>;
    onCreateTournament: (name: string, players: string[]) => void;
    onRecordGroupResult: (tournamentId: string, groupId: string, roundIndex: number, matchIndex: number, result: 'p1_win' | 'p2_win' | 'draw') => void;
    onRecordFinalStageResult: (tournamentId: string, result: 'p1_win' | 'p2_win' | 'draw', roundIndex?: number, matchIndex?: number) => void;
}

const TournamentView: React.FC<TournamentViewProps> = ({ activeTournamentId, tournaments, onCreateTournament, onRecordGroupResult, onRecordFinalStageResult }) => {
    const [step, setStep] = useState(1);
    const [tournamentName, setTournamentName] = useState('');
    const [playerCount, setPlayerCount] = useState(4);
    const [playerNames, setPlayerNames] = useState<string[]>(Array(4).fill(''));

    const handlePlayerCountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const count = parseInt(e.target.value, 10) || 0;
        setPlayerCount(count);
        setPlayerNames(Array(count).fill(''));
    };

    const handlePlayerNameChange = (index: number, name: string) => {
        const newPlayerNames = [...playerNames];
        newPlayerNames[index] = name;
        setPlayerNames(newPlayerNames);
    };

    const handleCreateClick = () => {
        if (tournamentName.trim() && playerNames.every(name => name.trim())) {
            onCreateTournament(tournamentName, playerNames.map(name => name.trim()));
            // Reset form
            setTournamentName('');
            setPlayerCount(4);
            setPlayerNames(Array(4).fill(''));
            setStep(1);
        } else {
            alert('Por favor, preencha o nome do torneio e o nome de todos os jogadores.');
        }
    };

    if (!activeTournamentId) {
        return (
            <Card style={{maxWidth: '600px', margin: '0 auto'}}>
                <h2 style={{marginTop: 0, marginBottom: '2rem', color: '#f8fafc', fontSize: '1.75rem', textAlign: 'center', fontWeight: 700}}>Criar Novo Torneio</h2>
                {step === 1 && (
                    <div style={{display: 'flex', flexDirection: 'column', gap: '1.5rem'}}>
                        <div>
                            <label htmlFor="tournament-name" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Nome do Torneio</label>
                            <StyledInput id="tournament-name" type="text" value={tournamentName} onChange={(e) => setTournamentName(e.target.value)} />
                        </div>
                        <div>
                            <label htmlFor="player-count" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Número de Jogadores</label>
                            <StyledInput id="player-count" type="number" min="3" max="64" value={playerCount} onChange={handlePlayerCountChange} />
                             <p style={{fontSize: '0.8rem', color: '#94a3b8', margin: '0.5rem 0 0'}}>Máximo de 6 jogadores por grupo. Grupos serão criados automaticamente.</p>
                        </div>
                        <StyledButton onClick={() => setStep(2)}>Próximo</StyledButton>
                    </div>
                )}
                {step === 2 && (
                    <div style={{display: 'flex', flexDirection: 'column', gap: '1.5rem'}}>
                         <h3 style={{marginTop: 0, marginBottom: 0, color: '#f1f5f9'}}>Nomes dos Jogadores</h3>
                         <div style={{display: 'flex', flexDirection: 'column', gap: '0.75rem'}}>
                            {playerNames.map((name, index) => (
                                <StyledInput key={index} type="text" placeholder={`Jogador ${index + 1}`} value={name} onChange={(e) => handlePlayerNameChange(index, e.target.value)} />
                            ))}
                         </div>
                        <div style={{display: 'flex', gap: '1rem', marginTop: '1rem'}}>
                            <StyledButton onClick={() => setStep(1)} variant="secondary">Voltar</StyledButton>
                            <StyledButton onClick={handleCreateClick}>Criar Torneio</StyledButton>
                        </div>
                    </div>
                )}
            </Card>
        );
    }
    
    const tournament = tournaments[activeTournamentId];
    if (!tournament) return <Card>Torneio não encontrado.</Card>;

    return <TournamentInProgressView tournament={tournament} onRecordGroupResult={onRecordGroupResult} onRecordFinalStageResult={onRecordFinalStageResult} />;
};

const TournamentInProgressView: React.FC<{tournament: Tournament, onRecordGroupResult: TournamentViewProps['onRecordGroupResult'], onRecordFinalStageResult: TournamentViewProps['onRecordFinalStageResult']}> = ({ tournament, onRecordGroupResult, onRecordFinalStageResult }) => (
    <div>
        <h2 style={{ marginTop: 0, marginBottom: '2rem', color: '#f8fafc', fontSize: '2.5rem', textAlign: 'center', fontWeight: 800 }}>{tournament.name}</h2>
        <h3 style={{ color: '#f1f5f9', fontSize: '1.75rem', borderBottom: '2px solid #a855f7', paddingBottom: '0.5rem', marginBottom: '1.5rem', fontWeight: 700 }}>Fase de Grupos</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '2rem', marginBottom: '3rem' }}>
            {(Object.entries(tournament.groups) as [string, GroupData][]).map(([groupId, groupData]) => (
                <Card key={groupId}>
                    <h4 style={{ marginTop: 0, color: '#f1f5f9', fontSize: '1.5rem', fontWeight: 600 }}>Grupo {groupId}</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>
                        <div>
                            <h5 style={{marginTop: 0, marginBottom: '1rem', color: '#cbd5e1', fontWeight: 600}}>Partidas</h5>
                            {groupData.schedule.map((round, roundIndex) => (
                                <div key={roundIndex}>
                                    {round.map((match, matchIndex) => (
                                        <div key={matchIndex} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid #4b5563', gap: '0.5rem' }}>
                                            <span>{match.p1} vs {match.p2}</span>
                                            <select value={match.result || ''} onChange={(e) => onRecordGroupResult(tournament.id, groupId, roundIndex, matchIndex, e.target.value as any)} style={{padding: '0.25rem', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid #4b5563', borderRadius: '0.375rem', color: '#f1f5f9'}}>
                                                <option value="">Res.</option>
                                                <option value="p1_win">V1</option>
                                                <option value="p2_win">V2</option>
                                                <option value="draw">E</option>
                                            </select>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                        <div>
                            <h5 style={{marginTop: '1rem', marginBottom: '1rem', color: '#cbd5e1', fontWeight: 600}}>Classificação</h5>
                            <StandingsTable standings={groupData.standings} />
                        </div>
                    </div>
                </Card>
            ))}
        </div>

        <FinalStageView tournament={tournament} onRecordFinalStageResult={onRecordFinalStageResult} />
    </div>
);

const FinalStageView: React.FC<{ tournament: Tournament, onRecordFinalStageResult: TournamentViewProps['onRecordFinalStageResult'] }> = ({ tournament, onRecordFinalStageResult }) => {
    const { finalStage } = tournament;

    if (finalStage.type === 'none') {
        // Fix for lines 465-466: Argument of type 'unknown' and property 'schedule' does not exist on type 'unknown'.
        // Switched to Object.keys to safely access the first group and resolve type inference issues.
        const groupKeys = Object.keys(tournament.groups);
        if (groupKeys.length === 0) {
            return null;
        }
        const group = tournament.groups[groupKeys[0]];

        const winner = getGroupWinner(group);
        const allMatchesPlayed = group.schedule.flat().every(m => m.result);
        if (!allMatchesPlayed) return null;

        return (
            <div>
                 <h3 style={{ color: '#f1f5f9', fontSize: '1.75rem', borderBottom: '2px solid #a855f7', paddingBottom: '0.5rem', marginBottom: '1.5rem', fontWeight: 700 }}>Resultado Final</h3>
                 <Card>
                    <div style={{textAlign: 'center'}}>
                        <TrophyIcon style={{color: '#facc15', width: '48px', height: '48px', margin: '0 auto 1rem'}} />
                        <h4 style={{margin: 0, fontSize: '1.25rem', color: '#cbd5e1', fontWeight: 600}}>Campeão do Torneio</h4>
                        <p style={{margin: '0.5rem 0 0', fontSize: '2rem', fontWeight: 'bold', color: '#f8fafc', textTransform: 'uppercase'}}>{winner}</p>
                    </div>
                 </Card>
            </div>
        );
    }
    
    return (
        <div>
            <h3 style={{ color: '#f1f5f9', fontSize: '1.75rem', borderBottom: '2px solid #a855f7', paddingBottom: '0.5rem', marginBottom: '1.5rem', fontWeight: 700 }}>Fase Final</h3>
            <Card>
                {finalStage.type === 'final_match' && (
                    <FinalMatchComponent tournamentId={tournament.id} match={finalStage} onRecordResult={onRecordFinalStageResult} />
                )}
                 {finalStage.type === 'round_robin' && (
                    <FinalRoundRobinComponent tournamentId={tournament.id} finalStage={finalStage} onRecordResult={onRecordFinalStageResult} />
                )}
            </Card>
        </div>
    );
};

const FinalMatchComponent: React.FC<{ tournamentId: string, match: FinalMatch, onRecordResult: TournamentViewProps['onRecordFinalStageResult'] }> = ({ tournamentId, match, onRecordResult }) => {
    const p1Name = match.p1 || match.p1Source;
    const p2Name = match.p2 || match.p2Source;
    const canRecord = match.p1 && match.p2;

    return (
        <div>
            <h4 style={{margin: '0 0 1rem 0', color: '#cbd5e1', fontSize: '1.5rem', textAlign: 'center', fontWeight: 700}}>Grande Final</h4>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: '0.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <span style={{flex: 1, textAlign: 'right', fontWeight: 700, fontSize: '1.25rem', minWidth: '100px'}}>{p1Name}</span>
                <span style={{margin: '0 0.5rem', color: '#94a3b8', fontSize: '1.25rem'}}>vs</span>
                <span style={{flex: 1, textAlign: 'left', fontWeight: 700, fontSize: '1.25rem', minWidth: '100px'}}>{p2Name}</span>
                <select 
                    value={match.result || ''} 
                    disabled={!canRecord}
                    onChange={(e) => onRecordResult(tournamentId, e.target.value as any)}
                    style={{padding: '0.75rem', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid #4b5563', borderRadius: '0.375rem', color: '#f1f5f9', marginLeft: 'auto'}}
                >
                    <option value="" disabled>Resultado</option>
                    <option value="p1_win">Vitória {p1Name}</option>
                    <option value="p2_win">Vitória {p2Name}</option>
                </select>
            </div>
        </div>
    );
}

const FinalRoundRobinComponent: React.FC<{ tournamentId: string, finalStage: FinalRoundRobin, onRecordResult: TournamentViewProps['onRecordFinalStageResult'] }> = ({ tournamentId, finalStage, onRecordResult }) => {
    if (finalStage.players.length === 0) {
        return <p style={{textAlign: 'center', color: '#94a3b8'}}>Aguardando vencedores dos grupos...</p>;
    }
    return (
         <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
            <div>
                <h4 style={{marginTop: 0, color: '#cbd5e1', fontWeight: 600}}>Partidas Finais</h4>
                {finalStage.schedule.map((round, roundIndex) => (
                    <div key={roundIndex}>
                        {round.map((match, matchIndex) => (
                           <div key={matchIndex} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid #4b5563', gap: '0.5rem' }}>
                                <span>{match.p1} vs {match.p2}</span>
                                <select value={match.result || ''} onChange={(e) => onRecordResult(tournamentId, e.target.value as any, roundIndex, matchIndex)} style={{padding: '0.25rem', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid #4b5563', borderRadius: '0.375rem', color: '#f1f5f9'}}>
                                    <option value="">Res.</option>
                                    <option value="p1_win">V1</option>
                                    <option value="p2_win">V2</option>
                                    <option value="draw">E</option>
                                </select>
                            </div>
                        ))}
                    </div>
                ))}
            </div>
            <div>
                <h4 style={{marginTop: 0, color: '#cbd5e1', fontWeight: 600}}>Classificação Final</h4>
                <StandingsTable standings={finalStage.standings} />
            </div>
        </div>
    )
}


export default App;