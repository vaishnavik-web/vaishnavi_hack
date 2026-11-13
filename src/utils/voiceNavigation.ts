import { NearbyPlaceCategory } from '../shared/types';

export type VoiceLanguage = 'en' | 'hi' | 'kn' | 'te' | 'ta';

export interface VoiceLanguageOption {
  code: VoiceLanguage;
  bcp47: string;
  label: string;
  nativeLabel: string;
}

export const VOICE_LANGUAGES: VoiceLanguageOption[] = [
  { code: 'en', bcp47: 'en-IN', label: 'English', nativeLabel: 'English' },
  { code: 'hi', bcp47: 'hi-IN', label: 'Hindi', nativeLabel: 'हिन्दी' },
  { code: 'kn', bcp47: 'kn-IN', label: 'Kannada', nativeLabel: 'ಕನ್ನಡ' },
  { code: 'te', bcp47: 'te-IN', label: 'Telugu', nativeLabel: 'తెలుగు' },
  { code: 'ta', bcp47: 'ta-IN', label: 'Tamil', nativeLabel: 'தமிழ்' },
];

export function formatDistanceHuman(meters: number, lang: VoiceLanguage = 'en'): string {
  const m = Math.max(0, Math.round(meters));
  if (m >= 1000) {
    const km = (m / 1000).toFixed(1);
    switch (lang) {
      case 'hi':
        return `${km} किलोमीटर`;
      case 'kn':
        return `${km} ಕಿಲೋಮೀಟರ್`;
      case 'te':
        return `${km} కిలోమీటర్లు`;
      case 'ta':
        return `${km} கிலோமீட்டர்`;
      default:
        return `${km} km`;
    }
  }
  switch (lang) {
    case 'hi':
      return `${m} मीटर`;
    case 'kn':
      return `${m} ಮೀಟರ್`;
    case 'te':
      return `${m} మీటర్లు`;
    case 'ta':
      return `${m} மீட்டர்`;
    default:
      return `${m} metres`;
  }
}

type ManeuverAction =
  | 'ARRIVE'
  | 'TURN_LEFT'
  | 'TURN_RIGHT'
  | 'SLIGHT_LEFT'
  | 'SLIGHT_RIGHT'
  | 'SHARP_LEFT'
  | 'SHARP_RIGHT'
  | 'UTURN'
  | 'ROUNDABOUT'
  | 'KEEP_LEFT'
  | 'KEEP_RIGHT'
  | 'MERGE'
  | 'BOARD_TRANSIT'
  | 'WALK'
  | 'CONTINUE';

function detectAction(raw: string, maneuverHint?: string): ManeuverAction {
  const lower = `${maneuverHint || ''} ${raw}`.toLowerCase();
  if (lower.includes('arrive') || lower.includes('destination')) return 'ARRIVE';
  if (lower.includes('board ') || lower.includes('transit')) return 'BOARD_TRANSIT';
  if (lower.includes('u-turn') || lower.includes('uturn')) return 'UTURN';
  if (lower.includes('roundabout') || lower.includes('traffic circle')) return 'ROUNDABOUT';
  if (lower.includes('sharp left')) return 'SHARP_LEFT';
  if (lower.includes('sharp right')) return 'SHARP_RIGHT';
  if (lower.includes('slight left')) return 'SLIGHT_LEFT';
  if (lower.includes('slight right')) return 'SLIGHT_RIGHT';
  if (lower.includes('keep left')) return 'KEEP_LEFT';
  if (lower.includes('keep right')) return 'KEEP_RIGHT';
  if (lower.includes('turn left') || lower.includes('turn_left')) return 'TURN_LEFT';
  if (lower.includes('turn right') || lower.includes('turn_right')) return 'TURN_RIGHT';
  if (lower.includes('merge')) return 'MERGE';
  if (lower.includes('walk')) return 'WALK';
  return 'CONTINUE';
}

