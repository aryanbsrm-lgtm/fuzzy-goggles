export interface KhabarlineMarket {
  name: string;
  slug: string;
  openTime: string;
  closeTime: string;
  openMinute?: number;
  closeMinute?: number;
  value: string; // e.g. "225-97-269" or "456-5" or "Loading..."
  openPana?: string;
  openAnk?: string;
  closeAnk?: string;
  closePana?: string;
  jodi?: string;
  isVerified: boolean;
  highlight?: boolean; // Yellow background card
  order?: number;
  lastUpdated?: string;
  verifiedDate?: string; // YYYY-MM-DD in IST when this market was verified
  verifiedSession?: 'OPEN' | 'CLOSE' | 'ALL';
  yesterdayValue?: string; // Last known finalized result from previous day
}

export interface StarlineEntry {
  time: string;
  value: string;
}

export interface Bombay36Slot {
  time: string;
  value: string;
}

export interface FreeGuessingItem {
  marketName: string;
  digits: string;
  patti: string;
  jodi: string;
  additional?: string;
}

export interface ChartRecordRow {
  dateRange: string; // e.g. "21-09-2026 To 27-09-2026"
  mon?: { openPana?: string; jodi?: string; closePana?: string };
  tue?: { openPana?: string; jodi?: string; closePana?: string };
  wed?: { openPana?: string; jodi?: string; closePana?: string };
  thu?: { openPana?: string; jodi?: string; closePana?: string };
  fri?: { openPana?: string; jodi?: string; closePana?: string };
  sat?: { openPana?: string; jodi?: string; closePana?: string };
  sun?: { openPana?: string; jodi?: string; closePana?: string };
}

export interface LiveSpotlightItem {
  marketName: string;
  value: string;
  badge?: string;
  note?: string;
}

export interface SponsoredPlayApp {
  id: string;
  appName: string;
  tag?: string; // e.g. "🔥 100% TRUSTED MATKA PLAY APP 🔥"
  headline: string; // e.g. "🎰 India's #1 Most Trusted Online Matka Play App 🎰"
  subheadline?: string; // e.g. "⚡ 1 मिनट में Fast Auto Deposit & 24x7 Instant Withdrawal"
  ratesText?: string; // e.g. "🎯 Jodi 10 का 950 • Patti 10 का 1400 • All 175+ Markets Live"
  downloadUrl: string; // Direct APK download link or landing page
  buttonText: string; // e.g. "📲 Download Play App (APK)"
  isActive: boolean;
  sponsorName?: string;
  priceCharged?: string;
  expiryDate?: string;
  contactForAdsUrl?: string; // Contact link for prospective clients wanting to buy ad slots
}

export interface KhabarlineState {
  siteTitle: string;
  domain: string;
  whatsappChannelUrl: string;
  telegramChannelUrl: string;
  apkUrl: string;
  goldenAnk: string; // e.g. "2-7-3-8"
  finalAnk: Record<string, string>; // { "KALYAN MORNING": "2", ... }
  liveResultMarkets: string[]; // List of market names currently in the live flash card section
  liveResultItems?: LiveSpotlightItem[]; // Structured live spotlight items
  liveMarketTimers?: Record<string, number>; // marketName -> expiryTimestampMs (5-minute window)
  markets: Record<string, KhabarlineMarket>;
  mainStarline: StarlineEntry[];
  mumbaiRajshreeStarline: StarlineEntry[];
  bombay36: {
    activeValue: string;
    slots: Bombay36Slot[];
  };
  aajPassHua: Array<{ market: string; text: string }>;
  freeGameZone: FreeGuessingItem[];
  weeklyPattiChart: {
    weekRange: string;
    lines: Record<string, string>; // "1" -> "119-560-489-470", ...
  };
  weeklyLineOpenClose: {
    weekRange: string;
    days: Record<string, string>; // "Mon" -> "5-0-2-7", ...
  };
  weeklyJodiChart: {
    weekRange: string;
    pairs: Record<string, string>; // "1" -> "00 05 50 55", ...
  };
  charts: Record<string, ChartRecordRow[]>; // slug -> rows
  showAppPromotion?: boolean; // Master toggle to show/hide app promotion & ads
  sponsoredPlayApps?: SponsoredPlayApp[];
  playAppBanner?: {
    enabled: boolean;
    tag?: string;
    headline: string;
    subheadline?: string;
    ratesText?: string;
    downloadUrl: string;
    buttonText: string;
    contactForAdsUrl?: string;
  };
}
