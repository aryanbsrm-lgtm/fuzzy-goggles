import { Config } from '../config.js';
import { ParsedPayload } from '../types.js';
import { MarketScheduleService } from '../services/schedule.js';

export interface RawIncomingMessage {
  text: string;
  groupJid: string;
  groupName?: string;
  senderJid: string;
  senderName?: string;
  timestamp: number;
}

const IGNORED_WORDS = new Set([
  'LIVE', 'FAST', 'RESULT', 'RESULTS', 'KHABAR', 'SUPER', 'OFFICIAL', 'RECORD',
  'CHART', 'UPDATE', 'UPDATES', 'GROUP', 'ADMIN', 'VIP', 'PRAKASH', 'JUNGLEE',
  'RUMMY', 'WELCOME', 'FREE', 'TELEGRAM', 'WHATSAPP', 'ONLINE', 'PLAY', 'APP',
  'SITE', 'CALL', 'DM', 'NUMBER', 'MATKA', 'SATTA', 'BAZAR_LIVE',
  'POST', 'TODAY', 'NEW', 'GOOD', 'MORNING', 'NIGHT', 'DAY', 'GAME',
  'OPEN', 'CLOSE', 'JODI', 'PATTI', 'PANNA', 'PASS', 'BLAST', 'DHAMAKA',
  'BHAI', 'KING', 'SIR', 'DIRECT', 'SINGLE', 'ANK'
]);

export class MessageParser {
  private config: Config['parser'];
  public scheduleService: MarketScheduleService;

  constructor(config: Config['parser'], scheduleService?: MarketScheduleService) {
    this.config = config;
    this.scheduleService = scheduleService || new MarketScheduleService();
  }

  /**
   * Attempts to extract clean Market Name, Session (OPEN/CLOSE), and Numerical Value
   */
  public parse(msg: RawIncomingMessage): ParsedPayload | null {
    if (!msg.text || msg.text.trim().length === 0) {
      return null;
    }

    const raw = msg.text;

    // 1. Extract Number Pattern (e.g. 240-67-340, 240-6, 6-340, 45)
    const numberMatch = this.extractNumberPattern(raw);
    if (!numberMatch) {
      return null;
    }

    const value = numberMatch.value;
    const initialSession = numberMatch.session;

    // 2. Extract Market Name from message lines
    const rawMarketName = this.extractMarketName(raw);
    if (!rawMarketName || rawMarketName.length === 0) {
      return null;
    }

    // 3. Resolve canonical market and session using timetable schedule
    const { marketName, session } = this.scheduleService.resolveMarketAndSession(
      rawMarketName,
      raw,
      initialSession,
      msg.timestamp
    );

    return {
      value,
      marketName,
      session,
      rawText: msg.text,
      groupJid: msg.groupJid,
      groupName: msg.groupName,
      senderJid: msg.senderJid,
      senderName: msg.senderName,
      timestamp: msg.timestamp,
    };
  }

  /**
   * Normalizes market name variations across channels (e.g. "KALYAN DAY" -> "KALYAN", "TIME" -> "TIME BAZAR")
   */
  public canonicalizeMarketName(name: string): string {
    const upper = name.trim().toUpperCase();

    const CANONICAL_MAP: Record<string, string> = {
      'KALYAN DAY': 'KALYAN',
      'KALYAN': 'KALYAN',
      'KALYAN NIGHT': 'KALYAN NIGHT',
      'MILAN DAY': 'MILAN DAY',
      'MILAN': 'MILAN DAY',
      'MILAN NIGHT': 'MILAN NIGHT',
      'RAJDHANI DAY': 'RAJDHANI DAY',
      'RAJDHANI': 'RAJDHANI DAY',
      'RAJDHANI NIGHT': 'RAJDHANI NIGHT',
      'TIME BAZAR': 'TIME BAZAR',
      'TIME': 'TIME BAZAR',
      'MAIN BAZAR': 'MAIN BAZAR',
      'MAIN': 'MAIN BAZAR',
      'MADHUR DAY': 'MADHUR DAY',
      'MADHUR': 'MADHUR DAY',
      'MADHUR NIGHT': 'MADHUR NIGHT',
      'SUPREME DAY': 'SUPREME DAY',
      'SUPREME': 'SUPREME DAY',
      'SUPREME NIGHT': 'SUPREME NIGHT',
      'SRIDEVI': 'SRIDEVI',
      'SRIDEVI DAY': 'SRIDEVI',
      'SRIDEVI NIGHT': 'SRIDEVI NIGHT',
      'RUDRAKSH DAY': 'RUDRAKSH DAY',
      'RUDRAKSH NIGHT': 'RUDRAKSH NIGHT',
      'KARNATAKA DAY': 'KARNATAKA DAY',
      'KARNATAKA NIGHT': 'KARNATAKA NIGHT',
    };

    return CANONICAL_MAP[upper] || upper;
  }

