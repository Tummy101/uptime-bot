require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const axios = require('axios');
const fs = require('fs');

console.log("🚀 CLOUD BOOT SEQUENCE INITIATED...");

// --- CONFIGURATION ---
const SITES_TO_CHECK = [
    'https://sproutgigs.com',
    'https://en.wikipedia.org'
];

// Base interval is 4 minutes (240,000ms), plus a random human delay later
const BASE_INTERVAL = 240000; 

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
    console.log(`\n[${new Date().toLocaleTimeString()}] 🟡 Starting Check...`);
    
    let browser;
    try {
        // --- 1. THE ZOMBIE KILLER TIMER ---
        // If the whole process takes longer than 3 minutes, it kills the attempt
        const checkPromise = new Promise(async (resolve, reject) => {
            try {
                browser = await puppeteer.launch({
                    headless: "new",
                    args: [
                        '--no-sandbox', 
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-blink-features=AutomationControlled',
                        '--single-process', // Crucial for low-RAM cloud servers
                        '--window-size=1920,1080'
                    ]
                });

                let reportLines = [];

                for (const url of SITES_TO_CHECK) {
                    const page = await browser.newPage();
                    await page.setViewport({ width: 1920, height: 1080 });

                    try {
                        const response = await page.goto(url, { 
                            waitUntil: 'domcontentloaded', 
                            timeout: 45000 // Individual page timeout
                        });

                        // Human pause to let Cloudflare calculate
                        const waitTime = Math.floor(Math.random() * 3000) + 5000;
                        await new Promise(r => setTimeout(r, waitTime));

                        const title = await page.title();
                        const status = response ? response.status() : 0;
                        
                        // Extract text from the page body to ensure we aren't just looking at a "Please Wait" screen
                        const bodyText = await page.evaluate(() => document.body.innerText);

                        // --- THE ADVANCED CHECK ---
                        const isBlocked = title.includes("Just a moment") || title.includes("Cloudflare") || status === 403;
                        const isDown = status >= 400 || title.includes("Page Not Found");
                        
                        // Specific check for SproutGigs: If it loads but doesn't have the word "Freelance" or "Jobs", it might be a silent block.
                        const isMissingContent = url.includes("sproutgigs") && !bodyText.toLowerCase().includes("freelance") && !bodyText.toLowerCase().includes("gigs");

                        if (isBlocked) {
                            throw new Error(`Cloudflare Blocked (Status: ${status})`);
                        }
                        if (isDown) {
                            throw new Error(`Status: ${status} | Title: "${title}"`);
                        }
                        if (isMissingContent) {
                            throw new Error("Page loaded, but missing expected SproutGigs content.");
                        }

                        console.log(`   ✅ UP: ${url}`);
                        logToHistory(url, "UP", "OK");

                        if (siteStates[url] === "DOWN" && !isFirstRun) {
                            await sendTelegramAlert(`🟢 RECOVERY: ${url} is back online!`);
                        }
                        
                        siteStates[url] = "UP";
                        reportLines.push(`✅ UP: ${url}`);

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
                    await sendTelegramAlert(`📊 **Initial Cloud Report:**\n${reportLines.join('\n')}`);
                    isFirstRun = false;
                }
                
                resolve(); // Everything finished successfully
            } catch (err) {
                reject(err); // Pass inner errors up
            }
        });

        // Race the actual check against a 3-minute death timer
        await Promise.race([
            checkPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Global Check Timeout (Zombie Killed)')), 180000))
        ]);

    } catch (err) {
        console.error("CRITICAL BROWSER ERROR:", err.message);
    } finally {
        if (browser) {
            await browser.close();
            console.log("🧹 Browser cleaned up for next cycle.");
        }
    }
}

// --- SMART SCHEDULER ---
function scheduleNextCheck() {
    // Add a random delay between 0 and 2 minutes to the base 4 minute interval
    // This means the bot checks every 4 to 6 minutes, never at exactly the same time.
    const randomDelay = Math.floor(Math.random() * 120000); 
    const nextInterval = BASE_INTERVAL + randomDelay;
    
    console.log(`⏱️ Next check scheduled in ${Math.round(nextInterval/1000)} seconds...`);
    setTimeout(() => {
        checkAllSites().then(scheduleNextCheck);
    }, nextInterval);
}

// --- START ---
console.log("🤖 Ultimate Stealth Monitor Started...");
checkAllSites().then(scheduleNextCheck);