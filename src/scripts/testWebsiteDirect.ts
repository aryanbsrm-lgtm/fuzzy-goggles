import http from 'http';
import path from 'path';
import fs from 'fs';
import { KhabarlineStore } from '../khabarline/store.js';
import { KhabarlineServer } from '../khabarline/server.js';
import { ResultApiService } from '../services/resultApiService.js';

process.env.NODE_ENV = 'test';
process.env.TZ = 'Asia/Kolkata';

async function fetchUrl(
  url: string,
  headers: Record<string, string> = {}
): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({ status: res.statusCode || 0, body: data, headers: res.headers });
      });
    });
    req.on('error', reject);
  });
}

async function main() {
  console.log('🚀 Running Direct Khabarline Website & Pages Verification...');

  const testDataPath = path.resolve(process.cwd(), 'data', 'test_website_direct.json');
  if (fs.existsSync(testDataPath)) {
    try { fs.unlinkSync(testDataPath); } catch {}
  }

  const store = new KhabarlineStore(testDataPath);
  const apiService = new ResultApiService(
    {
      enabled: true,
      hashKey: 'secret_test_key_123',
    },
    store
  );

  const testPort = 8097;
  const server = new KhabarlineServer(
    {
      enabled: true,
      port: testPort,
      domain: 'khabarline.site',
    },
    store,
    apiService
  );

  await server.start();
  const baseUrl = `http://127.0.0.1:${testPort}`;

  try {
    // 1. Homepage
    console.log('1. Verifying Homepage (/)');
    const homeRes = await fetchUrl(`${baseUrl}/`);
    console.log(`   Status: ${homeRes.status}, Content-Length: ${homeRes.body.length}`);
    if (homeRes.status !== 200 || !homeRes.body.includes('KHABARLINE.SITE')) {
      throw new Error('Homepage validation failed');
    }
    console.log('   ✅ Homepage OK');

    // 2. API Docs
    console.log('2. Verifying API Documentation (/api-docs)');
    const apiDocsRes = await fetchUrl(`${baseUrl}/api-docs`);
    console.log(`   Status: ${apiDocsRes.status}, Content-Length: ${apiDocsRes.body.length}`);
    if (apiDocsRes.status !== 200 || !apiDocsRes.body.includes('KHABARLINE VERIFIED GAME RESULT API')) {
      throw new Error('API Docs validation failed');
    }
    console.log('   ✅ API Docs OK');

    // 3. Jodi Chart
    console.log('3. Verifying Jodi Chart (/jodi-chart-record/kalyan)');
    const jodiRes = await fetchUrl(`${baseUrl}/jodi-chart-record/kalyan`);
    console.log(`   Status: ${jodiRes.status}, Content-Length: ${jodiRes.body.length}`);
    if (jodiRes.status !== 200 || !jodiRes.body.includes('KALYAN JODI CHART')) {
      throw new Error('Jodi Chart validation failed');
    }
    console.log('   ✅ Jodi Chart OK');

    // 4. Panel Chart
    console.log('4. Verifying Panel Chart (/panel-chart-record/kalyan)');
    const panelRes = await fetchUrl(`${baseUrl}/panel-chart-record/kalyan`);
    console.log(`   Status: ${panelRes.status}, Content-Length: ${panelRes.body.length}`);
    if (panelRes.status !== 200 || !panelRes.body.includes('KALYAN PANEL CHART')) {
      throw new Error('Panel Chart validation failed');
    }
    console.log('   ✅ Panel Chart OK');

    // 5. Legal Pages
    console.log('5. Verifying Legal Pages (About, Contact, Privacy, Terms, Disclaimer)');
    const aboutRes = await fetchUrl(`${baseUrl}/about.php`);
    const contactRes = await fetchUrl(`${baseUrl}/contact.php`);
    const privacyRes = await fetchUrl(`${baseUrl}/privacy.php`);
    const tosRes = await fetchUrl(`${baseUrl}/tos.php`);
    const disRes = await fetchUrl(`${baseUrl}/disclaimer.php`);

    if (
      aboutRes.status !== 200 ||
      contactRes.status !== 200 ||
      privacyRes.status !== 200 ||
      tosRes.status !== 200 ||
      disRes.status !== 200
    ) {
      throw new Error('Legal pages validation failed');
    }
    console.log('   ✅ About, Contact, Privacy, Terms & Disclaimer Pages OK');

    // 6. Robots & Sitemap
    console.log('6. Verifying SEO Feeds (/robots.txt & /sitemap.xml)');
    const robotsRes = await fetchUrl(`${baseUrl}/robots.txt`);
    const sitemapRes = await fetchUrl(`${baseUrl}/sitemap.xml`);
    if (
      robotsRes.status !== 200 ||
      !robotsRes.body.includes('User-agent: *') ||
      sitemapRes.status !== 200 ||
      !sitemapRes.body.includes('<urlset')
    ) {
      throw new Error('SEO feeds validation failed');
    }
    console.log('   ✅ Robots.txt and Sitemap.xml OK');

    // 7. Verified Game Result API
    console.log('7. Verifying Verified Game Result API (/api/v1/gameResult)');
    store.updateMarketResult('KALYAN', '156-27-133', true);
    const apiRes = await fetchUrl(`${baseUrl}/api/v1/gameResult?gameName=KALYAN&session=OPEN&hashKey=secret_test_key_123`);
    const apiJson = JSON.parse(apiRes.body);
    const data = apiJson.data || apiJson;
    if (apiRes.status !== 200 || !apiJson.success || data.openDigit !== '2') {
      throw new Error('Verified Game Result API validation failed: ' + apiRes.body);
    }
    console.log(`   ✅ API Output: ${JSON.stringify(data)}`);

    console.log('\n🌟 ALL 7 WEBSITE COMPONENTS & ENDPOINTS VALIDATED SUCCESSFULLY!');
  } catch (err: any) {
    console.error('❌ Verification failed:', err.message);
    process.exit(1);
  } finally {
    await server.stop();
    store.stopLiveTicker();
    if (fs.existsSync(testDataPath)) {
      try { fs.unlinkSync(testDataPath); } catch {}
    }
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
