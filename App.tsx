
import React, { useState, useEffect, useRef } from 'react';
import { geminiService } from './services/geminiService';
import { joobleService } from './services/joobleService';
import { JobListing, GroundingSource } from './types';
import JobCard from './components/JobCard';

const App: React.FC = () => {
  const [query, setQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('Quereinsteiger Jobs Tirol');
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [summary, setSummary] = useState('');
  const [sources, setSources] = useState<GroundingSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const initialSearchDone = useRef(false);
  
  // Settings state
  const [showSettings, setShowSettings] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [useJoobleOnly, setUseJoobleOnly] = useState(false);

  // Load settings from localStorage on mount
  useEffect(() => {
    try {
      const savedApiKey = localStorage.getItem('gemini_api_key') || '';
      const savedUseJooble = localStorage.getItem('use_jooble_only') === 'true';
      setGeminiApiKey(savedApiKey);
      setUseJoobleOnly(savedUseJooble);
    } catch (e) {}
  }, []);

  const saveSettings = () => {
    try {
      localStorage.setItem('gemini_api_key', geminiApiKey);
      localStorage.setItem('use_jooble_only', String(useJoobleOnly));
      setShowSettings(false);
    } catch (e) {}
  };

  const getFriendlyError = (err: any) => {
    const message = err?.message || '';
    if (message.includes('429') || message.includes('RESOURCE_EXHAUSTED')) {
      return 'Gemini API-Limit erreicht (429). Falls ein geteilter Free-Key verwendet wird, kann das Tageslimit schnell aufgebraucht sein. Prüfe Google AI Studio Quota/Billing oder hinterlege einen eigenen API-Key und versuche es später erneut.';
    }
    return `Hoppla, da lief was schief: ${message || 'Unbekannter Fehler'}.`;
  };

  // Initial search tailored to the user's goal
  useEffect(() => {
    if (initialSearchDone.current) return;
    initialSearchDone.current = true;
    handleSearch(undefined, "Jobs für Quereinsteiger ohne Ausbildung Innsbruck");
  }, []);

  const handleSearch = async (e?: React.FormEvent, customQuery?: string) => {
    if (e) e.preventDefault();
    const targetQuery = customQuery || query;
    if (!targetQuery.trim()) return;

    // Update state to reflect what is being searched if triggered via button
    if (customQuery) setQuery(customQuery);

    setLoading(true);
    setError(null);
    setJobs([]);
    setHasSearched(true);
    setActiveQuery(targetQuery);

    try {
      let data;
      
      // Use Jooble API if enabled, otherwise use Gemini with web scraping
      if (useJoobleOnly) {
        const joobleJobs = await joobleService.searchJobs(targetQuery, 'Tirol', 0);
        data = {
          jobs: joobleJobs,
          summary: `Jooble Ergebnisse für "${targetQuery}":`,
          groundingSources: []
        };
      } else {
        data = await geminiService.searchJobs(targetQuery, undefined, 0);
      }
      
      setJobs(data.jobs);
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

    try {
      let data;
      
      // Use Jooble API if enabled, otherwise use Gemini with web scraping
      if (useJoobleOnly) {
        const joobleJobs = await joobleService.searchJobs(activeQuery, 'Tirol', Math.floor(jobs.length / 10));
        data = {
          jobs: joobleJobs,
          groundingSources: []
        };
      } else {
        data = await geminiService.searchJobs(activeQuery, undefined, jobs.length);
      }
      
      const currentUrls = new Set(jobs.map(j => j.url));
      const newUniqueJobs = data.jobs.filter(j => !currentUrls.has(j.url));

      if (newUniqueJobs.length === 0) {
        // Silent
      } else {
        setJobs(prev => [...prev, ...newUniqueJobs]);
        setSources(prev => {
          const existingUris = new Set(prev.map(s => s.uri));
          const newSources = data.groundingSources.filter(s => !existingUris.has(s.uri));
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
    { label: "Quereinsteiger", icon: "fa-random", search: "Quereinsteiger Jobs Innsbruck ohne Erfahrung" },
    { label: "Ohne Vorkenntnisse", icon: "fa-user-graduate", search: "Hilfskraft Jobs Tirol ohne Ausbildung" },
    { label: "Beauty & Wellness", icon: "fa-spa", search: "Beauty Kosmetik Jobs Tirol Quereinstieg Ausbildung möglich" },
    { label: "Remote / Homeoffice", icon: "fa-laptop-house", search: "Homeoffice Jobs Tirol Quereinsteiger Support" },
    { label: "Büroassistenz", icon: "fa-print", search: "Bürohilfe Jobs Innsbruck ungelernt" },
    { label: "Verkauf & Mode", icon: "fa-tshirt", search: "Verkauf Jobs Mode Tirol Aushilfe" },
  ];

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
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-fade-in-up">
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

              {/* Jooble Only Toggle */}
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border-2 border-slate-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center">
                    <i className="fas fa-briefcase"></i>
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 text-sm">Jooble API verwenden</p>
                    <p className="text-xs text-slate-500">Nur Jooble Jobs anzeigen</p>
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
                {jobs.length} Angebote gefunden
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {jobs.map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>

            <div className="flex justify-center py-10">
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
