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
    'https://en.wikipedia.org', 
    'https://dherhoodsub.ng' 
];

const CHECK_INTERVAL = 60000; 

// Priority: Use Railway Variables. Fallback: Use your manual keys.
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8424829445:AAGkcpHHk9CyRNxDAazmfhXHPby5I7wauSc';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '7262907399';

// --- STATE MEMORY ---
let siteStates = {}; 
let isFirstRun = true;

// --- TELEGRAM FUNCTION ---
async function sendTelegramAlert(message) {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    try {
        await axios.post(url, { chat_id: TELEGRAM_CHAT_ID, text: message });
    } catch (error) {
        console.error(`[Telegram] Failed: ${error.message}`);
    }
}

// --- LOGGING FUNCTION ---
function logToHistory(url, status, message) {
    const date = new Date().toLocaleString();
    fs.appendFile('uptime_history.csv', `${date}, ${url}, ${status}, ${message}\n`, (err) => {
        if (err) console.error("Log Error:", err);
    });
}

// --- MAIN ENGINE ---
async function checkAllSites() {
    console.log(`\n[${new Date().toLocaleTimeString()}] 🟡 Checking sites...`);
    
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: "new",
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--single-process',
                '--disable-blink-features=AutomationControlled'
            ]
        });

        let startupMessage = "📊 **Cloud Monitor Report:**\n";

        for (const url of SITES_TO_CHECK) {
            try {
                const page = await browser.newPage();
                // Set a realistic User Agent to bypass simple bot checks
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
                
                const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
                const title = await page.title();
                const status = response ? response.status() : 0;

                // Define "DOWN" logic (Cloudflare 403s are treated as alerts here)
                const isDown = status >= 400 || title.includes("Page Not Found") || title.includes("Just a moment");

                if (isDown) {
                    throw new Error(`Status: ${status} | Title: "${title}"`);
                }

                console.log(`   ✅ UP: ${url}`);
                logToHistory(url, "UP", "OK");

                if (siteStates[url] === "DOWN" && !isFirstRun) {
                    await sendTelegramAlert(`🟢 RECOVERY: ${url} is back online!`);
                }
                
                siteStates[url] = "UP";
                startupMessage += `✅ UP: ${url}\n`;
                await page.close();

            } catch (error) {
                console.log(`   ❌ DOWN: ${url}`);
                logToHistory(url, "DOWN", error.message);
                await sendTelegramAlert(`🚨 ALERT: ${url} is DOWN!\nError: ${error.message}`);
                
                siteStates[url] = "DOWN";
                startupMessage += `❌ DOWN: ${url}\n`;
            }
        }

        if (isFirstRun) {
            await sendTelegramAlert(startupMessage);
            isFirstRun = false;
        }

    } catch (err) {
        console.error("BROWSER CRASH:", err);
    } finally {
        if (browser) await browser.close();
    }
}

// --- START ---
console.log("🤖 Monitor Bot Started...");
// Run once immediately, then every interval
checkAllSites();
setInterval(checkAllSites, CHECK_INTERVAL);