
import React, { useState, useEffect } from 'react';
import { Tournament, Match, Standing, GroupData, FinalStage, FinalMatch, FinalRoundRobin } from './types';
import { db } from './firebase';
import { collection, query, orderBy, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';


// --- ICONS ---
const TrophyIcon = ({ style }: { style?: React.CSSProperties }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>;
const UpArrowIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ color: '#4ade80', display: 'inline-block', verticalAlign: 'middle', marginLeft: '4px' }}><path d="M12 5L12 19M12 5L6 11M12 5L18 11" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const DownArrowIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ color: '#f87171', display: 'inline-block', verticalAlign: 'middle', marginLeft: '4px' }}><path d="M12 19L12 5M12 19L18 13M12 19L6 13" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const ClockIcon = ({ style }: { style?: React.CSSProperties }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
const TrashIcon = ({ style }: { style?: React.CSSProperties }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>;
const DownloadIcon = ({ style }: { style?: React.CSSProperties }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>;


// Helper function to generate a round-robin schedule
const generateRoundRobinSchedule = (playerNames: string[]): Record<string, Match[]> => {
    const schedule: Record<string, Match[]> = {};
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
        schedule[round] = roundMatches;
        const lastPlayer = players.pop();
        if (lastPlayer) {
            players.splice(1, 0, lastPlayer);
        }
    }
    return schedule;
};

const sortStandings = (standings: Standing[], schedule: Record<string, Match[]>): Standing[] => {
    const flatSchedule = Object.values(schedule).flat();

    // Use slice() to create a shallow copy before sorting, as .sort() is in-place
    return standings.slice().sort((a, b) => {
        // 1. Primary criteria: Points
        if (a.points !== b.points) {
            return b.points - a.points;
        }

        // 2. Secondary criteria: Head-to-head result
        const match = flatSchedule.find(m =>
            (m.p1 === a.name && m.p2 === b.name) || (m.p1 === b.name && m.p2 === a.name)
        );

        if (match && match.result) {
            if (match.result === 'p1_win') {
                return match.p1 === a.name ? -1 : 1;
            }
            if (match.result === 'p2_win') {
                return match.p2 === a.name ? -1 : 1;
            }
        }

        // 3. If still tied (e.g., they drew or match not played), don't change order
        return 0;
    });
};


const getGroupWinner = (group: GroupData): string => {
    const sortedStandings = sortStandings(Object.values(group.standings), group.schedule);
    return sortedStandings[0]?.name || '';
};

const calculateGroupingOptions = (numPlayers: number): number[][] => {
    const results: number[][] = [];
    const MIN_GROUP_SIZE = 3;
    const MAX_GROUP_SIZE = 6;

    function find(target: number, path: number[], start: number) {
        if (target === 0) {
            results.push([...path]);
            return;
        }

        for (let i = start; i <= Math.min(target, MAX_GROUP_SIZE); i++) {
            path.push(i);
            find(target - i, path, i); // Pass `i` as the new start to avoid permutations
            path.pop();
        }
    }
    
    find(numPlayers, [], MIN_GROUP_SIZE);
    
    const validResults = results.filter(p => p.every(s => s >= MIN_GROUP_SIZE));

    validResults.sort((a, b) => {
        if (a.length !== b.length) return a.length - b.length;
        return b[0] - a[0]; 
    });
    
    return validResults.map(p => p.sort((a,b) => b-a));
};

const formatGroupingOption = (option: number[]): string => {
    const counts: Record<number, number> = option.reduce((acc, size) => {
        acc[size] = (acc[size] || 0) + 1;
        return acc;
    }, {} as Record<number, number>);

    return Object.entries(counts)
        .map(([size, count]) => `${count} grupo${count > 1 ? 's' : ''} de ${size}`)
        .join(' e ');
};


const roundHeaderStyle: React.CSSProperties = {
    background: 'linear-gradient(to right, #ca8a04, #f59e0b)',
    color: '#ffffff',
    padding: '0.5rem 1rem',
    borderRadius: '0.375rem',
    textTransform: 'uppercase',
    fontWeight: 700,
    fontSize: '0.85rem',
    letterSpacing: '0.05em',
    textAlign: 'center',
    marginTop: 0,
    marginBottom: '1rem'
};

const byePlayerStyle: React.CSSProperties = {
    marginTop: '0.75rem',
    padding: '0.5rem 0.75rem',
    backgroundColor: 'rgba(252, 211, 77, 0.1)', // Soft gold background
    border: '1px solid rgba(252, 211, 77, 0.3)',
    borderRadius: '0.375rem',
    fontSize: '0.85rem',
    color: '#fef3c7', // Light gold text
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
};

// --- Splash Screen ---
const SplashScreen: React.FC<{ onEnter: () => void }> = ({ onEnter }) => {
    const splashStyle: React.CSSProperties = {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        textAlign: 'center',
        animation: 'fadeIn 1.5s ease-in-out'
    };

    const logoStyle: React.CSSProperties = {
        color: '#facc15',
        width: '100px',
        height: '100px',
        marginBottom: '1.5rem',
        animation: 'fadeInUp 1s ease-out 0.5s',
        animationFillMode: 'both'
    };

    const titleStyle: React.CSSProperties = {
        fontSize: '3rem',
        fontWeight: 800,
        color: '#fef3c7',
        margin: '0 0 1rem 0',
        letterSpacing: '0.05em',
        animation: 'fadeInUp 1s ease-out 0.8s',
        animationFillMode: 'both'
    };

    const infoStyle: React.CSSProperties = {
        fontSize: '1rem',
        color: '#e7e5e4',
        margin: '0.25rem 0',
        animation: 'fadeInUp 1s ease-out 1.1s',
        animationFillMode: 'both'
    };

    const buttonStyle: React.CSSProperties = {
        marginTop: '3rem',
        animation: 'fadeInUp 1s ease-out 1.4s',
        animationFillMode: 'both'
    };
    
    const keyframes = `
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
    `;

    return (
        <>
            <style>{keyframes}</style>
            <div style={splashStyle}>
                <TrophyIcon style={logoStyle} />
                <h1 style={titleStyle}>TORNEIOS DE XADREZ</h1>
                <p style={infoStyle}>Desenvolvido por André Brito</p>
                <p style={infoStyle}>Versão 1.0</p>
                <StyledButton onClick={onEnter} style={buttonStyle}>
                    Entrar
                </StyledButton>
            </div>
        </>
    );
};

// --- CLOCK & TIMER COMPONENTS ---
const BrasiliaClock: React.FC = () => {
    const [time, setTime] = useState('');

    useEffect(() => {
        const timer = setInterval(() => {
            const brasiliaTime = new Date().toLocaleTimeString('pt-BR', {
                timeZone: 'America/Sao_Paulo',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
            setTime(brasiliaTime);
        }, 1000);

        return () => clearInterval(timer);
    }, []);

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#d6d3d1', fontSize: '0.9rem' }}>
            <ClockIcon style={{ width: 16, height: 16 }} />
            <span>Brasília: <strong>{time}</strong></span>
        </div>
    );
};


const ElapsedTime: React.FC<{ startTime: number }> = ({ startTime }) => {
    const [elapsed, setElapsed] = useState('00:00:00');

    const formatTime = (ms: number) => {
        const totalSeconds = Math.floor(ms / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    };

    useEffect(() => {
        const timer = setInterval(() => {
            const diff = Date.now() - startTime;
            setElapsed(formatTime(diff));
        }, 1000);

        return () => clearInterval(timer);
    }, [startTime]);

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            color: '#d6d3d1',
            fontSize: '1rem',
            marginBottom: '2rem',
            padding: '0.5rem 1rem',
            backgroundColor: 'rgba(0,0,0,0.2)',
            borderRadius: '0.5rem'
        }}>
            <ClockIcon style={{ width: 20, height: 20, color: '#ca8a04' }} />
            <span>Tempo Transcorrido: <strong>{elapsed}</strong></span>
        </div>
    );
};

// --- PWA Install Banner ---
const InstallPWA: React.FC<{ onInstall: () => void; onDismiss: () => void; }> = ({ onInstall, onDismiss }) => {
    const bannerStyle: React.CSSProperties = {
        position: 'fixed',
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: '#292524',
        padding: '1rem 1.5rem',
        borderRadius: '0.75rem',
        border: '1px solid #ca8a04',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        zIndex: 1000,
        boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
        animation: 'slideInUp 0.5s ease-out',
        flexWrap: 'wrap',
        maxWidth: 'calc(100% - 40px)'
    };

    const dismissButtonStyle: React.CSSProperties = {
        background: 'none',
        border: 'none',
        color: '#a8a29e',
        cursor: 'pointer',
        fontSize: '0.9rem',
        padding: '0.5rem',
        marginLeft: '0.5rem'
    };

    const textStyle: React.CSSProperties = {
        color: '#e7e5e4',
        fontWeight: 500
    };

    const keyframes = `
        @keyframes slideInUp {
            from {
                transform: translate(-50%, 100px);
                opacity: 0;
            }
            to {
                transform: translate(-50%, 0);
                opacity: 1;
            }
        }
    `;

    return (
        <>
            <style>{keyframes}</style>
            <div style={bannerStyle} role="dialog" aria-labelledby="install-dialog-title" aria-describedby="install-dialog-description">
                <DownloadIcon style={{ color: '#facc15', flexShrink: 0 }} />
                <div style={{ flexGrow: 1 }}>
                    <h3 id="install-dialog-title" style={{ margin: 0, fontSize: '1rem', color: '#fef3c7' }}>Instalar o App</h3>
                    <p id="install-dialog-description" style={{ margin: '0.25rem 0 0', fontSize: '0.85rem' }}>Tenha acesso rápido e offline.</p>
                </div>
                <div style={{display: 'flex', gap: '0.5rem', alignItems: 'center'}}>
                    <StyledButton onClick={onInstall} style={{padding: '0.5rem 1rem', fontSize: '0.9rem'}}>
                        Instalar
                    </StyledButton>
                    <button onClick={onDismiss} style={dismissButtonStyle} aria-label="Dispensar">
                        Agora não
                    </button>
                </div>
            </div>
        </>
    );
};


// Main App component
const App: React.FC = () => {
    const [tournaments, setTournaments] = useState<Record<string, Tournament>>({});
    const [activeTournamentId, setActiveTournamentId] = useState<string | null>(() => {
        return localStorage.getItem('activeTournamentId') || null;
    });

    const [isAppEntered, setIsAppEntered] = useState(false);
    const [installPrompt, setInstallPrompt] = useState<Event | null>(null);
    const [showInstallBanner, setShowInstallBanner] = useState(true);

    useEffect(() => {
        const handler = (e: Event) => {
            e.preventDefault();
            console.log('beforeinstallprompt event fired');
            setInstallPrompt(e);
        };
        window.addEventListener('beforeinstallprompt', handler);
        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    // Listen for real-time updates from Firestore
    useEffect(() => {
        const q = query(collection(db, "tournaments"), orderBy("startTime", "desc"));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const tournamentsData: Record<string, Tournament> = {};
            querySnapshot.forEach((doc) => {
                tournamentsData[doc.id] = doc.data() as Tournament;
            });
            setTournaments(tournamentsData);

            // If the active tournament was deleted from another client, reset it.
            if (activeTournamentId && !tournamentsData[activeTournamentId]) {
                setActiveTournamentId(null);
            }
        });

        return () => unsubscribe(); // Cleanup subscription on unmount
    }, [activeTournamentId]);


    const handleInstallClick = () => {
        if (!installPrompt) return;
        (installPrompt as any).prompt();
        (installPrompt as any).userChoice.then((choiceResult: { outcome: string }) => {
            if (choiceResult.outcome === 'accepted') {
                console.log('User accepted the A2HS prompt');
            } else {
                console.log('User dismissed the A2HS prompt');
            }
            setInstallPrompt(null);
            setShowInstallBanner(false);
        });
    };
    
    const handleDismissInstall = () => {
        setShowInstallBanner(false);
    };

    useEffect(() => {
        if (activeTournamentId) {
            localStorage.setItem('activeTournamentId', activeTournamentId);
        } else {
            localStorage.removeItem('activeTournamentId');
        }
    }, [activeTournamentId]);
    
    const calculateStandings = (players: string[], schedule: Record<string, Match[]>): Record<string, Standing> => {
        const standings: Record<string, Standing> = players.reduce((acc, playerName) => {
            acc[playerName] = { name: playerName, points: 0, wins: 0, draws: 0, losses: 0 };
            return acc;
        }, {} as Record<string, Standing>);

        Object.values(schedule).flat().forEach(match => {
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
        const allGroupMatchesPlayed = Object.values(tournament.groups).every(group =>
            Object.values(group.schedule).flat().every(match => match.result !== null)
        );

        if (!allGroupMatchesPlayed || tournament.finalStage.type === 'none') {
            return tournament;
        }

        const groupWinners = Object.keys(tournament.groups)
            .sort()
            .map(groupId => getGroupWinner(tournament.groups[groupId]));

        const updatedTournament = JSON.parse(JSON.stringify(tournament));

        if (updatedTournament.finalStage.type === 'final_match' && groupWinners.length === 2) {
            if(updatedTournament.finalStage.p1 === null) {
                updatedTournament.finalStage.p1 = groupWinners[0];
                updatedTournament.finalStage.p2 = groupWinners[1];
            }
        } else if (updatedTournament.finalStage.type === 'round_robin' && groupWinners.length > 2) {
            if(updatedTournament.finalStage.players.length === 0) {
                updatedTournament.finalStage.players = groupWinners;
                updatedTournament.finalStage.schedule = generateRoundRobinSchedule(groupWinners);
                updatedTournament.finalStage.standings = groupWinners.reduce((acc, p) => ({ ...acc, [p]: { name: p, points: 0, wins: 0, draws: 0, losses: 0 } }), {});
            }
        }
        
        return updatedTournament;
    };

    const handleCreateTournament = async (name: string, playerNames: string[], grouping: number[]) => {
        const newDocRef = doc(collection(db, 'tournaments'));
        
        const groups: Record<string, GroupData> = {};
        const shuffledPlayers = [...playerNames].sort(() => Math.random() - 0.5);
        let playerIndex = 0;

        const createGroupData = (players: string[]): GroupData => ({
            players,
            schedule: generateRoundRobinSchedule(players),
            standings: players.reduce((acc, p) => ({ ...acc, [p]: { name: p, points: 0, wins: 0, draws: 0, losses: 0 } }), {})
        });
        
        grouping.forEach((groupSize, index) => {
            const groupId = String.fromCharCode(65 + index);
            const groupPlayers = shuffledPlayers.slice(playerIndex, playerIndex + groupSize);
            playerIndex += groupSize;
            groups[groupId] = createGroupData(groupPlayers);
        });
        
        let finalStage: FinalStage;
        if (grouping.length <= 1) {
            finalStage = { type: 'none' };
        } else if (grouping.length === 2) {
            finalStage = { type: 'final_match', p1: null, p2: null, result: null, p1Source: 'Vencedor Grupo A', p2Source: 'Vencedor Grupo B' };
        } else {
            finalStage = { type: 'round_robin', players: [], schedule: {}, standings: {} };
        }

        const newTournament: Tournament = {
            id: newDocRef.id,
            name,
            players: playerNames,
            groups,
            finalStage,
            startTime: Date.now()
        };

        await setDoc(newDocRef, newTournament);
        setActiveTournamentId(newDocRef.id);
    };

    const updateTournamentInDb = async (tournamentId: string, updatedTournament: Tournament) => {
        const tournamentRef = doc(db, "tournaments", tournamentId);
        await setDoc(tournamentRef, updatedTournament);
    };
    
    const handleRecordGroupResult = async (tournamentId: string, groupId: string, roundIndex: number, matchIndex: number, result: 'p1_win' | 'p2_win' | 'draw') => {
        const tournament = tournaments[tournamentId];
        if (!tournament) return;

        let updatedTournament = JSON.parse(JSON.stringify(tournament));
        
        const group = updatedTournament.groups[groupId];
        const previousSorted = sortStandings(Object.values(group.standings), group.schedule);
        group.previousRankOrder = previousSorted.map(s => s.name);

        group.schedule[roundIndex][matchIndex].result = result;
        group.standings = calculateStandings(group.players, group.schedule);
        
        updatedTournament = checkAndAdvanceToFinalStage(updatedTournament);
        await updateTournamentInDb(tournamentId, updatedTournament);
    };
    
    const handleRecordFinalStageResult = async (tournamentId: string, result: 'p1_win' | 'p2_win' | 'draw', roundIndex?: number, matchIndex?: number) => {
        const tournament = tournaments[tournamentId];
        if (!tournament) return;

        let updatedTournament = JSON.parse(JSON.stringify(tournament));
        const { finalStage } = updatedTournament;

        if (finalStage.type === 'final_match') {
            finalStage.result = result;
        } else if (finalStage.type === 'round_robin' && roundIndex !== undefined && matchIndex !== undefined) {
            const previousSorted = sortStandings(Object.values(finalStage.standings), finalStage.schedule);
            finalStage.previousRankOrder = previousSorted.map(s => s.name);

            finalStage.schedule[roundIndex][matchIndex].result = result;
            finalStage.standings = calculateStandings(finalStage.players, finalStage.schedule);
        }

        await updateTournamentInDb(tournamentId, updatedTournament);
    };

    const handleDeleteTournament = async (tournamentId: string) => {
        if (window.confirm("Tem certeza que deseja excluir este torneio? Esta ação não pode ser desfeita.")) {
            await deleteDoc(doc(db, "tournaments", tournamentId));
            if (activeTournamentId === tournamentId) {
                setActiveTournamentId(null);
            }
        }
    };

    const styles = {
        mainContent: { flex: 1, padding: '2rem', display: 'flex', flexDirection: 'column', width: '100%', maxWidth: '1200px', margin: '0 auto' } as React.CSSProperties,
        header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem', flexWrap: 'wrap', gap: '1rem', borderBottom: '2px solid #ca8a04', paddingBottom: '1.5rem' } as React.CSSProperties,
        headerTitleContainer: { display: 'flex', alignItems: 'center', gap: '1rem' },
        headerTitle: { fontSize: '1.85rem', fontWeight: 800, color: '#fef3c7', margin: 0 },
        headerControls: { display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' } as React.CSSProperties,
        footer: { marginTop: 'auto', paddingTop: '2rem', textAlign: 'center', fontSize: '0.8rem', color: '#e7e5e4' } as React.CSSProperties,
        styledSelect: {
            padding: '0.75rem',
            backgroundColor: '#292524',
            border: '1px solid #d97706',
            borderRadius: '0.5rem',
            color: '#e7e5e4',
            fontSize: '0.9rem',
            minWidth: '200px',
            fontWeight: 500
        },
        deleteButton: {
            background: '#7f1d1d',
            color: '#fecaca',
            border: 'none',
            borderRadius: '0.5rem',
            padding: '0.6rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.2s'
        }
    };

    if (!isAppEntered) {
        return <SplashScreen onEnter={() => setIsAppEntered(true)} />;
    }
    
    return (
        <div style={{minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            <main style={styles.mainContent}>
                <header style={styles.header}>
                    <div style={styles.headerTitleContainer}>
                        <TrophyIcon style={{color: '#ca8a04', width: 28, height: 28}}/>
                        <h1 style={styles.headerTitle}>TORNEIOS DE XADREZ</h1>
                    </div>
                    <div style={{...styles.headerControls, marginLeft: 'auto'}}>
                        <BrasiliaClock />
                        {Object.keys(tournaments).length > 0 && (
                             <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
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
                                {activeTournamentId && (
                                    <button 
                                        onClick={() => handleDeleteTournament(activeTournamentId)} 
                                        style={styles.deleteButton}
                                        title="Excluir torneio"
                                        aria-label="Excluir torneio"
                                    >
                                        <TrashIcon style={{ width: 20, height: 20 }}/>
                                    </button>
                                )}
                             </div>
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
            {installPrompt && showInstallBanner && (
                <InstallPWA onInstall={handleInstallClick} onDismiss={handleDismissInstall} />
            )}
        </div>
    );
};

const Card: React.FC<{ children: React.ReactNode, className?: string, style?: React.CSSProperties }> = ({ children, style }) => (
    <div style={{ 
        backgroundColor: '#44403c',
        border: '2px solid #ca8a04',
        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
        borderRadius: '0.75rem', 
        padding: '1.5rem', 
        ...style 
    }}>
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
            backgroundColor: '#292524',
            border: '1px solid #d97706',
            borderRadius: '0.5rem',
            color: '#e7e5e4',
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
        background: 'linear-gradient(to right, #ca8a04, #f59e0b)',
        color: '#ffffff',
    };

    const secondaryStyle: React.CSSProperties = {
        backgroundColor: '#44403c',
        color: '#fcd34d',
        border: '1px solid #ca8a04'
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

const StandingsTable: React.FC<{
    standings: Record<string, Standing>,
    schedule: Record<string, Match[]>,
    previousRankOrder?: string[]
}> = ({ standings, schedule, previousRankOrder }) => {
    const standingsArray = sortStandings(Object.values(standings), schedule);

    const winBg = 'rgba(74, 222, 128, 0.15)';
    const drawBg = 'rgba(250, 204, 21, 0.15)';
    const lossBg = 'rgba(248, 113, 113, 0.15)';

    return (
        <div style={{overflowX: 'auto'}}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95rem', minWidth: '300px' }}>
                <thead>
                    <tr>
                        <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ca8a04', color: '#fef9c3', fontWeight: 600 }}>Jogador</th>
                        <th style={{ padding: '12px', textAlign: 'center', borderBottom: '2px solid #ca8a04', color: '#fef9c3', fontWeight: 600 }}>P</th>
                        <th style={{ padding: '12px', textAlign: 'center', borderBottom: '2px solid #ca8a04', color: '#fef9c3', fontWeight: 600 }}>V</th>
                        <th style={{ padding: '12px', textAlign: 'center', borderBottom: '2px solid #ca8a04', color: '#fef9c3', fontWeight: 600 }}>E</th>
                        <th style={{ padding: '12px', textAlign: 'center', borderBottom: '2px solid #ca8a04', color: '#fef9c3', fontWeight: 600 }}>D</th>
                    </tr>
                </thead>
                <tbody>
                    {standingsArray.map((s: Standing, currentIndex) => {
                        let rankChangeIndicator = null;
                        if (previousRankOrder) {
                            const previousRank = previousRankOrder.indexOf(s.name);
                            if (previousRank !== -1) { // player was in previous list
                                if (currentIndex < previousRank) {
                                    rankChangeIndicator = <UpArrowIcon />;
                                } else if (currentIndex > previousRank) {
                                    rankChangeIndicator = <DownArrowIcon />;
                                }
                            }
                        }
                        
                        return (
                            <tr key={s.name} style={{ borderBottom: '1px solid #44403c' }}>
                                <td style={{ padding: '12px', fontWeight: 700 }}>
                                    {s.name}
                                    {rankChangeIndicator}
                                </td>
                                <td style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', color: '#fde047' }}>{s.points}</td>
                                <td style={{ padding: '12px', textAlign: 'center', color: '#86efac', backgroundColor: winBg }}>{s.wins}</td>
                                <td style={{ padding: '12px', textAlign: 'center', color: '#fde047', backgroundColor: drawBg }}>{s.draws}</td>
                                <td style={{ padding: '12px', textAlign: 'center', color: '#fca5a5', backgroundColor: lossBg }}>{s.losses}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};


// --- VIEWS ---

interface TournamentViewProps {
    activeTournamentId: string | null;
    tournaments: Record<string, Tournament>;
    onCreateTournament: (name: string, players: string[], grouping: number[]) => void;
    onRecordGroupResult: (tournamentId: string, groupId: string, roundIndex: number, matchIndex: number, result: 'p1_win' | 'p2_win' | 'draw') => void;
    onRecordFinalStageResult: (tournamentId: string, result: 'p1_win' | 'p2_win' | 'draw', roundIndex?: number, matchIndex?: number) => void;
}

const TournamentView: React.FC<TournamentViewProps> = ({ activeTournamentId, tournaments, onCreateTournament, onRecordGroupResult, onRecordFinalStageResult }) => {
    const [step, setStep] = useState(1);
    const [tournamentName, setTournamentName] = useState('');
    const [playerCount, setPlayerCount] = useState(4);
    const [playerNames, setPlayerNames] = useState<string[]>(Array(4).fill(''));
    const [groupingOptions, setGroupingOptions] = useState<number[][]>([]);
    const [selectedGrouping, setSelectedGrouping] = useState<number[]>([]);

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

    const handleNextToGrouping = () => {
        if (!tournamentName.trim()) {
            alert('Por favor, insira um nome para o torneio.');
            return;
        }
        const options = calculateGroupingOptions(playerCount);
        if (options.length === 0) {
            alert(`Não foi encontrada uma forma válida de dividir ${playerCount} jogadores em grupos de 3 a 6.`);
            return;
        }
        setGroupingOptions(options);
        setSelectedGrouping(options[0]);
        setStep(2);
    };

    const handleCreateClick = () => {
        if (playerNames.every(name => name.trim())) {
            onCreateTournament(tournamentName, playerNames.map(name => name.trim()), selectedGrouping);
        } else {
            alert('Por favor, preencha o nome de todos os jogadores.');
        }
    };

    const StyledRadioLabel: React.FC<{htmlFor: string, children: React.ReactNode, isChecked: boolean}> = ({htmlFor, children, isChecked}) => (
        <label
            htmlFor={htmlFor}
            style={{
                display: 'block',
                padding: '1rem',
                border: `2px solid ${isChecked ? '#ca8a04' : '#57534e'}`,
                borderRadius: '0.5rem',
                marginBottom: '0.75rem',
                cursor: 'pointer',
                backgroundColor: isChecked ? 'rgba(202, 138, 4, 0.1)' : 'transparent',
                transition: 'all 0.2s ease-in-out',
                fontWeight: 500
            }}
        >
            {children}
        </label>
    );

    if (!activeTournamentId) {
        return (
            <Card style={{maxWidth: '600px', margin: '0 auto'}}>
                <h2 style={{marginTop: 0, marginBottom: '2rem', color: '#fef3c7', fontSize: '1.75rem', textAlign: 'center', fontWeight: 700}}>Criar Novo Torneio</h2>
                {step === 1 && (
                    <div style={{display: 'flex', flexDirection: 'column', gap: '1.5rem'}}>
                        <div>
                            <label htmlFor="tournament-name" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: '#d6d3d1' }}>Nome do Torneio</label>
                            <StyledInput id="tournament-name" type="text" value={tournamentName} onChange={(e) => setTournamentName(e.target.value)} />
                        </div>
                        <div>
                            <label htmlFor="player-count" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: '#d6d3d1' }}>Número de Jogadores</label>
                            <StyledInput id="player-count" type="number" min="3" max="64" value={playerCount} onChange={handlePlayerCountChange} />
                             <p style={{fontSize: '0.8rem', color: '#a8a29e', margin: '0.5rem 0 0'}}>Mínimo de 3, máximo de 64.</p>
                        </div>
                        <StyledButton onClick={handleNextToGrouping}>Próximo</StyledButton>
                    </div>
                )}
                 {step === 2 && (
                    <div style={{display: 'flex', flexDirection: 'column', gap: '1.5rem'}}>
                        <h3 style={{marginTop: 0, marginBottom: 0, color: '#fef3c7'}}>Como deseja dividir os jogadores?</h3>
                        <div>
                            {groupingOptions.map((option, index) => (
                                <div key={index}>
                                    <input 
                                        type="radio" 
                                        id={`group-opt-${index}`} 
                                        name="grouping"
                                        value={JSON.stringify(option)}
                                        checked={JSON.stringify(selectedGrouping) === JSON.stringify(option)} 
                                        onChange={() => setSelectedGrouping(option)}
                                        style={{ display: 'none' }}
                                    />
                                    <StyledRadioLabel htmlFor={`group-opt-${index}`} isChecked={JSON.stringify(selectedGrouping) === JSON.stringify(option)}>
                                        {formatGroupingOption(option)}
                                    </StyledRadioLabel>
                                </div>
                            ))}
                        </div>
                        <div style={{display: 'flex', gap: '1rem', marginTop: '1rem'}}>
                             <StyledButton onClick={() => setStep(1)} variant="secondary">Voltar</StyledButton>
                             <StyledButton onClick={() => setStep(3)}>Próximo</StyledButton>
                        </div>
                    </div>
                )}
                {step === 3 && (
                    <div style={{display: 'flex', flexDirection: 'column', gap: '1.5rem'}}>
                         <h3 style={{marginTop: 0, marginBottom: 0, color: '#fef3c7'}}>Nomes dos Jogadores</h3>
                         <div style={{display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '300px', overflowY: 'auto', paddingRight: '0.5rem'}}>
                            {playerNames.map((name, index) => (
                                <StyledInput key={index} type="text" placeholder={`Jogador ${index + 1}`} value={name} onChange={(e) => handlePlayerNameChange(index, e.target.value)} />
                            ))}
                         </div>
                        <div style={{display: 'flex', gap: '1rem', marginTop: '1rem'}}>
                            <StyledButton onClick={() => setStep(2)} variant="secondary">Voltar</StyledButton>
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
        <h2 style={{ marginTop: 0, marginBottom: '0.5rem', color: '#fef3c7', fontSize: '2.5rem', textAlign: 'center', fontWeight: 800 }}>{tournament.name}</h2>
        <ElapsedTime startTime={tournament.startTime} />
        <h3 style={{ color: '#fef3c7', fontSize: '1.75rem', borderBottom: '2px solid #ca8a04', paddingBottom: '0.5rem', marginBottom: '1.5rem', fontWeight: 700 }}>Fase de Grupos</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '2rem', marginBottom: '3rem' }}>
            {(Object.entries(tournament.groups) as [string, GroupData][]).map(([groupId, groupData]) => (
                <Card key={groupId}>
                    <h4 style={{ marginTop: 0, color: '#fef9c3', fontSize: '1.5rem', fontWeight: 600 }}>Grupo {groupId}</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>
                        <div>
                            <h5 style={{marginTop: 0, marginBottom: '1rem', color: '#e7e5e4', fontWeight: 600}}>Partidas</h5>
                            {Object.values(groupData.schedule).map((round, roundIndex) => {
                                const playersInRound = round.flatMap(match => [match.p1, match.p2]);
                                const byePlayer = groupData.players.find(p => p !== "BYE" && !playersInRound.includes(p));

                                return (
                                    <div key={roundIndex} style={{ marginBottom: '1.5rem' }}>
                                         <h6 style={roundHeaderStyle}>
                                            Rodada {roundIndex + 1}
                                        </h6>
                                        {round.map((match, matchIndex) => (
                                            <div key={matchIndex} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid #57534e', gap: '0.5rem' }}>
                                                <span>{match.p1} vs {match.p2}</span>
                                                <select value={match.result || ''} onChange={(e) => onRecordGroupResult(tournament.id, groupId, roundIndex, matchIndex, e.target.value as any)} style={{padding: '0.25rem', backgroundColor: '#292524', border: '1px solid #d97706', borderRadius: '0.375rem', color: '#e7e5e4'}}>
                                                    <option value="">Res.</option>
                                                    <option value="p1_win">V1</option>
                                                    <option value="p2_win">V2</option>
                                                    <option value="draw">E</option>
                                                </select>
                                            </div>
                                        ))}
                                        {byePlayer && (
                                            <div style={byePlayerStyle}>
                                                 <ClockIcon style={{ width: 16, height: 16, marginRight: '0.5rem', color: '#fcd34d' }} />
                                                 <span><strong>{byePlayer}</strong> está de espera</span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        <div>
                            <h5 style={{marginTop: '1rem', marginBottom: '1rem', color: '#e7e5e4', fontWeight: 600}}>Classificação</h5>
                            <StandingsTable standings={groupData.standings} schedule={groupData.schedule} previousRankOrder={groupData.previousRankOrder} />
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
        const groupKeys = Object.keys(tournament.groups);
        if (groupKeys.length === 0) {
            return null;
        }
        const group = tournament.groups[groupKeys[0]];

        const winner = getGroupWinner(group);
        // Fix: Explicitly type `m` to resolve type inference issues.
        const allMatchesPlayed = Object.values(group.schedule).flat().every((m: Match) => m.result);
        if (!allMatchesPlayed) return null;

        return (
            <div>
                 <h3 style={{ color: '#fef3c7', fontSize: '1.75rem', borderBottom: '2px solid #ca8a04', paddingBottom: '0.5rem', marginBottom: '1.5rem', fontWeight: 700 }}>Resultado Final</h3>
                 <Card>
                    <div style={{textAlign: 'center'}}>
                        <TrophyIcon style={{color: '#facc15', width: '48px', height: '48px', margin: '0 auto 1rem'}} />
                        <h4 style={{margin: 0, fontSize: '1.25rem', color: '#fef9c3', fontWeight: 600}}>Campeão do Torneio</h4>
                        <p style={{margin: '0.5rem 0 0', fontSize: '2rem', fontWeight: 'bold', color: '#fef3c7', textTransform: 'uppercase'}}>{winner}</p>
                    </div>
                 </Card>
            </div>
        );
    }
    
    return (
        <div>
            <h3 style={{ color: '#fef3c7', fontSize: '1.75rem', borderBottom: '2px solid #ca8a04', paddingBottom: '0.5rem', marginBottom: '1.5rem', fontWeight: 700 }}>Fase Final</h3>
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
    if (match.result) {
        const winnerName = match.result === 'p1_win' ? match.p1 : match.p2;
        return (
            <div style={{textAlign: 'center', padding: '1rem 0'}}>
                <TrophyIcon style={{color: '#facc15', width: '60px', height: '60px', margin: '0 auto 1rem'}} />
                <h4 style={{margin: 0, fontSize: '1.5rem', color: '#fef9c3', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em'}}>Campeão</h4>
                <p style={{margin: '0.5rem 0 0', fontSize: '2.5rem', fontWeight: 'bold', color: '#fef3c7', textTransform: 'uppercase'}}>{winnerName}</p>
            </div>
        );
    }

    const p1Name = match.p1 || match.p1Source;
    const p2Name = match.p2 || match.p2Source;
    const canRecord = match.p1 && match.p2;

    return (
        <div>
            <h4 style={{margin: '0 0 1rem 0', color: '#fef3c7', fontSize: '1.5rem', textAlign: 'center', fontWeight: 700}}>Grande Final</h4>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', backgroundColor: '#292524', borderRadius: '0.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <span style={{flex: 1, textAlign: 'right', fontWeight: 700, fontSize: '1.25rem', minWidth: '100px'}}>{p1Name}</span>
                <span style={{margin: '0 0.5rem', color: '#a8a29e', fontSize: '1.25rem'}}>vs</span>
                <span style={{flex: 1, textAlign: 'left', fontWeight: 700, fontSize: '1.25rem', minWidth: '100px'}}>{p2Name}</span>
                <select 
                    value={match.result || ''} 
                    disabled={!canRecord}
                    onChange={(e) => onRecordResult(tournamentId, e.target.value as any)}
                    style={{padding: '0.75rem', backgroundColor: '#292524', border: '1px solid #d97706', borderRadius: '0.375rem', color: '#e7e5e4', marginLeft: 'auto', fontWeight: 500}}
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
        return <p style={{textAlign: 'center', color: '#a8a29e'}}>Aguardando vencedores dos grupos...</p>;
    }
    return (
         <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
            <div>
                <h4 style={{marginTop: 0, color: '#e7e5e4', fontWeight: 600}}>Partidas Finais</h4>
                {/* Fix: Explicitly type `round` to resolve type inference issues with `Object.values`. */}
                {Object.values(finalStage.schedule).map((round: Match[], roundIndex) => {
                    const playersInRound = round.flatMap(match => [match.p1, match.p2]);
                    const byePlayer = finalStage.players.find(p => p !== "BYE" && !playersInRound.includes(p));

                    return (
                        <div key={roundIndex} style={{ marginBottom: '1.5rem' }}>
                            <h6 style={roundHeaderStyle}>
                                Rodada {roundIndex + 1}
                            </h6>
                            {round.map((match, matchIndex) => (
                               <div key={matchIndex} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid #57534e', gap: '0.5rem' }}>
                                    <span>{match.p1} vs {match.p2}</span>
                                    <select value={match.result || ''} onChange={(e) => onRecordResult(tournamentId, e.target.value as any, roundIndex, matchIndex)} style={{padding: '0.25rem', backgroundColor: '#292524', border: '1px solid #d97706', borderRadius: '0.375rem', color: '#e7e5e4'}}>
                                        <option value="">Res.</option>
                                        <option value="p1_win">V1</option>
                                        <option value="p2_win">V2</option>
                                        <option value="draw">E</option>
                                    </select>
                                </div>
                            ))}
                             {byePlayer && (
                                <div style={byePlayerStyle}>
                                     <ClockIcon style={{ width: 16, height: 16, marginRight: '0.5rem', color: '#fcd34d' }} />
                                     <span><strong>{byePlayer}</strong> está de espera</span>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            <div>
                <h4 style={{marginTop: 0, color: '#e7e5e4', fontWeight: 600}}>Classificação Final</h4>
                <StandingsTable standings={finalStage.standings} schedule={finalStage.schedule} previousRankOrder={finalStage.previousRankOrder} />
            </div>
        </div>
    )
}


export default App;