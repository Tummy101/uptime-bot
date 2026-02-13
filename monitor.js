require('dotenv').config(); // Load the secrets
const puppeteer = require('puppeteer');
const axios = require('axios');
const fs = require('fs');

// --- CONFIGURATION ---
const SITES_TO_CHECK = [
    'https://sproutgigs.com',
    'https://en.wikipedia.org', // Replaced Google with Wikipedia
    'https://sproutgigs.com/broken-test'
];

const CHECK_INTERVAL = 60000; 

// USE THE SECRETS (No more hardcoded passwords!)
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// ... (The rest of your code stays exactly the same)
// --- 2. LOGGING FUNCTION (The "Historian") ---
function logToHistory(url, status, message) {
    const date = new Date().toLocaleString();
    const logEntry = `${date}, ${url}, ${status}, ${message}\n`;

    // Appends to a file called 'uptime_history.csv'
    fs.appendFile('uptime_history.csv', logEntry, (err) => {
        if (err) console.error("Could not write to file:", err);
    });
}

// --- 3. TELEGRAM FUNCTION ---
async function sendTelegramAlert(message) {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    try {
        await axios.post(url, { chat_id: TELEGRAM_CHAT_ID, text: message });
    } catch (error) {
        console.error(`[Telegram] Failed: ${error.message}`);
    }
}

// --- 4. THE CHECKER ENGINE ---
async function checkAllSites() {
    console.log(`\n[${new Date().toLocaleTimeString()}] 🟡 Starting Batch Check...`);
    
    // Launch ONE browser to check ALL sites (Saves RAM)
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    // Loop through every URL in our list
    for (const url of SITES_TO_CHECK) {
        try {
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            
            // Check the site
            const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
            const title = await page.title();
            const status = response ? response.status() : 0;

            // Error Logic
            const isPageMissing = title.includes("Page Not Found") || title.includes("404");
            const isStatusBad = status >= 400;

            if (isPageMissing || isStatusBad) {
                throw new Error(`Status: ${status} | Title: "${title}"`);
            }

            console.log(`   ✅ UP: ${url}`);
            logToHistory(url, "UP", "OK"); // Save to file
            await page.close(); // Close tab to save memory

        } catch (error) {
            console.error(`   ❌ DOWN: ${url} | ${error.message}`);
            
            // 1. Save to File
            logToHistory(url, "DOWN", error.message);
            
            // 2. Alert Phone
            await sendTelegramAlert(`🚨 ALERT: ${url} is DOWN!\nError: ${error.message}`);
        }
    }

    await browser.close();
    console.log("------------------------------------------------");
}

// --- 5. STARTUP ---
console.log("🤖 Ultimate Monitor Bot Started...");
sendTelegramAlert("🤖 Ultimate Monitor Bot Started. Watching " + SITES_TO_CHECK.length + " sites.");

checkAllSites();
setInterval(checkAllSites, CHECK_INTERVAL);