import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';
import { KhabarlineMarket, KhabarlineState, ChartRecordRow, StarlineEntry, Bombay36Slot, FreeGuessingItem, SponsoredPlayApp } from './types.js';

export const SPECIAL_EXTERNAL_MARKETS = [
  // Original 6 Sitara / Sitarani Markets
  { name: 'SITARANI MORNING', slug: 'sitarani-morning', openTime: '09:40 AM', closeTime: '10:40 AM', highlight: true },
  { name: 'SITARA MORNING', slug: 'sitara-morning', openTime: '10:10 AM', closeTime: '11:10 AM', highlight: true },
  { name: 'SITARANI DAY', slug: 'sitarani-day', openTime: '01:40 PM', closeTime: '02:40 PM', highlight: true },
  { name: 'SITARA DAY', slug: 'sitara-day', openTime: '02:15 PM', closeTime: '03:15 PM', highlight: true },
  { name: 'SITARA NIGHT', slug: 'sitara-night', openTime: '07:20 PM', closeTime: '08:20 PM', highlight: true },
  { name: 'SITARANI NIGHT', slug: 'sitarani-night', openTime: '08:30 PM', closeTime: '09:30 PM', highlight: true },

  // 20 Added Markets
  { name: 'SUBHODAYA', slug: 'subhodaya', openTime: '09:00 AM', closeTime: '10:00 AM', highlight: true },
  { name: 'TRIVENI MORNING', slug: 'triveni-morning', openTime: '10:05 AM', closeTime: '11:05 AM', highlight: true },
  { name: 'LOTUS MORNING', slug: 'lotus-morning', openTime: '10:10 AM', closeTime: '11:10 AM', highlight: true },
  { name: 'BAHUBALI', slug: 'bahubali', openTime: '10:15 AM', closeTime: '11:15 AM', highlight: true },
  { name: 'SWARN ANDHRA', slug: 'swarn-andhra', openTime: '10:35 AM', closeTime: '11:35 AM', highlight: true },
  { name: 'MAHALAXMI', slug: 'mahalaxmi', openTime: '10:55 AM', closeTime: '11:55 AM', highlight: true },
  { name: 'MADHYANA', slug: 'madhyana', openTime: '01:25 PM', closeTime: '02:25 PM', highlight: true },
  { name: 'LOTUS DAY', slug: 'lotus-day', openTime: '02:10 PM', closeTime: '03:10 PM', highlight: true },
  { name: 'NTR BAZAR', slug: 'ntr-bazar', openTime: '02:55 PM', closeTime: '03:55 PM', highlight: true },
  { name: 'TRIVENI DAY', slug: 'triveni-day', openTime: '03:00 PM', closeTime: '04:00 PM', highlight: true },
  { name: 'SWARN ANDHRA DAY', slug: 'swarn-andhra-day', openTime: '03:30 PM', closeTime: '05:30 PM', highlight: true },
  { name: 'LEELA DAY', slug: 'leela-day', openTime: '03:35 PM', closeTime: '05:35 PM', highlight: true },
  { name: 'PUSPA DAY', slug: 'pushpa-day', openTime: '03:40 PM', closeTime: '05:40 PM', highlight: true },
  { name: 'SITARA', slug: 'sitara', openTime: '04:30 PM', closeTime: '06:30 PM', highlight: true },
  { name: 'LOTUS NIGHT', slug: 'lotus-night', openTime: '08:10 PM', closeTime: '09:10 PM', highlight: true },
  { name: 'SWARN ANDHRA NIGHT', slug: 'swarn-andhra-night', openTime: '08:40 PM', closeTime: '10:40 PM', highlight: true },
  { name: 'PUSPA NIGHT', slug: 'pushpa-night', openTime: '08:40 PM', closeTime: '10:40 PM', highlight: true },
  { name: 'LEELA NIGHT', slug: 'leela-night', openTime: '08:45 PM', closeTime: '10:45 PM', highlight: true },
  { name: 'SHREEVALLI NIGHT', slug: 'shreevalli-night', openTime: '08:45 PM', closeTime: '10:45 PM', highlight: true },
  { name: 'RAAT RANI', slug: 'raat-rani', openTime: '10:15 PM', closeTime: '11:50 PM', highlight: true },
];

export const SIX_SPECIAL_MARKETS = SPECIAL_EXTERNAL_MARKETS;

export class KhabarlineStore extends EventEmitter {
  private filePath: string;
  private state: KhabarlineState;
  private liveTickerInterval: NodeJS.Timeout | null = null;
  private currentDateIST: string;
  private whitelistService?: any;

  constructor(customPath?: string, whitelistService?: any) {
    super();
    this.filePath = customPath || path.resolve(process.cwd(), 'data', 'khabarline_state.json');
    this.whitelistService = whitelistService;
    this.currentDateIST = this.getTodayIST();
    this.state = this.loadOrSeed();
    if (process.env.NODE_ENV !== 'test') {
      this.startLiveTicker();
    }
  }

