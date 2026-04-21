
import React, { useState, useEffect } from 'react';
import { geminiService } from './services/geminiService';
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

const GEMINI_MODEL_OPTIONS = [
  { value: '', label: 'Automatisch' },
  { value: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite' },
  { value: 'gemini-3.1-flash-preview', label: 'Gemini 3.1 Flash' },
  { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' },
  { value: 'gemma-4-31b-it', label: 'Gemma 4 31B' },
  { value: 'gemma-4-26b-a4b-it', label: 'Gemma 4 26B A4B' },
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (schnell)' },
  { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (gründlicher)' },
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
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [joobleApiKey, setJoobleApiKey] = useState('');
  const [geminiModel, setGeminiModel] = useState('');
  const [useJoobleOnly, setUseJoobleOnly] = useState(true);

  // Load settings from localStorage on mount
  useEffect(() => {
    try {
      const savedApiKey = localStorage.getItem('gemini_api_key') || '';
      const savedJoobleApiKey = localStorage.getItem('jooble_api_key') || '';
      const savedGeminiModel = localStorage.getItem('gemini_model') || '';
      const savedLocation = localStorage.getItem('job_location') || 'Tirol';
      const rawUseJooble = localStorage.getItem('use_jooble_only');
      const savedUseJooble = rawUseJooble === null ? true : rawUseJooble === 'true';
      setGeminiApiKey(savedApiKey);
      setJoobleApiKey(savedJoobleApiKey);
      setGeminiModel(savedGeminiModel);
      setLocation(savedLocation);
      setActiveLocation(savedLocation);
      geminiService.setApiKey(savedApiKey);
      geminiService.setModel(savedGeminiModel);
      joobleService.setApiKey(savedJoobleApiKey);
      setUseJoobleOnly(savedUseJooble);
    } catch (e) {}
  }, []);

  const saveSettings = () => {
    try {
      localStorage.setItem('gemini_api_key', geminiApiKey);
      localStorage.setItem('jooble_api_key', joobleApiKey);
      localStorage.setItem('gemini_model', geminiModel);
      localStorage.setItem('job_location', location);
      localStorage.setItem('use_jooble_only', String(useJoobleOnly));
      geminiService.setApiKey(geminiApiKey);
      geminiService.setModel(geminiModel);
      joobleService.setApiKey(joobleApiKey);
      setShowSettings(false);
    } catch (e) {}
  };

  const getFriendlyError = (err: any) => {
    const message = err?.message || '';
    if (message.includes('Jooble API Error: 404')) {
      return 'Jooble meldet 404. Das liegt oft an einem ungültigen API-Key ODER daran, dass kein Proxy aktiv ist. Key prüfen (jooble.org/api/about), neu speichern und die Anfrage erneut testen.';
    }
    if (message.includes('429') || message.includes('RESOURCE_EXHAUSTED')) {
      return 'Gemini API-Limit erreicht (429). Wichtig: Das Limit hängt am Google-Cloud-Projekt, nicht am einzelnen Key. Prüfe in AI Studio/Cloud Console das aktive Projekt (Quota, Billing, API-Key-Restriktionen) und teste ggf. ein neues Projekt mit neuem Key.';
    }
    return `Hoppla, da lief was schief: ${message || 'Unbekannter Fehler'}.`;
  };

  const handleSearch = async (e?: React.FormEvent, customQuery?: string) => {
    if (e) e.preventDefault();
    const targetQuery = customQuery || query;
    if (!targetQuery.trim()) return;

    // Update state to reflect what is being searched if triggered via button
    if (customQuery) setQuery(customQuery);

    setLoading(true);
    setError(null);
    setLoadMoreNotice(null);
    setJobs([]);
    setCurrentPage(0);
    setHasSearched(true);
    setSelectedSource('Alle');
    setActiveQuery(targetQuery);
    setActiveLocation(location);

    try {
      let data: SearchResult | null = null;
      
      // Use Jooble API if enabled, otherwise use Gemini with web scraping
      if (useJoobleOnly) {
        data = await jobSearchService.searchJobs(targetQuery, location, 0);
      } else {
        data = await geminiService.searchJobs(targetQuery, undefined, 0, location);
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
      
      // Use Jooble API if enabled, otherwise use Gemini with web scraping
      if (useJoobleOnly) {
        for (let attempt = 0; attempt < 3; attempt++) {
          nextPage += 1;
          data = await jobSearchService.searchJobs(activeQuery, activeLocation, nextPage);
          newUniqueJobs = data.jobs.filter(j => !currentUrls.has(j.url));

          if (newUniqueJobs.length > 0 || data.jobs.length === 0) {
            break;
          }
        }

        setCurrentPage(nextPage);
      } else {
        data = await geminiService.searchJobs(activeQuery, undefined, jobs.length, activeLocation, {
          knownUrls: jobs.map(job => job.url)
        });
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

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800 font-sans">
      {/* Navbar */}
      <nav className="bg-white border-b border-slate-100 sticky top-0 z-40 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
             <div className="bg-emerald-500 text-white w-9 h-9 rounded-xl flex items-center justify-center shadow-emerald-200 shadow-lg">
                <i className="fas fa-seedling text-lg"></i>
             </div>
             <div>
                <h1 className="text-lg font-black text-slate-800 leading-none tracking-tight">Tirol<span className="text-emerald-600">Neustart</span></h1>
                <p className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">Dein Weg zum neuen Job</p>
             </div>
          </div>
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-emerald-100 text-slate-600 hover:text-emerald-700 rounded-lg transition-colors text-sm font-semibold"
          >
            <i className="fas fa-cog"></i>
            <span className="hidden md:inline">Einstellungen</span>
          </button>
        </div>
      </nav>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6 animate-fade-in-up">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <i className="fas fa-cog text-emerald-500"></i>
                Einstellungen
              </h3>
              <button
                onClick={() => setShowSettings(false)}
                className="w-8 h-8 bg-slate-100 hover:bg-slate-200 rounded-full flex items-center justify-center transition-colors"
              >
                <i className="fas fa-times text-slate-500"></i>
              </button>
            </div>
            
            <div className="space-y-6">
              {/* Gemini API Key Setting */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  <i className="fas fa-key text-emerald-500 mr-2"></i>
                  Gemini API Key
                </label>
                <input
                  type="password"
                  value={geminiApiKey}
                  onChange={(e) => setGeminiApiKey(e.target.value)}
                  placeholder="Gib deinen API Key ein..."
                  className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 outline-none transition-all font-medium"
                />
                <p className="text-xs text-slate-500 mt-2">
                  Hol dir deinen kostenlosen API Key bei{' '}
                  <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline">
                    Google AI Studio
                  </a>
                </p>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  <i className="fas fa-microchip text-emerald-500 mr-2"></i>
                  Gemini Modell
                </label>
                <select
                  value={geminiModel}
                  onChange={(e) => setGeminiModel(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 outline-none transition-all font-medium"
                >
                  {GEMINI_MODEL_OPTIONS.map((model) => (
                    <option key={model.value || 'auto'} value={model.value}>
                      {model.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 mt-2">
                  Neuere Modelle stehen oben. Falls ein Modell für deinen Key nicht freigeschaltet ist, wird automatisch das nächste probiert.
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
                  className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none transition-all font-medium"
                />
                <p className="text-xs text-slate-500 mt-2">
                  Jooble API-Key holen bei{' '}
                  <a href="https://jooble.org/api/about" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                    jooble.org/api/about
                  </a>
                </p>
              </div>

              {/* Fast Search Toggle */}
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border-2 border-slate-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center">
                    <i className="fas fa-briefcase"></i>
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 text-sm">Schnelle Suche verwenden</p>
                    <p className="text-xs text-slate-500">Eigene Scraper und Jooble kombinieren</p>
                  </div>
                </div>
                <button
                  onClick={() => setUseJoobleOnly(!useJoobleOnly)}
                  className={`relative w-14 h-8 rounded-full transition-colors ${useJoobleOnly ? 'bg-emerald-500' : 'bg-slate-300'}`}
                >
                  <div className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow-md transition-transform ${useJoobleOnly ? 'left-7' : 'left-1'}`}></div>
                </button>
              </div>

              {/* Save Button */}
              <button
                onClick={saveSettings}
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl transition-colors shadow-lg shadow-emerald-200"
              >
                <i className="fas fa-save mr-2"></i>
                Speichern
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hero Section */}
      <div className="bg-white border-b border-slate-200 pb-8 pt-6 px-4">
         <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-2xl md:text-4xl font-black text-slate-800 mb-3 tracking-tight">
               Bereit für etwas <span className="text-emerald-500 underline decoration-4 decoration-emerald-200">Neues?</span>
            </h2>
            <p className="text-slate-500 text-base md:text-lg mb-8 max-w-2xl mx-auto leading-relaxed">
               Finde Jobs in Tirol, für die du keine spezielle Ausbildung brauchst. 
               Perfekt für Quereinsteiger, Umorientierer und Neustarter.
            </p>

            <form onSubmit={(e) => handleSearch(e)} className="relative max-w-2xl mx-auto mb-8 group">
               <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
                  <i className="fas fa-search text-emerald-500 text-lg"></i>
               </div>
               <input 
                  type="text" 
                  className="block w-full pl-12 pr-32 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-slate-900 placeholder-slate-400 focus:ring-4 focus:ring-emerald-100 focus:border-emerald-500 transition-all outline-none font-medium shadow-inner" 
                  placeholder="Z.B. Florist Helfer, Rezeptionist, Fahrer..." 
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
               />
               <button 
                  type="submit" 
                  className="absolute right-2 top-2 bottom-2 bg-slate-900 hover:bg-emerald-600 text-white font-bold py-2 px-6 rounded-xl transition-colors duration-200 shadow-lg"
               >
                  Suchen
               </button>
            </form>

            <div className="max-w-2xl mx-auto mb-8 flex flex-col sm:flex-row sm:items-center justify-center gap-3">
              <label className="text-sm font-bold text-slate-600 flex items-center justify-center gap-2">
                <i className="fas fa-location-dot text-emerald-500"></i>
                Ort
              </label>
              <select
                value={location}
                onChange={(e) => {
                  setLocation(e.target.value);
                  try {
                    localStorage.setItem('job_location', e.target.value);
                  } catch (err) {}
                }}
                className="px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-slate-900 focus:ring-4 focus:ring-emerald-100 focus:border-emerald-500 outline-none transition-all font-semibold"
              >
                {LOCATION_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option === 'Tirol' ? 'Tirol gesamt' : option}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap justify-center gap-3">
               {categories.map((cat, idx) => (
                  <button
                     key={idx}
                     onClick={() => handleSearch(undefined, cat.search)}
                     className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-600 font-semibold hover:border-emerald-400 hover:text-emerald-700 hover:shadow-md hover:-translate-y-0.5 transition-all text-sm active:scale-95"
                  >
                     <i className={`fas ${cat.icon} text-emerald-400`}></i>
                     {cat.label}
                  </button>
               ))}
            </div>
         </div>
      </div>

      {/* Main Content */}
      <main className="flex-grow max-w-6xl mx-auto w-full px-4 py-8">
        
        {/* Loading */}
        {loading && (
          <div className="py-24 text-center">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
               <i className="fas fa-binoculars text-2xl"></i>
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">Wir scannen die Jobbörsen...</h3>
            <p className="text-slate-500">Suche nach "{activeQuery}" bei TT, ÖH und co.</p>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="max-w-2xl mx-auto bg-white border-l-4 border-red-500 p-6 rounded-r-xl shadow-sm flex items-start gap-4">
            <div className="bg-red-100 p-2 rounded-full text-red-600 shrink-0">
               <i className="fas fa-bug"></i>
            </div>
            <div>
               <h3 className="font-bold text-slate-800">Keine Ergebnisse</h3>
               <p className="text-slate-600 mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Results */}
        {jobs.length > 0 && !loading && (
          <div className="space-y-8 animate-fade-in-up">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                 <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                   <i className="fas fa-fire text-orange-500"></i>
                   Top Chancen für dich
                 </h2>
                 <p className="text-sm text-slate-500 mt-1">{summary}</p>
              </div>
              <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100 self-start md:self-auto">
                {filteredJobs.length} von {jobs.length} Angebote
              </span>
            </div>

            {sourceOptions.length > 2 && (
              <div className="flex flex-wrap gap-2">
                {sourceOptions.map((source) => (
                  <button
                    key={source}
                    onClick={() => setSelectedSource(source)}
                    className={`px-3 py-2 rounded-lg border text-sm font-bold transition-colors ${
                      selectedSource === source
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-emerald-400 hover:text-emerald-700'
                    }`}
                  >
                    {source}
                    {source !== 'Alle' && (
                      <span className="ml-1 opacity-75">({sourceCounts[source] || 0})</span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {!selectedSourceStillAvailable && (
              <div className="bg-white border border-slate-200 rounded-xl p-5 text-sm font-semibold text-slate-600">
                Für {selectedSource} sind in den aktuell geladenen Treffern keine Angebote mehr vorhanden.
              </div>
            )}

            {filteredJobs.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredJobs.map((job) => (
                  <JobCard key={job.id} job={job} />
                ))}
              </div>
            ) : selectedSourceStillAvailable ? (
              <div className="bg-white border border-slate-200 rounded-xl p-5 text-sm font-semibold text-slate-600">
                Für {selectedSource} sind in den geladenen Treffern gerade keine Angebote sichtbar.
              </div>
            ) : null}

            <div className="flex flex-col items-center justify-center py-10">
               <button 
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="group flex items-center gap-3 px-8 py-4 bg-white border-2 border-slate-100 text-slate-700 font-bold rounded-2xl hover:border-emerald-500 hover:text-emerald-600 transition-all shadow-sm hover:shadow-lg disabled:opacity-50"
               >
                 {loadingMore ? (
                    <i className="fas fa-circle-notch fa-spin text-emerald-500"></i>
                 ) : (
                    <div className="w-8 h-8 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center group-hover:bg-emerald-100 group-hover:text-emerald-500 transition-colors">
                       <i className="fas fa-plus"></i>
                    </div>
                 )}
                 <span>Weitere Chancen anzeigen</span>
               </button>
               {loadMoreNotice && (
                <p className="mt-4 max-w-md text-center text-sm font-semibold text-slate-500">
                  {loadMoreNotice}
                </p>
               )}
            </div>
          </div>
        )}

        {/* Empty State / Intro */}
        {!hasSearched && !loading && (
           <div className="text-center py-20 opacity-50">
              <i className="fas fa-arrow-up text-4xl text-slate-300 animate-bounce mb-4"></i>
              <p className="text-slate-400">Wähle eine Kategorie oder starte eine Suche</p>
           </div>
        )}

        {/* Sources */}
        {sources.length > 0 && !loading && (
           <div className="mt-16 text-center">
             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Geprüfte Job-Quellen</p>
             <div className="flex flex-wrap justify-center gap-2 opacity-60 hover:opacity-100 transition-opacity">
               {sources.map((s, i) => (
                 <a key={i} href={s.uri} target="_blank" rel="noopener noreferrer" className="text-[10px] text-slate-500 hover:text-emerald-600 bg-white border border-slate-200 px-2 py-1 rounded hover:border-emerald-300 transition-colors truncate max-w-[150px]">
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
