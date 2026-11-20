import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';

export interface ScrapedChartData {
  title: string;
  tableHtml: string;
  fetchedAt: string;
}

export interface ExternalChartConfig {
  name: string;
  domain: string;
  jodiUrl: string;
  panelUrl: string;
}

export const EXTERNAL_CHARTS_REGISTRY: Record<string, ExternalChartConfig> = {
  // Original 6 Sitara / Sitarani Markets (BharatMatka)
  'sitarani-morning': {
    name: 'SITARANI MORNING',
    domain: 'bharatmatka.com',
    jodiUrl: 'https://bharatmatka.com/charts/main/sitarani-morning-jodi-chart/07123733-47af-4f51-9457-7d1d494be109',
    panelUrl: 'https://bharatmatka.com/charts/main/sitarani-morning-panel-chart/07123733-47af-4f51-9457-7d1d494be109',
  },
  'sitara-morning': {
    name: 'SITARA MORNING',
    domain: 'bharatmatka.com',
    jodiUrl: 'https://bharatmatka.com/charts/main/sitara-morning-jodi-chart/352dcc74-c0b4-4c90-b3bc-312494338718',
    panelUrl: 'https://bharatmatka.com/charts/main/sitara-morning-panel-chart/352dcc74-c0b4-4c90-b3bc-312494338718',
  },
  'sitarani-day': {
    name: 'SITARANI DAY',
    domain: 'bharatmatka.com',
    jodiUrl: 'https://bharatmatka.com/charts/main/sitarani-day-jodi-chart/ba07bdd7-2f3c-4a1b-ae74-9a578035facb',
    panelUrl: 'https://bharatmatka.com/charts/main/sitarani-day-panel-chart/ba07bdd7-2f3c-4a1b-ae74-9a578035facb',
  },
  'sitara-day': {
    name: 'SITARA DAY',
    domain: 'bharatmatka.com',
    jodiUrl: 'https://bharatmatka.com/charts/main/sitara-day-jodi-chart/29427d93-d938-44b0-82bb-21ee31f10afa',
    panelUrl: 'https://bharatmatka.com/charts/main/sitara-day-panel-chart/29427d93-d938-44b0-82bb-21ee31f10afa',
  },
  'sitara-night': {
    name: 'SITARA NIGHT',
    domain: 'bharatmatka.com',
    jodiUrl: 'https://bharatmatka.com/charts/main/sitara-night-jodi-chart/3c795aef-dfc1-41e2-8170-6429acf7a094',
    panelUrl: 'https://bharatmatka.com/charts/main/sitara-night-panel-chart/3c795aef-dfc1-41e2-8170-6429acf7a094',
  },
  'sitarani-night': {
    name: 'SITARANI NIGHT',
    domain: 'bharatmatka.com',
    jodiUrl: 'https://bharatmatka.com/charts/main/sitarani-night-jodi-chart/9995a935-f08f-41d3-9f49-fc0c714ee815',
    panelUrl: 'https://bharatmatka.com/charts/main/sitarani-night-panel-chart/9995a935-f08f-41d3-9f49-fc0c714ee815',
  },

  // 20 Added Markets
  'subhodaya': {
    name: 'SUBHODAYA',
    domain: 'mangalgames.com',
    jodiUrl: 'https://mangalgames.com/charts/main/subhodaya-jodi-chart/c478c470-fa34-4f8d-b3df-8e62c7ba4dda',
    panelUrl: 'https://mangalgames.com/charts/main/subhodaya-panel-chart/c478c470-fa34-4f8d-b3df-8e62c7ba4dda',
  },
  'triveni-morning': {
    name: 'TRIVENI MORNING',
    domain: 'mangalgames.com',
    jodiUrl: 'https://mangalgames.com/charts/main/triveni-morning-jodi-chart/ed441d77-ae1c-4f9b-ac71-d460116089fe',
    panelUrl: 'https://mangalgames.com/charts/main/triveni-morning-panel-chart/ed441d77-ae1c-4f9b-ac71-d460116089fe',
  },
  'lotus-morning': {
    name: 'LOTUS MORNING',
    domain: 'shreematka.com',
    jodiUrl: 'https://shreematka.com/charts/main/lotus-morning-jodi-chart/45903dea-2cab-4887-a3e1-9c6c10a7dcb9',
    panelUrl: 'https://shreematka.com/charts/main/lotus-morning-panel-chart/45903dea-2cab-4887-a3e1-9c6c10a7dcb9',
  },
  'bahubali': {
    name: 'BAHUBALI',
    domain: 'mangalgames.com',
    jodiUrl: 'https://mangalgames.com/charts/main/bahubali-jodi-chart/33747674-ba05-4203-8015-a123fb09ff3f',
    panelUrl: 'https://mangalgames.com/charts/main/bahubali-panel-chart/33747674-ba05-4203-8015-a123fb09ff3f',
  },
  'swarn-andhra': {
    name: 'SWARN ANDHRA',
    domain: 'bharatmatka.com',
    jodiUrl: 'https://bharatmatka.com/charts/main/swarn-andhra-jodi-chart/fbf366db-4089-4d51-8539-2a8418caf595',
    panelUrl: 'https://bharatmatka.com/charts/main/swarn-andhra-panel-chart/fbf366db-4089-4d51-8539-2a8418caf595',
  },
  'mahalaxmi': {
    name: 'MAHALAXMI',
    domain: 'mangalgames.com',
    jodiUrl: 'https://mangalgames.com/charts/main/mahalaxmi-jodi-chart/9295dd45-a55d-42e9-be65-10b1cf585ad6',
    panelUrl: 'https://mangalgames.com/charts/main/mahalaxmi-panel-chart/9295dd45-a55d-42e9-be65-10b1cf585ad6',
  },
  'madhyana': {
    name: 'MADHYANA',
    domain: 'mangalgames.com',
    jodiUrl: 'https://mangalgames.com/charts/main/madhyana-jodi-chart/6828517b-9a5e-4b5e-a051-49ffd4ee4827',
    panelUrl: 'https://mangalgames.com/charts/main/madhyana-panel-chart/6828517b-9a5e-4b5e-a051-49ffd4ee4827',
  },
  'lotus-day': {
    name: 'LOTUS DAY',
    domain: 'shreematka.com',
    jodiUrl: 'https://shreematka.com/charts/main/lotus-day-jodi-chart/cd11ec5a-2fc1-4438-93e4-cfd9974dd9fb',
    panelUrl: 'https://shreematka.com/charts/main/lotus-day-panel-chart/cd11ec5a-2fc1-4438-93e4-cfd9974dd9fb',
  },
  'ntr-bazar': {
    name: 'NTR BAZAR',
    domain: 'bharatmatka.com',
    jodiUrl: 'https://bharatmatka.com/charts/main/ntr-bazar-jodi-chart/b7740731-ced7-4102-b45a-e47dcbc3441a',
    panelUrl: 'https://bharatmatka.com/charts/main/ntr-bazar-panel-chart/b7740731-ced7-4102-b45a-e47dcbc3441a',
  },
  'triveni-day': {
    name: 'TRIVENI DAY',
    domain: 'mangalgames.com',
    jodiUrl: 'https://mangalgames.com/charts/main/triveni-day-jodi-chart/7b7c7394-7c1b-4f45-a329-5757cc8d5c50',
    panelUrl: 'https://mangalgames.com/charts/main/triveni-day-panel-chart/7b7c7394-7c1b-4f45-a329-5757cc8d5c50',
  },
  'swarn-andhra-day': {
    name: 'SWARN ANDHRA DAY',
    domain: 'bharatmatka.com',
    jodiUrl: 'https://bharatmatka.com/charts/main/swarn-andhra-day-jodi-chart/cb2b98ed-5cef-4f62-87db-034190788ad1',
    panelUrl: 'https://bharatmatka.com/charts/main/swarn-andhra-day-panel-chart/cb2b98ed-5cef-4f62-87db-034190788ad1',
  },
  'leela-day': {
    name: 'LEELA DAY',
    domain: 'shreematka.com',
    jodiUrl: 'https://shreematka.com/charts/main/leela-day-jodi-chart/ba27b08f-73e8-4c42-b6f2-4e0d295a7e50',
    panelUrl: 'https://shreematka.com/charts/main/leela-day-panel-chart/ba27b08f-73e8-4c42-b6f2-4e0d295a7e50',
  },
  'pushpa-day': {
    name: 'PUSPA DAY',
    domain: 'mangalgames.com',
    jodiUrl: 'https://mangalgames.com/charts/main/pushpa-day-jodi-chart/5481ae19-c77d-4453-b8e4-1025cc103e67',
    panelUrl: 'https://mangalgames.com/charts/main/pushpa-day-panel-chart/5481ae19-c77d-4453-b8e4-1025cc103e67',
  },
  'puspa-day': {
    name: 'PUSPA DAY',
    domain: 'mangalgames.com',
    jodiUrl: 'https://mangalgames.com/charts/main/pushpa-day-jodi-chart/5481ae19-c77d-4453-b8e4-1025cc103e67',
    panelUrl: 'https://mangalgames.com/charts/main/pushpa-day-panel-chart/5481ae19-c77d-4453-b8e4-1025cc103e67',
  },
  'sitara': {
    name: 'SITARA',
    domain: 'shreematka.com',
    jodiUrl: 'https://shreematka.com/charts/main/sitara-bazar-jodi-chart/52eac013-30d7-4758-add4-df2689c046a3',
    panelUrl: 'https://shreematka.com/charts/main/sitara-bazar-panel-chart/52eac013-30d7-4758-add4-df2689c046a3',
  },
  'sitara-bazar': {
    name: 'SITARA',
    domain: 'shreematka.com',
    jodiUrl: 'https://shreematka.com/charts/main/sitara-bazar-jodi-chart/52eac013-30d7-4758-add4-df2689c046a3',
    panelUrl: 'https://shreematka.com/charts/main/sitara-bazar-panel-chart/52eac013-30d7-4758-add4-df2689c046a3',
  },
  'lotus-night': {
    name: 'LOTUS NIGHT',
    domain: 'shreematka.com',
    jodiUrl: 'https://shreematka.com/charts/main/lotus-night-jodi-chart/1d9f66ec-47f9-4941-8013-f7113871a308',
    panelUrl: 'https://shreematka.com/charts/main/lotus-night-panel-chart/1d9f66ec-47f9-4941-8013-f7113871a308',
  },
  'swarn-andhra-night': {
    name: 'SWARN ANDHRA NIGHT',
    domain: 'bharatmatka.com',
    jodiUrl: 'https://bharatmatka.com/charts/main/swarn-andhra-night-jodi-chart/501f7e14-b122-487c-a22b-53390100c586',
    panelUrl: 'https://bharatmatka.com/charts/main/swarn-andhra-night-panel-chart/501f7e14-b122-487c-a22b-53390100c586',
  },
  'pushpa-night': {
    name: 'PUSPA NIGHT',
    domain: 'mangalgames.com',
    jodiUrl: 'https://mangalgames.com/charts/main/pushpa-night-jodi-chart/a2457986-d582-4afc-b563-f04f49ef6010',
    panelUrl: 'https://mangalgames.com/charts/main/pushpa-night-panel-chart/a2457986-d582-4afc-b563-f04f49ef6010',
  },
  'puspa-night': {
    name: 'PUSPA NIGHT',
    domain: 'mangalgames.com',
    jodiUrl: 'https://mangalgames.com/charts/main/pushpa-night-jodi-chart/a2457986-d582-4afc-b563-f04f49ef6010',
    panelUrl: 'https://mangalgames.com/charts/main/pushpa-night-panel-chart/a2457986-d582-4afc-b563-f04f49ef6010',
  },
  'leela-night': {
    name: 'LEELA NIGHT',
    domain: 'shreematka.com',
    jodiUrl: 'https://shreematka.com/charts/main/leela-night-jodi-chart/55c5e898-7397-4c75-b5e5-4bae3381c97b',
    panelUrl: 'https://shreematka.com/charts/main/leela-night-panel-chart/55c5e898-7397-4c75-b5e5-4bae3381c97b',
  },
  'shreevalli-night': {
    name: 'SHREEVALLI NIGHT',
    domain: 'shreematka.com',
    jodiUrl: 'https://shreematka.com/charts/main/shreevalli-night-jodi-chart/b1486812-5b14-44f2-8b1e-a53d57db2a0c',
    panelUrl: 'https://shreematka.com/charts/main/shreevalli-night-panel-chart/b1486812-5b14-44f2-8b1e-a53d57db2a0c',
  },
  'raat-rani': {
    name: 'RAAT RANI',
    domain: 'shreematka.com',
    jodiUrl: 'https://shreematka.com/charts/main/raat-rani-jodi-chart/14ecafa8-2f26-4122-bb8b-0740c8786251',
    panelUrl: 'https://shreematka.com/charts/main/raat-rani-panel-chart/14ecafa8-2f26-4122-bb8b-0740c8786251',
  },
};

