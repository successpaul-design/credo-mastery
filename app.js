const { useState, useEffect, useCallback, useMemo, useRef, createContext, useContext } = React;

// SM-2 Spaced Repetition Algorithm
const SM2 = {
    defaultCard: () => ({
        easeFactor: 2.5, interval: 0, repetitions: 0,
        nextReview: Date.now(), lastReview: null
    }),
    grade: (card, quality) => {
        let { easeFactor, interval, repetitions } = card;
        if (quality >= 3) {
            if (repetitions === 0) interval = 1;
            else if (repetitions === 1) interval = 6;
            else interval = Math.round(interval * easeFactor);
            repetitions += 1;
        } else {
            repetitions = 0;
            interval = 1;
        }
        easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
        if (easeFactor < 1.3) easeFactor = 1.3;
        return { easeFactor, interval, repetitions, nextReview: Date.now() + interval * 86400000, lastReview: Date.now() };
    }
};

// Storage utilities
const Storage = {
    get: (key, def = null) => { try { const i = localStorage.getItem(`credo_${key}`); return i ? JSON.parse(i) : def; } catch { return def; } },
    set: (key, val) => { try { localStorage.setItem(`credo_${key}`, JSON.stringify(val)); } catch (e) { console.error(e); } },
    exportAll: () => {
        const data = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('credo_')) data[key] = JSON.parse(localStorage.getItem(key));
        }
        return data;
    }
};

// Voice input hook
const useVoiceInput = (onResult) => {
    const [isListening, setIsListening] = useState(false);
    const recognitionRef = useRef(null);
    useEffect(() => {
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
            recognitionRef.current = new SR();
            recognitionRef.current.continuous = true;
            recognitionRef.current.interimResults = true;
            recognitionRef.current.onresult = (e) => {
                let final = '';
                for (let i = e.resultIndex; i < e.results.length; i++) {
                    if (e.results[i].isFinal) final += e.results[i][0].transcript;
                }
                if (final) onResult(final);
            };
            recognitionRef.current.onerror = () => setIsListening(false);
            recognitionRef.current.onend = () => setIsListening(false);
        }
        return () => { if (recognitionRef.current) recognitionRef.current.stop(); };
    }, [onResult]);
    const toggle = useCallback(() => {
        if (!recognitionRef.current) return;
        if (isListening) recognitionRef.current.stop();
        else recognitionRef.current.start();
        setIsListening(!isListening);
    }, [isListening]);
    return { isListening, toggle, supported: !!recognitionRef.current };
};

// Context
const AppContext = createContext();
const AppProvider = ({ children }) => {
    const [view, setView] = useState('dashboard');
    const [cards, setCards] = useState(() => Storage.get('cards', {}));
    const [goals, setGoals] = useState(() => Storage.get('goals', []));
    const [applications, setApplications] = useState(() => Storage.get('applications', []));
    const [stats, setStats] = useState(() => Storage.get('stats', { streak: 0, lastReview: null, totalReviews: 0 }));

    useEffect(() => { Storage.set('cards', cards); }, [cards]);
    useEffect(() => { Storage.set('goals', goals); }, [goals]);
    useEffect(() => { Storage.set('applications', applications); }, [applications]);
    useEffect(() => { Storage.set('stats', stats); }, [stats]);

    const getCardState = useCallback((type, id) => cards[`${type}_${id}`] || SM2.defaultCard(), [cards]);
    
    const gradeCard = useCallback((type, id, quality) => {
        const key = `${type}_${id}`;
        const newCard = SM2.grade(cards[key] || SM2.defaultCard(), quality);
        setCards(prev => ({ ...prev, [key]: newCard }));
        setStats(prev => {
            const today = new Date().toDateString();
            const lastDay = prev.lastReview ? new Date(prev.lastReview).toDateString() : null;
            const yesterday = new Date(Date.now() - 86400000).toDateString();
            let newStreak = prev.streak;
            if (lastDay !== today) {
                newStreak = (lastDay === yesterday) ? prev.streak + 1 : 1;
            }
            return { streak: newStreak, lastReview: Date.now(), totalReviews: prev.totalReviews + 1 };
        });
    }, [cards]);

    const getDueCards = useCallback(() => {
        const now = Date.now();
        return [
            ...KEKICH_CREDOS.map(c => ({ ...c, type: 'kekich' })),
            ...PAULISMS.map(p => ({ ...p, type: 'paulism' }))
        ].map(item => ({ ...item, cardState: getCardState(item.type, item.id) }))
         .filter(item => item.cardState.nextReview <= now)
         .sort((a, b) => a.cardState.nextReview - b.cardState.nextReview);
    }, [getCardState]);

    const addGoal = useCallback((goal) => setGoals(prev => [...prev, { ...goal, id: Date.now(), createdAt: Date.now() }]), []);
    const updateGoal = useCallback((id, updates) => setGoals(prev => prev.map(g => g.id === id ? { ...g, ...updates } : g)), []);
    const deleteGoal = useCallback((id) => setGoals(prev => prev.filter(g => g.id !== id)), []);
    const addApplication = useCallback((app) => setApplications(prev => [...prev, { ...app, id: Date.now(), createdAt: Date.now() }]), []);

    return <AppContext.Provider value={{ view, setView, cards, getCardState, gradeCard, getDueCards, goals, addGoal, updateGoal, deleteGoal, applications, addApplication, stats }}>{children}</AppContext.Provider>;
};
const useApp = () => useContext(AppContext);

