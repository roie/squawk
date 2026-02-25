// Squawk - Airline Ops Message Translator
// Hybrid Smart Architecture (Sanitizer + Fuzzy Label Fixer + Robust Regex)

// ============================================================================ 
// DOM ELEMENTS
// ============================================================================ 

const inputText = document.getElementById('input-text');
const translateBtn = document.getElementById('translate-btn');
const copyBtn = document.getElementById('copy-btn');
const copyImageBtn = document.getElementById('copy-image-btn');
const saveBtn = document.getElementById('save-btn');
const outputSection = document.getElementById('output-section');
const cardBody = document.getElementById('card-body');
const outputCard = document.getElementById('output-card');

// State
let lastParsedFlights = [];

// ============================================================================
// FUZZY SEARCH SETUP
// ============================================================================ 

const fuseOptions = {
    includeScore: true,
    threshold: 0.2, // Very strict to avoid false positives
    keys: ['matches']
};
const labelSearch = new Fuse(opsLabels, fuseOptions);

// ============================================================================ 
// EVENT LISTENERS
// ============================================================================ 

translateBtn.addEventListener('click', translate);
copyBtn.addEventListener('click', copyToClipboard);
copyImageBtn.addEventListener('click', copyImageToClipboard);
saveBtn.addEventListener('click', saveAsPNG);

// ============================================================================ 
// PARSING HELPERS (Hoisted)
// ============================================================================ 

/**
 * Detect flight type based on keywords
 */
function detectFlightType(block) {
    // PRIMARY: Time-based keywords - most reliable indicators
    if (/\bETA[:\s]/i.test(block)) return 'arrival';
    if (/\bSTA[:\s]/i.test(block)) return 'arrival';
    if (/\bSTD[:\s]/i.test(block)) return 'departure';
    if (/\bETD[:\s]/i.test(block)) return 'departure';

    // SECONDARY: Operational keywords
    if (/Carousel[:\s]/i.test(block)) return 'arrival';
    if (/Arr\s*Gate/i.test(block)) return 'arrival';
    if (/Tow\s*(Gate|IFC)/i.test(block)) return 'arrival';
    if (/Counters?[:\s]/i.test(block)) return 'departure';
    if (/Lateral[:\s]/i.test(block)) return 'departure';
    if (/[A-Z]{3}\s*[-–—→]\s*[A-Z]{3}/.test(block)) return 'departure';

    // FALLBACK: Emoji (lowest priority)
    if (block.includes('🛬')) return 'arrival';
    if (block.includes('🛫')) return 'departure';

    return 'unknown';
}

/*
    const arrivalPatterns = [/ETA[:\s]/, /STA[:\s]/, /ARRIVING/, /ARR:/, /Arr\s*Gate/];
    for (const pattern of arrivalPatterns) { if (pattern.test(upper)) return 'arrival'; }

    const departurePatterns = [/STD[:\s]/, /ETD[:\s]/, /DEPARTING/, /DEP:/, /Counters?[:\s]/];
    for (const pattern of departurePatterns) { if (pattern.test(upper)) return 'departure'; }

    if (/Arr\s*Gate|Tow\s*IFC/i.test(block)) return 'arrival';
*/

/**
 * Parse passenger counts
 */
function parsePassengers(block, flight) {
    const paxOBMatch = block.match(/Pax\s*OB[:\s]*(\d+)\s*\+\s*\*?(\d+)\*?\s*INF/i);
    if (paxOBMatch) {
        flight.total = parseInt(paxOBMatch[1]) + parseInt(paxOBMatch[2]);
        flight.infants = parseInt(paxOBMatch[2]);
        flight.paxMain = parseInt(paxOBMatch[1]); 
    }

    const paxLineMatch = block.match(/Pax(?:\s+count)?[ :\s]*([^\n]+)/i);
    if (paxLineMatch) {
        const line = paxLineMatch[1].trim();
        const biz = line.match(/\b[CJF](\d+)\b/); if (biz) flight.paxBusiness = parseInt(biz[1]);
        const eco = line.match(/\b[MY](\d+)\b/); if (eco) flight.paxEconomy = parseInt(eco[1]);
        const inf = line.match(/(?:INF|INFT)\s*(\d+)|\b(\d+)\s*(?:INF|INFT)/i); if (inf) flight.infants = parseInt(inf[1] || inf[2]);
        const staff = line.match(/(\d+)\s*ID|ID\s*(\d+)/i); if (staff) flight.staff = parseInt(staff[1] || staff[2]);
        const chd = line.match(/(\d+)\s*CHD|CHD\s*(\d+)/i); if (chd) flight.children = parseInt(chd[1] || chd[2]);

        // If it's a plain number like "Pax: 150"
        const simpleCount = line.match(/^\s*(\d+)\s*$/);
        if (simpleCount && !flight.paxBusiness && !flight.paxEconomy && !flight.paxMain) {
            flight.paxMain = parseInt(simpleCount[1]);
            flight.total = flight.paxMain + (flight.infants || 0);
        }
    }

    // STRICT: Exclude cargo totals (pcs/kg) from passenger counts
    const ttlMatch = block.match(/\b(?:TTL|TOTAL)\s*[=:]\s*(\d+)\b(?!\s*(?:pcs|pzs|pieces?|kg|kgs|kilos|lbs))/i);
    if (ttlMatch) flight.total = parseInt(ttlMatch[1]);

    if (!flight.total && (flight.paxBusiness || flight.paxEconomy)) {
        flight.total = (flight.paxBusiness || 0) + (flight.paxEconomy || 0) + (flight.infants || 0);
    }
}

