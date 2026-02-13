require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const axios = require('axios');
const fs = require('fs');

console.log("🚀 LEVEL 2: PERFORMANCE & UPTIME ENGINE INITIATED...");

// --- CONFIGURATION ---
const SITES_TO_CHECK = [
    'https://sproutgigs.com',
    'https://en.wikipedia.org',
    'https://dherhoodsub.ng',
    'https://classyhaven.com.ng' 
];

const CHECK_INTERVAL = 60000; 

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8424829445:AAGkcpHHk9CyRNxDAazmfhXHPby5I7wauSc';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '7262907399';

let siteStates = {}; 
let isFirstRun = true;

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

async function checkAllSites() {
    console.log(`\n[${new Date().toLocaleTimeString()}] ⚡ Running 60s Performance Ping...`);
    
    let browser;
    try {
        const checkPromise = new Promise(async (resolve, reject) => {
            try {
                browser = await puppeteer.launch({
                    headless: "new",
                    args: [
                        '--no-sandbox', 
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--single-process'
                    ]
                });

                let reportLines = [];

                for (const url of SITES_TO_CHECK) {
                    const page = await browser.newPage();
                    
                    try {
                        // --- LEVEL 2: START STOPWATCH ---
                        const startTime = Date.now();
                        
                        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                        
                        // --- LEVEL 2: STOP STOPWATCH ---
                        const loadTimeMs = Date.now() - startTime;

                        const title = await page.title();
                        const status = response ? response.status() : 0;
                        const securityDetails = response ? response.securityDetails() : null;

                        const isCloudflare = status === 403 || title.includes("Just a moment") || title.includes("Cloudflare");
                        const isActuallyDown = status >= 500 || status === 404 || title.includes("Page Not Found");

                        if (isActuallyDown) {
                            throw new Error(`CRITICAL DOWN | Status: ${status}`);
                        }

                        let sslMessage = "";
                        let perfMessage = `⏱️ ${loadTimeMs}ms`;
                        let startupInfo = `(${perfMessage})`; 
                        
                        // --- LEVEL 1+: SSL MONITORING ---
                        if (securityDetails) {
                            const validToMs = securityDetails.validTo() * 1000;
                            const daysRemaining = Math.floor((validToMs - Date.now()) / (1000 * 60 * 60 * 24));
                            
                            startupInfo = `(${perfMessage} | SSL: ${daysRemaining} days)`;

                            if (daysRemaining <= 14) {
                                sslMessage = ` | ⚠️ SSL Expires in ${daysRemaining} days`;
                                if (siteStates[url + "_ssl"] !== "EXPIRING") {
                                    await sendTelegramAlert(`🔐 SSL WARNING: The certificate for ${url} will expire in ${daysRemaining} days!`);
                                    siteStates[url + "_ssl"] = "EXPIRING";
                                }
                            } else {
                                siteStates[url + "_ssl"] = "SECURE";
                            }
                        }

                        // --- LOGGING THE DATA ---
                        if (isCloudflare) {
                            console.log(`   🛡️ UP (Cloudflare): ${url} | ${perfMessage}${sslMessage}`);
                            logToHistory(url, "UP", `Cloudflare 403 | ${loadTimeMs}ms${sslMessage}`);
                        } else {
                            console.log(`   ✅ UP: ${url} | ${perfMessage}${sslMessage}`);
                            logToHistory(url, "UP", `OK 200 | ${loadTimeMs}ms${sslMessage}`);
                        }

                        // --- PERFORMANCE ALERTS (Optional Add-on Later) ---
                        // You could add an alert here if loadTimeMs > 10000 (10 seconds)

                        if (siteStates[url] === "DOWN" && !isFirstRun) {
                            await sendTelegramAlert(`🟢 RECOVERY: ${url} is back online! (Response: ${loadTimeMs}ms)`);
                        }
                        
                        siteStates[url] = "UP";
                        reportLines.push(`✅ UP: ${url} ${startupInfo}`);

                    } catch (error) {
                        console.log(`   ❌ DOWN: ${url} - ${error.message}`);
                        logToHistory(url, "DOWN", error.message);
                        
                        if (siteStates[url] !== "DOWN") {
                            await sendTelegramAlert(`🚨 ALERT: ${url} is DOWN!\nError: ${error.message}`);
                        }
                        
                        siteStates[url] = "DOWN";
                        reportLines.push(`❌ DOWN: ${url}`);
                    } finally {
                        await page.close();
                    }
                }

                if (isFirstRun) {
                    await sendTelegramAlert(`📊 **Level 2 Engine Live:**\n${reportLines.join('\n')}`);
                    isFirstRun = false;
                }
                resolve(); 
            } catch (err) {
                reject(err); 
            }
        });

        await Promise.race([
            checkPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Global Check Timeout (Zombie Killed)')), 120000))
        ]);

    } catch (err) {
        console.error("ENGINE ERROR:", err.message);
    } finally {
        if (browser) {
            await browser.close();
            console.log("🧹 Browser cleaned up.");
        }
    }
}

// --- START ---
checkAllSites();
setInterval(checkAllSites, CHECK_INTERVAL);