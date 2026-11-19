/* ============================================================================
   Language (EN / FR). A module-level `_lang` lets the plain data modules
   (data.ts, briefing.ts) localise dates, numbers and copy at call time, while
   the React tree re-renders through LangProvider so every `L(en, fr)` call
   returns the active language. French copy is AI-assisted and needs a
   Francophone review before publishing (as on the live tracker, TODO_KIKI).
   ========================================================================== */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Lang = 'en' | 'fr';

let _lang: Lang = (() => {
  try { return localStorage.getItem('lang') === 'fr' ? 'fr' : 'en'; } catch { return 'en'; }
})();

export const getLang = (): Lang => _lang;
/** Pick the string for the active language. Translations live next to the source text. */
export const L = (en: string, fr: string): string => (_lang === 'fr' ? fr : en);

type Ctx = { lang: Lang; setLang: (l: Lang) => void };
const LangContext = createContext<Ctx>({ lang: 'en', setLang: () => {} });
export const useLang = () => useContext(LangContext);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(_lang);
  useEffect(() => { try { document.documentElement.lang = lang; } catch { /* non-DOM */ } }, [lang]);
  const setLang = (l: Lang) => {
    _lang = l;
    try { localStorage.setItem('lang', l); } catch { /* storage may be blocked */ }
    setLangState(l);
  };
  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>;
}