/**
 * Parse wheelchairs
 */
function parseWheelchairs(block, flight) {
    const wheelchairs = [];
    const foundTypes = new Set();

    // Shorthand format: "9R" or "9R+2C" where R=Ramp, C=Cabin, S=Steps
    // Can appear after any wheelchair code like "WCHC: 9R" or standalone
    const shorthandMatch = block.match(/(?:WCHC|WCHR|WCHS|WCH)[:\s]*(\d+)\s*([RCS])(?:\s*[\+&]\s*(\d+)\s*([RCS]))?/i);
    if (shorthandMatch) {
        const typeMap = { 'R': 'WCHR', 'C': 'WCHC', 'S': 'WCHS' };
        const count1 = parseInt(shorthandMatch[1]) || 0;
        const type1 = typeMap[shorthandMatch[2].toUpperCase()];
        if (count1 > 0 && type1 && wheelchairTypes[type1]) {
            wheelchairs.push({ count: count1, type: type1, ...wheelchairTypes[type1] });
            foundTypes.add(type1);
        }
        if (shorthandMatch[3] && shorthandMatch[4]) {
            const count2 = parseInt(shorthandMatch[3]) || 0;
            const type2 = typeMap[shorthandMatch[4].toUpperCase()];
            if (count2 > 0 && type2 && wheelchairTypes[type2]) {
                wheelchairs.push({ count: count2, type: type2, ...wheelchairTypes[type2] });
                foundTypes.add(type2);
            }
        }
        // Prevent duplicate matching of WCH codes
        foundTypes.add('WCHR'); foundTypes.add('WCHC'); foundTypes.add('WCHS');
    }

    // Standard formats: "1WCHR", "WCHR: 1", "WCHR 1", "1 WCHR"
    const standardPattern = /(\d+)\s*(WCHR|WCHS|WCHC|WCHP|BLND|DEAF|DPNA|MAAS)\b|\b(WCHR|WCHS|WCHC|WCHP|BLND|DEAF|DPNA|MAAS)[:\s]+(\d+)/gi;
    let match;
    while ((match = standardPattern.exec(block)) !== null) {
        const type = (match[2] || match[3]).toUpperCase();
        if (foundTypes.has(type)) continue;
        foundTypes.add(type);
        const count = parseInt(match[1] || match[4]) || 1;
        if (wheelchairTypes[type]) wheelchairs.push({ count, type, ...wheelchairTypes[type] });
    }

    if (wheelchairs.length > 0) flight.wheelchairs = wheelchairs;
}

/**
 * Parse special services
 */
function parseSpecialServices(block, flight) {
    const services = [];
    for (const [code, info] of Object.entries(specialServices)) {
        if (code === 'INF' || code === 'INFT') continue;
        const pattern = new RegExp(`(\d+)\s*${code}|${code}\s*[x×]?\s*(\d+)`, 'gi');
        const match = block.match(pattern);
        if (match) {
            const countMatch = match[0].match(/\d+/);
            services.push({ code, count: countMatch ? parseInt(countMatch[0]) : 1, ...info });
        }
    }
    if (services.length > 0) flight.specialServices = services;
}

/**
 * Parse connections
 */
function parseConnections(block, flight) {
    const conxPatterns = [
        /Conx\s+Pax\s*(\d+)\s*[:\s]*.+?(\d{1,2}:\d{2})\s*([A-Z]{2}\d{1,4})\s*([A-Z]{2,3})/i,
        /(?:Conx|CNX|Connecting)[:\s]*(\d+)\s*(?:pax\s*)?(?:to\s+)?([A-Z]{2}\d{1,4})\s*(?:@\s*)?(\d{1,2}:\d{2})\s*([A-Z]{2,3})?/i,
        /Conx\s*Pax[:\s]*(\d+)/i
    ];
    for (const pattern of conxPatterns) {
        const match = block.match(pattern);
        if (match) {
            if (pattern === conxPatterns[2]) { flight.connecting = { count: parseInt(match[1]) }; } 
            else {
                const destCode = (match[4] || '').toUpperCase();
                flight.connecting = {
                    count: parseInt(match[1]),
                    flight: match[pattern === conxPatterns[0] ? 3 : 2].toUpperCase(),
                    time: match[pattern === conxPatterns[0] ? 2 : 3],
                    destination: destCode,
                    destinationName: airports[destCode] || destCode
                };
            }
            break;
        }
    }
    if (flight.connecting) {
        const breakdownMatch = block.match(/Conx\s*Pax[:\s]*\d+[^\n]*\n\s*((?:\d+[A-Z]{2}\s*)+)/i);
        if (breakdownMatch) {
            const breakdown = [];
            const airlinePattern = /(\d+)([A-Z]{2})/g;
            let airlineMatch;
            while ((airlineMatch = airlinePattern.exec(breakdownMatch[1])) !== null) {
                const code = airlineMatch[2];
                breakdown.push({ count: parseInt(airlineMatch[1]), code, airlineName: airlines[code] || code });
            }
            if (breakdown.length > 0) flight.connecting.breakdown = breakdown;
        }
    }
}

/**
 * Parse incoming transfers
 */
