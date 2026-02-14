require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const axios = require('axios');
const fs = require('fs');

const SITES_TO_CHECK = [
    'https://en.wikipedia.org',
    'https://classyhaven.com.ng' 
];

const CHECK_INTERVAL = 60000; 
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8424829445:AAGkcpHHk9CyRNxDAazmfhXHPby5I7wauSc';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '7262907399';

let siteStates = {}; 
let isFirstRun = true;
let globalBrowser; // Persist the browser to save resources

async function sendTelegramAlert(message) {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    try {
        await axios.post(url, { chat_id: TELEGRAM_CHAT_ID, text: message });
    } catch (error) {
        console.error(`[Telegram] Failed: ${error.message}`);
    }
}

function logToHistory(url, status, message) {
    const date = new Date().toLocaleString();
    fs.appendFile('uptime_history.csv', `${date}, ${url}, ${status}, ${message}\n`, (err) => {
        if (err) console.error("Log Error:", err);
    });
}

async function getBrowser() {
    if (!globalBrowser || !globalBrowser.connected) {
        globalBrowser = await puppeteer.launch({
            headless: "new",
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-zygote', // Saves threads
                '--single-process', // Required for low-resource environments
                '--disable-features=IsolateOrigins,site-per-process'
            ]
        });
    }
    return globalBrowser;
}

async function checkAllSites() {
    console.log(`\n[${new Date().toLocaleTimeString()}] ⚡ Running Stabilized Check...`);
    
    try {
        const browser = await getBrowser();
        let reportLines = [];

        for (const url of SITES_TO_CHECK) {
            const page = await browser.newPage();
            await page.setViewport({ width: 1920, height: 1080 });
            
            let loadTimeMs = 0;
            let perfMessage = "";
            let sslMessage = "";
            let synthMessage = "";

            try {
                const startTime = Date.now();
                const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                loadTimeMs = Date.now() - startTime;
                perfMessage = `⏱️ ${loadTimeMs}ms`;

                const title = await page.title();
                const status = response ? response.status() : 0;
                const securityDetails = response ? response.securityDetails() : null;

                const isCloudflare = status === 403 || title.includes("Just a moment") || title.includes("Cloudflare");
                if (status >= 500 || status === 404) throw new Error(`Status: ${status}`);

                if (securityDetails) {
                    const validToMs = securityDetails.validTo() * 1000;
                    const daysRemaining = Math.floor((validToMs - Date.now()) / (1000 * 60 * 60 * 24));
                    sslMessage = ` | 🔐 SSL: ${daysRemaining}d`;
                    if (daysRemaining <= 14 && siteStates[url + "_ssl"] !== "EXPIRING" && !isFirstRun) {
                        await sendTelegramAlert(`🔐 SSL WARNING: ${url} expires in ${daysRemaining} days!`);
                        siteStates[url + "_ssl"] = "EXPIRING";
                    }
                }

                if (isCloudflare) {
                    synthMessage = " | 🤖 Synth: Skipped (Cloudflare)";
                } else if (url.includes('wikipedia.org')) {
                    await page.waitForSelector('input[name="search"]', { visible: true, timeout: 10000 });
                    await page.type('input[name="search"]', 'Node.js', { delay: 100 }); 
                    await page.keyboard.press('Enter');
                    await page.waitForFunction(() => document.title.includes('Node.js'), { timeout: 15000 });
                    synthMessage = " | 🤖 Synth: PASSED";
                } else if (url.includes('classyhaven.com.ng')) {
                    await page.waitForSelector('body', { timeout: 10000 });
                    const bodyText = await page.evaluate(() => document.body.innerText);
                    if (!bodyText.includes('Classy Haven') && !bodyText.includes('CLOSET')) {
                        throw new Error(`Text missing: "${bodyText.substring(0, 30)}..."`);
                    }
                    synthMessage = ` | 🤖 Synth: TEXT RENDER PASSED`;
                }

                console.log(`   ✅ UP: ${url} | ${perfMessage}${sslMessage}${synthMessage}`);
                logToHistory(url, "UP", `OK 200 | ${loadTimeMs}ms`);
                if (siteStates[url] === "DOWN" && !isFirstRun) await sendTelegramAlert(`🟢 RECOVERY: ${url} online!`);
                siteStates[url] = "UP";
                reportLines.push(`✅ UP: ${url} (${perfMessage}${sslMessage}${synthMessage})`);

            } catch (error) {
                console.log(`   ❌ DOWN: ${url} - ${error.message}`);
                logToHistory(url, "DOWN", error.message);
                if (siteStates[url] !== "DOWN" && !isFirstRun) await sendTelegramAlert(`🚨 ALERT: ${url} DOWN!\nReason: ${error.message}`);
                siteStates[url] = "DOWN";
                reportLines.push(`❌ DOWN: ${url}\n    ↳ ${error.message}`);
            } finally {
                await page.close(); // Crucial: Always close the tab
            }
        }

        if (isFirstRun) {
            await sendTelegramAlert(`📊 **Level 3.6 Engine Live:**\n${reportLines.join('\n')}`);
            isFirstRun = false;
        }
    } catch (err) {
        console.error("CRITICAL ENGINE ERROR:", err.message);
        if (globalBrowser) await globalBrowser.close(); // Reset browser on hard error
    }
}

checkAllSites();
setInterval(checkAllSites, CHECK_INTERVAL);