export const BHARATMATKA_CHARTS = EXTERNAL_CHARTS_REGISTRY;

export class ChartService {
  private cacheDir: string;
  private memoryCache = new Map<string, ScrapedChartData>();
  private inFlight = new Map<string, Promise<ScrapedChartData | null>>();

  constructor(cacheDir?: string) {
    this.cacheDir = cacheDir || path.resolve(process.cwd(), 'data', 'charts_cache');
    if (!fs.existsSync(this.cacheDir)) {
      try {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      } catch (err) {
        logger.error({ err }, 'Failed to create chart cache directory');
      }
    }
  }

  /**
   * Gets the authentic historical chart table HTML for a given market and type ('jodi' | 'panel').
   * Reads from memory cache -> disk cache -> fetches from bharatmatka.com or dpboss.boston.
   */
  public async getChartData(slug: string, type: 'jodi' | 'panel'): Promise<ScrapedChartData | null> {
    const cleanSlug = slug.toLowerCase().trim().replace(/\.php$/i, '');
    const key = `${type}_${cleanSlug}`;

    // 1. Memory cache
    if (this.memoryCache.has(key)) {
      return this.memoryCache.get(key)!;
    }

    // 2. Disk cache
    const diskPath = path.join(this.cacheDir, `${key}.json`);
    if (fs.existsSync(diskPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(diskPath, 'utf-8')) as ScrapedChartData;
        if (data && data.tableHtml) {
          this.memoryCache.set(key, data);
          return data;
        }
      } catch (e) {}
    }