function parseIncomingTransfers(block, flight) {
    const inCarrMatch = block.match(/(?:IN\s*CARR(?:\s*PAX)?|Transfers?)[:\s]*(.+?)(?:\n|$)/i);
    if (inCarrMatch) {
        const transfers = [];
        const transferPattern = /(\d+)\s*([A-Z]{2})|([A-Z]{2})\s*(\d+)/g;
        let match;
        while ((match = transferPattern.exec(inCarrMatch[1])) !== null) {
            const count = parseInt(match[1] || match[4]);
            const code = (match[2] || match[3]).toUpperCase();
            transfers.push({ count, airline: code, airlineName: airlines[code] || code });
        }
        if (transfers.length > 0) flight.incomingTransfers = transfers;
    }
}

/**
 * Parse baggage and cargo
 */
function parseBaggageAndCargo(block, flight) {
    // XQS format first (more specific): "XQS: 148 BIN 1,2 & 3"
    const xqsMatch = block.match(/XQS[:\s]*(\d+)(?:\s+BIN\s*([^\n]+))?/i);
    if (xqsMatch) {
        flight.bags = parseInt(xqsMatch[1]);
        if (xqsMatch[2]) flight.bagsBin = xqsMatch[2].trim();
    }
    // General bags format: "Bags: 107" (require colon, avoid "Priority Bags")
    if (!flight.bags) {
        const bagsMatch = block.match(/(?<!Priority\s)Bags?[:\s]*(\d+)/i);
        if (bagsMatch) flight.bags = parseInt(bagsMatch[1]);
    }
    // Carousel - handle "Carousel: 9might change" or "Carousel: 9 might change"
    const carouselMatch = block.match(/Carousel[:\s]*(\d{1,2})\s*([a-z].*)?/i);
    if (carouselMatch) {
        flight.carousel = carouselMatch[1];
        if (carouselMatch[2] && !/OVZ/i.test(carouselMatch[2])) {
            flight.carouselNote = carouselMatch[2].trim();
        }
    }
    const ovzMatch = block.match(/OVZ[:\s]*([A-Z])/i);
    if (ovzMatch) flight.oversizeBelt = ovzMatch[1];
    // Cargo block - after markdown removal, format is "CARGO :"
    // Capture until next section (STD, Pax, Special, IN CARR, Counters, Lateral)
    const cargoBlockMatch = block.match(/CARGO\s*:([\s\S]*?)(?=(?:STD|ETD|Pax[:\s]|Special[:\s]|IN\s*CARR|Counters|Lateral|$))/i);
    let specialItems = [];
    if (cargoBlockMatch) {
        const cargoText = cargoBlockMatch[1];
        // Parse TOTAL pieces - must be followed by pcs/pzs (not pax)
        const totalPcsMatch = cargoText.match(/TOTAL\s*[=:]\s*(\d+)\s*(?:pcs|pzs|pieces?)/i);
        if (totalPcsMatch) flight.cargoPieces = parseInt(totalPcsMatch[1]);
        // Parse total kg - look for standalone kg value (handles both kg and kgs)
        const totalKgMatch = cargoText.match(/(\d+(?:[.,]\d+)?)\s*kgs?/i);
        if (totalKgMatch) flight.cargo = parseFloat(totalKgMatch[1].replace(/,/g, ''));
        const lines = cargoText.split('\n').map(l => l.trim()).filter(l => l);
        for (const line of lines) {
            // Handle LIVELOBSTERS as one word or LIVE LOBSTERS with space
            const lobsters = line.match(/(\d+)\s*(?:pcs|pzs)?\s*(?:LIVE\s*)?LOBSTERS/i);
            if (lobsters) specialItems.push(`🦞 ${lobsters[1]} Live Lobsters`);
            const consol = line.match(/(\d+)\s*(?:pcs|pc|pzs)?\s*CONSOLIDATION/i);
            if (consol) specialItems.push(`📦 ${consol[1]} Consolidation`);
            const animals = line.match(/(\d+)\s*(?:pcs|pzs)?\s*(?:LIVE\s*ANIMALS|AVI)/i);
            if (animals) specialItems.push(`🐾 ${animals[1]} Live Animals`);
            const dgr = line.match(/(\d+)\s*(?:pcs|pzs)?\s*(?:DGR|DANGEROUS\s*GOODS)/i);
            if (dgr) specialItems.push(`⚠️ ${dgr[1]} Dangerous Goods`);
        }
    }
    // Combined pcs/kg format: "30pcs/563kg", "30 pcs / 563 kgs", "30 pieces/563 kg"
    const pcsKg = block.match(/(\d+)\s*(?:pcs|pzs|pc|pieces?)\s*[\/\s]+\s*([0-9,.]+)\s*kgs?/i);
    if (pcsKg) {
        if (!flight.cargoPieces) flight.cargoPieces = parseInt(pcsKg[1]);
        if (!flight.cargo) flight.cargo = parseFloat(pcsKg[2].replace(/,/g, ''));
    }
    // Simple kg format: "Cargo: 563kg"
    if (!flight.cargo) {
        const simpleKg = block.match(/Cargo[:\s]*([0-9,.]+)\s*kgs?/i);
        if (simpleKg) flight.cargo = parseFloat(simpleKg[1].replace(/,/g, ''));
    }
    if (specialItems.length === 0) {
        // Fallback for LIVELOBSTERS or LIVE LOBSTERS
        const lobsters = block.match(/(\d+)\s*(?:pcs|pzs)?\s*(?:LIVE\s*)?LOBSTERS/i);
        if (lobsters) specialItems.push(`🦞 ${lobsters[1]} Live Lobsters`);
        const consol = block.match(/(\d+)\s*(?:pcs|pc|pzs)?\s*CONSOLIDATION/i);
        if (consol) specialItems.push(`📦 ${consol[1]} Consolidation`);
    }
    if (specialItems.length > 0) flight.specialCargo = specialItems;
    if (/Cargo[:\s]*NIL/i.test(block)) flight.cargoNil = true;
    if (/Cargo[:\s]*TBD/i.test(block)) flight.cargoTBD = true;
}

