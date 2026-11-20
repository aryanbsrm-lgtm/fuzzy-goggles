import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export interface MarketScheduleEntry {
  name: string;
  openTime: string;
  closeTime: string;
  openMinute: number;
  closeMinute: number;
}

export class MarketScheduleService {
  private markets: MarketScheduleEntry[] = [];
  private marketMap = new Map<string, MarketScheduleEntry>();

  constructor(customSchedulePath?: string) {
    this.loadSchedule(customSchedulePath);
  }

  private loadSchedule(customPath?: string): void {
    let schedulePath = customPath;

    if (!schedulePath) {
      try {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        schedulePath = path.resolve(__dirname, '../data/markets.json');
      } catch {
        schedulePath = path.resolve(process.cwd(), 'src/data/markets.json');
      }
    }

    if (!fs.existsSync(schedulePath)) {
      schedulePath = path.resolve(process.cwd(), 'src/data/markets.json');
    }
    if (!fs.existsSync(schedulePath)) {
      schedulePath = path.resolve(process.cwd(), 'dist/data/markets.json');
    }

    if (fs.existsSync(schedulePath)) {
      try {
        const raw = fs.readFileSync(schedulePath, 'utf-8');
        this.markets = JSON.parse(raw);
        for (const m of this.markets) {
          if (m.openMinute === undefined && m.openTime) {
            m.openMinute = this.parseTimeToMinute(m.openTime) || 0;
          }
          if (m.closeMinute === undefined && m.closeTime) {
            m.closeMinute = this.parseTimeToMinute(m.closeTime) || 0;
          }
          this.marketMap.set(m.name.toUpperCase(), m);
        }
      } catch (err) {
        console.error('Failed to parse market schedule:', err);
      }
    } else {
      console.warn('Market schedule JSON not found at:', schedulePath);
    }
  }

  public parseTimeToMinute(timeStr?: string): number | undefined {
    if (!timeStr) return undefined;
    const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!match) return undefined;
    let hours = parseInt(match[1], 10);
    const mins = parseInt(match[2], 10);
    const meridiem = match[3].toUpperCase();
    if (meridiem === 'PM' && hours < 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;
    return hours * 60 + mins;
  }

  /**
   * Returns current Indian Standard Time (IST, UTC+5:30) in minutes from midnight (0..1439)
   */
  public getISTMinutes(timestamp: number = Date.now()): number {
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(timestamp + istOffsetMs);
    return istDate.getUTCHours() * 60 + istDate.getUTCMinutes();
  }

  /**
   * Resolves the market name and session using the timetable schedule and current IST time.
   */
  public resolveMarketAndSession(
    extractedName: string,
    rawText: string,
    inferredSession?: 'OPEN' | 'CLOSE' | 'JODI',
    timestamp: number = Date.now()
  ): { marketName: string; session: 'OPEN' | 'CLOSE' | 'JODI' } {
    const upperExtracted = extractedName.trim().toUpperCase();
    const currentMins = this.getISTMinutes(timestamp);
    const upperText = rawText.toUpperCase();

    // 1. Direct canonical aliases
    let candidateName = upperExtracted;
    if (candidateName === 'KALYAN DAY') candidateName = 'KALYAN';
    if (candidateName === 'TIME') candidateName = 'TIME BAZAR';
    if (candidateName === 'MAIN') candidateName = 'MAIN BAZAR';
    if (candidateName === 'PUSHPA DAY') candidateName = 'PUSPA DAY';
    if (candidateName === 'PUSHPA NIGHT') candidateName = 'PUSPA NIGHT';
    if (candidateName === 'SITARA BAZAR') candidateName = 'SITARA';

    // 2. Check exact match in schedule
    let matchedMarket = this.marketMap.get(candidateName);

    // 3. Disambiguate if not found in map, or if text is plain 'SRIDEVI'
    if (
      !matchedMarket ||
      (upperExtracted === 'SRIDEVI' &&
        !upperText.includes('DAY') &&
        !upperText.includes('NIGHT'))
    ) {
      const candidates = this.markets.filter(
        (m) =>
          m.name === upperExtracted ||
          m.name.startsWith(`${upperExtracted} `) ||
          upperExtracted.startsWith(`${m.name} `)
      );

      if (candidates.length > 1) {
        // Pick candidate closest to current IST time (accommodates large delays safely)
        let bestCandidate = candidates[0];
        let smallestDiff = 1440;

        for (const c of candidates) {
          const diffOpen = Math.abs(currentMins - c.openMinute);
          const diffClose = Math.abs(currentMins - c.closeMinute);
          const minDiff = Math.min(diffOpen, diffClose);

          if (minDiff < smallestDiff) {
            smallestDiff = minDiff;
            bestCandidate = c;
          }
        }
        matchedMarket = bestCandidate;
      }
    }

    const finalMarketName = matchedMarket ? matchedMarket.name : candidateName;

    // 4. Session resolution
    let finalSession: 'OPEN' | 'CLOSE' | 'JODI' = inferredSession || 'OPEN';

    if (/\bOPEN\b/.test(upperText) && !/\bCLOSE\b/.test(upperText)) {
      finalSession = 'OPEN';
    } else if (/\bCLOSE\b/.test(upperText)) {
      finalSession = 'CLOSE';
    } else if (inferredSession === 'OPEN' || inferredSession === 'CLOSE') {
      finalSession = inferredSession;
    } else if (inferredSession === 'JODI') {
      // 2-digit jodi could be Open Jodi or Close Jodi depending on timetable timing
      if (matchedMarket) {
        const diffOpen = Math.abs(currentMins - matchedMarket.openMinute);
        const diffClose = Math.abs(currentMins - matchedMarket.closeMinute);
        finalSession = diffOpen <= diffClose ? 'OPEN' : 'CLOSE';
      } else {
        finalSession = 'JODI';
      }
    } else if (matchedMarket) {
      const diffOpen = Math.abs(currentMins - matchedMarket.openMinute);
      const diffClose = Math.abs(currentMins - matchedMarket.closeMinute);
      finalSession = diffOpen <= diffClose ? 'OPEN' : 'CLOSE';
    }

    return {
      marketName: finalMarketName,
      session: finalSession,
    };
  }

  public getMarket(name: string): MarketScheduleEntry | undefined {
    return this.marketMap.get(name.toUpperCase());
  }

  public getAllMarkets(): MarketScheduleEntry[] {
    return [...this.markets];
  }
}