    // 3. Deduplicate in-flight fetch
    if (this.inFlight.has(key)) {
      return this.inFlight.get(key)!;
    }

    const isBharatmatka = Boolean(BHARATMATKA_CHARTS[cleanSlug]);
    const fetchPromise = (isBharatmatka ? this.fetchFromBharatmatka(cleanSlug, type) : this.fetchFromDpboss(cleanSlug, type))
      .then((data) => {
        if (data) {
          this.memoryCache.set(key, data);
          try {
            fs.writeFileSync(diskPath, JSON.stringify(data), 'utf-8');
          } catch (err) {
            logger.warn({ err }, `Failed to write chart disk cache for ${key}`);
          }
        }
        return data;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, fetchPromise);
    return fetchPromise;
  }

  /**
   * Fetches chart directly from dpboss.boston and extracts the title and table HTML.
   */
  private async fetchFromDpboss(slug: string, type: 'jodi' | 'panel'): Promise<ScrapedChartData | null> {
    const cleanSlug = slug.toLowerCase().trim().replace(/\.php$/i, '');
    const url = `https://dpboss.boston/${type === 'jodi' ? 'jodi-chart-record' : 'panel-chart-record'}/${cleanSlug}.php`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);

      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      clearTimeout(timeout);

      if (!res.ok) {
        logger.debug({ status: res.status, url }, `DPBoss chart fetch returned non-200 for ${slug}`);
        return null;
      }