// ============================================================================ 
// THE SMART ARCHITECTURE PIPELINE
// ============================================================================ 

/**
 * 1. SANITIZER: Clean invisible junk, markdown formatting, and normalize text
 */
function sanitizeInput(text) {
    return text
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remove zero-width spaces
        .replace(/\*\*([^*]+)\*\*/g, '$1')     // Remove **bold** markdown
        .replace(/\*([^*]+)\*/g, '$1')         // Remove *italic* markdown
        .replace(/\*+/g, '')                    // Remove any remaining stray asterisks
        .replace(/__([^_]+)__/g, '$1')         // Remove __bold__ markdown
        .replace(/_([^_]+)_/g, '$1')           // Remove _italic_ markdown
        .split('\n')
        .map(line => line.trim())
        .join('\n');
}

/**
 * 2. FUZZY LABEL FIXER: Fix typos in labels before regex runs
 * Only corrects actual typos - doesn't change already-valid labels like ETA, STD, REG
 */
function fuzzyCorrectLabels(block) {
    // Common valid labels that shouldn't be changed (regex already handles these)
    const validLabels = new Set([
        'ETA', 'ETD', 'STA', 'STD', 'REG', 'AC REG',
        'Gate', 'Arr Gate', 'Tow Gate',
        'Pax', 'Pax count', 'Pax OB', 'TTL', 'Total',
        'Cargo', 'Bags', 'Baggage', 'Carousel', 'XQS',
        'Special', 'Counters', 'Lateral', 'Belt',
        'Conx Pax', 'IN CARR PAX', 'Remarks', 'Notes',
        'WCHR', 'WCHS', 'WCHC', 'WCHP', 'BLND', 'DEAF', 'DPNA', 'MAAS',
        'Flight', 'FLT', 'Date', 'OVZ'
    ]);

    const lines = block.split('\n');
    const correctedLines = lines.map(line => {
        // Only split on FIRST colon to preserve time values like 17:41
        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) return line;

        const labelPart = line.substring(0, colonIndex).trim();
        const valuePart = line.substring(colonIndex + 1);

        // Don't correct things that look like data or are too long/short
        if (labelPart.length > 25 || labelPart.length < 2 || /^\d+$/.test(labelPart)) return line;

        // Don't change already-valid labels (case-insensitive check)
        const labelUpper = labelPart.toUpperCase();
        for (const valid of validLabels) {
            if (labelUpper === valid.toUpperCase()) return line;
        }

        const results = labelSearch.search(labelPart);
        if (results.length > 0 && results[0].score < 0.15 && results[0].score > 0) {
            // Only replace if it's a close match but NOT exact (typo correction)
            const canonicalLabel = results[0].item.matches[0];
            return canonicalLabel + ':' + valuePart;
        }
        return line;
    });
    return correctedLines.join('\n');
}

/**
 * 3. MATCHER (Robust Monolithic Regex)
 */