function extractRoadName(raw: string): string {
  const cleaned = raw.replace(/\s*\(\d+(?:\.\d+)?\s*(?:m|km)\)\s*$/i, '').trim();
  const match = cleaned.match(/\b(?:onto|on|along|towards|toward)\s+([^,.;(]+)/i);
  if (match && match[1]) {
    return match[1].trim();
  }
  return '';
}

const ACTION_PHRASES: Record<ManeuverAction, Record<VoiceLanguage, string>> = {
  ARRIVE: {
    en: 'You will reach your destination',
    hi: 'आप अपने गंतव्य पर पहुंच जाएंगे',
    kn: 'ನೀವು ನಿಮ್ಮ ಗಮ್ಯಸ್ಥಾನವನ್ನು ತಲುಪುತ್ತೀರಿ',
    te: 'మీరు మీ గమ్యస్థానానికి చేరుకుంటారు',
    ta: 'நீங்கள் உங்கள் இலக்கை அடைவீர்கள்',
  },
  TURN_LEFT: {
    en: 'Turn left',
    hi: 'बाएं मुड़ें',
    kn: 'ಎಡಕ್ಕೆ ತಿರುಗಿ',
    te: 'ఎడమవైపు తిరగండి',
    ta: 'இடதுபுறம் திரும்பவும்',
  },
  TURN_RIGHT: {
    en: 'Turn right',
    hi: 'दाएं मुड़ें',
    kn: 'ಬಲಕ್ಕೆ ತಿರುಗಿ',
    te: 'కుడివైపు తిరగండి',
    ta: 'வலதுபுறம் திரும்பவும்',
  },
  SLIGHT_LEFT: {
    en: 'Take a slight left',
    hi: 'हल्का बाएं मुड़ें',
    kn: 'ಸ್ವಲ್ಪ ಎಡಕ್ಕೆ ತಿರುಗಿ',
    te: 'కొద్దిగా ఎడమవైపు తిరగండి',
    ta: 'சற்று இடதுபுறம் திரும்பவும்',
  },
  SLIGHT_RIGHT: {
    en: 'Take a slight right',
    hi: 'हल्का दाएं मुड़ें',
    kn: 'ಸ್ವಲ್ಪ ಬಲಕ್ಕೆ ತಿರುಗಿ',
    te: 'కొద్దిగా కుడివైపు తిరగండి',
    ta: 'சற்று வலதுபுறம் திரும்பவும்',
  },
  SHARP_LEFT: {
    en: 'Take a sharp left',
    hi: 'तेज़ बाएं मुड़ें',
    kn: 'ತೀವ್ರವಾಗಿ ಎಡಕ್ಕೆ ತಿರುಗಿ',
    te: 'పూర్తిగా ఎడమవైపు తిరగండి',
    ta: 'கூர்மையாக இடதுபுறம் திரும்பவும்',
  },
  SHARP_RIGHT: {
    en: 'Take a sharp right',
    hi: 'तेज़ दाएं मुड़ें',
    kn: 'ತೀವ್ರವಾಗಿ ಬಲಕ್ಕೆ ತಿರುಗಿ',
    te: 'పూర్తిగా కుడివైపు తిరగండి',
    ta: 'கூர்மையாக வலதுபுறம் திரும்பவும்',
  },
  UTURN: {
    en: 'Make a U-turn',
    hi: 'यू-टर्न लें',
    kn: 'ಯೂ-ಟರ್ನ್ ತೆಗೆದುಕೊಳ್ಳಿ',
    te: 'యూ-టర్న్ తీసుకోండి',
    ta: 'யூ-டர்ன் எடுக்கவும்',
  },
  ROUNDABOUT: {
    en: 'Enter the roundabout',
    hi: 'गोल चक्कर में प्रवेश करें',
    kn: 'ವೃತ್ತವನ್ನು ಪ್ರವೇಶಿಸಿ',
    te: 'రౌండ్‌అబౌట్‌లోకి వెళ్ళండి',
    ta: 'சுற்றுவட்டத்தில் செல்லவும்',
  },
  KEEP_LEFT: {
    en: 'Keep left',
    hi: 'बाएं रहें',
    kn: 'ಎಡಭಾಗದಲ್ಲಿ ಮುಂದುವರಿಯಿರಿ',
    te: 'ఎడమవైపునే కొనసాగండి',
    ta: 'இடதுபுறமாக தொடரவும்',
  },
  KEEP_RIGHT: {
    en: 'Keep right',
    hi: 'दाएं रहें',
    kn: 'ಬಲಭಾಗದಲ್ಲಿ ಮುಂದುವರಿಯಿರಿ',
    te: 'కుడివైపునే కొనసాగండి',
    ta: 'வலதுபுறமாக தொடரவும்',
  },
  MERGE: {
    en: 'Merge onto the road ahead',
    hi: 'आगे की सड़क पर मिलें',
    kn: 'ಮುಂದಿನ ರಸ್ತೆಗೆ ಸೇರಿ',
    te: 'ముందున్న రోడ్డులో కలవండి',
    ta: 'முன்னால் உள்ள சாலையில் இணையவும்',
  },
  BOARD_TRANSIT: {
    en: 'Take public transport',
    hi: 'सार्वजनिक परिवहन लें',
    kn: 'ಸಾರ್ವಜನಿಕ ಸಾರಿಗೆಯನ್ನು ಹಿಡಿಯಿರಿ',
    te: 'పబ్లిక్ ట్రాన్స్‌పోర్ట్ ఎక్కండి',
    ta: 'பொதுப் போக்குவரத்தில் செல்லவும்',
  },
  WALK: {
    en: 'Walk straight',
    hi: 'सीधे चलें',
    kn: 'ನೇರವಾಗಿ ನಡೆಯಿರಿ',
    te: 'నేరుగా నడవండి',
    ta: 'நேராக நடக்கவும்',
  },
  CONTINUE: {
    en: 'Continue straight',
    hi: 'सीधे आगे बढ़ें',
    kn: 'ನೇರವಾಗಿ ಮುಂದುವರಿಯಿರಿ',
    te: 'నేరుగా కొనసాగండి',
    ta: 'நேராக தொடரவும்',
  },
};

export function formatNavigationInstruction(
  rawInstruction: string,
  distanceMeters: number | undefined,
  lang: VoiceLanguage,
  maneuverHint?: string
): string {
  const cleanRaw = rawInstruction.replace(/\s*\(\d+(?:\.\d+)?\s*(?:m|km)\)\s*$/i, '').trim();
  if (lang === 'en') {
    if (distanceMeters && distanceMeters > 0) {
      return `${cleanRaw} in ${formatDistanceHuman(distanceMeters, 'en')}.`;
    }
    return cleanRaw;
  }

  const action = detectAction(cleanRaw, maneuverHint);
  const phrase = ACTION_PHRASES[action][lang];
  const road = extractRoadName(cleanRaw);
  const distText =
    distanceMeters && distanceMeters > 15 ? formatDistanceHuman(distanceMeters, lang) : '';

  if (action === 'BOARD_TRANSIT') {
    return `${phrase}: ${cleanRaw}`;
  }

  const roadPart = road
    ? lang === 'hi'
      ? ` ${road} की ओर`
      : lang === 'kn'
      ? ` ${road} ಕಡೆಗೆ`
      : lang === 'te'
      ? ` ${road} వైపు`
      : ` ${road} வழியாக`
    : '';

  if (!distText) {
    return `${phrase}${roadPart}.`;
  }

  switch (lang) {
    case 'hi':
      return `${distText} के बाद ${phrase}${roadPart}।`;
    case 'kn':
      return `${distText} ನಂತರ ${phrase}${roadPart}.`;
    case 'te':
      return `${distText} తర్వాత ${phrase}${roadPart}.`;
    case 'ta':
      return `${distText} தூரத்தில் ${phrase}${roadPart}.`;
    default:
      return `${cleanRaw} in ${distText}.`;
  }
}

export function getNavigationPhrase(
  kind: 'start' | 'reroute' | 'arrived',
  lang: VoiceLanguage,
  destinationName?: string
): string {
  const dest = destinationName ? destinationName.split(',')[0] : '';
  if (kind === 'start') {
    switch (lang) {
      case 'hi':
        return `नेविगेशन शुरू हो गया है${dest ? ` — ${dest} की ओर` : ''}।`;
      case 'kn':
        return `ನ್ಯಾವಿಗೇಷನ್ ಪ್ರಾರಂಭವಾಗಿದೆ${dest ? ` — ${dest} ಕಡೆಗೆ` : ''}.`;
      case 'te':
        return `నావిగేషన్ ప్రారంభమైంది${dest ? ` — ${dest} వైపు` : ''}.`;
      case 'ta':
        return `வழிகாட்டல் தொடங்கியது${dest ? ` — ${dest} நோக்கி` : ''}.`;
      default:
        return `Navigation started${dest ? ` towards ${dest}` : ''}.`;
    }
  }
  if (kind === 'reroute') {
    switch (lang) {
      case 'hi':
        return 'आप मार्ग से बाहर हैं। नया मार्ग खोजा जा रहा है।';
      case 'kn':
        return 'ನೀವು ಮಾರ್ಗದಿಂದ ಹೊರಗಿದ್ದೀರಿ. ಹೊಸ ಮಾರ್ಗವನ್ನು ಲೆಕ್ಕಹಾಕಲಾಗುತ್ತಿದೆ.';
      case 'te':
        return 'మీరు మార్గం నుండి పక్కకు వెళ్ళారు. కొత్త మార్గం లెక్కించబడుతోంది.';
      case 'ta':
        return 'நீங்கள் பாதையை விட்டு விலகிவிட்டீர்கள். புதிய வழி கணக்கிடப்படுகிறது.';
      default:
        return 'Off route. Recalculating a new route.';
    }
  }
  switch (lang) {
    case 'hi':
      return `आप अपने गंतव्य${dest ? ` ${dest}` : ''} पर पहुंच गए हैं।`;
    case 'kn':
      return `ನೀವು ನಿಮ್ಮ ಗಮ್ಯಸ್ಥಾನ${dest ? ` ${dest}` : ''} ತಲುಪಿದ್ದೀರಿ.`;
    case 'te':
      return `మీరు మీ గమ్యస్థానం${dest ? ` ${dest}` : ''} చేరుకున్నారు.`;
    case 'ta':
      return `நீங்கள் உங்கள் இலக்கு${dest ? ` ${dest}` : ''} அடைந்துவிட்டீர்கள்.`;
    default:
      return `You have arrived at your destination${dest ? `, ${dest}` : ''}.`;
  }
}

export interface ParsedVoiceQuery {
  rawTranscript: string;
  cleanQuery: string;
  nearbyCategory: NearbyPlaceCategory | null;
}

export function parseVoiceSearchQuery(transcript: string): ParsedVoiceQuery {
  const rawTranscript = transcript.trim();
  let clean = rawTranscript;

  const prefixes = [
    /^(?:please\s+)?(?:take me to|navigate to|directions to|drive to|walk to|go to|route to|head to)\s+/i,
    /^(?:please\s+)?(?:find(?: the)? nearest|find a|find|search for|locate|show me(?: nearby| nearest)?)\s+/i,
  ];
  for (const rx of prefixes) {
    clean = clean.replace(rx, '').trim();
  }
  clean = clean.replace(/\s+(?:near me|nearby|around here|close by)$/i, '').trim();

  const lower = rawTranscript.toLowerCase();
  let nearbyCategory: NearbyPlaceCategory | null = null;
  if (
    lower.includes('nearest') ||
    lower.includes('near me') ||
    lower.includes('nearby') ||
    /^(?:find|locate|show)\b/i.test(lower)
  ) {
    if (/(petrol|gas station|fuel|diesel|pump)/i.test(lower)) nearbyCategory = 'gas_station';
    else if (/(hospital|clinic|medical|emergency)/i.test(lower)) nearbyCategory = 'hospital';
    else if (/(parking|park my car)/i.test(lower)) nearbyCategory = 'parking';
    else if (/(restaurant|food|eat|hotel|cafe)/i.test(lower)) nearbyCategory = 'restaurant';
    else if (/(bus stop|bus stand|transit|metro|railway)/i.test(lower))
      nearbyCategory = 'bus_station';
    else if (/\batm\b|cash machine/i.test(lower)) nearbyCategory = 'atm';
  }

  return {
    rawTranscript,
    cleanQuery: clean || rawTranscript,
    nearbyCategory,
  };
}

export function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pointToSegmentMeters(
  pLat: number,
  pLng: number,
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): number {
  const cosLat = Math.cos(((aLat + bLat) / 2) * (Math.PI / 180));
  const mPerDegLat = 111132.92;
  const mPerDegLng = 111412.84 * cosLat;

  const ax = 0;
  const ay = 0;
  const bx = (bLng - aLng) * mPerDegLng;
  const by = (bLat - aLat) * mPerDegLat;
  const px = (pLng - aLng) * mPerDegLng;
  const py = (pLat - aLat) * mPerDegLat;

  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px, py);
  const t = Math.max(0, Math.min(1, (px * dx + py * dy) / lenSq));
  return Math.hypot(px - t * dx, py - t * dy);
}

export function minDistanceToRouteMeters(
  lat: number,
  lng: number,
  geometry: Array<[number, number]>
): number {
  if (!geometry || geometry.length === 0) return Infinity;
  if (geometry.length === 1) {
    return haversineDistanceMeters(lat, lng, geometry[0][0], geometry[0][1]);
  }
  let minD = Infinity;
  for (let i = 0; i < geometry.length - 1; i++) {
    const d = pointToSegmentMeters(
      lat,
      lng,
      geometry[i][0],
      geometry[i][1],
      geometry[i + 1][0],
      geometry[i + 1][1]
    );
    if (d < minD) minD = d;
  }
  return minD;
}
