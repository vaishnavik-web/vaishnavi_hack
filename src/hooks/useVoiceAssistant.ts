import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { VOICE_LANGUAGES, VoiceLanguage } from '../utils/voiceNavigation';

export function useVoiceAssistant(initialLang: VoiceLanguage = 'en') {
  const [language, setLanguage] = useState<VoiceLanguage>(initialLang);
  const [muted, setMuted] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voicesLoaded, setVoicesLoaded] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [lastSpokenText, setLastSpokenText] = useState('');
  const lastAutoSpokenRef = useRef<string>('');

  const supported =
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof SpeechSynthesisUtterance !== 'undefined';

  useEffect(() => {
    if (!supported) return;
    const refreshVoices = () => {
      const list = window.speechSynthesis.getVoices();
      if (list.length > 0) {
        setVoices(list);
        setVoicesLoaded(true);
      }
    };
    refreshVoices();
    window.speechSynthesis.addEventListener('voiceschanged', refreshVoices);
    const fallbackTimer = setTimeout(() => {
      refreshVoices();
      setVoicesLoaded(true);
    }, 600);
    return () => {
      clearTimeout(fallbackTimer);
      window.speechSynthesis.removeEventListener('voiceschanged', refreshVoices);
    };
  }, [supported]);

  const langOption = useMemo(
    () => VOICE_LANGUAGES.find((v) => v.code === language) || VOICE_LANGUAGES[0],
    [language]
  );

  const matchingVoice = useMemo(() => {
    if (!voices.length) return null;
    const exact = voices.find((v) => v.lang.toLowerCase() === langOption.bcp47.toLowerCase());
    if (exact) return exact;
    const prefix = voices.find((v) =>
      v.lang.toLowerCase().startsWith(langOption.code.toLowerCase())
    );
    return prefix || null;
  }, [voices, langOption]);

  const voiceAvailableForLanguage = useMemo(() => {
    if (!supported) return false;
    if (!voicesLoaded) return true;
    if (language === 'en') {
      return voices.length === 0 || Boolean(matchingVoice);
    }
    return Boolean(matchingVoice);
  }, [supported, voicesLoaded, language, voices.length, matchingVoice]);

  const voiceNotice = useMemo(() => {
    if (!supported) {
      return 'Voice guidance is not supported in this browser. Written turn-by-turn directions are displayed.';
    }
    if (muted) {
      return 'Voice guidance muted. Tap unmute to hear spoken turns.';
    }
    if (!voiceAvailableForLanguage) {
      return `${langOption.label} text-to-speech voice is not installed on this device/browser. Written ${langOption.label} directions are shown.`;
    }
    return null;
  }, [supported, muted, voiceAvailableForLanguage, langOption]);

  const stop = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  const speak = useCallback(
    (text: string, options?: { force?: boolean }) => {
      const clean = text.trim();
      if (!clean) return;
      setLastSpokenText(clean);

      if (!options?.force && lastAutoSpokenRef.current === clean) {
        return;
      }
      lastAutoSpokenRef.current = clean;

      if (!supported || muted) return;

      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(clean);
        utterance.lang = matchingVoice?.lang || langOption.bcp47;
        if (matchingVoice) {
          utterance.voice = matchingVoice;
        }
        utterance.rate = 0.96;
        utterance.pitch = 1.0;
        utterance.onstart = () => setSpeaking(true);
        utterance.onend = () => setSpeaking(false);
        utterance.onerror = () => setSpeaking(false);
        window.speechSynthesis.speak(utterance);
      } catch {
        setSpeaking(false);
      }
    },
    [supported, muted, matchingVoice, langOption]
  );

  const repeatLast = useCallback(() => {
    if (lastSpokenText) {
      speak(lastSpokenText, { force: true });
    }
  }, [lastSpokenText, speak]);

  const resetDedupe = useCallback(() => {
    lastAutoSpokenRef.current = '';
  }, []);

  return {
    language,
    setLanguage,
    muted,
    setMuted,
    supported,
    speaking,
    voiceAvailableForLanguage,
    voiceNotice,
    lastSpokenText,
    speak,
    repeatLast,
    stop,
    resetDedupe,
  };
}

export function useSpeechSearch(langBcp47 = 'en-IN') {
  const [listening, setListening] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  const SpeechRecognitionCtor =
    typeof window !== 'undefined'
      ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      : null;

  const supported = Boolean(SpeechRecognitionCtor);

  const stopListening = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore stop errors
    }
    setListening(false);
  }, []);

  const startListening = useCallback(
    (onTranscript: (text: string) => void) => {
      if (!SpeechRecognitionCtor) {
        setSpeechError(
          'Voice search is not supported in this browser. Please type your destination.'
        );
        return;
      }
      setSpeechError(null);
      try {
        const rec = new SpeechRecognitionCtor();
        recognitionRef.current = rec;
        rec.lang = langBcp47;
        rec.interimResults = false;
        rec.maxAlternatives = 1;
        rec.onstart = () => setListening(true);
        rec.onresult = (event: any) => {
          const transcript = event?.results?.[0]?.[0]?.transcript || '';
          setListening(false);
          if (transcript.trim()) {
            onTranscript(transcript.trim());
          }
        };
        rec.onerror = (ev: any) => {
          setListening(false);
          const code = ev?.error || 'unknown';
          setSpeechError(
            code === 'not-allowed'
              ? 'Microphone permission was denied.'
              : `Voice capture failed (${code}). Try typing instead.`
          );
        };
        rec.onend = () => setListening(false);
        rec.start();
      } catch (err: any) {
        setListening(false);
        setSpeechError(err?.message || 'Unable to start voice recognition.');
      }
    },
    [SpeechRecognitionCtor, langBcp47]
  );

  return {
    supported,
    listening,
    speechError,
    startListening,
    stopListening,
  };
}