function parseSingleFlight(block) {
    const sanitized = sanitizeInput(block);
    const corrected = fuzzyCorrectLabels(sanitized);

    const flight = {
        type: detectFlightType(corrected),
        raw: block
    };

    // Flight number - after markdown removal, patterns are cleaner
    const flightNumPatterns = [
        /🛫\s*([A-Z]{2}\d{1,4})/,                    // 🛫FI602
        /🛬\s*([A-Z]{2}\d{1,4})/,                    // 🛬FI602
        /(?:Flight|FLT)[:\s]*([A-Z]{2}\d{1,4})/i,   // Flight: FI602
        /^([A-Z]{2}\d{1,4})\s+[\u{1F1E6}-\u{1F1FF}]/mu, // FI603 🇮🇸 (flight number followed by flag)
        /(?:^|\n)\s*([A-Z]{2}\d{1,4})\s+[A-Z]{3}-[A-Z]{3}/m, // FI602 YYZ-KEF
        /(?:^|\n)\s*([A-Z]{2}\d{1,4})\b/            // Plain flight number at start
    ];
    for (const pattern of flightNumPatterns) {
        const match = corrected.match(pattern);
        if (match) {
            flight.number = match[1].toUpperCase();
            const code = flight.number.substring(0, 2);
            flight.airlineCode = code;
            flight.airlineName = airlines[code] || null;
            break;
        }
    }

    // Date - fixed regex escaping for template literals
    const months = "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec";
    const datePatterns = [
        new RegExp(`Date[:\\s]+(\\d{1,2})(${months})(\\d{2,4})?`, 'i'),
        new RegExp(`(\\d{1,2})\\s*(${months})\\s*(\\d{2,4})?`, 'i'),
        new RegExp(`(${months})\\s*(\\d{1,2})(?:\\s*,?\\s*(\\d{2,4}))?`, 'i')
    ];
    for (const pattern of datePatterns) {
        const match = corrected.match(pattern);
        if (match) {
            let d, m, y;
            if (isNaN(parseInt(match[1]))) { m = match[1]; d = match[2]; y = match[3]; }
            else { d = match[1]; m = match[2]; y = match[3]; }
            if (!y) y = new Date().getFullYear(); else if (String(y).length === 2) y = '20' + y;
            flight.date = `${m} ${d}, ${y}`;
            break;
        }
    }

    // Aircraft
    const regMatch = corrected.match(/(?:AC\s*)?REG[:\s]*([A-Z]{1,2}-?[A-Z0-9]{2,5})/i) || corrected.match(/Registration[:\s]*([A-Z]{1,2}-?[A-Z0-9]{2,5})/i);
    if (regMatch) flight.registration = regMatch[1].toUpperCase();
    const acMatch = corrected.match(/\((\d{2,3}[A-Z]?|[A-Z]\d{2}|7M[89]|E\d{2}|CR[9J]|DH4|AT7)\)/i) || corrected.match(/(?:A\/C|Aircraft|Type)[:\s]*(\d{2,3}[A-Z]?|[A-Z]\d{2}|7M[89])/i);
    if (acMatch) { flight.aircraftCode = acMatch[1].toUpperCase(); flight.aircraft = aircraftTypes[flight.aircraftCode] || flight.aircraftCode; }

    // Times
    const extractTime = (regex) => {
        const m = corrected.match(regex);
        return m ? { time: m[1], local: m[0].toLowerCase().includes('lt') } : null;
    };
    const eta = extractTime(/ETA[:\s]*(\d{1,2}:\d{2})(?:lt)?/i); if (eta) { flight.eta = eta.time; flight.etaLocal = eta.local; }
    const sta = extractTime(/STA[:\s]*(\d{1,2}:\d{2})(?:lt)?/i); if (sta) { flight.sta = sta.time; flight.staLocal = sta.local; }
    const std = extractTime(/STD[:\s]*(\d{1,2}:\d{2})(?:lt)?/i); if (std) { flight.std = std.time; flight.stdLocal = std.local; }
    const etd = extractTime(/ETD[:\s]*(\d{1,2}:\d{2})(?:lt)?/i); if (etd) { flight.etd = etd.time; flight.etdLocal = etd.local; }

    // Gate - after markdown removal, format is clean like "Gate: C40/B40"
    const gateMatch = corrected.match(/Arr\s*Gate[:\s]*([A-Z0-9]+(?:\s*\/\s*[A-Z0-9]+)?)/i) ||
                      corrected.match(/Gate[:\s]*([A-Z0-9]+(?:\/[A-Z0-9]+)?)/i);
    if (gateMatch) flight.gate = gateMatch[1].replace(/\s+/g, '').toUpperCase();
    const towMatch = corrected.match(/Tow\s*(?:IFC\s*)?Gate[:\s]*([A-Z0-9]+)\s*@\s*(\d{1,2}:\d{2})(?:lt)?/i);
    if (towMatch) { flight.towGate = towMatch[1]; flight.towTime = towMatch[2]; }

    // Other fields
    const standMatch = corrected.match(/(?:Stand|Bay)[:\s]*(\d{1,3}[A-Z]?)/i); if (standMatch) flight.stand = standMatch[1];
    const routeMatch = corrected.match(/([A-Z]{3})\s*[-–—→]\s*([A-Z]{3})/);
    if (routeMatch) {
        flight.origin = routeMatch[1]; flight.destination = routeMatch[2];
        flight.originName = airports[routeMatch[1]] || routeMatch[1];
        flight.destinationName = airports[routeMatch[2]] || routeMatch[2];
    }
    const countMatch = corrected.match(/(?:Counters?|Check-?in)[:\s]*(\d{1,3}(?:\s*[-–]\s*\d{1,3})?)/i);
    if (countMatch) flight.counters = countMatch[1].replace(/\s+/g, '');
    const latMatch = corrected.match(/(?:Lateral|Belt)[:\s]*(\d{1,2})/i); if (latMatch) flight.lateral = latMatch[1];

    // Functional Blocks
    parsePassengers(corrected, flight);
    parseWheelchairs(corrected, flight);
    parseSpecialServices(corrected, flight);
    parseConnections(corrected, flight);
    parseIncomingTransfers(corrected, flight);
    parseBaggageAndCargo(corrected, flight);
    
    const prioMatch = corrected.match(/Priority\s*Bags[\s\S]*?(\d+[\s\S]*?)(?:Please|We really|Thank)/i);
    if (prioMatch) flight.priorityBags = prioMatch[1].replace(/\n/g, ' ').trim();

    const remMatch = corrected.match(/(?:Remarks?|Notes?|Delay)[:\s]*(.+?)(?:\n|$)/i);
    if (remMatch) flight.remarks = remMatch[1].trim();
    
    const flagMatch = corrected.match(/[\u{1F1E0}-\u{1F1FF}]{2}/u);
    if (flagMatch) { flight.flag = flagMatch[0]; flight.country = flagToCountry[flagMatch[0]] || null; }

    return flight;
}

// ============================================================================ 
// MAIN TRANSLATE FUNCTION
// ============================================================================ 

