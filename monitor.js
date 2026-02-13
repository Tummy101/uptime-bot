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
    console.log(`\n[${new Date().toLocaleTimeString()}] 🟡 Starting Human-Like Check...`);
    
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: "new",
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled',
                '--window-size=1920,1080'
            ]
        });

        let reportLines = [];

        for (const url of SITES_TO_CHECK) {
            const page = await browser.newPage();
            
            // Mask as a real desktop screen
            await page.setViewport({ width: 1920, height: 1080 });

            try {
                // Visit site
                const response = await page.goto(url, { 
                    waitUntil: 'domcontentloaded', 
                    timeout: 60000 
                });

                // --- THE "HUMAN" PAUSE ---
                // Wait 5-8 seconds to let Cloudflare challenges resolve
                const waitTime = Math.floor(Math.random() * 3000) + 5000;
                await new Promise(r => setTimeout(r, waitTime));

                const title = await page.title();
                const status = response ? response.status() : 0;

                // Detect Cloudflare blocks
                const isBlocked = title.includes("Just a moment") || title.includes("Cloudflare") || status === 403;
                const isDown = status >= 400 || title.includes("Page Not Found");

                if (isBlocked) {
                    throw new Error(`Cloudflare Blocked (Status: ${status})`);
                }
                if (isDown) {
                    throw new Error(`Status: ${status} | Title: "${title}"`);
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
                
                // Only alert if state changed or it's the first run
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

    } catch (err) {
        console.error("CRITICAL BROWSER ERROR:", err);
    } finally {
        if (browser) await browser.close();
    }
}

// --- START ---
console.log("🤖 Ultimate Stealth Monitor Started...");
checkAllSites();
setInterval(checkAllSites, CHECK_INTERVAL);