      const html = await res.text();

      // Extract Title from <h3>
      let title = '';
      const h3Match = html.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
      if (h3Match) {
        title = h3Match[1].replace(/<[^>]+>/g, '').trim();
      } else {
        title = `${cleanSlug.toUpperCase().replace(/-/g, ' ')} MATKA ${type.toUpperCase()} RECORD`;
      }

      // Extract Table (<table ... </table>)
      let tableHtml = '';
      const tableMatch = html.match(/<table[\s\S]*?<\/table>/i);
      if (tableMatch) {
        tableHtml = tableMatch[0];
      }

      if (!tableHtml) {
        logger.debug({ url }, `No table found in DPBoss chart HTML for ${slug}`);
        return null;
      }

      logger.info({ slug, type, title }, '✅ Successfully fetched & cached authentic DPBoss chart');
      return {
        title,
        tableHtml,
        fetchedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      logger.debug({ err: err?.message || err, slug, type }, `DPBoss chart fetch notice for ${slug}`);
      return null;
    }
  }

  /**
   * Fetches chart directly from external site (bharatmatka.com, shreematka.com, mangalgames.com, rama567.net)
   * and extracts the title and table HTML.
   */
  private async fetchFromExternalSite(slug: string, type: 'jodi' | 'panel'): Promise<ScrapedChartData | null> {
    const config = EXTERNAL_CHARTS_REGISTRY[slug];
    if (!config) return null;
    const url = type === 'jodi' ? config.jodiUrl : config.panelUrl;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 14000);

      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      clearTimeout(timeout);

      if (!res.ok) {
        logger.debug({ status: res.status, url }, `External chart fetch returned non-200 for ${slug}`);
        return null;
      }

      const html = await res.text();

      // Extract Title from <h1> or fallback to standard DPBoss format
      let title = '';
      const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
      if (h1Match) {
        const rawName = h1Match[1].replace(/<[^>]+>/g, '').trim();
        title = `${rawName.toUpperCase()} MATKA ${type.toUpperCase()} RECORD`;
      } else {
        title = `${config.name} MATKA ${type.toUpperCase()} RECORD`;
      }

      // Extract Table (<table ... </table>)
      let tableHtml = '';
      const tableMatch = html.match(/<table[\s\S]*?<\/table>/i);
      if (tableMatch) {
        tableHtml = tableMatch[0];
      }

      if (!tableHtml) {
        logger.debug({ url }, `No table found in external chart HTML for ${slug}`);
        return null;
      }

      logger.info({ slug, type, title, domain: config.domain }, '✅ Successfully fetched & cached authentic external chart');
      return {
        title,
        tableHtml,
        fetchedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      logger.debug({ err: err?.message || err, slug, type }, `External chart fetch notice for ${slug}`);
      return null;
    }
  }

  private async fetchFromBharatmatka(slug: string, type: 'jodi' | 'panel'): Promise<ScrapedChartData | null> {
    return this.fetchFromExternalSite(slug, type);
  }

  /**
   * Pre-fetches and syncs all special external charts into cache.
   */
  public async syncAllBharatmatkaCharts(): Promise<{ success: boolean; syncedCount: number; results: Array<{ slug: string; type: string; success: boolean }> }> {
    const results: Array<{ slug: string; type: string; success: boolean }> = [];
    let syncedCount = 0;
    const processedKeys = new Set<string>();

    for (const [slug, config] of Object.entries(EXTERNAL_CHARTS_REGISTRY)) {
      if (processedKeys.has(config.jodiUrl)) continue;
      processedKeys.add(config.jodiUrl);

      for (const type of ['jodi', 'panel'] as const) {
        try {
          const res = await this.getChartData(slug, type);
          const ok = Boolean(res && res.tableHtml);
          if (ok) syncedCount++;
          results.push({ slug, type, success: ok });
        } catch {
          results.push({ slug, type, success: false });
        }
      }
    }
    return { success: syncedCount > 0, syncedCount, results };
  }

  /**
   * Pre-fetches popular markets in the background so they are instantly warm in cache.
   */
  public async prefetchPopular(popularSlugs: string[]): Promise<void> {
    for (const slug of popularSlugs) {
      try {
        await this.getChartData(slug, 'jodi');
        await this.getChartData(slug, 'panel');
      } catch (e) {}
    }
  }
}