function translate() {
    const input = inputText.value.trim();
    if (!input) return;
    const blocks = parseInputToBlocks(input);
    if (blocks.length === 0) return;
    const flights = blocks.map(block => parseSingleFlight(block)).filter(f => f && f.number);
    lastParsedFlights = flights;
    renderFlights(flights);
    outputSection.style.display = 'block';
    copyBtn.disabled = false; copyImageBtn.disabled = false; saveBtn.disabled = false;
    outputSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function parseInputToBlocks(input) {
    // Pre-sanitize for block splitting (remove markdown)
    const normalized = input
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*\n]+)\*/g, '$1');

    // 1. If explicit separators exist, use them as primary split
    if (normalized.includes('----------')) {
        return normalized.split(/----------+/).filter(b => b.trim());
    }

    // 2. Stateful line-by-line scanner
    const lines = normalized.split('\n');
    const blocks = [];
    let currentBlock = [];

    // Patterns that indicate a NEW flight starts on this line
    // MUST be at the start of the trimmed line to avoid splitting on remarks
    const headerPatterns = [
        /^🛫\s*[A-Z]{2}\d{1,4}/,                            // 🛫 FI602
        /^🛬\s*[A-Z]{2}\d{1,4}/,                            // 🛬 FI602
        /^Flight[:\s]+[A-Z]{2}\d{1,4}/i,                    // Flight: FI602
        /^[A-Z]{2}\d{1,4}\s+[\u{1F1E6}-\u{1F1FF}]/u         // FI603 🇮🇸
    ];

    for (const line of lines) {
        const trimmedLine = line.trim();
        
        // Skip purely empty lines at the very beginning of a block
        if (!trimmedLine && currentBlock.length === 0) continue;

        // Check if this line is a header
        const isHeader = headerPatterns.some(pattern => pattern.test(trimmedLine));

        if (isHeader && currentBlock.length > 0) {
            // We found a new header, push the previous block and start a new one
            blocks.push(currentBlock.join('\n').trim());
            currentBlock = [line];
        } else {
            currentBlock.push(line);
        }
    }

    // Push the final block
    if (currentBlock.length > 0) {
        blocks.push(currentBlock.join('\n').trim());
    }

    return blocks.length > 0 ? blocks : [normalized];
}

// ============================================================================ 
// RENDERER
// ============================================================================ 

function renderFlights(flights) {
    cardBody.innerHTML = '';
    flights.forEach(flight => {
        const section = document.createElement('div');
        section.className = 'flight-section';
        section.innerHTML = renderSingleFlight(flight);
        cardBody.appendChild(section);
    });
}