  public setWhitelistService(service: any): void {
    this.whitelistService = service;
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

  private loadOrSeed(): KhabarlineState {
    let state: KhabarlineState;
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && parsed.markets && Object.keys(parsed.markets).length > 0) {
          logger.info({ marketsCount: Object.keys(parsed.markets).length }, '📂 Loaded Khabarline state from disk');
          state = parsed;
        } else {
          state = this.createDefaultState();
        }
      } else {
        state = this.createDefaultState();
      }
    } catch (err: any) {
      logger.warn({ err: err?.message || err }, '⚠️ Could not read khabarline state file, re-seeding defaults...');
      state = this.createDefaultState();
    }

    // Ensure liveMarketTimers exists and compute missing openMinute/closeMinute
    if (!state.liveMarketTimers) {
      state.liveMarketTimers = {};
    }
    for (const m of Object.values(state.markets)) {
      if (m.openTime && m.openMinute === undefined) {
        m.openMinute = this.parseTimeToMinute(m.openTime);
      }
      if (m.closeTime && m.closeMinute === undefined) {
        m.closeMinute = this.parseTimeToMinute(m.closeTime);
      }
    }

    // Startup Rollover Guard: Ensure yesterday's verified status is NEVER treated as verified today!
    const todayIST = this.getTodayIST();
    this.currentDateIST = todayIST;
    const currentMins = this.getISTMinutes();
    for (const m of Object.values(state.markets || {})) {
      const isOvernight = m.openMinute !== undefined && m.closeMinute !== undefined && m.closeMinute < m.openMinute;
      const isOvernightWaitingForTonight = isOvernight && currentMins < m.openMinute && (m.verifiedSession === 'CLOSE' || m.verifiedSession === 'ALL');
      if (m.verifiedDate !== todayIST || isOvernightWaitingForTonight) {
        if (m.value && m.value !== 'Loading...' && m.value !== '***-**-***') {
          m.yesterdayValue = m.yesterdayValue || m.value;
        }
        m.isVerified = false;
        m.verifiedSession = undefined;
        if (isOvernightWaitingForTonight) {
          m.verifiedDate = this.getYesterdayIST();
        }
      }
    }

    // Sanitize liveResultMarkets against current IST schedule and active timers
    const now = Date.now();
    const validLive: string[] = [];
    for (const key of state.liveResultMarkets || []) {
      const market = state.markets[key];
      const expiry = state.liveMarketTimers[key] || 0;
      const isScheduledActive =
        market &&
        ((market.openMinute !== undefined &&
          currentMins >= market.openMinute &&
          currentMins < market.openMinute + 5) ||
          (market.closeMinute !== undefined &&
            currentMins >= market.closeMinute &&
            currentMins < market.closeMinute + 5));

      if (now < expiry || isScheduledActive) {
        validLive.push(key);
      } else {
        delete state.liveMarketTimers[key];
      }
    }
    // Ensure all special external markets exist
    this.ensureSixMarketsExist(state);

    this.saveState(state);
    return state;
  }

  private ensureSixMarketsExist(state: KhabarlineState): void {
    if (!state.markets) state.markets = {};
    SPECIAL_EXTERNAL_MARKETS.forEach((item, index) => {
      const key = item.name.toUpperCase().trim();
      const slug = item.slug || this.slugify(item.name);
      const openMinute = this.parseTimeToMinute(item.openTime);
      const closeMinute = this.parseTimeToMinute(item.closeTime);

      if (!state.markets[key]) {
        state.markets[key] = {
          name: item.name,
          slug,
          openTime: item.openTime,
          closeTime: item.closeTime,
          openMinute,
          closeMinute,
          value: '***-**-***',
          isVerified: false,
          highlight: item.highlight,
          order: 40 + index,
          lastUpdated: new Date().toISOString(),
        };
      } else {
        const existing = state.markets[key];
        existing.slug = slug;
        if (item.openTime && (existing.openMinute === undefined || existing.openTime === '11:00 AM' || existing.name === 'LEELA NIGHT')) {
          existing.openTime = item.openTime;
          existing.openMinute = openMinute;
        }
        if (item.closeTime && (existing.closeMinute === undefined || existing.closeTime === '01:00 PM' || existing.name === 'LEELA NIGHT')) {
          existing.closeTime = item.closeTime;
          existing.closeMinute = closeMinute;
        }
        if (existing.openMinute === undefined && existing.openTime) {
          existing.openMinute = this.parseTimeToMinute(existing.openTime);
        }
        if (existing.closeMinute === undefined && existing.closeTime) {
          existing.closeMinute = this.parseTimeToMinute(existing.closeTime);
        }
        if (existing.highlight === undefined) existing.highlight = true;
      }
    });
  }

  private slugify(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  public decomposeResult(val: string): {
    openPana?: string;
    openAnk?: string;
    closeAnk?: string;
    closePana?: string;
    jodi?: string;
  } {
    if (!val || val === 'Loading...' || val === '***-**-***') return {};
    const norm = val.replace(/\s+/g, '').replace(/–|=|_/g, '-').trim();

    // 1. Full 3-phase result: 240-67-340 or 599-38-167 or 447-58-233
    const fullMatch = norm.match(/^(\d{3})-(\d)(\d)-(\d{3})$/);
    if (fullMatch) {
      return {
        openPana: fullMatch[1],
        openAnk: fullMatch[2],
        closeAnk: fullMatch[3],
        closePana: fullMatch[4],
        jodi: `${fullMatch[2]}${fullMatch[3]}`,
      };
    }

    // 2. Open Pana + Jodi with pending close: 599-38-*** or 599-38- or 599-38
    const openJodiMatch = norm.match(/^(\d{3})-(\d)(\d)(?:-[\*\s]+|-)?$/);
    if (openJodiMatch) {
      return {
        openPana: openJodiMatch[1],
        openAnk: openJodiMatch[2],
        closeAnk: openJodiMatch[3],
        jodi: `${openJodiMatch[2]}${openJodiMatch[3]}`,
      };
    }

    // 3. Open Pana + Single: 599-3, 122-5, 599-3*, 599-3-***
    const openSingleMatch = norm.match(/^(\d{3})-(\d)(?:[\*\s]+)?(?:-[\*\s]+)?$/);
    if (openSingleMatch) {
      return {
        openPana: openSingleMatch[1],
        openAnk: openSingleMatch[2],
        jodi: `${openSingleMatch[2]}*`,
        closePana: '***',
      };
    }

    // 4. Close Single/Jodi + Close Pana: ***-38-167 or *-8-167 or 38-167 or 8-167
    const closeMatch = norm.match(/^(?:[\*\s]+-)?(?:(\d))?(\d)-(\d{3})$/);
    if (closeMatch) {
      return {
        openPana: '***',
        openAnk: closeMatch[1] || undefined,
        closeAnk: closeMatch[2],
        closePana: closeMatch[3],
        jodi: closeMatch[1] ? `${closeMatch[1]}${closeMatch[2]}` : `*${closeMatch[2]}`,
      };
    }

    // 5. Inverted close or open patti: 167-8
    const pattiSingleMatch = norm.match(/^(\d{3})-(\d)$/);
    if (pattiSingleMatch) {
      return {
        openPana: pattiSingleMatch[1],
        openAnk: pattiSingleMatch[2],
        jodi: `${pattiSingleMatch[2]}*`,
        closePana: '***',
      };
    }

    return {};
  }

  private createDefaultState(): KhabarlineState {
    let marketsJson: Array<{ name: string; openTime: string; closeTime: string; openMinute?: number; closeMinute?: number }> = [];
    try {
      const p = path.resolve(process.cwd(), 'src', 'data', 'markets.json');
      if (fs.existsSync(p)) {
        marketsJson = JSON.parse(fs.readFileSync(p, 'utf-8'));
      }
    } catch (e) {
      logger.warn('Failed to load markets.json for khabarline seeding');
    }

    const defaultHighlighted = new Set([
      'KALYAN MORNING',
      'KARNATAKA DAY',
      'PRABHAT',
      'KALYAN',
      'MAIN BAZAR',
      'KALYAN NIGHT',
      'OLD MAIN MUMBAI',
      'RATAN KHATRI',
      'BOMBAY NIGHT',
      'BALAJI',
    ]);

    const seededMarkets: Record<string, KhabarlineMarket> = {};

    // Initial default numbers matching standard DPBoss boards
    const sampleNumbers: Record<string, string> = {
      'KALYAN MORNING': '225-97-269',
      'MILAN MORNING': '670-33-148',
      'SRIDEVI': '359-70-479',
      'MAIN BAZAR MORNING': '680-42-570',
      'MADHURI': '357-54-248',
      'SRIDEVI MORNING': '114-64-455',
      'MAHARANI': '360-92-778',
      'KARNATAKA DAY': '138-21-678',
      'TIME BAZAR MORNING': '689-33-670',
      'MAIN SRIDEVI DAY': '440-8',
      'TIME BAZAR': '566-74-257',
      'TARA MUMBAI DAY': '137-1',
      'PRABHAT': '390-2',
      'DIAMOND': '580-3',
      'TIME BAZAR DAY': '360-90-118',
      'MILAN DAY': '470-18-369',
      'MAIN BAZAR DAY': '490-31-380',
      'PUNA BAZAR': '125-8',
      'MUMBAI MORNING': '178-69-289',
      'NEW TIME BAZAR': '450-91-128',
      'KALYAN': '156-27-133',
      'SRIDEVI NIGHT': '235-08-369',
      'DIAMOND NIGHT': '370-04-680',
      'MADHURI NIGHT': '249-57-359',
      'NIGHT TIME BAZAR': '147-24-446',
      'TARA MUMBAI NIGHT': '490-38-260',
      'MILAN NIGHT': '124-75-780',
      'RAJDHANI NIGHT': '150-60-280',
      'MAIN BAZAR': '570-24-158',
      'MAIN SRIDEVI': '110-29-388',
      'MAHARANI DAY': '400-41-137',
      'PAREL DAY': '360-9',
      'BOMBAY DAY': '470-1',
      'KALYAN NIGHT': '190-00-127',
      'MUMBAI NIGHT': '369-83-247',
      'SUPREME MORNING': '190-06-240',
      'SRIDEVI DAY': '456-5',
      'PRABHAT NIGHT': '270-98-459',
      'SUPER DAY': '440-81-470',
      'OLD MUMBAI': '400-46-123',
      'OLD MAIN MUMBAI': '128-14-167',
      'MADHUR MORNING': '134-87-449',
      'MADHUR DAY': '468-80-460',
      'MADHUR NIGHT': '360-92-679',
      'SHRI DAY': '166-34-356',
      'SHRI NIGHT': '567-89-225',
      'RATAN KHATRI': '167-49-568',
      'WORLI MORNING': '290-11-119',
      'WORLI NIGHT': '590-43-120',
      'MAHARANI NIGHT': '240-62-570',
      'JAY SHREE DAY': '450-99-289',
      'SRI DHANALAXMI': '477-86-259',
      'BOMBAY NIGHT': '129-25-230',
      'SUNDAY BAZAR': '100-1',
      'PADMAVATHI': '130-49-450',
      'PADMAVATHI NIGHT': '567-83-300',
      'MAIN RATAN': '600-65-357',
      'RATAN GOLD DAY': '789-42-345',
      'RATAN GOLD NIGHT': '467-78-134',
      'BALAJI': '123-65-555',
      'KAMDHENU': '227-10-127',
      'KAMDHENU NIGHT': '100-18-189',
      'SUPER NIGHT': '469-93-148',
      'NEW KALYAN DAY': '220-44-239',
      'LUCKY DAY': '230-53-256',
      'KALYAN SRIDEVI': '188-71-579',
      'KALYAN SRIDEVI NIGHT': '336-21-128',
      'CENTRAL MUMBAI': '349-6',
      'MUMBAI DAY': '113-5',
      'KOHINOOR DAY': '168-59-568',
      'KOHINOOR NIGHT': '123-64-248',
      'NEW TARA MUMBAI DAY': '225-9',
      'STAR TARA MORNING': '128-10-569',
      'STAR TARA DAY': '268-6',
      'STAR TARA NIGHT': '890-79-568',
      'PUNA NIGHT': '449-72-237',
      'SUPREME DAY': '124-76-349',
      'SUPREME NIGHT': '469-95-267',
      'RADHA MUMBAI DAY': '367-6',
      'RADHA MUMBAI NIGHT': '130-43-247',
      'PARAS DAY': '400-42-345',
      'PARAS NIGHT': '369-83-148',
      'SRILAKSHMI': '258-54-400',
      'BHAGYA DAY': '149-46-358',
      'BHAGYA NIGHT': '257-45-140',
      'WORLI MUMBAI DAY': '120-38-440',
      'MAIN MUMBAI RK': '570-23-238',
      'WORLI MUMBAI': '189-86-240',
      'SITA DAY': '147-22-570',
      'COUNTRY BAZAR': '368-74-167',
      'AMAR BAZAR': '200-23-247',
      'ROSE BAZAR DAY': '388-97-278',
      'ROSE BAZAR NIGHT': '269-79-126',
      'JANTA MORNING': '124-76-123',
      'CENTRAL BOMBAY': '140-53-346',
      'TEEN PATTI': '348-51-128',
      'DURGA NIGHT': '228-24-149',
      'MAHADEVI': '270-96-457',
      'SUPER TIME': '358-67-115',
      'KAALI': '270-93-490',
      'MAIN MUMBAI NIGHT': '139-34-149',
      'SITA NIGHT': '180-93-445',
      'KAMAL MORNING': '556-64-789',
      'KAMAL DAY': '588-11-137',
      'KAMAL NIGHT': '579-11-678',
      'KHATRI MORNING': '337-30-145',
      'ANDHRA MORNING': '467-76-114',
      'ANDHRA DAY': '390-25-122',
      'ANDHRA NIGHT': '258-54-590',
      'MAHADEVI MORNING': '900-94-149',
      'DELHI BAZAR': '478-95-177',
      'RATAN DAY': '230-59-180',
      'MAHALAXMI MORNING': '115-79-180',
      'WORLI MUMBAI NIGHT': '248-40-334',
      'RAJDHANI DAY': '156-26-448',
      'TIME NIGHT': '250-79-225',
      'SUPER MATKA': '100-13-120',
      'BOMBAY RAJSHREE DAY': '269-7',
      'BOMBAY RAJSHREE NIGHT': '158-46-123',
      'CB': '569-0',
      'CHANDNI MORNING': '579-16-240',
      'GUJRAT MORNING': '500-52-778',
      'GUJRAT NIGHT': '899-68-990',
      'GOWA': '123-69-180',
      'RAKHI MORNING': '290-10-190',
      'RATNA MORNING': '248-40-578',
      'GEETA MORNING': '226-03-355',
      'RATNA DAY': '470-19-388',
      'RATNA NIGHT': '244-08-116',
      'TULSI MORNING': '347-40-190',
      'SRILAXMI DAY': '889-5',
      'NTR MORNING': '224-82-390',
      'NTR DAY': '236-12-129',
      'NTR NIGHT': '155-10-488',
      'MAYA BAZAR': '229-30-479',
      'SUPER KING': '660-21-560',
      'SUPER KING NIGHT': '234-92-480',
      'MEENA BAZAR': '459-81-128',
      'KALYAN KING': '136-1',
      'SITARA BAZAR': '279-87-359',
      'MANGAL BAZAR': '477-84-112',
      'MANGAL MORNING': '257-49-469',
      'MANGAL DAY': '157-38-459',
      'MANGAL NIGHT': '223-77-340',
      'GAMA MORNING': '368-70-190',
      'GAMA DAY': '257-4',
      'GAMA NIGHT': '588-12-110',
      'MILAN BAZAR MORNING': '158-49-270',
      'MILAN BAZAR DAY': '349-6',
      'MILAN BAZAR NIGHT': '458-79-135',
      'MAIN MILAN MORNING': '345-22-228',
      'MEENA MORNING': '366-52-480',
      'MAIN STAR': '170-88-260',
      'SUPREME BAZAR DAY': '560-17-250',
      'SUPREME BAZAR NIGHT': '117-90-190',
      'ANMOL': '269-75-555',
      'STANDARD BAZAR': '147-25-159',
      'CITY BAZAR DAY': 'Loading...',
      'CITY BAZAR NIGHT': '157-30-578',
      'MAIN BAZAR NIGHT': '133-75-122',
      'SAMSKARA DAY': '668-07-557',
      'SAMSKARA NIGHT': '567-83-157',
      'THALAIVA MORNING': '340-74-149',
      'THALAIVA NIGHT': '170-85-168',
      'THALAIVA': '899-60-550',
      'SITA MORNING': '490-37-115',
      'VAISHNAVI DAY': '356-4',
      'ASHA BAZAR': '788-38-378',
      'RAJSHREE': '190-03-300',
      'DAY JANTA': '126-99-135',
      'NIGHT JANTA': '144-91-290',
      'MATKA KING': '255-28-800',
      'MATKA KING NIGHT': '125-80-145',
    };

    let idx = 0;
    for (const item of marketsJson) {
      idx++;
      const val = sampleNumbers[item.name.toUpperCase()] || 'Loading...';
      const parts = this.decomposeResult(val);
      const slug = this.slugify(item.name);
      seededMarkets[item.name.toUpperCase()] = {
        name: item.name.toUpperCase(),
        slug,
        openTime: item.openTime,
        closeTime: item.closeTime,
        openMinute: item.openMinute !== undefined ? item.openMinute : this.parseTimeToMinute(item.openTime),
        closeMinute: item.closeMinute !== undefined ? item.closeMinute : this.parseTimeToMinute(item.closeTime),
        value: val,
        ...parts,
        isVerified: true,
        highlight: defaultHighlighted.has(item.name.toUpperCase()),
        order: idx,
        lastUpdated: new Date().toISOString(),
      };
    }

    // Add any extra markets from sampleNumbers not in markets.json
    for (const [k, v] of Object.entries(sampleNumbers)) {
      if (!seededMarkets[k]) {
        idx++;
        const parts = this.decomposeResult(v);
        seededMarkets[k] = {
          name: k,
          slug: this.slugify(k),
          openTime: '11:00 AM',
          closeTime: '01:00 PM',
          openMinute: this.parseTimeToMinute('11:00 AM'),
          closeMinute: this.parseTimeToMinute('01:00 PM'),
          value: v,
          ...parts,
          isVerified: true,
          highlight: defaultHighlighted.has(k),
          order: idx,
          lastUpdated: new Date().toISOString(),
        };
      }
    }

    const charts: Record<string, ChartRecordRow[]> = {};
    for (const market of Object.values(seededMarkets)) {
      charts[market.slug] = this.generateSampleChartRows(market);
    }

    return {
      siteTitle: 'KHABARLINE | SATTA MATKA | KALYAN MATKA | MATKA RESULT | MATKA | SATTA',
      domain: 'khabarline.site',
      whatsappChannelUrl: 'https://whatsapp.com/channel/0029VbCH7KEGpLHN8giIeL2F',
      telegramChannelUrl: 'https://t.me/result_juggler',
      apkUrl: '#',
      goldenAnk: '2-7-3-8',
      finalAnk: {
        'KALYAN MORNING': '2',
        'MILAN MORNING': '2',
        'SRIDEVI': '4',
        'MAIN BAZAR MORNING': '2',
        'MADHURI': '8',
        'SRIDEVI MORNING': '0',
        'KARNATAKA DAY': '6',
        'TIME BAZAR': '2',
        'MILAN DAY': '8',
        'MUMBAI MORNING': '0',
        'NEW TIME BAZAR': '0',
        'KALYAN': '8',
        'SRIDEVI NIGHT': '6',
        'MADHURI NIGHT': '4',
        'MILAN NIGHT': '4',
        'RAJDHANI NIGHT': '2',
        'MAIN BAZAR': '2',
        'BOMBAY DAY': '6',
        'KALYAN NIGHT': '0',
        'OLD MAIN MUMBAI': '0',
        'MADHUR DAY': '6',
        'MADHUR NIGHT': '2',
        'SUNDAY BAZAR': '6',
        'CITY BAZAR DAY': '2',
        'CITY BAZAR NIGHT': '6',
      },
      liveResultMarkets: [],
      liveMarketTimers: {},
      markets: seededMarkets,
      mainStarline: [
        { time: '09:05 AM', value: '360-9' },
        { time: '10:05 AM', value: '899-6' },
        { time: '11:05 AM', value: '118-0' },
        { time: '12:05 PM', value: '578-0' },
        { time: '01:05 PM', value: '557-7' },
        { time: '02:05 PM', value: '478-9' },
        { time: '03:05 PM', value: '128-1' },
        { time: '04:05 PM', value: '348-5' },
        { time: '05:05 PM', value: '140-5' },
        { time: '06:05 PM', value: '235-0' },
        { time: '07:05 PM', value: '459-8' },
        { time: '08:05 PM', value: '269-7' },
      ],
      mumbaiRajshreeStarline: [
        { time: '09:45 AM', value: '236-1' },
        { time: '10:45 AM', value: '225-9' },
        { time: '11:45 AM', value: '124-7' },
        { time: '12:45 PM', value: '347-4' },
        { time: '01:45 PM', value: '279-8' },
        { time: '02:45 PM', value: '140-5' },
        { time: '03:45 PM', value: '450-9' },
        { time: '04:45 PM', value: '257-4' },
        { time: '05:45 PM', value: '689-3' },
        { time: '06:45 PM', value: '136-0' },
        { time: '07:45 PM', value: '357-5' },
        { time: '08:45 PM', value: '118-0' },
      ],
      bombay36: {
        activeValue: '570-2',
        slots: [
          { time: '11:00 AM', value: '230-5' },
          { time: '11:15 AM', value: '116-8' },
          { time: '11:30 AM', value: '369-8' },
          { time: '11:45 AM', value: '159-5' },
          { time: '12:00 PM', value: '146-1' },
          { time: '12:15 PM', value: '123-6' },
          { time: '12:30 PM', value: '479-0' },
          { time: '12:45 PM', value: '348-5' },
          { time: '01:00 PM', value: '169-6' },
          { time: '01:15 PM', value: '250-7' },
          { time: '01:30 PM', value: '270-9' },
          { time: '01:45 PM', value: '455-4' },
          { time: '02:00 PM', value: '127-0' },
          { time: '02:15 PM', value: '668-0' },
          { time: '02:30 PM', value: '357-5' },
          { time: '02:45 PM', value: '570-2' },
          { time: '03:00 PM', value: '149-4' },
          { time: '03:15 PM', value: '280-0' },
          { time: '03:30 PM', value: '368-7' },
          { time: '03:45 PM', value: '459-8' },
          { time: '04:00 PM', value: '--' },
          { time: '04:15 PM', value: '--' },
          { time: '04:30 PM', value: '--' },
          { time: '04:45 PM', value: '--' },
          { time: '05:00 PM', value: '--' },
          { time: '05:15 PM', value: '--' },
          { time: '05:30 PM', value: '--' },
          { time: '05:45 PM', value: '--' },
          { time: '06:00 PM', value: '--' },
          { time: '06:15 PM', value: '--' },
          { time: '06:30 PM', value: '--' },
          { time: '06:45 PM', value: '--' },
          { time: '07:00 PM', value: '--' },
          { time: '07:15 PM', value: '--' },
          { time: '07:30 PM', value: '--' },
          { time: '07:45 PM', value: '--' },
        ],
      },
      aajPassHua: [
        { market: 'KALYAN MORNING', text: 'Close Ank 7 Pass, Close Patti 269 Pass.' },
        { market: 'SRIDEVI MORNING', text: 'Close Ank 4 Pass.' },
        { market: 'TIME BAZAR MORNING', text: 'Open Ank 3 Pass, Close Ank 3 Pass.' },
        { market: 'KALYAN', text: 'Open Ank 2 Pass, Jodi 27 Pass.' },
        { market: 'MILAN DAY', text: 'Open Ank 1 Pass, Patti 470 Pass.' },
      ],
      freeGameZone: [
        { marketName: 'MILAN MORNING', digits: '1-6-3-8', patti: '236-367-238-288-189', jodi: '13-18-63-68-31-36-81-86' },
        { marketName: 'KALYAN MORNING', digits: '8-5-7-2', patti: '369-357-269-129', jodi: '85-89-55-79-29-72' },
        { marketName: 'TIME BAZAR', digits: '1-6-2-7', patti: '236-367-556-129-179', jodi: '12-17-62-67-23-28-73-78' },
        { marketName: 'MILAN DAY', digits: '4-9-1-6', patti: '470-137-240-358', jodi: '41-46-91-96-14-19-64-69' },
        { marketName: 'KALYAN', digits: '1-6-2-7', patti: '156-277-133-288', jodi: '12-17-62-67-21-26-71-76' },
        { marketName: 'MILAN NIGHT', digits: '2-7-5-0', patti: '124-780-348-578', jodi: '25-20-75-70-52-57-02-07' },
        { marketName: 'KALYAN NIGHT', digits: '1-6-0-5', patti: '190-127-348-569', jodi: '10-15-60-65-01-06-51-56' },
        { marketName: 'RAJDHANI NIGHT', digits: '1-6-0-5', patti: '150-280-349-678', jodi: '16-10-61-60-01-06-51-56' },
        { marketName: 'MAIN BAZAR', digits: '5-0-2-7', patti: '570-158-234-789', jodi: '52-57-02-07-25-20-75-70' },
        { marketName: 'RATAN KHATRI', digits: '1-6-4-9', patti: '167-568-239-478', jodi: '14-19-64-69-41-46-91-96' },
        { marketName: 'PUNA BAZAR', digits: '3-5-6', patti: '148-490-357-780-156-367', jodi: '12-14-18-52-54-58-62-64-68' },
        { marketName: 'SRIDEVI NIGHT', digits: '2-3-4-9', patti: '679-139-239-234', jodi: '25-20-35-30-40-45-90-95' },
        { marketName: 'MAIN BAZAR MORNING', digits: '9-3-5-0', patti: '450-670-113-127', jodi: '93-98-39-34-52-57-02-07' },
        { marketName: 'PADMAVATHI', digits: '1-4-7-9', patti: '137-560-455-130-124-566-126-559', jodi: '12-11-44-42-76-73-92-96' },
        { marketName: 'KARNATAKA DAY', digits: '4-5-8', patti: '130-235-456-890-350-478', jodi: '49-47-57-59-80-89' },
        { marketName: 'SRIDEVI', digits: '4-5-9-0', patti: '112-889-117-488', jodi: '41-46-52-57-93-98-00-05' },
        { marketName: 'PRABHAT', digits: '3-4-8-9', patti: '139-689-149-590-134-170-135-180', jodi: '32-37-44-49-87-82-94-99' },
        { marketName: 'NEW TIME BAZAR', digits: '9-4-1-6', patti: '289-590-146-367-240', jodi: '97-92-47-42-11-16-61-66' },
        { marketName: 'SRIDEVI MORNING', digits: '1-2-3-4', patti: '489-358-157-680-239', jodi: '12-17-21-26-31-36-41-46' },
        { marketName: 'MAIN BAZAR DAY', digits: '1-6-3-8', patti: '489-358-556-157-170', jodi: '13-18-63-68-31-36-81-86' },
      ],
      weeklyPattiChart: {
        weekRange: '21-09-2026 To 27-09-2026',
        lines: {
          '1': '119-560-489-470',
          '2': '246-156-660-345',
          '3': '120-238-670-346',
          '4': '347-699-149-257',
          '5': '159-500-690-168',
          '6': '349-178-466-556',
          '7': '124-368-557-467',
          '8': '378-558-189-558',
          '9': '568-126-144-289',
          '0': '118-136-550-479',
        },
      },
      weeklyLineOpenClose: {
        weekRange: '21-09-2026 To 27-09-2026',
        days: {
          'Mon': '5-0-2-7',
          'Tue': '1-6-4-9',
          'Wed': '2-7-3-8',
          'Thu': '1-6-4-9',
          'Fri': '2-7-5-0',
          'Sat': '3-8-4-9',
          'Sun': '1-6-5-0',
        },
      },
      weeklyJodiChart: {
        weekRange: '21-09-2026 To 27-09-2026',
        pairs: {
          '1': '00 05 50 55',
          '2': '14 19 64 69',
          '3': '31 36 81 86',
          '4': '02 07 52 57',
          '5': '34 39 84 89',
          '6': '21 26 71 76',
        },
      },
      charts,
      sponsoredPlayApps: [
        {
          id: 'kalyan-play-app',
          appName: 'Khabarline Online Matka Play',
          tag: '🔥 100% TRUSTED ONLINE MATKA PLAY APP 🔥',
          headline: '🎰 सबसे भरोसेमंद Online Matka Play App 🎰',
          subheadline: '⚡ 1 मिनट में Fast Auto Deposit & 24x7 Instant Withdrawal • 100% Safe & Trusted',
          ratesText: '🎯 Single Ank 10 का 95 • Jodi 10 का 950 • Single Patti 10 का 1400',
          downloadUrl: 'https://whatsapp.com/channel/0029VbCH7KEGpLHN8giIeL2F',
          buttonText: '📲 Download Play App (APK)',
          isActive: true,
          sponsorName: 'Admin Direct',
          contactForAdsUrl: 'https://whatsapp.com/channel/0029VbCH7KEGpLHN8giIeL2F',
        },
      ],
      playAppBanner: {
        enabled: true,
        tag: '🔥 100% TRUSTED ONLINE MATKA PLAY APP 🔥',
        headline: '🎰 सबसे भरोसेमंद Online Matka Play App 🎰',
        subheadline: '⚡ 1 मिनट में Fast Auto Deposit & 24x7 Instant Withdrawal • 100% Safe & Trusted',
        ratesText: '🎯 Single Ank 10 का 95 • Jodi 10 का 950 • Single Patti 10 का 1400',
        downloadUrl: 'https://whatsapp.com/channel/0029VbCH7KEGpLHN8giIeL2F',
        buttonText: '📲 Download Play App (APK)',
        contactForAdsUrl: 'https://whatsapp.com/channel/0029VbCH7KEGpLHN8giIeL2F',
      },
    };
  }

  private generateSampleChartRows(market: KhabarlineMarket): ChartRecordRow[] {
    const weeks: ChartRecordRow[] = [
      {
        dateRange: '01/09/2026 to 07/09/2026',
        mon: { openPana: '240', jodi: '67', closePana: '340' },
        tue: { openPana: '129', jodi: '25', closePana: '230' },
        wed: { openPana: '456', jodi: '59', closePana: '180' },
        thu: { openPana: '138', jodi: '21', closePana: '678' },
        fri: { openPana: '359', jodi: '70', closePana: '479' },
        sat: { openPana: '680', jodi: '42', closePana: '570' },
        sun: { openPana: '100', jodi: '15', closePana: '230' },
      },
      {
        dateRange: '08/09/2026 to 14/09/2026',
        mon: { openPana: '566', jodi: '74', closePana: '257' },
        tue: { openPana: '360', jodi: '90', closePana: '118' },
        wed: { openPana: '470', jodi: '18', closePana: '369' },
        thu: { openPana: '156', jodi: '27', closePana: '133' },
        fri: { openPana: '190', jodi: '00', closePana: '127' },
        sat: { openPana: '570', jodi: '24', closePana: '158' },
        sun: { openPana: '128', jodi: '14', closePana: '167' },
      },
      {
        dateRange: '15/09/2026 to 21/09/2026',
        mon: { openPana: '468', jodi: '80', closePana: '460' },
        tue: { openPana: '225', jodi: '97', closePana: '269' },
        wed: { openPana: '670', jodi: '33', closePana: '148' },
        thu: { openPana: '357', jodi: '54', closePana: '248' },
        fri: { openPana: '114', jodi: '64', closePana: '455' },
        sat: { openPana: '360', jodi: '92', closePana: '778' },
        sun: { openPana: '450', jodi: '91', closePana: '128' },
      },
      {
        dateRange: '22/09/2026 to 28/09/2026',
        mon: { openPana: '235', jodi: '08', closePana: '369' },
        tue: { openPana: '370', jodi: '04', closePana: '680' },
        wed: { openPana: '249', jodi: '57', closePana: '359' },
        thu: { openPana: '147', jodi: '24', closePana: '446' },
        fri: { openPana: '124', jodi: '75', closePana: '780' },
        sat: market.openPana
          ? {
              openPana: market.openPana,
              jodi: market.jodi || (market.openAnk ? `${market.openAnk}*` : '**'),
              closePana: market.closePana || '***',
            }
          : { openPana: '156', jodi: '27', closePana: '133' },
        sun: { openPana: '***', jodi: '**', closePana: '***' },
      },
    ];
    return weeks;
  }

  public saveState(state?: KhabarlineState): void {
    const s = state || this.state;
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(s, null, 2), 'utf-8');
    } catch (err: any) {
      logger.error({ err: err?.message || err }, 'Failed to persist Khabarline state');
    }
  }

  public getState(): KhabarlineState {
    return this.state;
  }

  public getMarkets(): KhabarlineMarket[] {
    return Object.values(this.state.markets).sort((a, b) => (a.order || 999) - (b.order || 999));
  }

  public getMarket(slugOrName: string): KhabarlineMarket | undefined {
    const direct = this.state.markets[slugOrName.toUpperCase()];
    if (direct) return direct;
    const slug = this.slugify(slugOrName);
    const normQuerySlug = slug.replace(/^pushpa-/, 'puspa-').replace(/^sitara-bazar$/, 'sitara');
    return Object.values(this.state.markets).find((m) => {
      const normMSlug = (m.slug || '').replace(/^pushpa-/, 'puspa-').replace(/^sitara-bazar$/, 'sitara');
      return m.slug === slug || normMSlug === normQuerySlug || m.name.toUpperCase() === slugOrName.toUpperCase();
    });
  }

  public getMarketBySlug(slug: string): KhabarlineMarket | undefined {
    const cleanSlug = this.slugify(slug);
    const normQuerySlug = cleanSlug.replace(/^pushpa-/, 'puspa-').replace(/^sitara-bazar$/, 'sitara');
    return Object.values(this.state.markets).find((m) => {
      const normMSlug = (m.slug || '').replace(/^pushpa-/, 'puspa-').replace(/^sitara-bazar$/, 'sitara');
      return m.slug === cleanSlug || normMSlug === normQuerySlug;
    });
  }

  public getChartRows(slugOrName: string): ChartRecordRow[] {
    const market = this.getMarket(slugOrName);
    const slug = market ? market.slug : this.slugify(slugOrName);
    if (!this.state.charts[slug]) {
      this.state.charts[slug] = market ? this.generateSampleChartRows(market) : [];
      this.saveState();
    }
    return this.state.charts[slug] || [];
  }

  public getChartHistory(slugOrName: string): ChartRecordRow[] {
    return this.getChartRows(slugOrName);
  }

  public syncFromDpboss(items: Array<{ marketName: string; result: string }>): number {
    return this.syncFromDpbossFull(
      items.map((i) => ({ marketName: i.marketName, value: i.result }))
    );
  }

  public syncFromDpbossFull(
    batch:
      | Array<{
          marketName: string;
          value: string;
          openTime?: string;
          closeTime?: string;
          rawText?: string;
        }>
      | {
          markets: Array<{
            marketName: string;
            value: string;
            openTime?: string;
            closeTime?: string;
            rawText?: string;
          }>;
          liveResults?: Array<{ marketName: string; value: string }>;
          finalAnk?: Record<string, string>;
          goldenAnk?: string;
        }
  ): number {
    const items = Array.isArray(batch) ? batch : batch.markets || [];
    const liveResults = !Array.isArray(batch) && batch.liveResults ? batch.liveResults : [];
    const finalAnk = !Array.isArray(batch) && batch.finalAnk ? batch.finalAnk : undefined;
    const goldenAnk = !Array.isArray(batch) && batch.goldenAnk ? batch.goldenAnk : undefined;

    let updatedCount = 0;
    const now = Date.now();
    const currentIstMins = this.getISTMinutes(now);

    if (!this.state.liveMarketTimers) {
      this.state.liveMarketTimers = {};
    }

    if (goldenAnk) {
      this.state.goldenAnk = goldenAnk;
    }
    if (finalAnk && Object.keys(finalAnk).length > 0) {
      this.state.finalAnk = { ...this.state.finalAnk, ...finalAnk };
    }
    const todayIST = this.getTodayIST();

    for (const item of items) {
      if (!item.marketName || !item.value) continue;
      const key = item.marketName.toUpperCase().trim();
      let existing = this.state.markets[key];
      const parts = this.decomposeResult(item.value);
      const isWhitelisted = this.whitelistService?.isMarketEnabled
        ? this.whitelistService.isMarketEnabled(key)
        : Boolean(this.whitelistService?.isWhitelisted?.(key));

      const openMinute = item.openTime ? this.parseTimeToMinute(item.openTime) : undefined;
      const closeMinute = item.closeTime ? this.parseTimeToMinute(item.closeTime) : undefined;

      const isNewRealValue =
        existing &&
        existing.value !== item.value &&
        item.value !== 'Loading...' &&
        item.value !== '***-**-***';

      if (!existing) {
        existing = {
          name: key,
          slug,
          openTime: item.openTime || '11:00 AM',
          closeTime: item.closeTime || '01:00 PM',
          openMinute,
          closeMinute,
          value: item.value,
          ...parts,
          isVerified: false,
          order: Object.keys(this.state.markets).length + 1,
          lastUpdated: new Date().toISOString(),
        };
        this.state.markets[key] = existing;
        updatedCount++;
      } else {
        // ANTI-STALE GUARD 1: If market was already verified TODAY in IST, never let DPBoss batch overwrite with conflict
        const isVerifiedToday = existing.isVerified && existing.verifiedDate === todayIST;
        if (isVerifiedToday) {
          const openMatches =
            !existing.openPana ||
            !parts.openPana ||
            (existing.openPana === parts.openPana && existing.openAnk === parts.openAnk);

          if (!openMatches) {
            logger.debug(
              { market: key, verifiedVal: existing.value, dpbossVal: item.value },
              '🛡️ Ignored stale DPBoss batch update: Market was already verified today with conflicting numbers.'
            );
            if (item.openTime && (!existing.openTime || existing.openTime !== item.openTime)) existing.openTime = item.openTime;
            if (item.closeTime && (!existing.closeTime || existing.closeTime !== item.closeTime)) existing.closeTime = item.closeTime;
            if (openMinute !== undefined) existing.openMinute = openMinute;
            if (closeMinute !== undefined) existing.closeMinute = closeMinute;
            continue;
          }

          // If open matches and DPBoss newly has close:
          if (
            parts.closePana &&
            parts.closePana !== '***' &&
            parts.closeAnk &&
            (!existing.closePana || existing.closePana === '***')
          ) {
            existing.closeAnk = parts.closeAnk;
            existing.closePana = parts.closePana;
            if (existing.openAnk && existing.closeAnk) existing.jodi = `${existing.openAnk}${existing.closeAnk}`;
            if (existing.openPana && existing.openAnk && existing.closeAnk && existing.closePana) {
              existing.value = `${existing.openPana}-${existing.jodi}-${existing.closePana}`;
            }
            existing.lastUpdated = new Date().toISOString();
            updatedCount++;
            continue;
          }

          continue;
        }

        // ANTI-STALE GUARD 2: Detect if DPBoss item is yesterday's stale number
        const normItem = item.value.replace(/[\s\-_=]+/g, '');
        const normYesterday = (existing.yesterdayValue || '').replace(/[\s\-_=]+/g, '');
        const isStaleYesterdayValue = Boolean(normYesterday) && normItem === normYesterday;

        if (isStaleYesterdayValue) {
          // DPBoss still has yesterday's number sitting on its page.
          // If our market was already reset to 'Loading...' or '***-**-***', do NOT overwrite it back to yesterday's number!
          if (existing.value === 'Loading...' || existing.value === '***-**-***') {
            logger.debug(
              { market: key, dpbossVal: item.value },
              '🛡️ Ignored DPBoss batch item: Value matches yesterday result, holding Loading... for today draw.'
            );
            if (item.openTime && (!existing.openTime || existing.openTime !== item.openTime)) existing.openTime = item.openTime;
            if (item.closeTime && (!existing.closeTime || existing.closeTime !== item.closeTime)) existing.closeTime = item.closeTime;
            if (openMinute !== undefined) existing.openMinute = openMinute;
            if (closeMinute !== undefined) existing.closeMinute = closeMinute;
            continue;
          }
          // If existing value is not Loading, ensure it is NOT marked verified today!
          existing.isVerified = false;
          existing.verifiedDate = undefined;
        }

        // ANTI-STALE GUARD 3: Whitelisted markets MUST be verified through Consensus Engine, NEVER from batch scraper
        if (isWhitelisted) {
          // Update timings only; never auto-verify whitelisted markets from DPBoss batch scraping
          if (item.openTime && (!existing.openTime || existing.openTime !== item.openTime)) existing.openTime = item.openTime;
          if (item.closeTime && (!existing.closeTime || existing.closeTime !== item.closeTime)) existing.closeTime = item.closeTime;
          if (openMinute !== undefined) existing.openMinute = openMinute;
          if (closeMinute !== undefined) existing.closeMinute = closeMinute;
          continue;
        }

        // For non-whitelisted markets: Only mark verified if draw time has passed and value is genuinely new
        const marketOpenMin = existing.openMinute ?? openMinute ?? 0;
        const isPastDrawTime = currentIstMins >= marketOpenMin;
        const isRealResult = item.value !== 'Loading...' && item.value !== '***-**-***';

        if (existing.value !== item.value) {
          existing.value = item.value;
          existing.openPana = parts.openPana || existing.openPana;
          existing.openAnk = parts.openAnk || existing.openAnk;
          existing.closeAnk = parts.closeAnk || existing.closeAnk;
          existing.closePana = parts.closePana || existing.closePana;
          existing.jodi = parts.jodi || existing.jodi;
          existing.lastUpdated = new Date().toISOString();

          if (isRealResult && !isStaleYesterdayValue && isPastDrawTime) {
            existing.verifiedDate = todayIST;
            existing.isVerified = true;
            this.appendTodayChartResult(existing);
          } else {
            existing.isVerified = false;
            existing.verifiedDate = undefined;
          }
          updatedCount++;
        }

        if (item.openTime && (!existing.openTime || existing.openTime !== item.openTime)) {
          existing.openTime = item.openTime;
        }
        if (item.closeTime && (!existing.closeTime || existing.closeTime !== item.closeTime)) {
          existing.closeTime = item.closeTime;
        }
        if (openMinute !== undefined) existing.openMinute = openMinute;
        if (closeMinute !== undefined) existing.closeMinute = closeMinute;
      }

      // If a real new result was declared or market is currently in its 5-minute result window
      const isScheduledNow =
        (existing.openMinute !== undefined &&
          currentIstMins >= existing.openMinute &&
          currentIstMins < existing.openMinute + 5) ||
        (existing.closeMinute !== undefined &&
          currentIstMins >= existing.closeMinute &&
          currentIstMins < existing.closeMinute + 5);

      if (isNewRealValue || isScheduledNow) {
        this.state.liveMarketTimers[key] = now + 5 * 60 * 1000;
        if (!this.state.liveResultMarkets.includes(key)) {
          this.state.liveResultMarkets.unshift(key);
        }
      }
    }

    // Process explicit live result cards parsed directly from DPBoss .liv-rslt
    if (liveResults && liveResults.length > 0) {
      this.state.liveResultItems = liveResults;
      for (const liveItem of liveResults) {
        const key = liveItem.marketName.toUpperCase().trim();
        this.state.liveMarketTimers[key] = now + 5 * 60 * 1000;
        if (!this.state.liveResultMarkets.includes(key)) {
          this.state.liveResultMarkets.push(key);
        }
        if (liveItem.value && liveItem.value !== 'Loading...' && this.state.markets[key]) {
          const targetMarket = this.state.markets[key];
          const isVerifiedToday = targetMarket.isVerified && targetMarket.verifiedDate === todayIST;
          if (isVerifiedToday) {
            const liveParts = this.decomposeResult(liveItem.value);
            const liveOpenMatches =
              !targetMarket.openPana ||
              !liveParts.openPana ||
              (targetMarket.openPana === liveParts.openPana && targetMarket.openAnk === liveParts.openAnk);
            if (!liveOpenMatches) {
              continue;
            }
          }
          if (targetMarket.value !== liveItem.value) {
            this.updateMarketResult(key, liveItem.value, true);
          } else {
            targetMarket.isVerified = true;
            targetMarket.verifiedDate = todayIST;
          }
        }
      }
    }

    // Always check live schedule so scheduled markets are never missed during DPBoss syncs!
    this.checkLiveSchedule(now);

    this.saveState();
    this.emit('live_markets_updated', {
      liveMarkets: this.state.liveResultMarkets,
      liveItems: this.state.liveResultItems,
      displayList: this.getLiveDisplayList(),
    });
    this.emit('state_changed', this.state);
    return updatedCount;
  }

  public updateStarlineEntry(typeOrId: string, time: string, value: string): void {
    const isMumbai = typeOrId.toLowerCase().includes('mumbai') || typeOrId.toLowerCase().includes('rajshree');
    const list = isMumbai ? this.state.mumbaiRajshreeStarline : this.state.mainStarline;
    const entry = list.find((s) => s.time.toLowerCase() === time.toLowerCase());
    if (entry) {
      entry.value = value;
    } else {
      list.push({ time, value });
    }
    this.saveState();
    this.emit('state_changed', this.state);
  }

  public getTodayIST(date: Date = new Date()): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }

  public getYesterdayIST(date: Date = new Date()): string {
    const yesterday = new Date(date.getTime() - 24 * 60 * 60 * 1000);
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(yesterday);
  }

  public getISTMinutes(timestamp: number = Date.now()): number {
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(timestamp + istOffsetMs);
    return istDate.getUTCHours() * 60 + istDate.getUTCMinutes();
  }

  public startLiveTicker(): void {
    if (this.liveTickerInterval) return;
    // Check every 10 seconds for scheduled market result windows & 5-minute expirations
    this.liveTickerInterval = setInterval(() => {
      this.checkLiveSchedule();
    }, 10000);
    this.liveTickerInterval.unref();
  }

  public stopLiveTicker(): void {
    if (this.liveTickerInterval) {
      clearInterval(this.liveTickerInterval);
      this.liveTickerInterval = null;
    }
  }

  /**
   * Returns a unified list of live spotlight rows for the top section:
   * Combines explicit DPBoss live items + scheduled/promoted liveResultMarkets (26 special external markets + all standard markets).
   */
  public getLiveDisplayList(): Array<{
    name: string;
    value: string;
    badge?: string;
    note?: string;
    isLoading: boolean;
  }> {
    const list: Array<{
      name: string;
      value: string;
      badge?: string;
      note?: string;
      isLoading: boolean;
    }> = [];
    const seen = new Set<string>();
    const todayIST = this.getTodayIST();
    const currentMins = this.getISTMinutes();

    // 1. Explicit DPBoss items
    for (const item of this.state.liveResultItems || []) {
      const key = item.marketName.toUpperCase().trim();
      seen.add(key);
      const m = this.state.markets[key];
      const val = item.value || (m ? m.value : 'Loading...');
      const isLoading = val === 'Loading...' || val === '***-**-***';
      list.push({
        name: m ? m.name : item.marketName,
        value: val,
        badge: item.badge || (isLoading ? 'खबर लाइन चालू है' : undefined),
        note: item.note,
        isLoading,
      });
    }

    // 2. Scheduled or promoted liveResultMarkets (26 special external markets + all standard markets)
    for (const key of this.state.liveResultMarkets || []) {
      const norm = key.toUpperCase().trim();
      if (seen.has(norm)) continue;
      seen.add(norm);
      const m = this.state.markets[norm];
      if (!m) continue;

      const isAtOpenTime =
        m.openMinute !== undefined &&
        currentMins >= m.openMinute &&
        currentMins < m.openMinute + 5;

      const isAtCloseTime =
        m.closeMinute !== undefined &&
        currentMins >= m.closeMinute &&
        currentMins < m.closeMinute + 5;

      const hasTodayOpen =
        m.isVerified &&
        m.verifiedDate === todayIST &&
        (m.verifiedSession === 'OPEN' || m.verifiedSession === 'ALL' || (m.openPana && m.openPana !== '***'));

      const hasTodayClose =
        m.isVerified &&
        m.verifiedDate === todayIST &&
        (m.verifiedSession === 'CLOSE' || m.verifiedSession === 'ALL' || (m.closePana && m.closePana !== '***'));

      let val = m.value || 'Loading...';
      if (isAtOpenTime && !hasTodayOpen) {
        val = 'Loading...';
      } else if (isAtCloseTime && !hasTodayClose) {
        val = m.openPana && m.openAnk ? `${m.openPana}-${m.openAnk}*-***` : (hasTodayOpen ? m.value : 'Loading...');
      }

      const isLoading = val === 'Loading...' || val === '***-**-***' || val.includes('*-***');
      list.push({
        name: m.name,
        value: val,
        badge: 'खबर लाइन चालू है',
        isLoading,
      });
    }

    return list;
  }

  /**
   * Promotes a market to the top LIVE RESULT section for 5 minutes.
   * After 5 minutes, it is automatically demoted to the lower market cards.
   */
  public promoteToLive(marketName: string, durationMinutes: number = 5): void {
    const key = marketName.toUpperCase().trim();
    if (!this.state.liveMarketTimers) {
      this.state.liveMarketTimers = {};
    }
    const expiry = Date.now() + durationMinutes * 60 * 1000;
    this.state.liveMarketTimers[key] = expiry;

    if (!this.state.liveResultMarkets.includes(key)) {
      this.state.liveResultMarkets.unshift(key);
    }
    this.saveState();
    this.emit('live_markets_updated', {
      liveMarkets: this.state.liveResultMarkets,
      activeMarket: this.state.markets[key],
      displayList: this.getLiveDisplayList(),
    });
    this.emit('state_changed', this.state);
  }

  /**
   * Resets verification statuses at midnight IST so previous day's results
   * are never mistakenly treated as verified for today.
   */
  public performDailyRollover(todayIST: string): void {
    logger.info(
      { previousDate: this.currentDateIST, newDate: todayIST },
      '🌅 Midnight IST Day Rollover: Resetting daily verification states for new day'
    );
    this.currentDateIST = todayIST;
    const currentMins = this.getISTMinutes();
    for (const m of Object.values(this.state.markets || {})) {
      const isOvernight = m.openMinute !== undefined && m.closeMinute !== undefined && m.closeMinute < m.openMinute;
      const isOvernightWaitingForTonight = isOvernight && currentMins < m.openMinute && (m.verifiedSession === 'CLOSE' || m.verifiedSession === 'ALL');
      if (m.verifiedDate !== todayIST || isOvernightWaitingForTonight) {
        if (m.value && m.value !== 'Loading...' && m.value !== '***-**-***') {
          m.yesterdayValue = m.value;
        }
        m.isVerified = false;
        m.verifiedSession = undefined;
        if (isOvernightWaitingForTonight) {
          m.verifiedDate = this.getYesterdayIST();
        }
      }
    }
    this.saveState();
    this.emit('state_changed', this.state);
  }

  /**
   * Checks current IST time against market declaration schedule:
   * 1. If current time is within [openMinute, openMinute + 5] or [closeMinute, closeMinute + 5],
   *    promotes market to the top LIVE RESULT section.
   * 2. Prunes any market whose 5 minutes have elapsed and is no longer at active result time.
   */
  public checkLiveSchedule(now: number = Date.now()): boolean {
    if (!this.state.liveMarketTimers) {
      this.state.liveMarketTimers = {};
    }

    const currentMins = this.getISTMinutes(now);
    const todayIST = this.getTodayIST(new Date(now));

    // Daily rollover check
    if (this.currentDateIST !== todayIST) {
      this.performDailyRollover(todayIST);
    }

    let changed = false;

    // 1. Check all markets for scheduled result window (0 to 5 mins from open/close time)
    for (const market of Object.values(this.state.markets)) {
      const isAtOpenTime =
        market.openMinute !== undefined &&
        currentMins >= market.openMinute &&
        currentMins < market.openMinute + 5;

      const isAtCloseTime =
        market.closeMinute !== undefined &&
        currentMins >= market.closeMinute &&
        currentMins < market.closeMinute + 5;

      if (isAtOpenTime || isAtCloseTime) {
        const key = market.name.toUpperCase().trim();
        // Set expiry for 5 minutes if not already active
        if (!this.state.liveMarketTimers[key]) {
          this.state.liveMarketTimers[key] = now + 5 * 60 * 1000;
        }

        // When open time arrives for a new draw, if today's open result is not yet verified,
        // reset market value to 'Loading...' so both top live spotlight and main board show Loading...
        if (isAtOpenTime) {
          const hasTodayOpen =
            market.isVerified &&
            market.verifiedDate === todayIST &&
            (market.verifiedSession === 'OPEN' || market.verifiedSession === 'ALL' || (market.openPana && market.openPana !== '***'));
          if (!hasTodayOpen && market.value !== 'Loading...' && market.value !== '***-**-***') {
            market.yesterdayValue = market.yesterdayValue || market.value;
            market.value = 'Loading...';
            market.openPana = undefined;
            market.openAnk = undefined;
            market.closeAnk = undefined;
            market.closePana = undefined;
            market.jodi = undefined;
            market.isVerified = false;
            market.verifiedDate = undefined;
            market.verifiedSession = undefined;
            changed = true;
            this.emit('market_updated', market);
          }
        }

        if (!this.state.liveResultMarkets.includes(key)) {
          this.state.liveResultMarkets.unshift(key);
          changed = true;
          logger.info(
            { market: key, currentMins, openMinute: market.openMinute, closeMinute: market.closeMinute },
            '⏰ Market reached scheduled result time: Promoted to top Live Result section for 5 mins'
          );
        }
      }
    }

    // 2. Prune markets whose 5 minutes have elapsed
    const initialCount = this.state.liveResultMarkets.length;
    const remainingMarkets: string[] = [];

    for (const key of this.state.liveResultMarkets) {
      const market = this.state.markets[key];
      const expiry = this.state.liveMarketTimers[key] || 0;

      // Check if market is still within its scheduled 5-minute result window
      const isScheduledActive =
        market &&
        ((market.openMinute !== undefined &&
          currentMins >= market.openMinute &&
          currentMins < market.openMinute + 5) ||
          (market.closeMinute !== undefined &&
            currentMins >= market.closeMinute &&
            currentMins < market.closeMinute + 5));

      if (now < expiry || isScheduledActive) {
        remainingMarkets.push(key);
      } else {
        changed = true;
        delete this.state.liveMarketTimers[key];
        logger.info(
          { market: key },
          '⏱️ 5-minute live window elapsed: Market moved down from top Live Result section to main table'
        );
      }
    }

    if (changed || remainingMarkets.length !== initialCount) {
      this.state.liveResultMarkets = remainingMarkets;
      this.saveState();
      this.emit('live_markets_updated', {
        liveMarkets: this.state.liveResultMarkets,
        displayList: this.getLiveDisplayList(),
      });
      this.emit('state_changed', this.state);
      return true;
    }

    return false;
  }

  public updateMarketResult(
    marketName: string,
    value: string,
    isVerified: boolean = true,
    session?: 'OPEN' | 'CLOSE' | 'ALL'
  ): KhabarlineMarket {
    const key = marketName.toUpperCase().trim();
    let existing = this.state.markets[key];
    const parts = this.decomposeResult(value);
    const slug = this.slugify(key);
    const isRealResult = value && value !== 'Loading...' && value !== '***-**-***';
    const todayIST = this.getTodayIST();

    let detectedSession = session;
    if (!detectedSession) {
      if (parts.openPana && parts.closePana && parts.closePana !== '***') {
        detectedSession = 'ALL';
      } else if (parts.openPana && (!parts.closePana || parts.closePana === '***')) {
        detectedSession = 'OPEN';
      } else if (parts.closePana && (!parts.openPana || parts.openPana === '***')) {
        detectedSession = 'CLOSE';
      } else {
        detectedSession = 'ALL';
      }
    }

    if (!existing) {
      existing = {
        name: key,
        slug,
        openTime: '11:00 AM',
        closeTime: '01:00 PM',
        openMinute: this.parseTimeToMinute('11:00 AM'),
        closeMinute: this.parseTimeToMinute('01:00 PM'),
        value,
        ...parts,
        isVerified,
        verifiedDate: isVerified ? todayIST : undefined,
        verifiedSession: isVerified ? detectedSession : undefined,
        lastUpdated: new Date().toISOString(),
      };
      this.state.markets[key] = existing;
    } else {
      if (detectedSession === 'OPEN') {
        // OPEN declaration: set open parts, and clear previous close/jodi!
        existing.openPana = parts.openPana || existing.openPana;
        existing.openAnk = parts.openAnk || existing.openAnk;
        existing.closeAnk = undefined;
        existing.closePana = parts.closePana || '***';
        existing.jodi = existing.openAnk ? `${existing.openAnk}*` : undefined;
        existing.value = existing.openPana && existing.openAnk ? `${existing.openPana}-${existing.openAnk}` : value;
      } else if (detectedSession === 'CLOSE') {
        // CLOSE declaration:
        existing.closeAnk = parts.closeAnk || existing.closeAnk;
        existing.closePana = parts.closePana || existing.closePana;
        if (existing.openAnk && existing.closeAnk) {
          existing.jodi = `${existing.openAnk}${existing.closeAnk}`;
        }
        if (existing.openPana && existing.openAnk && existing.closeAnk && existing.closePana) {
          existing.value = `${existing.openPana}-${existing.jodi}-${existing.closePana}`;
        } else {
          existing.value = value;
        }
      } else {
        // FULL (ALL) declaration:
        existing.value = value;
        if (parts.openPana && parts.openPana !== '***') existing.openPana = parts.openPana;
        if (parts.openAnk && parts.openAnk !== '*') existing.openAnk = parts.openAnk;
        if (parts.closeAnk && parts.closeAnk !== '*') existing.closeAnk = parts.closeAnk;
        if (parts.closePana && parts.closePana !== '***') existing.closePana = parts.closePana;
        if (parts.jodi && !parts.jodi.includes('*')) existing.jodi = parts.jodi;
      }

      const isOvernight = existing.openMinute !== undefined && existing.closeMinute !== undefined && existing.closeMinute < existing.openMinute;
      const currentMins = this.getISTMinutes();
      const isPastMidnightClose = isOvernight && currentMins < 300 && detectedSession !== 'OPEN';

      if (isPastMidnightClose) {
        // Overnight market close after midnight completes the previous day's game cycle
        existing.yesterdayValue = existing.value;
        existing.verifiedDate = this.getYesterdayIST();
        existing.verifiedSession = detectedSession;
        existing.isVerified = false;
      } else {
        existing.isVerified = isVerified;
        if (isVerified) {
          existing.verifiedDate = todayIST;
          existing.verifiedSession = detectedSession;
        }
      }
      existing.lastUpdated = new Date().toISOString();
    }

    // Promote to top Live Result spotlight section for 5 minutes during draw / declaration window
    if (!this.state.liveMarketTimers) {
      this.state.liveMarketTimers = {};
    }
    this.state.liveMarketTimers[key] = Date.now() + 5 * 60 * 1000;

    if (!this.state.liveResultMarkets.includes(key)) {
      this.state.liveResultMarkets.unshift(key);
    }

    // Update charts archive if this is a real declared result
    if (isRealResult) {
      this.appendTodayChartResult(existing);
    }

    this.saveState();
    this.emit('market_updated', existing);
    this.emit('live_markets_updated', {
      liveMarkets: this.state.liveResultMarkets,
      activeMarket: existing,
      displayList: this.getLiveDisplayList(),
    });
    this.emit('state_changed', this.state);
    return existing;
  }

  private appendTodayChartResult(market: KhabarlineMarket): void {
    if (!this.state.charts[market.slug]) {
      this.state.charts[market.slug] = this.generateSampleChartRows(market);
    }
    const chartRows = this.state.charts[market.slug];
    if (chartRows.length > 0) {
      const lastRow = chartRows[chartRows.length - 1];
      const dayOfWeek = new Date().getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
      const dayMap: Record<number, 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'> = {
        0: 'sun',
        1: 'mon',
        2: 'tue',
        3: 'wed',
        4: 'thu',
        5: 'fri',
        6: 'sat',
      };
      const dayKey = dayMap[dayOfWeek] || 'sat';
      lastRow[dayKey] = {
        openPana: market.openPana || lastRow[dayKey]?.openPana || '***',
        jodi: market.jodi || lastRow[dayKey]?.jodi || (market.openAnk ? `${market.openAnk}*` : '**'),
        closePana: market.closePana || lastRow[dayKey]?.closePana || '***',
      };
    }
  }

  public updateGoldenAnk(val: string): void {
    this.state.goldenAnk = val.trim();
    this.saveState();
    this.emit('state_changed', this.state);
  }

  public updateFinalAnk(marketName: string, ank: string): void {
    this.state.finalAnk[marketName.toUpperCase().trim()] = ank.trim();
    this.saveState();
    this.emit('state_changed', this.state);
  }

  public updateStarline(type: 'main' | 'mumbaiRajshree', entries: StarlineEntry[]): void {
    if (type === 'main') {
      this.state.mainStarline = entries;
    } else {
      this.state.mumbaiRajshreeStarline = entries;
    }
    this.saveState();
    this.emit('state_changed', this.state);
  }

  public updateBombay36(activeValue: string, slots?: Bombay36Slot[]): void {
    this.state.bombay36.activeValue = activeValue;
    if (slots && slots.length > 0) {
      this.state.bombay36.slots = slots;
    }
    this.saveState();
    this.emit('state_changed', this.state);
  }

  public updateAajPassHua(items: Array<{ market: string; text: string }>): void {
    this.state.aajPassHua = items;
    this.saveState();
    this.emit('state_changed', this.state);
  }

  public updateFreeGameZone(items: FreeGuessingItem[]): void {
    this.state.freeGameZone = items;
    this.saveState();
    this.emit('state_changed', this.state);
  }

  public getSponsoredPlayApps(): SponsoredPlayApp[] {
    return this.state.sponsoredPlayApps || [];
  }

  public addSponsoredPlayApp(app: Omit<SponsoredPlayApp, 'id'> & { id?: string }): SponsoredPlayApp {
    if (!this.state.sponsoredPlayApps) {
      this.state.sponsoredPlayApps = [];
    }
    const newApp: SponsoredPlayApp = {
      ...app,
      id: app.id || `app-${Date.now()}`,
      isActive: app.isActive !== false,
    };
    this.state.sponsoredPlayApps.unshift(newApp);
    this.saveState();
    this.emit('state_changed', this.state);
    return newApp;
  }

  public updateSponsoredPlayApp(id: string, updates: Partial<SponsoredPlayApp>): boolean {
    if (!this.state.sponsoredPlayApps) return false;
    const index = this.state.sponsoredPlayApps.findIndex((a) => a.id === id);
    if (index === -1) return false;
    this.state.sponsoredPlayApps[index] = {
      ...this.state.sponsoredPlayApps[index],
      ...updates,
    };
    this.saveState();
    this.emit('state_changed', this.state);
    return true;
  }

  public deleteSponsoredPlayApp(id: string): boolean {
    if (!this.state.sponsoredPlayApps) return false;
    const before = this.state.sponsoredPlayApps.length;
    this.state.sponsoredPlayApps = this.state.sponsoredPlayApps.filter((a) => a.id !== id);
    const changed = this.state.sponsoredPlayApps.length !== before;
    if (changed) {
      this.saveState();
      this.emit('state_changed', this.state);
    }
    return changed;
  }

  public updateMarketDetails(
    marketName: string,
    updates: {
      value?: string;
      openTime?: string;
      closeTime?: string;
      highlight?: boolean;
      isVerified?: boolean;
    }
  ): KhabarlineMarket {
    const key = marketName.toUpperCase().trim();
    let market = this.state.markets[key];
    if (!market) {
      market = this.updateMarketResult(key, updates.value || '***-**-***', updates.isVerified !== false);
    }
    if (updates.openTime) {
      market.openTime = updates.openTime;
      market.openMinute = this.parseTimeToMinute(updates.openTime);
    }
    if (updates.closeTime) {
      market.closeTime = updates.closeTime;
      market.closeMinute = this.parseTimeToMinute(updates.closeTime);
    }
    if (updates.highlight !== undefined) {
      market.highlight = updates.highlight;
    }
    if (updates.value && updates.value !== market.value) {
      this.updateMarketResult(key, updates.value, updates.isVerified !== false);
    } else {
      this.saveState();
      this.emit('market_updated', market);
    }
    return this.state.markets[key] || market;
  }

  public updatePlayAppBanner(banner: Partial<NonNullable<KhabarlineState['playAppBanner']>>): void {
    this.state.playAppBanner = {
      ...(this.state.playAppBanner || {
        enabled: true,
        headline: '🎰 सबसे भरोसेमंद Online Matka Play App 🎰',
        downloadUrl: this.state.apkUrl,
        buttonText: '📲 Download Play App (APK)',
      }),
      ...banner,
    };
    if (banner.enabled !== undefined) {
      this.state.showAppPromotion = Boolean(banner.enabled);
    }
    if (banner.downloadUrl) {
      this.state.apkUrl = banner.downloadUrl;
    }
    this.saveState();
    this.emit('state_changed', this.state);
  }

  public updateSiteSettings(settings: Partial<KhabarlineState>): void {
    if (settings.apkUrl !== undefined) this.state.apkUrl = settings.apkUrl;
    if (settings.whatsappChannelUrl !== undefined) this.state.whatsappChannelUrl = settings.whatsappChannelUrl;
    if (settings.telegramChannelUrl !== undefined) this.state.telegramChannelUrl = settings.telegramChannelUrl;
    if (settings.siteTitle !== undefined) this.state.siteTitle = settings.siteTitle;
    if (settings.domain !== undefined) this.state.domain = settings.domain;
    if (settings.showAppPromotion !== undefined) {
      this.state.showAppPromotion = Boolean(settings.showAppPromotion);
      if (this.state.playAppBanner) {
        this.state.playAppBanner.enabled = Boolean(settings.showAppPromotion);
      }
    }
    if (settings.playAppBanner !== undefined) {
      this.state.playAppBanner = {
        ...(this.state.playAppBanner || {}),
        ...settings.playAppBanner,
      };
      if (settings.playAppBanner.enabled !== undefined) {
        this.state.showAppPromotion = Boolean(settings.playAppBanner.enabled);
      }
      if (settings.playAppBanner.downloadUrl) {
        this.state.apkUrl = settings.playAppBanner.downloadUrl;
      }
    }
    this.saveState();
    this.emit('state_changed', this.state);
  }
}