// Icons
const Icons = {
    Home: () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
    Cards: () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>,
    Target: () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
    Book: () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>,
    Settings: () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>,
    Mic: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>,
    MicOff: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>,
    Check: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>,
    X: () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
    Plus: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
    Download: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
    Upload: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
    Flame: () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>,
    Clock: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
    Trash: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
    Link: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
    Edit: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
};

// Styles
const S = {
    nav: { display: 'flex', justifyContent: 'space-around', padding: '12px 16px', background: 'var(--bg-secondary)', borderTop: '1px solid var(--border-subtle)', position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100 },
    navItem: (active) => ({ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', padding: '8px 16px', background: 'none', border: 'none', color: active ? 'var(--accent-gold)' : 'var(--text-muted)', cursor: 'pointer', fontSize: '10px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.05em' }),
    main: { flex: 1, overflowY: 'auto', paddingBottom: '100px' },
    header: { padding: '24px 20px 16px', background: 'linear-gradient(180deg, var(--bg-secondary) 0%, var(--bg-primary) 100%)', borderBottom: '1px solid var(--border-subtle)' },
    title: { fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' },
    subtitle: { fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' },
    card: { background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', padding: '20px', margin: '12px 16px' },
    statGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', padding: '16px' },
    statBox: { background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', padding: '16px', textAlign: 'center', border: '1px solid var(--border-subtle)' },
    statValue: { fontFamily: 'var(--font-display)', fontSize: '1.8rem', fontWeight: 700, color: 'var(--accent-gold)' },
    statLabel: { fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: '4px' },
    btn: (v = 'primary') => ({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '14px 24px', borderRadius: 'var(--radius-md)', border: v === 'outline' ? '1px solid var(--border-accent)' : 'none', fontFamily: 'var(--font-body)', fontSize: '0.95rem', fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s', background: v === 'primary' ? 'var(--accent-gold)' : (v === 'outline' ? 'transparent' : 'var(--bg-tertiary)'), color: v === 'primary' ? 'var(--bg-primary)' : 'var(--text-primary)' }),
    input: { width: '100%', padding: '14px 16px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)', fontSize: '1rem', outline: 'none' },
    textarea: { width: '100%', padding: '14px 16px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)', fontSize: '1rem', outline: 'none', resize: 'vertical', minHeight: '100px' },
    label: { display: 'block', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' },
    badge: (c = 'gold') => ({ display: 'inline-block', padding: '4px 10px', borderRadius: '20px', fontFamily: 'var(--font-mono)', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.05em', background: `var(--accent-${c})20`, color: `var(--accent-${c})` }),
    modal: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', zIndex: 1000 },
    modalContent: { background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', padding: '24px', width: '100%', maxWidth: '420px', maxHeight: '85vh', overflowY: 'auto' }
};

// Navigation
const Navigation = () => {
    const { view, setView } = useApp();
    const items = [
        { id: 'dashboard', icon: Icons.Home, label: 'Home' },
        { id: 'review', icon: Icons.Cards, label: 'Review' },
        { id: 'goals', icon: Icons.Target, label: 'Goals' },
        { id: 'library', icon: Icons.Book, label: 'Library' },
        { id: 'settings', icon: Icons.Settings, label: 'Settings' }
    ];
    return (
        <nav style={S.nav}>
            {items.map(item => (
                <button key={item.id} style={S.navItem(view === item.id)} onClick={() => setView(item.id)}>
                    <item.icon />{item.label}
                </button>
            ))}
        </nav>
    );
};

// Dashboard
const Dashboard = () => {
    const { stats, getDueCards, goals, setView, cards } = useApp();
    const dueCards = getDueCards();
    const masteredCount = Object.values(cards).filter(c => c.repetitions >= 5).length;
    return (
        <div>
            <header style={S.header}>
                <h1 style={S.title}>Credo Mastery</h1>
                <p style={S.subtitle}>Internalize. Apply. Transform.</p>
            </header>
            <div style={S.statGrid}>
                <div style={S.statBox}>
                    <div style={{ ...S.statValue, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}><Icons.Flame />{stats.streak}</div>
                    <div style={S.statLabel}>Day Streak</div>
                </div>
                <div style={S.statBox}>
                    <div style={S.statValue}>{dueCards.length}</div>
                    <div style={S.statLabel}>Due Today</div>
                </div>
                <div style={S.statBox}>
                    <div style={S.statValue}>{masteredCount}</div>
                    <div style={S.statLabel}>Mastered</div>
                </div>
            </div>
            {dueCards.length > 0 && (
                <div style={S.card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem' }}>Ready for Review</h2>
                        <span style={S.badge('blue')}>{dueCards.length} cards</span>
                    </div>
                    <button style={{ ...S.btn('primary'), width: '100%' }} onClick={() => setView('review')}>Start Review Session</button>
                </div>
            )}
            <div style={S.card}>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', marginBottom: '16px' }}>Your Goals</h2>
                {goals.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', marginBottom: '16px' }}>No goals yet. Add your first goal to start tracking.</p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                        {goals.slice(0, 3).map(goal => (
                            <div key={goal.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)' }}>
                                <Icons.Target />
                                <span style={{ flex: 1 }}>{goal.name}</span>
                                <span style={S.badge(goal.linkedCredos?.length ? 'green' : 'gold')}>{goal.linkedCredos?.length || 0} linked</span>
                            </div>
                        ))}
                    </div>
                )}
                <button style={{ ...S.btn('outline'), width: '100%' }} onClick={() => setView('goals')}><Icons.Plus /> Manage Goals</button>
            </div>
            <div style={S.card}>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', marginBottom: '8px' }}>Progress</h2>
                <p style={{ color: 'var(--text-muted)', marginBottom: '16px' }}>{stats.totalReviews} total reviews completed</p>
                <div style={{ height: '8px', background: 'var(--bg-tertiary)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${(masteredCount / 111) * 100}%`, height: '100%', background: 'linear-gradient(90deg, var(--accent-gold), var(--accent-green))', borderRadius: '4px', transition: 'width 0.5s ease' }} />
                </div>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '8px' }}>{masteredCount} of 111 principles mastered ({Math.round((masteredCount / 111) * 100)}%)</p>
            </div>
        </div>
    );
};

// Review
const Review = () => {
    const { getDueCards, gradeCard, addApplication } = useApp();
    const [currentIndex, setCurrentIndex] = useState(0);
    const [showAnswer, setShowAnswer] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [note, setNote] = useState('');
    const dueCards = useMemo(() => getDueCards(), [getDueCards]);
    const current = dueCards[currentIndex];

    const handleVoice = useCallback((text) => setNote(p => p + ' ' + text), []);
    const { isListening, toggle, supported } = useVoiceInput(handleVoice);

    const handleGrade = (q) => {
        if (current) gradeCard(current.type, current.id, q);
        setShowAnswer(false);
        setCurrentIndex(i => i < dueCards.length - 1 ? i + 1 : 0);
    };

    const saveApp = () => {
        if (current && note.trim()) {
            addApplication({ credoType: current.type, credoId: current.id, note: note.trim(), credoText: current.type === 'kekich' ? current.text : current.title });
            setNote('');
            setShowModal(false);
        }
    };

    if (dueCards.length === 0) {
        return (
            <div>
                <header style={S.header}><h1 style={S.title}>Review</h1><p style={S.subtitle}>Spaced Repetition</p></header>
                <div style={{ ...S.card, textAlign: 'center', padding: '60px 20px' }}>
                    <div style={{ fontSize: '4rem', marginBottom: '16px' }}>✨</div>
                    <h2 style={{ fontFamily: 'var(--font-display)', marginBottom: '8px' }}>All caught up!</h2>
                    <p style={{ color: 'var(--text-muted)' }}>No cards due for review. Check back later.</p>
                </div>
            </div>
        );
    }

    return (
        <div>
            <header style={S.header}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div><h1 style={S.title}>Review</h1><p style={S.subtitle}>{currentIndex + 1} of {dueCards.length}</p></div>
                    <span style={S.badge(current.type === 'kekich' ? 'gold' : 'purple')}>{current.type === 'kekich' ? 'Kekich' : 'Paulism'}</span>
                </div>
            </header>
            <div style={{ ...S.card, minHeight: '280px', display: 'flex', flexDirection: 'column' }}>
                {current.type === 'kekich' ? (
                    <>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--accent-gold)', marginBottom: '12px' }}>Credo #{current.id}</div>
                        <p style={{ flex: 1, fontFamily: 'var(--font-body)', fontSize: '1.05rem', lineHeight: 1.7 }}>{current.text}</p>
                    </>
                ) : (
                    <>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--accent-purple)', marginBottom: '8px' }}>Paulism #{current.id}</div>
                        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', marginBottom: '16px' }}>{current.title}</h3>
                        <p style={{ fontStyle: 'italic', color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '1rem' }}>"{current.truth}"</p>
                        {showAnswer && (
                            <div style={{ marginTop: '16px' }}>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '12px' }}>The Code</div>
                                <ul style={{ paddingLeft: '20px' }}>
                                    {current.code.map((item, i) => <li key={i} style={{ marginBottom: '8px', color: 'var(--text-secondary)' }}>{item}</li>)}
                                </ul>
                            </div>
                        )}
                    </>
                )}
            </div>
            {!showAnswer ? (
                <div style={{ padding: '0 16px' }}><button style={{ ...S.btn('primary'), width: '100%' }} onClick={() => setShowAnswer(true)}>Show Answer</button></div>
            ) : (
                <div style={{ padding: '0 16px' }}>
                    <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '12px', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>How well did you know this?</p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '12px' }}>
                        {[{ q: 1, label: 'Again', color: 'var(--accent-red)' }, { q: 3, label: 'Hard', color: 'var(--accent-gold-dim)' }, { q: 4, label: 'Good', color: 'var(--accent-blue)' }, { q: 5, label: 'Easy', color: 'var(--accent-green)' }].map(({ q, label, color }) => (
                            <button key={q} style={{ ...S.btn('outline'), padding: '12px', borderColor: color, color }} onClick={() => handleGrade(q)}>{label}</button>
                        ))}
                    </div>
                    <button style={{ ...S.btn('outline'), width: '100%' }} onClick={() => setShowModal(true)}><Icons.Plus /> Log Application</button>
                </div>
            )}
            {showModal && (
                <div style={S.modal}>
                    <div style={S.modalContent}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ fontFamily: 'var(--font-display)' }}>Log Application</h3>
                            <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => setShowModal(false)}><Icons.X /></button>
                        </div>
                        <label style={S.label}>How did you apply this principle?</label>
                        <div style={{ position: 'relative' }}>
                            <textarea style={S.textarea} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Describe the situation..." />
                            {supported && (
                                <button style={{ position: 'absolute', right: '12px', bottom: '12px', background: isListening ? 'var(--accent-red)' : 'var(--bg-tertiary)', border: 'none', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-primary)' }} onClick={toggle}>
                                    {isListening ? <Icons.MicOff /> : <Icons.Mic />}
                                </button>
                            )}
                        </div>
                        <button style={{ ...S.btn('primary'), width: '100%', marginTop: '16px' }} onClick={saveApp} disabled={!note.trim()}>Save Application</button>
                    </div>
                </div>
            )}
        </div>
    );
};

// Goals
const Goals = () => {
    const { goals, addGoal, updateGoal, deleteGoal } = useApp();
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({ name: '', targetDate: '', linkedCredos: [] });
    const [showLink, setShowLink] = useState(false);
    const [search, setSearch] = useState('');

    const handleVoice = useCallback((text) => setForm(p => ({ ...p, name: p.name + ' ' + text })), []);
    const { isListening, toggle, supported } = useVoiceInput(handleVoice);

    const allCredos = useMemo(() => [
        ...KEKICH_CREDOS.map(c => ({ ...c, type: 'kekich', display: `K#${c.id}: ${c.text.substring(0, 50)}...` })),
        ...PAULISMS.map(p => ({ ...p, type: 'paulism', display: `P#${p.id}: ${p.title}` }))
    ], []);

    const filtered = useMemo(() => {
        if (!search) return allCredos;
        const t = search.toLowerCase();
        return allCredos.filter(c => c.display.toLowerCase().includes(t) || (c.text && c.text.toLowerCase().includes(t)) || (c.truth && c.truth.toLowerCase().includes(t)));
    }, [allCredos, search]);

    const save = () => {
        if (form.name.trim()) {
            if (editing) updateGoal(editing.id, form);
            else addGoal(form);
            setForm({ name: '', targetDate: '', linkedCredos: [] });
            setEditing(null);
            setShowModal(false);
        }
    };

    const edit = (g) => {
        setEditing(g);
        setForm({ name: g.name, targetDate: g.targetDate || '', linkedCredos: g.linkedCredos || [] });
        setShowModal(true);
    };

    const toggleLink = (c) => {
        const key = `${c.type}_${c.id}`;
        setForm(p => ({ ...p, linkedCredos: p.linkedCredos.includes(key) ? p.linkedCredos.filter(x => x !== key) : [...p.linkedCredos, key] }));
    };

    return (
        <div>
            <header style={S.header}><h1 style={S.title}>Goals</h1><p style={S.subtitle}>Track your transformation</p></header>
            <div style={{ padding: '16px' }}>
                <button style={{ ...S.btn('primary'), width: '100%' }} onClick={() => { setEditing(null); setForm({ name: '', targetDate: '', linkedCredos: [] }); setShowModal(true); }}><Icons.Plus /> Add New Goal</button>
            </div>
            {goals.length === 0 ? (
                <div style={{ ...S.card, textAlign: 'center', padding: '40px 20px' }}>
                    <Icons.Target />
                    <h3 style={{ fontFamily: 'var(--font-display)', marginTop: '16px' }}>No Goals Yet</h3>
                    <p style={{ color: 'var(--text-muted)', marginTop: '8px' }}>Add your first goal and link relevant credos.</p>
                </div>
            ) : (
                goals.map(goal => (
                    <div key={goal.id} style={S.card}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem' }}>{goal.name}</h3>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => edit(goal)}><Icons.Edit /></button>
                                <button style={{ background: 'none', border: 'none', color: 'var(--accent-red)', cursor: 'pointer' }} onClick={() => deleteGoal(goal.id)}><Icons.Trash /></button>
                            </div>
                        </div>
                        {goal.targetDate && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}><Icons.Clock /> Target: {new Date(goal.targetDate).toLocaleDateString()}</p>}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {(goal.linkedCredos || []).map(key => {
                                const [type, id] = key.split('_');
                                const credo = type === 'kekich' ? KEKICH_CREDOS.find(c => c.id === parseInt(id)) : PAULISMS.find(p => p.id === parseInt(id));
                                return credo ? <span key={key} style={S.badge(type === 'kekich' ? 'gold' : 'purple')}>{type === 'kekich' ? `K#${id}` : credo.title}</span> : null;
                            })}
                            {(!goal.linkedCredos || goal.linkedCredos.length === 0) && <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No credos linked</span>}
                        </div>
                    </div>
                ))
            )}
            {showModal && (
                <div style={S.modal}>
                    <div style={S.modalContent}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ fontFamily: 'var(--font-display)' }}>{editing ? 'Edit Goal' : 'New Goal'}</h3>
                            <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => setShowModal(false)}><Icons.X /></button>
                        </div>
                        <div style={{ marginBottom: '16px' }}>
                            <label style={S.label}>Goal Name</label>
                            <div style={{ position: 'relative' }}>
                                <input style={S.input} value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g., Financial Independence 2026" />
                                {supported && <button style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: isListening ? 'var(--accent-red)' : 'transparent', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={toggle}>{isListening ? <Icons.MicOff /> : <Icons.Mic />}</button>}
                            </div>
                        </div>
                        <div style={{ marginBottom: '16px' }}>
                            <label style={S.label}>Target Date (Optional)</label>
                            <input type="date" style={S.input} value={form.targetDate} onChange={(e) => setForm(p => ({ ...p, targetDate: e.target.value }))} />
                        </div>
                        <div style={{ marginBottom: '16px' }}>
                            <label style={S.label}>Linked Credos ({form.linkedCredos.length})</label>
                            <button style={{ ...S.btn('outline'), width: '100%' }} onClick={() => setShowLink(true)}><Icons.Link /> Link Credos</button>
                        </div>
                        <button style={{ ...S.btn('primary'), width: '100%' }} onClick={save} disabled={!form.name.trim()}>{editing ? 'Update Goal' : 'Create Goal'}</button>
                    </div>
                </div>
            )}
            {showLink && (
                <div style={{ ...S.modal, zIndex: 1001 }}>
                    <div style={{ ...S.modalContent, maxWidth: '100%', height: '100%', maxHeight: '100%', borderRadius: 0, display: 'flex', flexDirection: 'column' }}>
                        <div style={{ padding: '0 0 16px', borderBottom: '1px solid var(--border-subtle)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                <h3 style={{ fontFamily: 'var(--font-display)' }}>Link Credos</h3>
                                <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => setShowLink(false)}><Icons.X /></button>
                            </div>
                            <input style={S.input} placeholder="Search credos..." value={search} onChange={(e) => setSearch(e.target.value)} />
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', paddingTop: '16px' }}>
                            {filtered.map(credo => {
                                const key = `${credo.type}_${credo.id}`;
                                const linked = form.linkedCredos.includes(key);
                                return (
                                    <div key={key} style={{ padding: '14px', background: linked ? 'var(--accent-gold)10' : 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', marginBottom: '8px', cursor: 'pointer', border: linked ? '1px solid var(--accent-gold)' : '1px solid var(--border-subtle)' }} onClick={() => toggleLink(credo)}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <div style={{ width: '22px', height: '22px', borderRadius: '4px', border: `2px solid ${linked ? 'var(--accent-gold)' : 'var(--border-accent)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: linked ? 'var(--accent-gold)' : 'transparent', color: 'var(--bg-primary)' }}>{linked && <Icons.Check />}</div>
                                            <div style={{ flex: 1 }}>
                                                <span style={S.badge(credo.type === 'kekich' ? 'gold' : 'purple')}>{credo.type === 'kekich' ? `Kekich #${credo.id}` : `Paulism`}</span>
                                                <p style={{ marginTop: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{credo.type === 'kekich' ? credo.text.substring(0, 80) + '...' : credo.title}</p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <button style={{ ...S.btn('primary'), marginTop: '16px' }} onClick={() => setShowLink(false)}>Done ({form.linkedCredos.length} selected)</button>
                    </div>
                </div>
            )}
        </div>
    );
};

// Library
const Library = () => {
    const { getCardState } = useApp();
    const [tab, setTab] = useState('kekich');
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState(null);

    const items = tab === 'kekich' ? KEKICH_CREDOS : PAULISMS;
    const filtered = items.filter(item => {
        const t = search.toLowerCase();
        if (tab === 'kekich') return item.text.toLowerCase().includes(t) || item.category.includes(t);
        return item.title.toLowerCase().includes(t) || item.truth.toLowerCase().includes(t);
    });

    return (
        <div>
            <header style={S.header}><h1 style={S.title}>Library</h1><p style={S.subtitle}>All principles</p></header>
            <div style={{ display: 'flex', padding: '0 16px', gap: '8px', marginBottom: '8px' }}>
                <button style={{ ...S.btn(tab === 'kekich' ? 'primary' : 'outline'), flex: 1, padding: '10px' }} onClick={() => setTab('kekich')}>Kekich (100)</button>
                <button style={{ ...S.btn(tab === 'paulism' ? 'primary' : 'outline'), flex: 1, padding: '10px' }} onClick={() => setTab('paulism')}>Paulisms (11)</button>
            </div>
            <div style={{ padding: '8px 16px' }}><input style={S.input} placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
            <div style={{ padding: '0 16px' }}>
                {filtered.map(item => {
                    const state = getCardState(tab, item.id);
                    const mastered = state.repetitions >= 5;
                    return (
                        <div key={item.id} style={{ ...S.card, margin: '8px 0', cursor: 'pointer' }} onClick={() => setSelected(item)}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                        <span style={S.badge(tab === 'kekich' ? 'gold' : 'purple')}>#{item.id}</span>
                                        {mastered && <span style={S.badge('green')}>Mastered</span>}
                                    </div>
                                    <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>{tab === 'kekich' ? item.text.substring(0, 100) + '...' : item.title}</p>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
            {selected && (
                <div style={S.modal}>
                    <div style={S.modalContent}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <span style={S.badge(tab === 'kekich' ? 'gold' : 'purple')}>{tab === 'kekich' ? `Kekich #${selected.id}` : `Paulism #${selected.id}`}</span>
                            <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => setSelected(null)}><Icons.X /></button>
                        </div>
                        {tab === 'kekich' ? (
                            <>
                                <p style={{ fontSize: '1.05rem', lineHeight: 1.7, marginBottom: '16px' }}>{selected.text}</p>
                                <span style={S.badge('blue')}>{selected.category}</span>
                            </>
                        ) : (
                            <>
                                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', marginBottom: '12px' }}>{selected.title}</h3>
                                <p style={{ fontStyle: 'italic', color: 'var(--text-secondary)', marginBottom: '20px' }}>"{selected.truth}"</p>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '12px' }}>The Code</div>
                                <ul style={{ paddingLeft: '20px' }}>
                                    {selected.code.map((item, i) => <li key={i} style={{ marginBottom: '8px', color: 'var(--text-secondary)' }}>{item}</li>)}
                                </ul>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

// Settings
const Settings = () => {
    const { applications, stats } = useApp();
    const fileInputRef = useRef(null);

    const exportData = () => {
        const data = Storage.exportAll();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `credo-mastery-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const importData = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const data = JSON.parse(ev.target.result);
                    Object.entries(data).forEach(([key, value]) => localStorage.setItem(key, JSON.stringify(value)));
                    window.location.reload();
                } catch (err) {
                    alert('Invalid backup file');
                }
            };
            reader.readAsText(file);
        }
    };

    return (
        <div>
            <header style={S.header}><h1 style={S.title}>Settings</h1><p style={S.subtitle}>Backup & Data</p></header>
            <div style={S.card}>
                <h3 style={{ fontFamily: 'var(--font-display)', marginBottom: '16px' }}>Backup & Restore</h3>
                <p style={{ color: 'var(--text-muted)', marginBottom: '16px', fontSize: '0.9rem' }}>Export your data to save it, or import a backup to restore.</p>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button style={{ ...S.btn('primary'), flex: 1 }} onClick={exportData}><Icons.Download /> Export</button>
                    <button style={{ ...S.btn('outline'), flex: 1 }} onClick={() => fileInputRef.current?.click()}><Icons.Upload /> Import</button>
                    <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={importData} />
                </div>
            </div>
            <div style={S.card}>
                <h3 style={{ fontFamily: 'var(--font-display)', marginBottom: '16px' }}>Statistics</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div style={{ padding: '12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent-gold)' }}>{stats.totalReviews}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total Reviews</div>
                    </div>
                    <div style={{ padding: '12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent-gold)' }}>{applications.length}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Applications Logged</div>
                    </div>
                </div>
            </div>
            {applications.length > 0 && (
                <div style={S.card}>
                    <h3 style={{ fontFamily: 'var(--font-display)', marginBottom: '16px' }}>Recent Applications</h3>
                    {applications.slice(-5).reverse().map(app => (
                        <div key={app.id} style={{ padding: '12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', marginBottom: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <span style={S.badge(app.credoType === 'kekich' ? 'gold' : 'purple')}>{app.credoType === 'kekich' ? `K#${app.credoId}` : app.credoText}</span>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(app.createdAt).toLocaleDateString()}</span>
                            </div>
                            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{app.note}</p>
                        </div>
                    ))}
                </div>
            )}
            <div style={{ padding: '16px', textAlign: 'center' }}>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>Credo Mastery v1.0</p>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '4px' }}>Built for Paul Huff</p>
            </div>
        </div>
    );
};

// App
const App = () => {
    const { view } = useApp();
    const views = { dashboard: Dashboard, review: Review, goals: Goals, library: Library, settings: Settings };
    const View = views[view] || Dashboard;
    return (
        <>
            <main style={S.main}><View /></main>
            <Navigation />
        </>
    );
};

// Render
ReactDOM.createRoot(document.getElementById('root')).render(
    <AppProvider><App /></AppProvider>
);