  /**
   * Extracts result digit patterns from text:
   * - 240-67-340 (Full Patti + Jodi) -> CLOSE
   * - 240-6 (Open Patti + Single) -> OPEN
   * - 6-340 / 67-340 (Close Patti) -> CLOSE
   * - 45 (Jodi) -> JODI
   */
  public extractNumberPattern(text: string): { value: string; session: 'OPEN' | 'CLOSE' | 'JODI' } | null {
    // Clean emojis and symbols around numbers
    const clean = text
      .replace(/👉|✈️|☎️|🛫|🔰|🔥|⭐|💥/g, ' ')
      .replace(/[\*\_\~]/g, ' ');

    // 1. Full Format: 3 digits - 2 digits - 3 digits (e.g. 240-67-340 or 389=03=689)
    const fullPattiMatch = clean.match(/\b(\d{3})\s*[-–=_]\s*(\d{2})\s*[-–=_]\s*(\d{3})\b/);
    if (fullPattiMatch) {
      return {
        value: `${fullPattiMatch[1]}-${fullPattiMatch[2]}-${fullPattiMatch[3]}`,
        session: 'CLOSE',
      };
    }

    // 2. Open Format: 3 digits - 1 or 2 digits (e.g. 240-6 or 389=0)
    const openPattiMatch = clean.match(/\b(\d{3})\s*[-–=_]\s*(\d{1,2})\b/);
    if (openPattiMatch) {
      const ank = openPattiMatch[2];
      return {
        value: `${openPattiMatch[1]}-${ank}`,
        session: ank.length === 2 ? 'CLOSE' : 'OPEN',
      };
    }

    // 3. Close Format: 1 or 2 digits - 3 digits (e.g. 6-340 or 0=689)
    const closePattiMatch = clean.match(/\b(\d{1,2})\s*[-–=_]\s*(\d{3})\b/);
    if (closePattiMatch) {
      return {
        value: `${closePattiMatch[1]}-${closePattiMatch[2]}`,
        session: 'CLOSE',
      };
    }

    // 4. Standalone 2-digit Jodi (e.g. 45 or 08)
    const jodiMatch = clean.match(/(?:^|\n|\s)(\d{2})(?:\s|\n|$)/);
    if (jodiMatch) {
      return {
        value: jodiMatch[1],
        session: 'JODI',
      };
    }

    return null;
  }

  /**
   * Extracts clean Market Name by filtering out header/footer noise
   */
  public extractMarketName(text: string): string | null {
    const lines = text.split('\n');

    for (const rawLine of lines) {
      // Clean characters
      let line = rawLine
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/[^\w\s]/gi, ' ') // strip punctuation, emojis, hyphens
        .trim();

      if (!line || line.length < 3) continue;

      // Skip lines that are just numbers or separators
      if (/^[\d\s\-_]+$/.test(line)) continue;

      const words = line
        .split(/\s+/)
        .map((w) => w.trim().toUpperCase())
        .filter((w) => w.length > 0);

      // Check if line contains known market keywords
      const filteredWords = words.filter((w) => {
        if (/^\d+$/.test(w)) return false; // strip numbers
        return true;
      });

      if (filteredWords.length === 0) continue;

      // If line is ONLY header fluff like "PRAKASH FAST RESULTS" or "LIVE KHABAR"
      const nonFluff = filteredWords.filter((w) => !IGNORED_WORDS.has(w));

      if (nonFluff.length > 0) {
        // Reconstruct market name (e.g. "MILAN DAY", "RAJDHANI DAY", "KALYAN", "TIME BAZAR")
        const marketWords: string[] = [];
        for (const w of filteredWords) {
          // Allow DAY, NIGHT, BAZAR, MORNING if paired with a market name (e.g. MILAN DAY)
          if (['DAY', 'NIGHT', 'BAZAR', 'MORNING'].includes(w) || !IGNORED_WORDS.has(w)) {
            marketWords.push(w);
          }
        }

        if (marketWords.length > 0) {
          return marketWords.join(' ');
        }
      }
    }

    return null;
  }
}