function renderSingleFlight(flight) {
    const isArrival = flight.type === 'arrival';
    const headerClass = isArrival ? 'arriving' : 'departing';
    const headerIcon = isArrival ? '🛬' : '🛫';
    const headerText = isArrival ? 'ARRIVING' : 'DEPARTING';

    // Build route/origin display
    let routeDisplay = '';
    if (flight.origin && flight.destination) {
        routeDisplay = `${flight.originName} → ${flight.destinationName}`;
    } else if (flight.country && flight.flag) {
        routeDisplay = `from ${flight.country} ${flight.flag}`;
    } else if (flight.flag) {
        routeDisplay = `${flight.flag}`;
    }

    // Build time display
    const time = flight.eta || flight.sta || flight.std || flight.etd;
    let timeLabel = flight.eta ? 'Estimated Arrival' : flight.sta ? 'Scheduled Arrival' : flight.std ? 'Scheduled Departure' : flight.etd ? 'Estimated Departure' : '';
    if (flight.etaLocal || flight.staLocal || flight.stdLocal || flight.etdLocal) timeLabel += ' (Local)';

    let html = `
        <div class="section-header ${headerClass}">${headerIcon} ${headerText}</div>
        <div class="flight-header">
            <div class="flight-info">
                <span class="flight-number">${flight.number || 'Unknown'}</span>
                ${routeDisplay ? `<span class="flight-route">• ${routeDisplay}</span>` : ''}
                ${flight.date ? `<span class="flight-date">• ${flight.date}</span>` : ''}
            </div>
            ${time ? `<div class="time-box"><div class="time-label">${timeLabel}</div><div class="time-value">🕐 ${time}</div></div>` : ''}
        </div>
    `;

    let infoBoxes = '';
    if (flight.registration) infoBoxes += `<div class="info-box"><div class="value">🛩️ ${flight.registration}</div><div class="label">${flight.aircraft || 'Aircraft'}</div></div>`;
    if (flight.gate) {
        let label = isArrival ? 'Arrival Gate' : 'Departure Gate';
        if (flight.towGate) label += ` → Tow ${flight.towGate}`;
        infoBoxes += `<div class="info-box"><div class="value">🚪 ${flight.gate}</div><div class="label">${label}</div></div>`;
    }
    if (flight.stand) infoBoxes += `<div class="info-box"><div class="value">🅿️ ${flight.stand}</div><div class="label">Stand</div></div>`;
    if (flight.counters) infoBoxes += `<div class="info-box"><div class="value">🎫 ${flight.counters}</div><div class="label">Check-In Counters</div></div>`;
    if (flight.lateral) infoBoxes += `<div class="info-box"><div class="value">🛄 ${flight.lateral}</div><div class="label">Baggage Belt</div></div>`;
    if (infoBoxes) html += `<div class="info-grid">${infoBoxes}</div>`;

    if (flight.total !== undefined || flight.paxMain !== undefined) {
        html += '<div class="pax-section"><div class="pax-section-label">👥 Passengers on Board</div><div class="pax-grid">';
        if (flight.paxBusiness !== undefined) html += `<div class="pax-box"><div class="count">${flight.paxBusiness}</div><div class="type">Business</div></div>`;
        if (flight.paxEconomy !== undefined) html += `<div class="pax-box"><div class="count">${flight.paxEconomy}</div><div class="type">Economy</div></div>`;
        if (flight.paxMain !== undefined && flight.paxBusiness === undefined && flight.paxEconomy === undefined) html += `<div class="pax-box"><div class="count">${flight.paxMain}</div><div class="type">Adults/Seats</div></div>`;
        if (flight.children !== undefined) html += `<div class="pax-box"><div class="count">${flight.children}</div><div class="type">Children</div></div>`;
        if (flight.infants !== undefined) html += `<div class="pax-box"><div class="count">${flight.infants}</div><div class="type">Infants</div></div>`;
        if (flight.staff !== undefined) html += `<div class="pax-box"><div class="count">${flight.staff}</div><div class="type">Staff</div></div>`;
        if (flight.total !== undefined) html += `<div class="pax-box total"><div class="count">${flight.total}</div><div class="type">Total Pax</div></div>`;
        html += '</div></div>';
    }

    if (flight.wheelchairs || flight.specialServices) {
        let lines = [];
        if (flight.wheelchairs) for (const wc of flight.wheelchairs) lines.push(`${wc.count}× ${wc.name}`);
        if (flight.specialServices) for (const svc of flight.specialServices) lines.push(`${svc.count}× ${svc.name}`);
        html += `<div class="special-box assist"><div class="header">♿ Special Assistance</div><div class="details">${lines.join(', ')}</div></div>`;
    }

    if (flight.connecting) {
        let h = `${flight.connecting.count} Passengers Connecting`;
        if (flight.connecting.breakdown && flight.connecting.breakdown.length > 0) h = `${flight.connecting.count} Connecting (${flight.connecting.breakdown.map(b => `${b.count} ${b.airlineName}`).join(', ')})`;
        let d = flight.connecting.flight ? `Next flight: ${flight.connecting.flight} at ${flight.connecting.time}${flight.connecting.destinationName ? ` to ${flight.connecting.destinationName}` : ''}` : '';
        html += `<div class="special-box"><div class="header">🔄 ${h}</div>${d ? `<div class="details">${d}</div>` : ''}</div>`;
    }

    if (flight.incomingTransfers && flight.incomingTransfers.length > 0) {
        const t = flight.incomingTransfers.map(t => `${t.count} from ${t.airlineName}`).join(', ');
        html += `<div class="special-box"><div class="header">🔄 Incoming Transfer Passengers</div><div class="details">${t}</div></div>`;
    }

    if (flight.bags || flight.cargo || flight.cargoNil || flight.cargoTBD || flight.carousel) {
        html += '<div class="info-grid">';
        if (flight.bags) html += `<div class="info-box"><div class="value">🧳 ${flight.bags}</div><div class="label">Checked Bags</div></div>`;
        if (flight.carousel) {
            let v = flight.carousel;
            if (flight.carouselNote) v += ` <span class="note">(${flight.carouselNote})</span>`;
            let l = 'Baggage Carousel' + (flight.oversizeBelt ? ` · Oversize: ${flight.oversizeBelt}` : '');
            html += `<div class="info-box"><div class="value">🛄 ${v}</div><div class="label">${l}</div></div>`;
        }
        if (flight.cargo) {
            html += `<div class="info-box"><div class="value">📦 ${flight.cargo.toLocaleString()} kg</div><div class="label">Cargo Weight</div></div>`;
            if (flight.cargoPieces) html += `<div class="info-box"><div class="value">🧩 ${flight.cargoPieces}</div><div class="label">Cargo Pieces</div></div>`;
        } else if (flight.cargoNil) html += `<div class="info-box nil"><div class="value">📦 NIL</div><div class="label">Cargo</div></div>`;
        else if (flight.cargoTBD) html += `<div class="info-box"><div class="value">📦 TBD</div><div class="label">Cargo</div></div>`;
        html += '</div>';
    }

    if (flight.specialCargo) html += `<div class="special-box cargo-section"><div class="header">⚠️ Special Cargo</div><div class="details">${flight.specialCargo.join('<br>')}</div></div>`;
    if (flight.priorityBags) html += `<div class="special-box"><div class="header">🏷️ Priority Bags</div><div class="details">${flight.priorityBags}</div></div>`;
    if (flight.remarks) html += `<div class="special-box"><div class="header">📝 Remarks</div><div class="details">${flight.remarks}</div></div>`;

    return html;
}

// ============================================================================
// EXPORT FUNCTIONS (PRESERVED)
// ============================================================================

