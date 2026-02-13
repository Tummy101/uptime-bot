require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const axios = require('axios');
const fs = require('fs');

console.log("🚀 LEVEL 3: SYNTHETIC ENGINE INITIATED...");

// --- CONFIGURATION ---
const SITES_TO_CHECK = [
    'https://en.wikipedia.org',
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
    console.log(`\n[${new Date().toLocaleTimeString()}] ⚡ Running 60s Performance & Synthetic Ping...`);
    
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
                        const startTime = Date.now();
                        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
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
                        let synthMessage = "";
                        let perfMessage = `⏱️ ${loadTimeMs}ms`;

                        // --- LEVEL 3: SYNTHETIC TRANSACTIONS ---
                        if (isCloudflare) {
                            synthMessage = " | 🤖 Synth: Skipped (Cloudflare Wall)";
                        } else if (url.includes('wikipedia.org')) {
                            // Wikipedia Search Test
                            try {
                                await page.waitForSelector('input[name="search"]', { timeout: 5000 });
                                await page.type('input[name="search"]', 'Node.js');
                                
                                await Promise.all([
                                    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }),
                                    page.keyboard.press('Enter')
                                ]);
                                
                                const newTitle = await page.title();
                                if (!newTitle.includes('Node.js')) {
                                    throw new Error("Search button failed to return correct data.");
                                }
                                synthMessage = " | 🤖 Synth: SEARCH PASSED";
                            } catch (synthErr) {
                                throw new Error(`Synthetic Failure - ${synthErr.message}`);
                            }
                        } else if (url.includes('classyhaven.com.ng')) {
                            // Classy Haven Render Test
                            try {
                                // Count how many clickable links are on the page to ensure it's not a blank white screen
                                const linkCount = await page.evaluate(() => document.querySelectorAll('a').length);
                                
                                if (linkCount < 1) {
                                    throw new Error("Page loaded, but zero links found. Possible blank page or database error.");
                                }
                                synthMessage = ` | 🤖 Synth: RENDER PASSED (${linkCount} links found)`;
                            } catch (synthErr) {
                                throw new Error(`Synthetic Failure - ${synthErr.message}`);
                            }
                        }

                        // --- LEVEL 1+: SSL MONITORING ---
                        if (securityDetails) {
                            const validToMs = securityDetails.validTo() * 1000;
                            const daysRemaining = Math.floor((validToMs - Date.now()) / (1000 * 60 * 60 * 24));
                            
                            if (daysRemaining <= 14) {
                                sslMessage = ` | ⚠️ SSL Expires in ${daysRemaining} days`;
                                if (siteStates[url + "_ssl"] !== "EXPIRING") {
                                    await sendTelegramAlert(`🔐 SSL WARNING: ${url} certificate expires in ${daysRemaining} days!`);
                                    siteStates[url + "_ssl"] = "EXPIRING";
                                }
                            } else {
                                siteStates[url + "_ssl"] = "SECURE";
                                sslMessage = ` | 🔐 SSL: ${daysRemaining}d`;
                            }
                        }

                        let startupInfo = `(${perfMessage}${sslMessage}${synthMessage})`; 

                        // --- LOGGING ---
                        if (isCloudflare) {
                            console.log(`   🛡️ UP (Cloudflare): ${url} | ${perfMessage}${synthMessage}`);
                            logToHistory(url, "UP", `Cloudflare 403 | ${loadTimeMs}ms`);
                        } else {
                            console.log(`   ✅ UP: ${url} | ${perfMessage}${synthMessage}`);
                            logToHistory(url, "UP", `OK 200 | ${loadTimeMs}ms`);
                        }

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
                    await sendTelegramAlert(`📊 **Level 3 Engine Live:**\n${reportLines.join('\n')}`);
                    isFirstRun = false;
                }
                resolve(); 
            } catch (err) {
                reject(err); 
            }
        });

        await Promise.race([
            checkPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Global Check Timeout (Zombie Killed)')), 150000))
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