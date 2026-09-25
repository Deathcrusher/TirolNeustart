
import React, { useState, useEffect } from 'react';
import { aiSearchService } from './services/aiSearchService';
import { joobleService } from './services/joobleService';
import { jobSearchService } from './services/jobSearchService';
import { JobListing, GroundingSource, SearchResult } from './types';
import JobCard from './components/JobCard';

const LOCATION_OPTIONS = [
  'Tirol',
  'Innsbruck',
  'Kufstein',
  'Wörgl',
  'Schwaz',
  'Hall in Tirol',
  'Kitzbühel',
  'Imst',
  'Landeck',
  'Lienz',
  'Reutte',
  'Telfs',
];

const normalizeSourceLabel = (source: string) => {
  const normalized = source.toLowerCase();
  if (normalized.includes('metajob')) return 'METAJob';
  if (normalized.includes('jooble')) return 'Jooble';
  return source;
};

const SOURCE_FILTER_BLOCKLIST = new Set(['willhaben Jobs', 'AMS alle jobs', 'Indeed AT']);

const App: React.FC = () => {
  const [query, setQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('Quereinsteiger Jobs Tirol');
  const [location, setLocation] = useState('Tirol');
  const [activeLocation, setActiveLocation] = useState('Tirol');
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [summary, setSummary] = useState('');
  const [sources, setSources] = useState<GroundingSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreNotice, setLoadMoreNotice] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedSource, setSelectedSource] = useState('Alle');
  
  // Settings state
  const [showSettings, setShowSettings] = useState(false);
  const [joobleApiKey, setJoobleApiKey] = useState('');
  const [useFastSearch, setUseFastSearch] = useState(false);
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [savedJobs, setSavedJobs] = useState<JobListing[]>([]);
  const [showSavedJobs, setShowSavedJobs] = useState(false);
  const [authChecked, setAuthChecked] = useState(import.meta.env.DEV);
  const [isAuthenticated, setIsAuthenticated] = useState(import.meta.env.DEV);
  const [authUsername, setAuthUsername] = useState('admin');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authSetupError, setAuthSetupError] = useState('');

  useEffect(() => {
    if (import.meta.env.DEV) return;

    fetch('/api/auth', { credentials: 'same-origin' })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (response.status === 503) setAuthSetupError(data.error || 'Der Zugriffsschutz ist nicht eingerichtet.');
        setIsAuthenticated(response.ok && data.authenticated === true);
      })
      .catch(() => setAuthError('Der Anmeldestatus konnte nicht geprüft werden. Bitte lade die Seite erneut.'))
      .finally(() => setAuthChecked(true));
  }, []);

  // Load settings from localStorage on mount
  useEffect(() => {
    try {
      const savedJoobleApiKey = localStorage.getItem('jooble_api_key') || '';
      const savedLocation = localStorage.getItem('job_location') || 'Tirol';
      const savedUseJooble = localStorage.getItem('use_fast_search') === 'true';
      const savedRemoteOnly = localStorage.getItem('remote_only') === 'true';
      const savedDarkMode = localStorage.getItem('dark_mode') === 'true';
      const savedJobsJson = localStorage.getItem('saved_jobs') || '[]';
      const parsedSavedJobs = JSON.parse(savedJobsJson) as JobListing[];
      localStorage.removeItem('gemini_api_key');
      localStorage.removeItem('gemini_model');
      setJoobleApiKey(savedJoobleApiKey);
      setLocation(savedLocation);
      setActiveLocation(savedLocation);
      setUseFastSearch(savedUseJooble);
      setRemoteOnly(savedRemoteOnly);
      setDarkMode(savedDarkMode);
      setSavedJobs(parsedSavedJobs);
      joobleService.setApiKey(savedJoobleApiKey);
    } catch (e) {}
  }, []);

  const toggleSaveJob = (job: JobListing) => {
    setSavedJobs(prev => {
      const isAlreadySaved = prev.some(j => j.url === job.url);
      let newSavedJobs: JobListing[];
      if (isAlreadySaved) {
        newSavedJobs = prev.filter(j => j.url !== job.url);
      } else {
        newSavedJobs = [...prev, job];
      }
      try {
        localStorage.setItem('saved_jobs', JSON.stringify(newSavedJobs));
      } catch (e) {}
      return newSavedJobs;
    });
  };

  const saveSettings = () => {
    try {
      localStorage.setItem('jooble_api_key', joobleApiKey);
      localStorage.setItem('job_location', location);
      localStorage.setItem('use_fast_search', String(useFastSearch));
      localStorage.setItem('dark_mode', String(darkMode));
      joobleService.setApiKey(joobleApiKey);
      setShowSettings(false);
    } catch (e) {}
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthError('');
    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ username: authUsername, password: authPassword }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 503) setAuthSetupError(data.error || 'Der Zugriffsschutz ist nicht eingerichtet.');
        setAuthError(data.error || 'Die Anmeldung ist fehlgeschlagen.');
        return;
      }
      setAuthPassword('');
      setIsAuthenticated(true);
    } catch {
      setAuthError('Der Anmeldedienst ist gerade nicht erreichbar. Bitte versuche es erneut.');
    }
  };

  const handleLogout = async () => {
    try {
      const response = await fetch('/api/auth', { method: 'DELETE', credentials: 'same-origin' });
      if (!response.ok) throw new Error('Abmeldung fehlgeschlagen.');
      setIsAuthenticated(false);
      setAuthError('');
    } catch {
      setAuthError('Die Abmeldung hat nicht geklappt. Bitte versuche es erneut.');
    }
  };

  const getFriendlyError = (err: any) => {
    const message = err?.message || '';
    if (message.includes('Jooble API Error: 404')) {
      return 'Jooble meldet 404. Das liegt oft an einem ungültigen API-Key ODER daran, dass kein Proxy aktiv ist. Key prüfen (jooble.org/api/about), neu speichern und die Anfrage erneut testen.';
    }
    if (message.includes('OPENAI_API_KEY')) {
      return 'Der OpenAI API-Key fehlt. Hinterlege OPENAI_API_KEY in den Vercel-Umgebungsvariablen und deploye die App erneut.';
    }
    if (message.includes('OpenAI hat den API-Schlüssel abgelehnt')) {
      return message;
    }
    if (message.includes('OpenAI-Limit')) {
      return message;
    }
    return `Hoppla, da lief was schief: ${message || 'Unbekannter Fehler'}.`;
  };

  const handleSearch = async (e?: React.FormEvent, customQuery?: string, remoteOnlyOverride?: boolean) => {
    if (e) e.preventDefault();
    const targetQuery = customQuery || query;
    const activeRemoteOnly = remoteOnlyOverride ?? remoteOnly;
    if (!targetQuery.trim()) return;

    // Update state to reflect what is being searched if triggered via button
    if (customQuery) setQuery(customQuery);

    setLoading(true);
    setError(null);
    setLoadMoreNotice(null);
    setJobs([]);
    setCurrentPage(0);
    setHasSearched(true);
    setShowSavedJobs(false);
    setSelectedSource('Alle');
    setActiveQuery(targetQuery);
    setActiveLocation(location);

    try {
      let data: SearchResult | null = null;
      
      // Use the scraper/Jooble path only when fast search is selected.
      if (useFastSearch) {
        data = await jobSearchService.searchJobs(targetQuery, location, 0, '', activeRemoteOnly);
      } else {
        data = await aiSearchService.searchJobs(targetQuery, 0, location, [], activeRemoteOnly);
      }
      
      setJobs(data.jobs);
      setCurrentPage(0);
      setSummary(data.summary);
      setSources(data.groundingSources);
      if (data.jobs.length === 0) {
        setError("Keine passenden Einstiegs-Jobs gefunden. Versuch es mal mit einer anderen Kategorie.");
      }
    } catch (err: any) {
      setError(getFriendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleLoadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    setError(null);
    setLoadMoreNotice(null);

    try {
      let data: SearchResult | null = null;
      let nextPage = currentPage;
      let newUniqueJobs: JobListing[] = [];
      const currentUrls = new Set(jobs.map(j => j.url));
      
      // Use the scraper/Jooble path only when fast search is selected.
      if (useFastSearch) {
        for (let attempt = 0; attempt < 3; attempt++) {
          nextPage += 1;
          data = await jobSearchService.searchJobs(activeQuery, activeLocation, nextPage, selectedSource === 'Alle' ? '' : selectedSource, remoteOnly);
          newUniqueJobs = data.jobs.filter(j => !currentUrls.has(j.url));

          if (newUniqueJobs.length > 0 || data.jobs.length === 0) {
            break;
          }
        }

        setCurrentPage(nextPage);
      } else {
        data = await aiSearchService.searchJobs(activeQuery, jobs.length, activeLocation, jobs.map(job => job.url), remoteOnly);
        newUniqueJobs = data.jobs.filter(j => !currentUrls.has(j.url));
      }

      if (newUniqueJobs.length === 0) {
        setLoadMoreNotice('Gerade keine weiteren neuen Treffer gefunden. Versuch es später nochmal oder ändere den Suchbegriff.');
      } else {
        setJobs(prev => [...prev, ...newUniqueJobs]);
        setSources(prev => {
          const existingUris = new Set(prev.map(s => s.uri));
          const newSources = (data?.groundingSources || []).filter(s => !existingUris.has(s.uri));
          return [...prev, ...newSources];
        });
      }
    } catch (err: any) {
      console.error("Load more error", err);
      setError(getFriendlyError(err));
    } finally {
      setLoadingMore(false);
    }
  };

  const handleSourceFilterChange = async (source: string) => {
    setSelectedSource(source);
    setLoadMoreNotice(null);

    if (source === 'Alle' || !useFastSearch || loading || loadingMore) return;

    const existingSourceJobs = jobs.filter((job) => normalizeSourceLabel(job.source) === source);
    if (existingSourceJobs.length > 0) return;

    setLoadingMore(true);
    try {
      const data = await jobSearchService.searchJobs(activeQuery, activeLocation, 0, source, remoteOnly);
      const currentUrls = new Set(jobs.map((job) => job.url));
      const newUniqueJobs = data.jobs.filter((job) => !currentUrls.has(job.url));

      if (newUniqueJobs.length > 0) {
        setJobs((prev) => [...prev, ...newUniqueJobs]);
        setSources((prev) => {
          const existingUris = new Set(prev.map((item) => item.uri));
          const newSources = data.groundingSources.filter((item) => !existingUris.has(item.uri));
          return [...prev, ...newSources];
        });
      } else {
        setLoadMoreNotice(`Bei ${source} wurden gerade keine zusätzlichen Treffer gefunden.`);
      }
    } catch (err: any) {
      setError(getFriendlyError(err));
    } finally {
      setLoadingMore(false);
    }
  };

  const categories = [
    { label: "Quereinsteiger", icon: "fa-random", search: "Quereinsteiger" },
    { label: "Ohne Vorkenntnisse", icon: "fa-user-graduate", search: "Ohne Vorkenntnisse" },
    { label: "Beauty & Wellness", icon: "fa-spa", search: "Beauty Wellness" },
    { label: "Remote / Homeoffice", icon: "fa-laptop-house", search: "Homeoffice Remote" },
    { label: "Büroassistenz", icon: "fa-print", search: "Büroassistenz" },
    { label: "Verkauf & Mode", icon: "fa-tshirt", search: "Verkauf Mode" },
  ];

  const sourceCounts = jobs.reduce<Record<string, number>>((counts, job) => {
    const source = normalizeSourceLabel(job.source);
    counts[source] = (counts[source] || 0) + 1;
    return counts;
  }, {});
  const sourceOptions = [
    'Alle',
    ...Array.from(new Set([
      ...Object.keys(sourceCounts),
      ...sources.map((source) => normalizeSourceLabel(source.title)),
    ])).filter((source) => !SOURCE_FILTER_BLOCKLIST.has(source)),
  ];
  const filteredJobs = selectedSource === 'Alle'
    ? jobs
    : jobs.filter((job) => normalizeSourceLabel(job.source) === selectedSource);
  const selectedSourceStillAvailable = selectedSource === 'Alle' || sourceOptions.includes(selectedSource);

  if (!authChecked || !isAuthenticated) {
    return (
      <main className="auth-screen">
        <section className="auth-panel">
          <div className="auth-brand">
            <div className="auth-brand-mark" aria-hidden="true">
              <svg viewBox="0 0 40 40" fill="none">
                <path d="M4 29.5 15.8 12l6.4 9.1 3.5-4.7L36 29.5H4Z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
                <path d="M8 33h24" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </div>
            <div className="auth-brand-copy">
              <h1 className="auth-brand-name">Tirol<span>Neustart</span></h1>
              <p className="auth-brand-caption">Private Jobsuche</p>
            </div>
          </div>

          <div className="auth-intro">
            <p className="auth-eyebrow">Dein persönlicher Jobfinder</p>
            <h2>Schön, dass du da bist.</h2>
            <p>Melde dich an, um deine Jobsuche fortzusetzen.</p>
          </div>

          {!authChecked ? (
            <p className="auth-status">Zugriff wird geprüft …</p>
          ) : authSetupError ? (
            <div className="auth-setup-error" role="status">
              <strong>Der Zugriffsschutz ist noch nicht eingerichtet.</strong>
              <p>{authSetupError}</p>
            </div>
          ) : (
            <form onSubmit={handleLogin} className="auth-form">
              <div>
                <label htmlFor="access-username" className="auth-label">Benutzername</label>
                <input
                  id="access-username"
                  type="text"
                  autoComplete="username"
                  autoFocus
                  required
                  value={authUsername}
                  onChange={(event) => setAuthUsername(event.target.value)}
                  className="auth-input"
                />
              </div>
              <div>
                <label htmlFor="access-password" className="auth-label">Zugangspasswort</label>
                <input
                  id="access-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={authPassword}
                  onChange={(event) => setAuthPassword(event.target.value)}
                  className="auth-input"
                />
              </div>
              {authError && <p role="alert" className="auth-error">{authError}</p>}
              <button type="submit" className="auth-submit">
                Anmelden
              </button>
            </form>
          )}
        </section>
      </main>
    );
  }

  return (
    <div className={`site-shell ${darkMode ? 'is-dark' : ''}`}>
      {/* Navbar */}
      <nav className="site-nav">
        <div className="site-nav__inner">
          <a className="brand-lockup" href="#start" aria-label="TirolNeustart Startseite">
            <div className="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 40 40" fill="none">
                <path d="M4 29.5 15.8 12l6.4 9.1 3.5-4.7L36 29.5H4Z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
                <path d="m12.2 29.5 4.9-7.3 4.7 7.3M25.8 23.7l2.6-3.5 5.1 9.3" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M8 33h24" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <h1 className="brand-name">Tirol<span>Neustart</span></h1>
              <p className="brand-caption">Ein Jobfinder für neue Wege</p>
            </div>
          </a>
          <div className="nav-actions">
             {!import.meta.env.DEV && (
               <button
                 onClick={() => void handleLogout()}
                 className="nav-action"
                 aria-label="Abmelden"
               >
                 <i className="fas fa-sign-out-alt"></i>
                 <span>Abmelden</span>
               </button>
             )}
             <button
               onClick={() => setShowSavedJobs(!showSavedJobs)}
               className={`nav-action ${showSavedJobs ? 'nav-action--active' : ''}`}
               aria-pressed={showSavedJobs}
             >
               <i className="fas fa-bookmark"></i>
               <span>Merkliste</span>
               {savedJobs.length > 0 && <span className="nav-action__count">{savedJobs.length}</span>}
             </button>
             <button
               onClick={() => setShowSettings(true)}
               className="nav-action"
             >
               <i className="fas fa-cog"></i>
               <span>Einstellungen</span>
             </button>
           </div>
        </div>
      </nav>

      {/* Settings Modal */}
      {showSettings && (
        <div className="settings-overlay" role="presentation" onClick={(event) => {
          if (event.target === event.currentTarget) setShowSettings(false);
        }}>
          <div className={`settings-panel ${darkMode ? 'is-dark' : ''}`} role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <div className="flex items-center justify-between mb-6">
              <h3 id="settings-title" className={`text-xl font-bold flex items-center gap-2 ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                <i className="fas fa-cog text-emerald-500"></i>
                Einstellungen
              </h3>
              <button
                onClick={() => setShowSettings(false)}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${darkMode ? 'bg-zinc-700 hover:bg-zinc-600' : 'bg-slate-100 hover:bg-slate-200'}`}
              >
                <i className={`fas fa-times ${darkMode ? 'text-zinc-400' : 'text-slate-500'}`}></i>
              </button>
            </div>
            
            <div className="space-y-6">
              <div className="rounded-lg border-2 border-emerald-100 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950">
                <p className="font-bold text-emerald-900 dark:text-emerald-100">
                  <i className="fas fa-wand-magic-sparkles mr-2"></i>
                  KI-Suche mit GPT-6 Luna
                </p>
                <p className="mt-2 text-xs leading-relaxed text-emerald-800 dark:text-emerald-200">
                  Der OpenAI API-Key wird serverseitig in Vercel unter <code>OPENAI_API_KEY</code> gespeichert. Er wird nicht im Browser abgelegt.
                </p>
              </div>

              {/* Jooble API Key Setting */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  <i className="fas fa-key text-blue-500 mr-2"></i>
                  Jooble API Key
                </label>
                <input
                  type="password"
                  value={joobleApiKey}
                  onChange={(e) => setJoobleApiKey(e.target.value)}
                  placeholder="Gib deinen Jooble Key ein..."
                  className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none transition-all font-medium"
                />
                <p className="text-xs text-slate-500 mt-2">
                  Jooble API-Key holen bei{' '}
                  <a href="https://jooble.org/api/about" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                    jooble.org/api/about
                  </a>
                </p>
              </div>

              {/* Fast Search Toggle */}
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border-2 border-slate-200 dark:bg-slate-800 dark:border-slate-700">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center dark:bg-blue-900 dark:text-blue-400">
                    <i className="fas fa-briefcase"></i>
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 dark:text-slate-200 text-sm">Schnelle Suche verwenden</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Eigene Scraper und Jooble kombinieren</p>
                  </div>
                </div>
                <button
                  onClick={() => setUseFastSearch(!useFastSearch)}
                  className={`relative w-14 h-8 rounded-lg transition-colors ${useFastSearch ? 'bg-emerald-500' : 'bg-slate-300'} dark:${useFastSearch ? 'bg-emerald-500' : 'bg-slate-600'}`}
                >
                  <div className={`absolute top-1 w-6 h-6 bg-white rounded-md shadow-md transition-transform ${useFastSearch ? 'left-7' : 'left-1'}`}></div>
                </button>
              </div>

              {/* Dark Mode Toggle */}
              <div className={`flex items-center justify-between p-4 rounded-lg border-2 ${darkMode ? 'bg-zinc-700 border-zinc-600' : 'bg-slate-50 border-slate-200'}`}>
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${darkMode ? 'bg-violet-900 text-violet-400' : 'bg-violet-100 text-violet-600'}`}>
                    <i className={`fas ${darkMode ? 'fa-sun' : 'fa-moon'}`}></i>
                  </div>
                  <div>
                    <p className={`font-bold text-sm ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>Dark Mode</p>
                    <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Augen schonend im Dunkeln</p>
                  </div>
                </div>
                <button
                  onClick={() => setDarkMode(!darkMode)}
                  className={`relative w-14 h-8 rounded-lg transition-colors ${darkMode ? 'bg-violet-500' : 'bg-slate-300'}`}
                  aria-label="Toggle Dark Mode"
                >
                  <div className={`absolute top-1 w-6 h-6 bg-white rounded-md shadow-md transition-transform ${darkMode ? 'left-7' : 'left-1'}`}></div>
                </button>
              </div>

              {/* Save Button */}
              <button
                onClick={saveSettings}
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-lg transition-colors shadow-lg shadow-emerald-200"
              >
                <i className="fas fa-save mr-2"></i>
                Speichern
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Brand story and personal search profile */}
      <section className="hero-shell" id="start">
        <div className="hero-shell__inner">
          <div className="hero-overline">Für deinen nächsten Schritt in Tirol</div>
          <div className="hero-grid">
            <div className="hero-copy">
              <h2>Arbeit, die<br />ins Leben <em>passt.</em></h2>
              <p className="hero-copy__lead">
                Ein Neustart muss sich gut anfühlen. Wir suchen Teilzeitstellen, die Platz lassen für alles, was dir sonst noch wichtig ist.
              </p>
              <div className="hero-copy__foot">
                <i className="fas fa-sun"></i>
                <span>Mit Ruhe suchen. Mit Zuversicht starten.</span>
              </div>
            </div>

            <aside className="profile-card" aria-label="Connies Suchprofil">
              <div className="profile-card__head">
                <span className="profile-card__label"><i className="fas fa-sparkles"></i> Connies Suchprofil</span>
                <span className="profile-card__badge"><span></span> persönlich</span>
              </div>
              <h3>Mehr Raum für deine Pläne.</h3>
              <p className="profile-card__copy">Die passende Arbeit soll sich an dein Leben anpassen – und nicht umgekehrt.</p>
              <div className="profile-card__metrics">
                <div className="profile-metric"><strong>≤20</strong><span>Stunden pro Woche</span></div>
                <div className="profile-metric"><strong>Sa</strong><span>bleibt frei</span></div>
              </div>
              <div className="profile-card__tags">
                <span>Freitag nachmittags frei</span>
                <span>Make-up-Ausbildung</span>
              </div>
              <svg className="profile-card__landscape" viewBox="0 0 520 100" preserveAspectRatio="none" aria-hidden="true">
                <path d="M0 74 95 31l67 39 89-60 94 58 70-32 105 50v14H0Z" fill="#b9c8a9" />
                <path d="m0 76 95-45 29 17-20-4-9 7 31-5 36 24 89-60 41 25-27-9-16 8 28-5 47 30 70-32 32 19-19-5-12 8 28-5 97 45H0Z" fill="#8fa78b" />
                <path d="M0 83c86-18 143 3 224-2s160-20 296 2v17H0Z" fill="#718c74" />
              </svg>
            </aside>
          </div>
          <p className="hero-footnote">Weniger Druck. Mehr Perspektive. Dein Tempo.</p>
        </div>
      </section>

      {/* Search */}
      <section className="search-wrap" aria-label="Jobs suchen">
        <div className="search-card">
          <div className="search-card__heading">
            <div>
              <h2 className="search-card__title">Wonach suchst du?</h2>
              <p className="search-card__hint">Ein Begriff genügt – wir kümmern uns um den Rest.</p>
            </div>
            <span className="search-engine"><i className="fas fa-wand-magic-sparkles"></i>{useFastSearch ? 'Schnelle Suche' : 'KI-Suche mit GPT-6 Luna'}</span>
          </div>

          <form onSubmit={(e) => handleSearch(e)} className="job-search-form">
            <label>
              <span className="field-label">Beruf oder Stichwort</span>
              <div className="search-field">
                <i className="fas fa-magnifying-glass search-field__icon" aria-hidden="true"></i>
                <input
                  type="text"
                  className="search-input"
                  placeholder="Zum Beispiel Büro, Beauty oder Verkauf"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </label>

            <label>
              <span className="field-label">Region</span>
              <select
                value={location}
                onChange={(e) => {
                  setLocation(e.target.value);
                  try {
                    localStorage.setItem('job_location', e.target.value);
                  } catch (err) {}
                }}
                className="search-select"
              >
                {LOCATION_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option === 'Tirol' ? 'Ganz Tirol' : option}
                  </option>
                ))}
              </select>
            </label>

            <button type="submit" className="search-submit">
              Suchen <i className="fas fa-arrow-right" aria-hidden="true"></i>
            </button>
          </form>

          <div className="search-options">
            <label className="remote-toggle">
              <input
                type="checkbox"
                checked={remoteOnly}
                onChange={(event) => {
                  const nextRemoteOnly = event.target.checked;
                  setRemoteOnly(nextRemoteOnly);
                  try {
                    localStorage.setItem('remote_only', String(nextRemoteOnly));
                  } catch (error) {}
                  if (hasSearched) {
                    void handleSearch(undefined, query || activeQuery, nextRemoteOnly);
                  }
                }}
              />
              <span className="remote-toggle__switch" aria-hidden="true"></span>
              <span>Nur Remote-Jobs</span>
              <span className="remote-toggle__state">{remoteOnly ? 'aktiv' : 'optional'}</span>
            </label>
            <div className="search-rules" aria-label="Connies Arbeitswünsche">
              <strong>Wichtig für Connie</strong>
              <span>bis 20 Std.</span><span>Samstag frei</span><span>Freitag ab Mittag frei</span>
            </div>
          </div>

          <div className="category-row" aria-label="Beliebte Suchbereiche">
            {categories.map((cat) => (
              <button key={cat.label} onClick={() => handleSearch(undefined, cat.search)} className="category-chip">
                <i className={`fas ${cat.icon}`} aria-hidden="true"></i>{cat.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Main Content */}
      <main className="content-shell">
        
        {/* Saved Jobs View */}
        {showSavedJobs && savedJobs.length > 0 && (
          <div>
            <div className="saved-header">
              <span className="saved-header__icon"><i className="fas fa-bookmark"></i></span>
              <h2>Deine Merkliste</h2>
              <span className="results-count">{savedJobs.length} gespeichert</span>
            </div>
            <div className="job-list">
              {savedJobs.map((job) => (
                <JobCard key={job.url} job={job} darkMode={darkMode} isSaved={true} onToggleSave={toggleSaveJob} />
              ))}
            </div>
          </div>
        )}

        {showSavedJobs && savedJobs.length === 0 && (
          <div className="saved-empty">
            <i className="fas fa-bookmark"></i>
            <strong>Deine Merkliste wartet auf den ersten Treffer.</strong>
            <p>Speichere passende Stellen mit dem Lesezeichen.</p>
          </div>
        )}

        {/* Loading */}
        {loading && !showSavedJobs && (
          <div className="loading-card">
            <div className="loading-card__icon"><i className="fas fa-compass fa-spin"></i></div>
            <h3>Wir schauen uns für dich um.</h3>
            <p>Suche nach „{activeQuery}“ in {activeLocation}</p>
          </div>
        )}

        {/* Error */}
        {error && !loading && !showSavedJobs && (
          <div className="notice-card" role="status">
            <i className="fas fa-circle-info"></i>
            <p>{error}</p>
          </div>
        )}

        {/* Results */}
        {jobs.length > 0 && !loading && !showSavedJobs && (
          <div className="results-layout">
            <aside className="results-sidebar">
              <div className="sidebar-panel">
                <p className="sidebar-title">Quellen filtern</p>
                <div className="source-list">
                  {sourceOptions.map((source) => (
                    <button
                      key={source}
                      onClick={() => handleSourceFilterChange(source)}
                      className={`source-filter ${selectedSource === source ? 'is-active' : ''}`}
                      aria-pressed={selectedSource === source}
                    >
                      <span>{source}</span>
                      <span className="source-filter__count">{source === 'Alle' ? jobs.length : sourceCounts[source] || 0}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="sidebar-panel active-search">
                <p className="sidebar-title">Deine Suche</p>
                <p className="active-search__query">{activeQuery}</p>
                <p className="active-search__location"><i className="fas fa-location-dot"></i> {activeLocation}</p>
              </div>
            </aside>

            <section className="results-main">
              <div className="mobile-sources">
                <p className="mobile-sources__title">Quellen</p>
                <div className="mobile-sources__list">
                  {sourceOptions.map((source) => (
                    <button
                      key={source}
                      onClick={() => handleSourceFilterChange(source)}
                      className={`mobile-source-filter ${selectedSource === source ? 'is-active' : ''}`}
                      aria-pressed={selectedSource === source}
                    >
                      {source}<span>{source === 'Alle' ? jobs.length : sourceCounts[source] || 0}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="results-heading">
                <div>
                  <p className="results-heading__eyebrow">Deine Möglichkeiten</p>
                  <h2>Passende Chancen</h2>
                  <p className="results-summary">{summary}</p>
                </div>
                <div className="results-count"><strong>{filteredJobs.length}</strong> von {jobs.length} Treffern</div>
              </div>


              {!selectedSourceStillAvailable && (
                <div className="filter-notice">
                  Für {selectedSource} sind in den aktuell geladenen Treffern keine Angebote mehr vorhanden.
                </div>
              )}

              {filteredJobs.length > 0 ? (
                <div className="job-list">
                  {filteredJobs.map((job) => (
                    <JobCard key={job.id} job={job} darkMode={darkMode} isSaved={savedJobs.some(j => j.url === job.url)} onToggleSave={toggleSaveJob} />
                  ))}
                </div>
              ) : selectedSourceStillAvailable ? (
                <div className="filter-notice">
                  Für {selectedSource} sind in den geladenen Treffern gerade keine Angebote sichtbar.
                </div>
              ) : null}

              <div className="load-more-wrap">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="load-more-button"
                >
                  <i className={`fas ${loadingMore ? 'fa-circle-notch fa-spin' : 'fa-plus'}`}></i>
                  <span>Weitere Chancen anzeigen</span>
                </button>
                {loadMoreNotice && (
                  <p className="load-more-notice">
                    {loadMoreNotice}
                  </p>
                )}
              </div>
            </section>
          </div>
        )}

        {/* Empty State / Intro */}
        {!hasSearched && !loading && !showSavedJobs && (
          <section className="empty-state">
            <div className="empty-state__art" aria-hidden="true">
              <svg viewBox="0 0 120 120" fill="none">
                <circle cx="60" cy="60" r="46" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 5" />
                <path d="m23 77 25-35 13 18 8-11 29 39H22l1-11Z" fill="currentColor" opacity=".18" />
                <path d="m29 82 19-27 13 18 8-11 22 30H29v-10Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                <path d="M43 91h37M58 77l3 5 6-1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <circle cx="83" cy="35" r="5" fill="#d47750" />
              </svg>
            </div>
            <div>
              <p className="empty-state__eyebrow">Dein nächster Schritt</p>
              <h2>Dein Neustart beginnt hier.</h2>
              <p>Starte mit einem Beruf oder Stichwort. Wir suchen nach passenden Teilzeitstellen in Tirol, die zu Connies Plänen passen.</p>
            </div>
          </section>
        )}

        {/* Sources */}
        {sources.length > 0 && !loading && !showSavedJobs && (
           <div className="source-attribution">
             <p className="source-attribution__label">Quellen der Suche</p>
             <div className="source-attribution__links">
               {sources.map((s, i) => (
                 <a key={i} href={s.uri} target="_blank" rel="noopener noreferrer">
                   {s.title}
                 </a>
               ))}
             </div>
           </div>
        )}
      </main>
    </div>
  );
};

export default App;
