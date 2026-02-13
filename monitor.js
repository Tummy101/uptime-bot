console.log("🚀 CLOUD BOOT SEQUENCE INITIATED...");
// Replace the old puppeteer require with these
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin()); // Tell puppeteer to use the stealth "mask"

// ... keep your other requires (axios, fs, etc.)

const browser = await puppeteer.launch({
    headless: "new",
    args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled', // Hides "I am a bot" flag
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ]
});
// --- CONFIGURATION ---
const SITES_TO_CHECK = [
    'https://sproutgigs.com',
    'https://en.wikipedia.org', 
    'https://dherhoodsub.ng' // Keep this to test the "DOWN" alert
];

const CHECK_INTERVAL = 60000; // Check every 60 seconds

const TELEGRAM_BOT_TOKEN = '8424829445:AAGkcpHHk9CyRNxDAazmfhXHPby5I7wauSc';
const TELEGRAM_CHAT_ID = '7262907399';

// --- STATE MEMORY ---
// This dictionary remembers the last status of every site
// Example: { "google.com": "UP", "sproutgigs.com": "DOWN" }
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
    
    // Launch browser
    const browser = await puppeteer.launch({
    headless: "new",
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null, // Helps Railway find Chrome
    args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage', // Recommended for low-memory cloud servers
        '--single-process'         // Saves RAM on Railway
    ]
});

    let startupMessage = "📊 **Startup Report:**\n";

    for (const url of SITES_TO_CHECK) {
        try {
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            
            const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
            const title = await page.title();
            const status = response ? response.status() : 0;

            // Define "DOWN" logic
            const isDown = status >= 400 || title.includes("Page Not Found") || title.includes("404");

            if (isDown) {
                throw new Error(`Status: ${status} | Title: "${title}"`);
            }

            // --- SITE IS UP ---
            console.log(`   ✅ UP: ${url}`);
            logToHistory(url, "UP", "OK");

            // LOGIC: If it was DOWN before, send a RECOVERY alert
            if (siteStates[url] === "DOWN" && !isFirstRun) {
                await sendTelegramAlert(`🟢 RECOVERY: ${url} is back online!`);
            }
            
            // Save current state
            siteStates[url] = "UP";
            startupMessage += `✅ UP: ${url}\n`;

            await page.close();

        } catch (error) {
            // --- SITE IS DOWN ---
            console.log(`   ❌ DOWN: ${url}`);
            logToHistory(url, "DOWN", error.message);

            // Send Alert (You said you want these every time)
            await sendTelegramAlert(`🚨 ALERT: ${url} is DOWN!\nError: ${error.message}`);
            
            siteStates[url] = "DOWN";
            startupMessage += `❌ DOWN: ${url}\n`;
        }
    }

    await browser.close();

    // Send the big report ONLY on the first run
    if (isFirstRun) {
        await sendTelegramAlert(startupMessage);
        console.log("📨 Startup Report sent.");
        isFirstRun = false;
    }
}

// --- START ---
console.log("🤖 Monitor Bot Started...");
checkAllSites();
setInterval(checkAllSites, CHECK_INTERVAL);