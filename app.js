// Squawk - Airline Ops Message Translator
// Dictionary + regex based parsing (no AI)
// Dictionaries are loaded from dictionaries.js

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

// ============================================================================
// EVENT LISTENERS
// ============================================================================

translateBtn.addEventListener('click', translate);
copyBtn.addEventListener('click', copyToClipboard);
copyImageBtn.addEventListener('click', copyImageToClipboard);
saveBtn.addEventListener('click', saveAsPNG);

// ============================================================================
// MAIN TRANSLATE FUNCTION
// ============================================================================

function translate() {
    const input = inputText.value.trim();
    if (!input) return;

    const flights = parseFlights(input);
    if (flights.length === 0) return;

    // Store for export functions
    lastParsedFlights = flights;

    // Log parsed data for debugging
    console.log('Parsed flights:', flights);

    renderFlights(flights);

    // Show output and enable buttons
    outputSection.style.display = 'block';
    copyBtn.disabled = false;
    copyImageBtn.disabled = false;
    saveBtn.disabled = false;
    
    // Accessibility
    copyBtn.setAttribute('aria-disabled', 'false');
    copyImageBtn.setAttribute('aria-disabled', 'false');
    saveBtn.setAttribute('aria-disabled', 'false');

    // Scroll to output
    outputSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ============================================================================
// FLIGHT PARSER
// ============================================================================

/**
 * Parse input text into an array of flight objects
 * Splits on flight number patterns and processes each block
 */
function parseFlights(input) {
    // Normalize line endings and clean up input
    const normalized = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Split on separators (dashes) or flight number patterns
    // We explicitly split by the divider line "----------" first if present
    let blocks = [];
    if (normalized.includes('----------')) {
        blocks = normalized.split(/----------+/).filter(b => b.trim());
    } else {
        // Fallback to regex splitting if no explicit separators
        // *FI603*, 🛫FI602, Flight: CM470
        const flightPattern = /(?=\*[A-Z]{2}\d{1,4}\*)|(?=🛫\s*[A-Z]{2}\d{1,4})|(?=🛬\s*[A-Z]{2}\d{1,4})|(?=(?:^|\n)Flight[:\s]+[A-Z]{2}\d{1,4})/m;
        blocks = normalized.split(flightPattern).filter(b => b.trim());
    }

    // If no split happened, treat entire input as single flight
    if (blocks.length === 0) {
        blocks = [normalized];
    }

    return blocks.map(block => parseSingleFlight(block)).filter(f => f && f.number);
}

/**
 * Detect flight type based on keywords
 * Priority: emoji > explicit keywords > route format > fallbacks
 */
function detectFlightType(block) {
    // Check emoji indicators FIRST (most reliable, unambiguous)
    if (block.includes('🛬')) return 'arrival';
    if (block.includes('🛫')) return 'departure';

    const upper = block.toUpperCase();

    // Check for arrival indicators
    const arrivalPatterns = [
        /\bETA[:\s]/,      // ETA:
        /\bSTA[:\s]/,      // STA:
        /\bARRIVING\b/,    // Full word ARRIVING
        /\bARR:/,          // ARR:
        /\bArr\s*Gate\b/   // Arr Gate
    ];
    for (const pattern of arrivalPatterns) {
        if (pattern.test(upper)) return 'arrival';
    }

    // Check for departure indicators
    const departurePatterns = [
        /\bSTD[:\s]/,      // STD:
        /\bETD[:\s]/,      // ETD:
        /\bDEPARTING\b/,   // Full word DEPARTING
        /\bDEP:/,          // DEP:
        /\bCounters?[:\s]/ // Counters
    ];
    for (const pattern of departurePatterns) {
        if (pattern.test(upper)) return 'departure';
    }

    // Route format (YYZ-KEF) indicates departure usually (Origin-Dest)
    // Tow/Arr Gate strongly implies arrival
    if (/Arr\s*Gate|Tow\s*IFC/i.test(block)) return 'arrival';

    // Route fallback
    if (/[A-Z]{3}\s*[-–—→]\s*[A-Z]{3}/.test(block)) return 'departure';

    return 'unknown';
}

/**
 * Parse a single flight block into structured data
 */
function parseSingleFlight(block) {
    const flight = {
        type: detectFlightType(block),
        raw: block
    };

    // ========== FLIGHT IDENTIFICATION ==========

    // Flight number - multiple formats
    // *FI603*, 🛫FI602, FI603, Flight: CM470
    const flightNumPatterns = [
        /\*([A-Z]{2}\d{1,4})\*/,           // *FI603*
        /🛫\s*([A-Z]{2}\d{1,4})/,          // 🛫FI602
        /🛬\s*([A-Z]{2}\d{1,4})/,          // 🛬FI602
        /(?:Flight|FLT)[:\s]*([A-Z]{2}\d{1,4})/i,  // Flight: CM470
        /(?:^|\n)\s*([A-Z]{2}\d{1,4})\b/   // FI603 at line start
    ];

    for (const pattern of flightNumPatterns) {
        const match = block.match(pattern);
        if (match) {
            flight.number = match[1].toUpperCase();
            // Extract airline code safely
            const airlineCodeMatch = flight.number.match(/^[A-Z]{2}/);
            if (airlineCodeMatch) {
                flight.airlineCode = airlineCodeMatch[0];
                flight.airlineName = airlines[flight.airlineCode] || null;
            }
            break;
        }
    }

    // ========== DATE ==========

    // Date formats: "24Jan2026", "26 Jan", "Jan 26", "28JAN26", "Date: 28JAN26"
    // STRICTER PATTERNS: Only match valid months to avoid capturing "YYZ" or "pcs"
    const months = "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec";
    const datePatterns = [
        new RegExp(`Date[:\\s]+(\\d{1,2})(${months})(\\d{2,4})?`, 'i'), // Date: 28JAN26
        new RegExp(`(\\d{1,2})\\s*(${months})\\s*(\\d{2,4})?\\b`, 'i'), // 28 Jan 2026
        new RegExp(`(${months})\\s*(\\d{1,2})(?:\\s*,?\\s*(\\d{2,4}))?\\b`, 'i'), // Jan 28, 2026
        new RegExp(`(\\d{1,2})(${months})(\\d{2,4})`, 'i') // 24Jan2026
    ];

    for (const pattern of datePatterns) {
        const match = block.match(pattern);
        if (match) {
            let day, month, year;
            // Identify structure based on which group captures the month
            const g1 = match[1];
            const g2 = match[2];
            const g3 = match[3];

            // If group 1 is the month (Pattern 3: Jan 28)
            if (isNaN(parseInt(g1)) && !isNaN(parseInt(g2))) {
                month = g1;
                day = g2;
                year = g3;
            } 
            // If group 2 is the month (Pattern 1, 2, 4: 28 Jan)
            else if (!isNaN(parseInt(g1)) && isNaN(parseInt(g2))) {
                day = g1;
                month = g2;
                year = g3;
            }

            // Normalize year
            if (!year) {
                year = new Date().getFullYear();
            } else if (year.length === 2) {
                year = '20' + year;
            }

            if (day && month) {
                flight.date = `${month} ${day}, ${year}`;
                break;
            }
        }
    }

    // ========== AIRCRAFT ==========

    const regPatterns = [
        /(?:AC\s*)?REG[:\s]*([A-Z]{1,2}-?[A-Z0-9]{2,5})/i,
        /Registration[:\s]*([A-Z]{1,2}-?[A-Z0-9]{2,5})/i
    ];
    for (const pattern of regPatterns) {
        const match = block.match(pattern);
        if (match) {
            flight.registration = match[1].toUpperCase();
            break;
        }
    }

    const aircraftPatterns = [
        /\((\d{2,3}[A-Z]?|[A-Z]\d{2}|7M[89]|E\d{2}|CR[9J]|DH4|AT7)\)/i,
        /\[(\d{2,3}[A-Z]?|[A-Z]\d{2}|7M[89])\]/i,
        /(?:A\/C|Aircraft|Type)[:\s]*(\d{2,3}[A-Z]?|[A-Z]\d{2}|7M[89])/i
    ];

    for (const pattern of aircraftPatterns) {
        const match = block.match(pattern);
        if (match) {
            const code = match[1].toUpperCase();
            flight.aircraftCode = code;
            flight.aircraft = aircraftTypes[code] || code;
            break;
        }
    }

    // ========== TIMES ==========

    // Helper to capture 'lt'
    const extractTime = (regex) => {
        const match = block.match(regex);
        if (match) {
            const isLocal = (match[0].toLowerCase().includes('lt'));
            return { time: match[1], local: isLocal };
        }
        return null;
    };

    const eta = extractTime(/ETA[:\s]*(\d{1,2}:\d{2})(?:lt)?/i);
    if (eta) { flight.eta = eta.time; flight.etaLocal = eta.local; }

    const sta = extractTime(/STA[:\s]*(\d{1,2}:\d{2})(?:lt)?/i);
    if (sta) { flight.sta = sta.time; flight.staLocal = sta.local; }

    const std = extractTime(/STD[:\s]*(\d{1,2}:\d{2})(?:lt)?/i);
    if (std) { flight.std = std.time; flight.stdLocal = std.local; }

    const etd = extractTime(/ETD[:\s]*(\d{1,2}:\d{2})(?:lt)?/i);
    if (etd) { flight.etd = etd.time; flight.etdLocal = etd.local; }

    // ========== LOCATION / GATES ==========

    // Primary Gate
    const gatePatterns = [
        /\*?Arr\s*Gate\*?[:\s]*([A-Z0-9]+(?:\s*\/\s*[A-Z0-9]+)?)/i,
        /Gate[:\s*]*\**([A-Z0-9]+(?:\s*\/\s*[A-Z0-9]+)?)\**/i
    ];
    for (const pattern of gatePatterns) {
        const match = block.match(pattern);
        if (match) {
            flight.gate = match[1].replace(/\*+/g, '').replace(/\s+/g, '').toUpperCase();
            break;
        }
    }

    // Tow information
    const towMatch = block.match(/Tow\s*(?:IFC\s*)?\*?Gate\*?[:\s]*([A-Z0-9]+)\s*@\s*(?:Between\s*)?(\d{1,2}:\d{2})(?:lt)?/i);
    if (towMatch) {
        flight.towGate = towMatch[1];
        flight.towTime = towMatch[2];
    }

    // Stand/Bay
    const standMatch = block.match(/(?:Stand|Bay)[:\s]*(\d{1,3}[A-Z]?)/i);
    if (standMatch) flight.stand = standMatch[1];

    // Route
    const routeMatch = block.match(/([A-Z]{3})\s*[-–—→]\s*([A-Z]{3})/);
    if (routeMatch) {
        flight.origin = routeMatch[1];
        flight.destination = routeMatch[2];
        flight.originName = airports[routeMatch[1]] || routeMatch[1];
        flight.destinationName = airports[routeMatch[2]] || routeMatch[2];
    }

    // Counters
    const countersMatch = block.match(/(?:Counters?|Check-?in)[:\s]*(\d{1,3}(?:\s*[-–]\s*\d{1,3})?)/i);
    if (countersMatch) flight.counters = countersMatch[1].replace(/\s+/g, '');

    // Lateral/Belt
    const lateralMatch = block.match(/(?:Lateral|Belt)[:\s]*(\d{1,2})/i);
    if (lateralMatch) flight.lateral = lateralMatch[1];

    // ========== PASSENGERS ==========

    parsePassengers(block, flight);

    // ========== SPECIAL SERVICES & BAGGAGE ==========

    parseWheelchairs(block, flight);
    parseSpecialServices(block, flight);
    parseConnections(block, flight);
    parseIncomingTransfers(block, flight);
    parseBaggageAndCargo(block, flight); // Consolidated function
    
    // Priority Bags (New)
    const priorityMatch = block.match(/\*Priority\s*Bags\*[\s\S]*?(\d+[\s\S]*?)(?:Please|We really|Thank)/i);
    if (priorityMatch) {
        // Clean up the priority bags text
        let pBags = priorityMatch[1].replace(/\n/g, ' ').trim();
        flight.priorityBags = pBags;
    }

    // ========== REMARKS ==========

    const remarksMatch = block.match(/(?:Remarks?|Notes?|Delay)[:\s]*(.+?)(?:\n|$)/i);
    if (remarksMatch) {
        flight.remarks = remarksMatch[1].trim();
    }
    
    // Country detection via flags
    const flagMatch = block.match(/[\u{1F1E0}-\u{1F1FF}]{2}/u);
    if (flagMatch) {
        flight.flag = flagMatch[0];
        flight.country = flagToCountry[flagMatch[0]] || null;
    }

    return flight;
}

/**
 * Parse passenger counts from various formats
 */
function parsePassengers(block, flight) {
    // 1. "Pax OB: 157 + *02* INF" (Total + Infants)
    // Handle asterisks inside the numbers like *02*
    const paxOBMatch = block.match(/Pax\s*OB[:\s]*(\d+)\s*\+\s*\*?(\d+)\*?\s*INF/i);
    if (paxOBMatch) {
        const count1 = parseInt(paxOBMatch[1]);
        const count2 = parseInt(paxOBMatch[2]);
        flight.total = count1 + count2;
        flight.infants = count2;
        // In this format, the first number is usually "adults/seats occupied", so effectively total - infants(lap)
        // We won't assume Economy unless specified
        flight.paxMain = count1; 
    }

    // 2. "Pax count: C16 M105 2ID" or "Pax: C14 M125 1INFT"
    // Regex that looks for the Pax line
    const paxLineMatch = block.match(/Pax(?:\s+count)?[:\s]*([^\n]+)/i);
    if (paxLineMatch) {
        const line = paxLineMatch[1];

        // Business (C, J, F)
        const biz = line.match(/\b[CJF](\d+)\b/);
        if (biz) flight.paxBusiness = parseInt(biz[1]);

        // Economy (M, Y)
        const eco = line.match(/\b[MY](\d+)\b/);
        if (eco) flight.paxEconomy = parseInt(eco[1]);

        // Infants (INF1, 1INFT, *02* INF)
        const inf = line.match(/(?:INF|INFT)\s*(\d+)|\b(\d+)\s*(?:INF|INFT)/i);
        if (inf) flight.infants = parseInt(inf[1] || inf[2]);

        // Staff (2ID, ID2)
        const staff = line.match(/(\d+)\s*ID|ID\s*(\d+)/i);
        if (staff) flight.staff = parseInt(staff[1] || staff[2]);
        
        // Children (CHD)
        const chd = line.match(/(\d+)\s*CHD|CHD\s*(\d+)/i);
        if (chd) flight.children = parseInt(chd[1] || chd[2]);
    }

    // Total TTL=123
    // EXCLUDE "TOTAL = 31 pcs" which is cargo
    // Look for TTL or TOTAL followed by number, but NOT followed by pcs/kg
    // Added \b after capture group to prevent partial match of "3" from "31"
    const ttlMatch = block.match(/\b(?:TTL|TOTAL)\s*[=:]\s*(\d+)\b(?!\s*(?:pcs|pzs|kg|kilos|lbs))/i);
    if (ttlMatch) flight.total = parseInt(ttlMatch[1]);

    // Fallback total calculation
    if (!flight.total && (flight.paxBusiness || flight.paxEconomy)) {
        flight.total = (flight.paxBusiness || 0) + (flight.paxEconomy || 0) + (flight.infants || 0);
    }
}

/**
 * Parse wheelchair and mobility assistance codes
 */
function parseWheelchairs(block, flight) {
    const wheelchairs = [];
    const foundTypes = new Set();

    // Format 1: Copa style - *WCHC*: 3R + 01C (R=Ramp, C=Cabin)
    const copaWchMatch = block.match(/\*?WCHC\*?[:\s]*(\d+)R(?:\s*\+\s*(\d+)C)?/i);
    if (copaWchMatch) {
        const rampCount = parseInt(copaWchMatch[1]) || 0;
        const cabinCount = parseInt(copaWchMatch[2]) || 0;
        if (rampCount > 0) {
            wheelchairs.push({ count: rampCount, type: 'WCHR', ...wheelchairTypes['WCHR'] });
            foundTypes.add('WCHR');
        }
        if (cabinCount > 0) {
            wheelchairs.push({ count: cabinCount, type: 'WCHC', ...wheelchairTypes['WCHC'] });
            foundTypes.add('WCHC');
        }
    }

    // Format 2: Standard - 1WCHR, 2 WCHS, WCHC x 3, Special: 1WCHC 1WCHR
    const wchrPattern = /(\d+)\s*(WCHR|WCHS|WCHC|WCHP|BLND|DEAF|DPNA|MAAS)|(?:(WCHR|WCHS|WCHC|WCHP|BLND|DEAF|DPNA|MAAS)[:\s]*(\d+)?)/gi;

    let match;
    while ((match = wchrPattern.exec(block)) !== null) {
        const type = (match[2] || match[3]).toUpperCase();

        // Avoid duplicates
        if (foundTypes.has(type)) continue;
        foundTypes.add(type);

        const count = parseInt(match[1] || match[4]) || 1;

        if (wheelchairTypes[type]) {
            wheelchairs.push({
                count: count,
                type: type,
                ...wheelchairTypes[type]
            });
        }
    }

    if (wheelchairs.length > 0) {
        flight.wheelchairs = wheelchairs;
        // Keep single wheelchair for backwards compatibility
        flight.wheelchair = wheelchairs[0];
    }
}

/**
 * Parse special service codes (UMNR, etc)
 */
function parseSpecialServices(block, flight) {
    const services = [];

    for (const [code, info] of Object.entries(specialServices)) {
        // Skip INF/INFT as they're handled in passenger parsing
        if (code === 'INF' || code === 'INFT') continue;

        const pattern = new RegExp(`(\\d+)\\s*${code}|${code}\\s*[x×]?\\s*(\\d+)`, 'gi');
        const match = block.match(pattern);

        if (match) {
            const countMatch = match[0].match(/\d+/);
            services.push({
                code: code,
                count: countMatch ? parseInt(countMatch[0]) : 1,
                ...info
            });
        }
    }

    if (services.length > 0) {
        flight.specialServices = services;
    }
}

/**
 * Parse connecting passenger information
 */
function parseConnections(block, flight) {
    // Format 1: Conx Pax6 :first flight 19:45 PD655 LAs
    // Format 2: Conx Pax:5 followed by airline breakdown on next line
    // Format 3: CNX: 6 pax to PD655 19:45 LAS

    const conxPatterns = [
        /Conx\s+Pax\s*(\d+)\s*[:\s]*.+?(\d{1,2}:\d{2})\s*([A-Z]{2}\d{1,4})\s*([A-Z]{2,3})/i,
        /(?:Conx|CNX|Connecting)[:\s]*(\d+)\s*(?:pax\s*)?(?:to\s+)?([A-Z]{2}\d{1,4})\s*(?:@\s*)?(\d{1,2}:\d{2})\s*([A-Z]{2,3})?/i,
        /Conx\s*Pax[:\s]*(\d+)/i  // Simple format: just count
    ];

    for (const pattern of conxPatterns) {
        const match = block.match(pattern);
        if (match) {
            if (pattern === conxPatterns[2]) {
                // Simple format - just count, check for breakdown on next lines
                flight.connecting = {
                    count: parseInt(match[1])
                };
            } else {
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

    // Check for airline breakdown following Conx line: "1AC 3PD 1WS"
    if (flight.connecting) {
        const breakdownMatch = block.match(/Conx\s*Pax[:\s]*\d+[^\n]*\n\s*((?:\d+[A-Z]{2}\s*)+)/i);
        if (breakdownMatch) {
            const breakdown = [];
            const airlinePattern = /(\d+)([A-Z]{2})/g;
            let airlineMatch;
            while ((airlineMatch = airlinePattern.exec(breakdownMatch[1])) !== null) {
                const code = airlineMatch[2];
                breakdown.push({
                    count: parseInt(airlineMatch[1]),
                    code: code,
                    airlineName: airlines[code] || code
                });
            }
            if (breakdown.length > 0) {
                flight.connecting.breakdown = breakdown;
            }
        }
    }
}

/**
 * Parse incoming transfer passengers from other airlines
 */
function parseIncomingTransfers(block, flight) {
    // Format: IN CARR PAX : 3AC ,5PD
    // Also: Transfers: 3 AC, 5 PD
    const inCarrMatch = block.match(/(?:IN\s*CARR(?:\s*PAX)?|Transfers?)[:\s]*(.+?)(?:\n|$)/i);

    if (inCarrMatch) {
        const transfers = [];
        const transferLine = inCarrMatch[1];

        // Match patterns: 3AC, 3 AC, AC3, AC 3
        const transferPattern = /(\d+)\s*([A-Z]{2})|([A-Z]{2})\s*(\d+)/g;
        let match;

        while ((match = transferPattern.exec(transferLine)) !== null) {
            const count = parseInt(match[1] || match[4]);
            const airlineCode = (match[2] || match[3]).toUpperCase();

            transfers.push({
                count: count,
                airline: airlineCode,
                airlineName: airlines[airlineCode] || airlineCode
            });
        }

        if (transfers.length > 0) {
            flight.incomingTransfers = transfers;
        }
    }
}

// ============================================================================
// RENDERER
// ============================================================================

/**
 * Render all parsed flights to the card
 */
function renderFlights(flights) {
    cardBody.innerHTML = '';

    flights.forEach(flight => {
        const section = document.createElement('div');
        section.className = 'flight-section';
        section.innerHTML = renderSingleFlight(flight);
        cardBody.appendChild(section);
    });
}

/**
 * Consolidated Baggage and Cargo Parsing
 */
function parseBaggageAndCargo(block, flight) {
    // Bags
    const bagsMatch = block.match(/(?:Bags?|Baggage)[:\s]*(\d+)/i);
    if (bagsMatch) flight.bags = parseInt(bagsMatch[1]);

    // XQS (Copa bags)
    const xqsMatch = block.match(/\*?XQS\*?[:\s]*(\d+)(?:\s+BIN\s*([^\n]+))?/i);
    if (xqsMatch) {
        if (!flight.bags) flight.bags = parseInt(xqsMatch[1]);
        if (xqsMatch[2]) flight.bagsBin = xqsMatch[2].trim();
    }

    // Carousel
    const carouselMatch = block.match(/\*?Carousel\*?[:\s]*(\d{1,2})\s*([a-z].*)?(?:\s*\*?OVZ\*?[:\s]*([A-Z]))?/i);
    if (carouselMatch) {
        flight.carousel = carouselMatch[1];
        if (carouselMatch[2]) {
            // If the note starts with *OVZ, it's not a note
            if (!carouselMatch[2].includes('OVZ')) {
                flight.carouselNote = carouselMatch[2].trim();
            }
        }
        // Capture OVZ if it wasn't caught in group 3 (regex can be tricky)
        const ovzMatch = block.match(/\*?OVZ\*?[:\s]*([A-Z])/i);
        if (ovzMatch) flight.oversizeBelt = ovzMatch[1];
    }

    // === COMPLEX CARGO BLOCK PARSING ===
    // Extract everything between *CARGO* and the next section (like STD, Pax, etc)
    // This allows us to parse multi-line cargo details
    const cargoBlockMatch = block.match(/\*?CARGO\*?\s*:([\s\S]*?)(?=(?:STD|Pax|Total|TTL|Special|IN\s*CARR|Counters|Lateral|$))/i);
    
    let specialItems = [];
    
    if (cargoBlockMatch) {
        const cargoText = cargoBlockMatch[1];
        
        // 1. Try to find TOTAL count and weight explicitly in the block
        // "TOTAL =31 pcs \n 592.0 kg"
        const totalPcsMatch = cargoText.match(/TOTAL\s*[=:]\s*(\d+)\s*(?:pcs|pzs)/i);
        if (totalPcsMatch) flight.cargoPieces = parseInt(totalPcsMatch[1]);
        
        // Find total weight - often on its own line or after total pieces
        // Look for number + kg/kgs at start of line or after total
        const totalKgMatch = cargoText.match(/(?:TOTAL[^\n]*\n|)\s*([0-9,.]+)\s*kg/i);
        if (totalKgMatch) flight.cargo = parseFloat(totalKgMatch[1].replace(/,/g, ''));

        // 2. Parse individual line items
        // "30pcs LIVELOBSTERS" or "1pc CONSOLIDATION"
        // We split by newline and look for patterns
        const lines = cargoText.split('\n').map(l => l.trim()).filter(l => l);
        
        for (const line of lines) {
            // Lobsters
            const lobsters = line.match(/(\d+)\s*(?:pcs|pzs)?\s*(?:LIVE)?\s*LOBSTERS/i);
            if (lobsters) specialItems.push(`🦞 ${lobsters[1]} Live Lobsters`);
            
            // Consolidation
            const consol = line.match(/(\d+)\s*(?:pcs|pc|pzs)?\s*CONSOLIDATION/i);
            if (consol) specialItems.push(`📦 ${consol[1]} Consolidation`);
            
            // Animals
            const animals = line.match(/(\d+)\s*(?:pcs|pzs)?\s*(?:LIVE\s*ANIMALS|AVI)/i);
            if (animals) specialItems.push(`🐾 ${animals[1]} Live Animals`);
            
            // Dangerous Goods
            const dgr = line.match(/(\d+)\s*(?:pcs|pzs)?\s*(?:DGR|DANGEROUS\s*GOODS)/i);
            if (dgr) specialItems.push(`⚠️ ${dgr[1]} Dangerous Goods`);
        }
    }

    // === FALLBACK / SIMPLE PARSING ===
    // If the complex block didn't yield results (or format is simple), try simple patterns
    
    if (!flight.cargo) {
        // Pattern 1: Simple KGS "**2477 KGS **"
        const simpleKg = block.match(/\*?Cargo\*?[:\s*]*\**([0-9,.]+)\s*KGS?/i);
        if (simpleKg) flight.cargo = parseFloat(simpleKg[1].replace(/,/g, ''));
        
        // Pattern 2: Pcs/Kg combo "98 Pzs/ 2,062.00 Kgs"
        const pcsKg = block.match(/(\d+)\s*(?:pcs|pzs|pc)\s*[\/\s]*\s*([0-9,.]+)\s*kgs?/i);
        if (pcsKg) {
            if (!flight.cargoPieces) flight.cargoPieces = parseInt(pcsKg[1]);
            flight.cargo = parseFloat(pcsKg[2].replace(/,/g, ''));
        }
    }

    // Add any special items found via simple regex if not already found
    if (specialItems.length === 0) {
        // 30pcs LIVELOBSTERS (global search)
        const lobsters = block.match(/(\d+)\s*(?:pcs)?\s*LIVELOBSTERS|LIVE\s*LOBSTERS/i);
        if (lobsters) specialItems.push(`🦞 ${lobsters[1]} Live Lobsters`);

        // Consolidation
        const consol = block.match(/(\d+)\s*(?:pcs|pc)\s*CONSOLIDATION/i);
        if (consol) specialItems.push(`📦 ${consol[1]} Consolidation`);
    }

    if (specialItems.length > 0) flight.specialCargo = specialItems;

    // NIL/TBD
    if (/Cargo\*?[:\s]*NIL/i.test(block)) flight.cargoNil = true;
    if (/Cargo\*?[:\s]*TBD/i.test(block)) flight.cargoTBD = true;
}

/**
 * Render a single flight to HTML
 * Focus: CLARITY - turning chaos into readable information
 */
function renderSingleFlight(flight) {
    const isArrival = flight.type === 'arrival';
    const headerClass = isArrival ? 'arriving' : 'departing';
    const headerIcon = isArrival ? '🛬' : '🛫';
    const headerText = isArrival ? 'ARRIVING' : 'DEPARTING';

    // Build origin/destination display - Dictionary now handles simplification
    let routeDisplay = '';
    if (flight.origin && flight.destination) {
        routeDisplay = `${flight.originName} → ${flight.destinationName}`;
    } else if (flight.country && flight.flag) {
        routeDisplay = `from ${flight.country} ${flight.flag}`;
    } else if (flight.flag) {
        routeDisplay = `${flight.flag}`;
    }

    let html = `
        <div class="section-header ${headerClass}">
            ${headerIcon} ${headerText}
        </div>
        <div class="flight-header">
            <span class="flight-number">${flight.number || 'Unknown'}</span>
            ${flight.date ? `<span class="flight-date">${flight.date}</span>` : ''}
        </div>
        ${routeDisplay ? `<div class="flight-route">${routeDisplay}</div>` : ''}
    `;

    // ===== FLIGHT INFO BOXES =====
    let infoBoxes = '';

    // Aircraft registration and type
    if (flight.registration) {
        infoBoxes += `
            <div class="info-box">
                <div class="value">🛩️ ${flight.registration}</div>
                <div class="label">${flight.aircraft || 'Aircraft'}</div>
            </div>
        `;
    }

    // Gate - keep full value like C39A/B39
    if (flight.gate) {
        let gateLabel = isArrival ? 'Arrival Gate' : 'Departure Gate';
        if (flight.towGate) {
            gateLabel += ` → Tow ${flight.towGate}`;
        }
        infoBoxes += `
            <div class="info-box">
                <div class="value">🚪 ${flight.gate}</div>
                <div class="label">${gateLabel}</div>
            </div>
        `;
    }

    // Time - in a card with full label
    const time = flight.eta || flight.sta || flight.std || flight.etd;
    let timeLabel = flight.eta ? 'Estimated Arrival' : flight.sta ? 'Scheduled Arrival' : flight.std ? 'Scheduled Departure' : flight.etd ? 'Estimated Departure' : '';
    
    // Add local time indicator if detected
    const isLocal = flight.etaLocal || flight.staLocal || flight.stdLocal || flight.etdLocal;
    if (isLocal) timeLabel += ' (Local)';

    if (time) {
        infoBoxes += `
            <div class="info-box">
                <div class="value">🕐 ${time}</div>
                <div class="label">${timeLabel}</div>
            </div>
        `;
    }

    // Stand/Bay
    if (flight.stand) {
        infoBoxes += `
            <div class="info-box">
                <div class="value">🅿️ ${flight.stand}</div>
                <div class="label">Stand</div>
            </div>
        `;
    }

    // Counters (departures)
    if (flight.counters) {
        infoBoxes += `
            <div class="info-box">
                <div class="value">🎫 ${flight.counters}</div>
                <div class="label">Check-In Counters</div>
            </div>
        `;
    }

    // Lateral/Belt (departures)
    if (flight.lateral) {
        infoBoxes += `
            <div class="info-box">
                <div class="value">🛄 ${flight.lateral}</div>
                <div class="label">Baggage Belt</div>
            </div>
        `;
    }

    if (infoBoxes) {
        html += `<div class="info-grid">${infoBoxes}</div>`;
    }

    // ===== PASSENGERS ON BOARD =====
    if (flight.paxBusiness !== undefined || flight.paxEconomy !== undefined ||
        flight.infants !== undefined || flight.children !== undefined ||
        flight.total !== undefined || flight.staff !== undefined || flight.paxMain !== undefined) {

        html += '<div class="pax-section"><div class="pax-section-label">👥 Passengers on Board</div><div class="pax-grid">';

        if (flight.paxBusiness !== undefined) {
            html += `<div class="pax-box"><div class="count">${flight.paxBusiness}</div><div class="type">Business</div></div>`;
        }
        if (flight.paxEconomy !== undefined) {
            html += `<div class="pax-box"><div class="count">${flight.paxEconomy}</div><div class="type">Economy</div></div>`;
        }
        // Fallback for when we only have "Main" or generic Pax OB count
        if (flight.paxMain !== undefined && flight.paxBusiness === undefined && flight.paxEconomy === undefined) {
             html += `<div class="pax-box"><div class="count">${flight.paxMain}</div><div class="type">Adults/Seats</div></div>`;
        }
        if (flight.children !== undefined) {
            html += `<div class="pax-box"><div class="count">${flight.children}</div><div class="type">Children</div></div>`;
        }
        if (flight.infants !== undefined) {
            html += `<div class="pax-box"><div class="count">${flight.infants}</div><div class="type">Infants</div></div>`;
        }
        if (flight.staff !== undefined) {
            html += `<div class="pax-box"><div class="count">${flight.staff}</div><div class="type">Staff</div></div>`;
        }
        if (flight.total !== undefined) {
            html += `<div class="pax-box total"><div class="count">${flight.total}</div><div class="type">Total Pax</div></div>`;
        }

        html += '</div></div>';
    }

    // ===== SPECIAL ASSISTANCE (combined into one card) =====
    const hasSpecial = (flight.wheelchairs && flight.wheelchairs.length > 0) ||
                       (flight.specialServices && flight.specialServices.length > 0);

    if (hasSpecial) {
        let specialLines = [];

        // Add wheelchairs with full descriptions
        if (flight.wheelchairs) {
            for (const wc of flight.wheelchairs) {
                specialLines.push(`${wc.count}× ${wc.name}`);
            }
        }

        // Add other services
        if (flight.specialServices) {
            for (const svc of flight.specialServices) {
                specialLines.push(`${svc.count}× ${svc.name}`);
            }
        }

        html += `
            <div class="special-box assist">
                <div class="header">♿ Special Assistance</div>
                <div class="details">${specialLines.join(', ')}</div>
            </div>
        `;
    }

    // ===== CONNECTIONS =====

    // Connecting passengers (outbound)
    if (flight.connecting) {
        let connectingHeader = `${flight.connecting.count} Passengers Connecting`;
        let connectingDetails = '';

        if (flight.connecting.breakdown) {
            // Show breakdown in header: "5 (1 Air Canada, 3 Porter, 1 WestJet)"
            const breakdownStr = flight.connecting.breakdown.map(b => `${b.count} ${b.airlineName}`).join(', ');
            connectingHeader = `${flight.connecting.count} Connecting (${breakdownStr})`;
        }

        if (flight.connecting.flight) {
            connectingDetails = `Next flight: ${flight.connecting.flight} at ${flight.connecting.time}${flight.connecting.destinationName ? ` to ${flight.connecting.destinationName}` : ''}`;
        }

        html += `
            <div class="special-box">
                <div class="header">🔄 ${connectingHeader}</div>
                ${connectingDetails ? `<div class="details">${connectingDetails}</div>` : ''}
            </div>
        `;
    }

    // Incoming transfers (from other airlines)
    if (flight.incomingTransfers && flight.incomingTransfers.length > 0) {
        const transferText = flight.incomingTransfers
            .map(t => `${t.count} from ${t.airlineName}`)
            .join(', ');
        html += `
            <div class="special-box">
                <div class="header">🔄 Incoming Transfer Passengers</div>
                <div class="details">${transferText}</div>
            </div>
        `;
    }

    // ===== BAGGAGE & CARGO =====
    const hasBaggageCargo = flight.bags || flight.cargo || flight.cargoNil || flight.cargoTBD || flight.mail || flight.carousel;

    if (hasBaggageCargo) {
        html += '<div class="info-grid">';

        if (flight.bags) {
            html += `
                <div class="info-box">
                    <div class="value">🧳 ${flight.bags}</div>
                    <div class="label">Checked Bags</div>
                </div>
            `;
        }

        if (flight.carousel) {
            let carouselValue = flight.carousel;
            if (flight.carouselNote) carouselValue += ` (${flight.carouselNote})`;
            let carouselLabel = 'Baggage Carousel';
            if (flight.oversizeBelt) carouselLabel += ` · Oversize: ${flight.oversizeBelt}`;
            html += `
                <div class="info-box">
                    <div class="value">🔄 ${carouselValue}</div>
                    <div class="label">${carouselLabel}</div>
                </div>
            `;
        }

        if (flight.cargo) {
            // We split parsing, now display nicely
            // If we have pieces AND weight, show both
            // If only weight, show weight
            
            // Box 1: Weight
            html += `
                <div class="info-box">
                    <div class="value">📦 ${flight.cargo.toLocaleString()} kg</div>
                    <div class="label">Cargo Weight</div>
                </div>
            `;
            
            // Box 2: Pieces (if available)
            if (flight.cargoPieces) {
                html += `
                    <div class="info-box">
                        <div class="value">🧩 ${flight.cargoPieces}</div>
                        <div class="label">Cargo Pieces</div>
                    </div>
                `;
            }
            
        } else if (flight.cargoNil) {
            html += `
                <div class="info-box nil">
                    <div class="value">📦 NIL</div>
                    <div class="label">Cargo</div>
                </div>
            `;
        } else if (flight.cargoTBD) {
            html += `
                <div class="info-box">
                    <div class="value">📦 TBD</div>
                    <div class="label">Cargo</div>
                </div>
            `;
        }

        if (flight.mail) {
            html += `
                <div class="info-box">
                    <div class="value">✉️ ${flight.mail.toLocaleString()} kg</div>
                    <div class="label">Mail</div>
                </div>
            `;
        }

        html += '</div>';
    }

    // Special cargo (lobsters, live animals, etc.)
    if (flight.specialCargo && flight.specialCargo.length > 0) {
        html += `
            <div class="special-box cargo-section">
                <div class="header">⚠️ Special Cargo</div>
                <div class="details">${flight.specialCargo.join('<br>')}</div>
            </div>
        `;
    }
    
    // ===== PRIORITY BAGS (New) =====
    if (flight.priorityBags) {
        html += `
            <div class="special-box">
                <div class="header">🏷️ Priority Bags</div>
                <div class="details">${flight.priorityBags}</div>
            </div>
        `;
    }

    // ===== REMARKS =====
    if (flight.remarks) {
        html += `
            <div class="special-box">
                <div class="header">📝 Remarks</div>
                <div class="details">${flight.remarks}</div>
            </div>
        `;
    }

    return html;
}

// ============================================================================
// EXPORT FUNCTIONS
// ============================================================================

// Store parsed flights for text export
let lastParsedFlights = [];

/**
 * Generate a plain text summary of parsed flights
 */
function generateTextSummary(flights) {
    let text = '';

    flights.forEach((flight, index) => {
        if (index > 0) text += '\n' + '─'.repeat(40) + '\n\n';

        const typeEmoji = flight.type === 'arrival' ? '🛬' : '🛫';
        const typeText = flight.type === 'arrival' ? 'ARRIVING' : 'DEPARTING';

        text += `${typeEmoji} ${typeText}\n`;
        text += `Flight: ${flight.number || 'Unknown'}`;
        if (flight.airlineName) text += ` (${flight.airlineName})`;
        text += '\n';

        if (flight.date) text += `Date: ${flight.date}\n`;

        // Route
        if (flight.origin && flight.destination) {
            text += `Route: ${flight.origin} → ${flight.destination}`;
            text += ` (${flight.originName} → ${flight.destinationName})\n`;
        } else if (flight.country) {
            text += `From: ${flight.country}\n`;
        }

        // Aircraft
        if (flight.registration) {
            text += `Aircraft: ${flight.registration}`;
            if (flight.aircraft) text += ` (${flight.aircraft})`;
            text += '\n';
        }

        // Time
        const time = flight.eta || flight.sta || flight.std || flight.etd;
        let timeLabel = flight.eta ? 'ETA' : flight.sta ? 'STA' : flight.std ? 'STD' : 'ETD';
        // Add local time indicator
        if (flight.etaLocal || flight.staLocal || flight.stdLocal || flight.etdLocal) {
            timeLabel += ' (lt)';
        }
        if (time) text += `${timeLabel}: ${time}\n`;

        // Location
        if (flight.gate) text += `Gate: ${flight.gate}\n`;
        if (flight.towGate) text += `Tow Gate: ${flight.towGate} @ ${flight.towTime || 'TBA'}\n`;
        if (flight.stand) text += `Stand: ${flight.stand}\n`;
        if (flight.counters) text += `Counters: ${flight.counters}\n`;
        if (flight.lateral) text += `Lateral: Belt ${flight.lateral}\n`;

        // Passengers
        if (flight.total || flight.paxBusiness || flight.paxEconomy || flight.paxMain) {
            text += '\nPassengers:\n';
            if (flight.paxBusiness !== undefined) text += `  Business: ${flight.paxBusiness}\n`;
            if (flight.paxEconomy !== undefined) text += `  Economy: ${flight.paxEconomy}\n`;
            if (flight.paxMain !== undefined) text += `  Main/Seats: ${flight.paxMain}\n`;
            if (flight.children !== undefined) text += `  Children: ${flight.children}\n`;
            if (flight.infants !== undefined) text += `  Infants: ${flight.infants}\n`;
            if (flight.staff !== undefined) text += `  Staff: ${flight.staff}\n`;
            if (flight.total !== undefined) text += `  Total: ${flight.total}\n`;
        }

        // Special services
        if (flight.wheelchairs && flight.wheelchairs.length > 0) {
            text += '\nSpecial Assistance:\n';
            flight.wheelchairs.forEach(wc => {
                text += `  ♿ ${wc.count}x ${wc.name} - ${wc.detail}\n`;
            });
        }

        if (flight.specialServices && flight.specialServices.length > 0) {
            if (!flight.wheelchairs) text += '\nSpecial Services:\n';
            flight.specialServices.forEach(svc => {
                text += `  ${svc.icon} ${svc.count}x ${svc.name}\n`;
            });
        }

        // Connections
        if (flight.connecting) {
            let connText = `\nConnecting: ${flight.connecting.count}`;
            if (flight.connecting.breakdown) {
                const breakdownStr = flight.connecting.breakdown.map(b => `${b.count} ${b.airlineName}`).join(', ');
                connText += ` (${breakdownStr})`;
            }
            text += connText;
            
            if (flight.connecting.flight) {
                text += ` → ${flight.connecting.flight} @ ${flight.connecting.time}`;
                if (flight.connecting.destinationName) text += ` to ${flight.connecting.destinationName}`;
            }
            text += '\n';
        }

        if (flight.incomingTransfers && flight.incomingTransfers.length > 0) {
            const transfers = flight.incomingTransfers.map(t => `${t.count} ${t.airlineName}`).join(', ');
            text += `Incoming Transfers: ${transfers}\n`;
        }

        // Baggage & Cargo
        if (flight.bags) {
            text += `\nBags: ${flight.bags}`;
            if (flight.carousel) text += ` (Carousel ${flight.carousel})`;
            text += '\n';
        }
        
        if (flight.priorityBags) {
            text += `Priority Bags: ${flight.priorityBags}\n`;
        }

        if (flight.cargo) {
            text += `Cargo: ${flight.cargo.toLocaleString()} kg`;
            if (flight.cargoPieces) text += ` (${flight.cargoPieces} pcs)`;
            text += '\n';
        } else if (flight.cargoNil) {
            text += `Cargo: NIL\n`;
        } else if (flight.cargoTBD) {
            text += `Cargo: TBD\n`;
        }
        
        if (flight.specialCargo && flight.specialCargo.length > 0) {
            text += `Special Cargo: ${flight.specialCargo.join(', ')}\n`;
        }

        if (flight.mail) {
            text += `Mail: ${flight.mail.toLocaleString()} kg\n`;
        }

        // Remarks
        if (flight.remarks) {
            text += `\nRemarks: ${flight.remarks}\n`;
        }
    });

    return text.trim();
}

/**
 * Copy text summary to clipboard
 */
async function copyToClipboard() {
    try {
        const text = generateTextSummary(lastParsedFlights);

        await navigator.clipboard.writeText(text);

        // Visual feedback
        const label = copyBtn.querySelector('.btn-label');
        const originalText = label.textContent;
        label.textContent = 'Copied!';
        copyBtn.classList.add('success');
        setTimeout(() => {
            label.textContent = originalText;
            copyBtn.classList.remove('success');
        }, 2000);
    } catch (err) {
        console.error('Failed to copy:', err);
        alert('Failed to copy to clipboard');
    }
}

/**
 * Save card as PNG image
 */
async function saveAsPNG() {
    const label = saveBtn.querySelector('.btn-label');
    const originalText = label.textContent;

    try {
        // Show loading state
        label.textContent = 'Saving...';
        saveBtn.disabled = true;

        const cardClone = outputCard.cloneNode(true);
        // Removed fixed width of 420px to allow natural expansion
        // REMOVED padding and background to match display exactly
        cardClone.style.cssText = `
            position: absolute;
            left: -9999px;
            top: 0;
            width: 500px; 
        `;
        document.body.appendChild(cardClone);

        // Increased timeout for robustness
        await new Promise(resolve => setTimeout(resolve, 100));

        const canvas = await html2canvas(cardClone, {
            backgroundColor: null, // Transparent background to respect card border radius
            scale: 2,
            logging: false,
            useCORS: true
        });

        document.body.removeChild(cardClone);

        // Generate filename: squawk-[FLIGHT(S)]-[DATE].png
        let filename = 'squawk';

        // Add flight number(s)
        if (lastParsedFlights.length > 0) {
            const flightNumbers = lastParsedFlights
                .filter(f => f.number)
                .map(f => f.number);

            if (flightNumbers.length === 1) {
                filename += `-${flightNumbers[0]}`;
            } else if (flightNumbers.length > 1) {
                // Turn: combine flight numbers (FI603-FI602)
                filename += `-${flightNumbers.join('-')}`;
            }

            // Add date from first flight that has one
            const flightWithDate = lastParsedFlights.find(f => f.date);
            if (flightWithDate && flightWithDate.date) {
                // Clean date: "Jan 26, 2026" -> "26Jan2026"
                const dateMatch = flightWithDate.date.match(/(\w+)\s+(\d+),?\s*(\d{4})?/);
                if (dateMatch) {
                    const cleanDate = `${dateMatch[2]}${dateMatch[1]}${dateMatch[3] || ''}`;
                    filename += `-${cleanDate}`;
                }
            }
        }

        filename += '.png';

        // Download
        const link = document.createElement('a');
        link.download = filename;
        link.href = canvas.toDataURL('image/png');
        link.click();

        // Visual feedback
        label.textContent = 'Saved!';
        saveBtn.classList.add('success');
        setTimeout(() => {
            label.textContent = originalText;
            saveBtn.disabled = false;
            saveBtn.classList.remove('success');
        }, 2000);

    } catch (err) {
        console.error('Failed to save:', err);
        label.textContent = originalText;
        saveBtn.disabled = false;
        alert('Failed to save as PNG');
    }
}

/**
 * Copy card as PNG image to clipboard
 */
async function copyImageToClipboard() {
    const label = copyImageBtn.querySelector('.btn-label');
    const originalText = label.textContent;

    try {
        // Show loading state
        label.textContent = 'Copying...';
        copyImageBtn.disabled = true;

        // Clone the card for rendering at mobile-friendly width
        const cardClone = outputCard.cloneNode(true);
        cardClone.style.cssText = `
            position: absolute;
            left: -9999px;
            top: 0;
            width: 500px;
        `;
        document.body.appendChild(cardClone);

        // Wait a frame for styles to apply
        await new Promise(resolve => setTimeout(resolve, 100));

        const canvas = await html2canvas(cardClone, {
            backgroundColor: null,
            scale: 2,
            logging: false,
            useCORS: true
        });

        document.body.removeChild(cardClone);

        // Copy to clipboard
        canvas.toBlob(async (blob) => {
            try {
                await navigator.clipboard.write([
                    new ClipboardItem({ 'image/png': blob })
                ]);

                // Visual feedback
                label.textContent = 'Copied!';
                copyImageBtn.classList.add('success');
                setTimeout(() => {
                    label.textContent = originalText;
                    copyImageBtn.disabled = false;
                    copyImageBtn.classList.remove('success');
                }, 2000);
            } catch (clipErr) {
                console.error('Clipboard write failed:', clipErr);
                label.textContent = originalText;
                copyImageBtn.disabled = false;
                alert('Failed to copy image. Try "Save as PNG" instead.');
            }
        }, 'image/png');

    } catch (err) {
        console.error('Failed to copy image:', err);
        label.textContent = originalText;
        copyImageBtn.disabled = false;
        alert('Failed to copy image');
    }
}