function generateTextSummary(flights) {
    let text = '';
    flights.forEach((f, i) => {
        if (i > 0) text += '\n' + '─'.repeat(40) + '\n\n';
        text += (f.type === 'arrival' ? '🛬 ARRIVING' : '🛫 DEPARTING') + `\nFlight: ${f.number || 'Unknown'}\n`;
        if (f.date) text += `Date: ${f.date}\n`;
        if (f.registration) text += `Aircraft: ${f.registration} (${f.aircraft || ''})\n`;
        const time = f.eta || f.sta || f.std || f.etd;
        if (time) {
            let label = f.eta ? 'ETA' : f.sta ? 'STA' : f.std ? 'STD' : 'ETD';
            text += `${label}: ${time}\n`;
        }
        if (f.gate) text += `Gate: ${f.gate}${f.towGate ? ` (Tow to ${f.towGate})` : ''}\n`;
        if (f.stand) text += `Stand: ${f.stand}\n`;
        if (f.counters) text += `Counters: ${f.counters}\n`;
        if (f.lateral) text += `Baggage Belt: ${f.lateral}\n`;

        // Passenger breakdown
        if (f.total) {
            let paxStr = `Pax: ${f.total}`;
            let details = [];
            if (f.paxBusiness) details.push(`${f.paxBusiness}C`);
            if (f.paxEconomy) details.push(`${f.paxEconomy}Y`);
            if (f.infants) details.push(`${f.infants}INF`);
            if (details.length > 0) paxStr += ` (${details.join('/')})`;
            text += paxStr + '\n';
        }

        // Special Assistance
        if (f.wheelchairs || f.specialServices) {
            let lines = [];
            if (f.wheelchairs) for (const wc of f.wheelchairs) lines.push(`${wc.count}x ${wc.type}`);
            if (f.specialServices) for (const svc of f.specialServices) lines.push(`${svc.count}x ${svc.code}`);
            text += `Special: ${lines.join(', ')}\n`;
        }

        // Connections
        if (f.connecting) {
            let conx = `Connections: ${f.connecting.count} pax`;
            if (f.connecting.flight) conx += ` to ${f.connecting.flight} @ ${f.connecting.time}`;
            text += conx + '\n';
        }

        // Cargo & Bags
        if (f.bags) text += `Bags: ${f.bags}\n`;
        if (f.carousel) text += `Carousel: ${f.carousel}${f.carouselNote ? ` (${f.carouselNote})` : ''}\n`;
        if (f.cargo) text += `Cargo: ${f.cargo.toLocaleString()} kg${f.cargoPieces ? ` (${f.cargoPieces} pcs)` : ''}\n`;
        else if (f.cargoNil) text += `Cargo: NIL\n`;

        if (f.specialCargo && f.specialCargo.length > 0) {
            text += `Special Cargo:\n - ${f.specialCargo.map(c => c.replace(/^[^\s]+\s*/, '')).join('\n - ')}\n`;
        }

        if (f.remarks) text += `Remarks: ${f.remarks}\n`;
    });
    return text.trim();
}

async function copyToClipboard() {
    try {
        const text = generateTextSummary(lastParsedFlights);
        await navigator.clipboard.writeText(text);
        const label = copyBtn.querySelector('.btn-label');
        const originalText = label.textContent;
        label.textContent = 'Copied!';
        copyBtn.classList.add('success');
        setTimeout(() => { label.textContent = originalText; copyBtn.classList.remove('success'); }, 2000);
    } catch (err) { console.error(err); }
}

async function saveAsPNG() {
    const label = saveBtn.querySelector('.btn-label');
    const originalText = label.textContent;
    try {
        label.textContent = 'Saving...';
        saveBtn.disabled = true;
        const cardClone = outputCard.cloneNode(true);
        cardClone.style.cssText = `position: absolute; left: -9999px; top: 0; width: 500px;`;
        document.body.appendChild(cardClone);
        await new Promise(resolve => setTimeout(resolve, 150));
        const canvas = await html2canvas(cardClone, { backgroundColor: null, scale: 2, logging: false, useCORS: true });
        document.body.removeChild(cardClone);
        let filename = 'squawk';
        if (lastParsedFlights.length > 0) {
            const flightNumbers = lastParsedFlights.filter(f => f.number).map(f => f.number);
            filename += `-${flightNumbers.join('-')}`;
            const fWithDate = lastParsedFlights.find(f => f.date);
            if (fWithDate && fWithDate.date) {
                const dateMatch = fWithDate.date.match(/(\w+)\s+(\d+),?\s*(\d{4})?/);
                if (dateMatch) filename += `-${dateMatch[2]}${dateMatch[1]}${dateMatch[3] || ''}`;
            }
        }
        const link = document.createElement('a'); link.download = filename + '.png';
        link.href = canvas.toDataURL('image/png'); link.click();
        label.textContent = 'Saved!';
        saveBtn.classList.add('success');
        setTimeout(() => { label.textContent = originalText; saveBtn.disabled = false; saveBtn.classList.remove('success'); }, 2000);
    } catch (err) { console.error(err); label.textContent = originalText; saveBtn.disabled = false; }
}

async function copyImageToClipboard() {
    const label = copyImageBtn.querySelector('.btn-label');
    const originalText = label.textContent;
    try {
        label.textContent = 'Copying...';
        copyImageBtn.disabled = true;
        const cardClone = outputCard.cloneNode(true);
        cardClone.style.cssText = `position: absolute; left: -9999px; top: 0; width: 500px;`;
        document.body.appendChild(cardClone);
        await new Promise(resolve => setTimeout(resolve, 150));
        const canvas = await html2canvas(cardClone, { backgroundColor: null, scale: 2, logging: false, useCORS: true });
        document.body.removeChild(cardClone);
        canvas.toBlob(async (blob) => {
            try {
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                label.textContent = 'Copied!';
                copyImageBtn.classList.add('success');
                setTimeout(() => { label.textContent = originalText; copyImageBtn.disabled = false; copyImageBtn.classList.remove('success'); }, 2000);
            } catch (clipErr) { console.error(clipErr); label.textContent = originalText; copyImageBtn.disabled = false; }
        }, 'image/png');
    } catch (err) { console.error(err); label.textContent = originalText; copyImageBtn.disabled = false; }
}
