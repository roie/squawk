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

    // Split on flight number patterns:
    // - *FI603* (asterisk-wrapped)
    // - 🛫FI602 or 🛬FI602 (emoji prefixed)
    // Split on flight markers:
    // - *FI603* (asterisk-wrapped)
    // - 🛫FI602, 🛬FI602 (emoji prefix)
    // - FI603 at start of line (bare flight number)
    // - Flight: CM470 (explicit label)
    const flightPattern = /(?=\*[A-Z]{2}\d{1,4}\*)|(?=🛫\s*[A-Z]{2}\d{1,4})|(?=🛬\s*[A-Z]{2}\d{1,4})|(?=(?:^|\n)Flight[:\s]+[A-Z]{2}\d{1,4})/m;

    let blocks = normalized.split(flightPattern).filter(b => b.trim());

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

    // Check for arrival indicators using word boundaries
    // Note: Avoid loose patterns like 'ARR ' which match 'CARR ' in 'IN CARR PAX'
    const arrivalPatterns = [
        /\bETA[:\s]/,      // ETA: or ETA followed by space
        /\bSTA[:\s]/,      // STA: or STA followed by space
        /\bARRIVING\b/,    // Full word ARRIVING
        /\bARR:/           // ARR: (time format)
    ];
    for (const pattern of arrivalPatterns) {
        if (pattern.test(upper)) return 'arrival';
    }

    // Check for departure indicators using word boundaries
    const departurePatterns = [
        /\bSTD[:\s]/,      // STD: or STD followed by space
        /\bETD[:\s]/,      // ETD: or ETD followed by space
        /\bDEPARTING\b/,   // Full word DEPARTING
        /\bDEP:/           // DEP: (time format)
    ];
    for (const pattern of departurePatterns) {
        if (pattern.test(upper)) return 'departure';
    }

    // Route format (YYZ-KEF) indicates departure
    if (/[A-Z]{3}\s*[-–—→]\s*[A-Z]{3}/.test(block)) return 'departure';

    // Carousel/baggage claim suggests arrival
    if (/carousel/i.test(block)) return 'arrival';

    // Counters/lateral suggests departure
    if (/counters|lateral/i.test(block)) return 'departure';

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
            // Extract airline code from flight number
            flight.airlineCode = flight.number.match(/^[A-Z]{2}/)[0];
            flight.airlineName = airlines[flight.airlineCode] || null;
            break;
        }
    }

    // ========== DATE ==========

    // Date formats: "26 Jan", "Jan 26", "28JAN26", "Date: 28JAN26"
    const datePatterns = [
        /(\d{1,2})\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*(\d{2,4})?\b/i, // 28JAN26 or 28 Jan 26
        /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*(\d{1,2})(?:\s*,?\s*(\d{2,4}))?\b/i, // Jan 28, 2026
        /Date[:\s]+(\d{1,2})(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(\d{2,4})?/i // Date: 28JAN26
    ];

    for (const pattern of datePatterns) {
        const match = block.match(pattern);
        if (match) {
            if (pattern === datePatterns[2]) {
                // Date: 28JAN26 format
                flight.date = `${match[2]} ${match[1]}`;
            } else if (pattern === datePatterns[0]) {
                flight.date = `${match[2]} ${match[1]}`;
            } else {
                flight.date = `${match[1]} ${match[2]}`;
            }
            break;
        }
    }

    // ========== AIRCRAFT ==========

    // Registration: REG:TF-ICJ, AC REG: HP-1832, Registration: TF-ICJ
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

    // Aircraft type: (7M8), [738], A/C: 320, Type: 789
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

    // ETA, STA (arrivals) - handles "lt" suffix for local time
    const etaMatch = block.match(/ETA[:\s]*(\d{1,2}:\d{2})(?:lt)?/i);
    if (etaMatch) flight.eta = etaMatch[1];

    const staMatch = block.match(/STA[:\s]*(\d{1,2}:\d{2})(?:lt)?/i);
    if (staMatch) flight.sta = staMatch[1];

    // STD, ETD (departures)
    const stdMatch = block.match(/STD[:\s]*(\d{1,2}:\d{2})(?:lt)?/i);
    if (stdMatch) flight.std = stdMatch[1];

    const etdMatch = block.match(/ETD[:\s]*(\d{1,2}:\d{2})(?:lt)?/i);
    if (etdMatch) flight.etd = etdMatch[1];

    // Actual times
    const ataMatch = block.match(/ATA[:\s]*(\d{1,2}:\d{2})(?:lt)?/i);
    if (ataMatch) flight.ata = ataMatch[1];

    const atdMatch = block.match(/ATD[:\s]*(\d{1,2}:\d{2})(?:lt)?/i);
    if (atdMatch) flight.atd = atdMatch[1];

    // ========== LOCATION / GATES ==========

    // Gate: C39A, Gate: **C39A/B39*, Arr Gate: 173// Tow info
    const gatePatterns = [
        /Arr\s*Gate[:\s]*(\d{1,3}[A-Z]?)(?:\s*\/\/\s*Tow[^@]*@\s*([^0-9]*\d{1,2}:\d{2}[^,\n]*))?/i,  // Arr Gate: 173// Tow @ time
        /Gate[:\s*]*\**([\w\d]+(?:\/[\w\d]+)?)\**/i  // Gate: C39A or **C39A/B40*
    ];
    for (const pattern of gatePatterns) {
        const match = block.match(pattern);
        if (match) {
            flight.gate = match[1].replace(/\*+/g, '').toUpperCase();
            // Check for tow info
            if (match[2]) {
                flight.towInfo = match[2].trim();
            }
            break;
        }
    }

    // Check for IFC/tow gate info separately
    const towMatch = block.match(/Tow\s*(?:IFC\s*)?Gate[:\s]*(\d{1,3}[A-Z]?)\s*@?\s*([\d:]+(?:lt)?)?/i);
    if (towMatch && !flight.towInfo) {
        flight.towGate = towMatch[1];
        if (towMatch[2]) flight.towTime = towMatch[2].replace(/lt$/i, '');
    }

    // Stand/Bay: Stand 42, Bay 15
    const standMatch = block.match(/(?:Stand|Bay)[:\s]*(\d{1,3}[A-Z]?)/i);
    if (standMatch) flight.stand = standMatch[1];

    // Route: YYZ-KEF, YYZ → KEF, YYZ to KEF
    const routeMatch = block.match(/([A-Z]{3})\s*[-–—→]\s*([A-Z]{3})/);
    if (routeMatch) {
        flight.origin = routeMatch[1];
        flight.destination = routeMatch[2];
        flight.originName = airports[routeMatch[1]] || routeMatch[1];
        flight.destinationName = airports[routeMatch[2]] || routeMatch[2];
    }

    // Counters (departure): Counters: 419-423, Check-in: 10-15
    const countersMatch = block.match(/(?:Counters?|Check-?in)[:\s]*(\d{1,3}(?:\s*[-–]\s*\d{1,3})?)/i);
    if (countersMatch) flight.counters = countersMatch[1].replace(/\s+/g, '');

    // Lateral/Belt (departure baggage drop): Lateral:15, Belt: 3
    const lateralMatch = block.match(/(?:Lateral|Belt)[:\s]*(\d{1,2})/i);
    if (lateralMatch) flight.lateral = lateralMatch[1];

    // ========== PASSENGERS ==========

    // Parse passenger counts - multiple formats supported
    parsePassengers(block, flight);

    // ========== SPECIAL SERVICES ==========

    // Parse wheelchair and mobility assistance
    parseWheelchairs(block, flight);

    // Parse other special services (UMNR, etc)
    parseSpecialServices(block, flight);

    // ========== CONNECTIONS ==========

    // Connecting passengers: Conx Pax6 :first flight 19:45 PD655 LAs
    parseConnections(block, flight);

    // Incoming transfers: IN CARR PAX : 3AC ,5PD
    parseIncomingTransfers(block, flight);

    // ========== BAGGAGE ==========

    // Bags count: Bags: 107, Baggage: 95
    const bagsMatch = block.match(/(?:Bags?|Baggage)[:\s]*(\d+)/i);
    if (bagsMatch) flight.bags = parseInt(bagsMatch[1]);

    // Carousel: Carousel: 10, Carousel: 9might change, *Carousel*: 12 *OVZ*: D
    const carouselMatch = block.match(/\*?Carousel\*?[:\s]*(\d{1,2})\s*([a-z]+[^\n*]*)?(?:\s*\*?OVZ\*?[:\s]*([A-Z]))?/i);
    if (carouselMatch) {
        flight.carousel = carouselMatch[1];
        // Check for notes like "might change"
        if (carouselMatch[2] && carouselMatch[2].trim()) {
            flight.carouselNote = carouselMatch[2].trim();
        }
        // Check for oversize baggage area
        if (carouselMatch[3]) {
            flight.oversizeBelt = carouselMatch[3];
        }
    }

    // XQS (bags count in Copa format): XQS: 148 BIN 1,2 & 3
    const xqsMatch = block.match(/\*?XQS\*?[:\s]*(\d+)(?:\s+BIN\s*([^\n]+))?/i);
    if (xqsMatch) {
        if (!flight.bags) flight.bags = parseInt(xqsMatch[1]);
        if (xqsMatch[2]) flight.bagsBin = xqsMatch[2].trim();
    }

    // Priority bags: "Priority Bags" followed by counts
    const priorityMatch = block.match(/Priority\s*Bags[:\s]*\n?\s*(\d+[^\n]+)/i);
    if (priorityMatch) {
        flight.priorityBags = priorityMatch[1].trim();
    }

    // ========== CARGO ==========

    // Cargo weight: Cargo: **2195KGS **, CARGO: 1500 KG, CARGO: 98 Pzs/ 2,062.00 Kgs
    const cargoPatterns = [
        /\*?Cargo\*?[:\s*]*(\d+)\s*(?:KGS?|KG)\b/i,  // 2195KGS
        /\*?Cargo\*?[:\s*]*\d+\s*(?:Pzs?|pcs)[\/\s]*([0-9,\.]+)\s*(?:KGS?|KG)/i,  // 98 Pzs/ 2,062.00 Kgs
        /TOTAL[=:\s]*\d+\s*pcs[^0-9]*([0-9,\.]+)\s*kg/i,  // TOTAL =31 pcs 592.0 kg
        /([0-9,\.]+)\s*kg\s*$/im  // 592.0 kg at end of line
    ];

    for (const pattern of cargoPatterns) {
        const match = block.match(pattern);
        if (match && !flight.cargo) {
            flight.cargo = parseFloat(match[1].replace(/,/g, ''));
            break;
        }
    }

    // Cargo pieces count
    const cargoPcsMatch = block.match(/\*?Cargo\*?[:\s*]*(\d+)\s*(?:Pzs?|pcs)/i);
    if (cargoPcsMatch) {
        flight.cargoPieces = parseInt(cargoPcsMatch[1]);
    }

    // Special cargo items (lobsters, live animals, consolidation, etc.)
    const specialCargoItems = [];

    // Live lobsters: "30pcs LIVELOBSTERS" or "30 pcs LIVE LOBSTERS"
    const lobsterMatch = block.match(/(\d+)\s*(?:pcs?)?\s*(LIVE\s*LOBSTERS?|LIVELOBSTERS?)/i);
    if (lobsterMatch) {
        specialCargoItems.push(`🦞 ${lobsterMatch[1]} Live Lobsters`);
    }

    // Live animals
    const animalMatch = block.match(/(\d+)\s*(?:pcs?)?\s*(LIVE\s*ANIMALS?|AVI)/i);
    if (animalMatch) {
        specialCargoItems.push(`🐾 ${animalMatch[1]} Live Animals`);
    }

    // Consolidation shipments
    const consolidationMatch = block.match(/(\d+)\s*(?:pcs?)?\s*CONSOLIDATION/i);
    if (consolidationMatch) {
        specialCargoItems.push(`📦 ${consolidationMatch[1]} Consolidation`);
    }

    // Dangerous goods
    const dgrMatch = block.match(/(\d+)\s*(?:pcs?)?\s*(?:DGR|DANGEROUS\s*GOODS)/i);
    if (dgrMatch) {
        specialCargoItems.push(`⚠️ ${dgrMatch[1]} Dangerous Goods`);
    }

    if (specialCargoItems.length > 0) {
        flight.specialCargo = specialCargoItems;
    }

    // Parse multi-line cargo section for total weight
    const multiCargoMatch = block.match(/\*?CARGO\*?\s*:[^\d]*\n[\s\S]*?(?:TOTAL\s*=?\s*)?(\d+)\s*(?:pcs?)[\s\S]*?([\d,\.]+)\s*kg/i);
    if (multiCargoMatch && !flight.cargo) {
        flight.cargoPieces = parseInt(multiCargoMatch[1]);
        flight.cargo = parseFloat(multiCargoMatch[2].replace(/,/g, ''));
    }

    // Cargo NIL: *CARGO* : NIl, Cargo: NIL, *CARGO* : (followed by nothing meaningful)
    if (/\*?Cargo\*?[:\s*]*NIL/i.test(block)) {
        flight.cargoNil = true;
    }

    // Mail
    const mailMatch = block.match(/Mail[:\s]*(\d+)\s*(?:KGS?|KG)/i);
    if (mailMatch) flight.mail = parseInt(mailMatch[1]);

    // ========== COUNTRY / ORIGIN ==========

    // Country flag emoji
    const flagMatch = block.match(/[\u{1F1E0}-\u{1F1FF}]{2}/u);
    if (flagMatch) {
        flight.flag = flagMatch[0];
        flight.country = flagToCountry[flagMatch[0]] || null;
    }

    // ========== REMARKS / NOTES ==========

    // Delay reason, remarks
    const remarksMatch = block.match(/(?:Remarks?|Notes?|Delay)[:\s]*(.+?)(?:\n|$)/i);
    if (remarksMatch) {
        flight.remarks = remarksMatch[1].trim();
    }

    return flight;
}

/**
 * Parse passenger counts from various formats
 */
function parsePassengers(block, flight) {
    // Format 1: "Pax count: C13 M113 INF1" or "Pax: C7 M130 2INFT"
    let paxLineMatch = block.match(/Pax(?:\s+count)?[:\s]*(.+?)(?:\n|$)/i);

    // Format 2: "Pax OB: 160 + 03 INF" (on board with infants separated)
    const paxOBMatch = block.match(/Pax\s*OB[:\s]*(\d+)\s*\+\s*(\d+)\s*INF/i);
    if (paxOBMatch) {
        flight.total = parseInt(paxOBMatch[1]) + parseInt(paxOBMatch[2]);
        flight.infants = parseInt(paxOBMatch[2]);
        // Main count is total - infants
        const mainPax = parseInt(paxOBMatch[1]);
        flight.paxEconomy = mainPax; // Assume economy if not broken down
    }

    if (paxLineMatch && !paxOBMatch) {
        const paxLine = paxLineMatch[1];

        // Business/First class: C13, J5, F2
        const businessMatch = paxLine.match(/[CJF](\d+)/i);
        if (businessMatch) flight.paxBusiness = parseInt(businessMatch[1]);

        // Economy: M113, Y95
        const economyMatch = paxLine.match(/[MY](\d+)/i);
        if (economyMatch) flight.paxEconomy = parseInt(economyMatch[1]);

        // Infants: INF1, 2INFT, INFT2, 1INFT (no space allowed between number and INF)
        const infantMatch = paxLine.match(/(\d+)(?:INF|INFT)|(?:INF|INFT)(\d+)/i);
        if (infantMatch) flight.infants = parseInt(infantMatch[1] || infantMatch[2]);

        // Staff/Crew: 2ID, ID2
        const staffMatch = paxLine.match(/(\d+)\s*ID\b|ID\s*(\d+)/i);
        if (staffMatch) flight.staff = parseInt(staffMatch[1] || staffMatch[2]);
    }

    // Also check for standalone class counts in block
    if (flight.paxBusiness === undefined) {
        const businessAlt = block.match(/\bC(\d+)\b/);
        if (businessAlt) flight.paxBusiness = parseInt(businessAlt[1]);
    }

    if (flight.paxEconomy === undefined) {
        const economyAlt = block.match(/\bM(\d+)\b/);
        if (economyAlt) flight.paxEconomy = parseInt(economyAlt[1]);
    }

    // Check for infants in block if not found yet: "+ 03 INF" or "03 INF"
    if (flight.infants === undefined) {
        const infBlockMatch = block.match(/\+\s*(\d+)\s*INF|\b(\d+)\s*INF\b/i);
        if (infBlockMatch) {
            flight.infants = parseInt(infBlockMatch[1] || infBlockMatch[2]);
        }
    }

    // Children: CHD3, 2CHD
    const childMatch = block.match(/(\d+)\s*CHD|CHD\s*(\d+)/i);
    if (childMatch) flight.children = parseInt(childMatch[1] || childMatch[2]);

    // Total: TTL=127, TTL: 139, TOTAL: 150
    const ttlMatch = block.match(/(?:TTL|TOTAL)\s*[=:]\s*(\d+)/i);
    if (ttlMatch) flight.total = parseInt(ttlMatch[1]);

    // Calculate total if not provided
    if (!flight.total && (flight.paxBusiness || flight.paxEconomy)) {
        flight.total = (flight.paxBusiness || 0) + (flight.paxEconomy || 0) + (flight.infants || 0);
    }
}

/**
 * Parse wheelchair and mobility assistance codes
 */
function parseWheelchairs(block, flight) {
    const wheelchairs = [];

    // Match patterns like: 1WCHR, 2 WCHS, WCHC x 3, WCHC: 9R (type with seat)
    const wchrPattern = /(\d+)\s*(WCHR|WCHS|WCHC|WCHP|BLND|DEAF|DPNA|MAAS)|(?:(WCHR|WCHS|WCHC|WCHP|BLND|DEAF|DPNA|MAAS)[:\s]*(\d+)?[A-Z]?)/gi;

    let match;
    const foundTypes = new Set();
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
 * Render a single flight to HTML
 * Focus: CLARITY - turning chaos into readable information
 */
function renderSingleFlight(flight) {
    const isArrival = flight.type === 'arrival';
    const headerClass = isArrival ? 'arriving' : 'departing';
    const headerIcon = isArrival ? '🛬' : '🛫';
    const headerText = isArrival ? 'ARRIVING' : 'DEPARTING';

    // Build origin/destination display
    let routeDisplay = '';
    if (flight.origin && flight.destination) {
        routeDisplay = `${flight.origin} → ${flight.destination} (${flight.originName} → ${flight.destinationName})`;
    } else if (flight.country && flight.flag) {
        routeDisplay = `from ${flight.country} ${flight.flag}`;
    } else if (flight.flag) {
        routeDisplay = `${flight.flag}`;
    }

    let html = `
        <div class="section-header ${headerClass}">
            ${headerIcon} ${headerText}
        </div>
        <div class="flight-title">
            <div>
                <div class="flight-number">✈️ ${flight.number || 'Unknown'}</div>
                ${routeDisplay ? `<div class="flight-origin">${routeDisplay}</div>` : ''}
            </div>
            ${flight.date ? `<div class="flight-date">${flight.date}</div>` : ''}
        </div>
    `;

    // ===== FLIGHT INFO (Aircraft, Gate, Time) =====
    let infoBoxes = '';

    // Aircraft registration and type
    if (flight.registration) {
        infoBoxes += `
            <div class="info-box">
                <div class="value">✈️ ${flight.registration}</div>
                <div class="label">${flight.aircraft || 'Aircraft'}</div>
            </div>
        `;
    }

    // Gate (arrivals)
    if (flight.gate) {
        let gateLabel = 'Arrival Gate';
        if (flight.towGate) {
            gateLabel += ` → Tow to ${flight.towGate}`;
            if (flight.towTime) gateLabel += ` @ ${flight.towTime}`;
        }
        infoBoxes += `
            <div class="info-box">
                <div class="value">🚪 ${flight.gate}</div>
                <div class="label">${gateLabel}</div>
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
                <div class="label">Check-in Counters</div>
            </div>
        `;
    }

    // Time (scheduled)
    const time = flight.eta || flight.sta || flight.std || flight.etd;
    const timeLabel = flight.eta ? 'Estimated Arrival' : flight.sta ? 'Scheduled Arrival' : flight.std ? 'Scheduled Departure' : flight.etd ? 'Estimated Departure' : '';
    if (time) {
        infoBoxes += `
            <div class="info-box">
                <div class="value">🕐 ${time}</div>
                <div class="label">${timeLabel}</div>
            </div>
        `;
    }

    // Actual time
    const actualTime = flight.ata || flight.atd;
    const actualLabel = flight.ata ? 'Actual Arrival' : 'Actual Departure';
    if (actualTime) {
        infoBoxes += `
            <div class="info-box">
                <div class="value">✅ ${actualTime}</div>
                <div class="label">${actualLabel}</div>
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
        flight.total !== undefined || flight.staff !== undefined) {

        html += '<div class="pax-section"><div class="pax-section-label">👥 Passengers on Board</div><div class="pax-grid">';

        if (flight.paxBusiness !== undefined) {
            html += `<div class="pax-box"><div class="count">${flight.paxBusiness}</div><div class="type">Business</div></div>`;
        }
        if (flight.paxEconomy !== undefined) {
            html += `<div class="pax-box"><div class="count">${flight.paxEconomy}</div><div class="type">Economy</div></div>`;
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
    const hasBaggageCargo = flight.bags || flight.cargo || flight.cargoNil || flight.mail || flight.carousel;

    if (hasBaggageCargo) {
        html += '<div class="info-grid">';

        if (flight.bags) {
            let bagsDisplay = `${flight.bags}`;
            if (flight.bagsBin) bagsDisplay += ` (Bins ${flight.bagsBin})`;
            let bagsLabel = 'Checked Bags';
            if (flight.priorityBags) bagsLabel += ` • Priority: ${flight.priorityBags}`;
            html += `
                <div class="info-box">
                    <div class="value">🧳 ${bagsDisplay}</div>
                    <div class="label">${bagsLabel}</div>
                </div>
            `;
        }

        if (flight.carousel) {
            let carouselDisplay = `${flight.carousel}`;
            if (flight.oversizeBelt) carouselDisplay += ` (Oversize Area ${flight.oversizeBelt})`;
            let carouselLabel = 'Baggage Carousel';
            if (flight.carouselNote) carouselLabel += ` (${flight.carouselNote})`;
            html += `
                <div class="info-box">
                    <div class="value">🔄 ${carouselDisplay}</div>
                    <div class="label">${carouselLabel}</div>
                </div>
            `;
        }

        if (flight.cargo) {
            let cargoLabel = 'Cargo Weight';
            if (flight.cargoPieces) cargoLabel += ` (${flight.cargoPieces} pcs)`;
            html += `
                <div class="info-box">
                    <div class="value">📦 ${flight.cargo.toLocaleString()} kg</div>
                    <div class="label">${cargoLabel}</div>
                </div>
            `;
        }

        if (flight.cargoNil) {
            html += `
                <div class="info-box nil">
                    <div class="value">📦 None</div>
                    <div class="label">No Cargo</div>
                </div>
            `;
        }

        if (flight.specialCargo && flight.specialCargo.length > 0) {
            html += `
                <div class="info-box special-cargo">
                    <div class="value">${flight.specialCargo.join(', ')}</div>
                    <div class="label">Special Cargo</div>
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
        const timeLabel = flight.eta ? 'ETA' : flight.sta ? 'STA' : flight.std ? 'STD' : 'ETD';
        if (time) text += `${timeLabel}: ${time}\n`;

        // Location
        if (flight.gate) text += `Gate: ${flight.gate}\n`;
        if (flight.counters) text += `Counters: ${flight.counters}\n`;
        if (flight.lateral) text += `Lateral: Belt ${flight.lateral}\n`;

        // Passengers
        if (flight.total || flight.paxBusiness || flight.paxEconomy) {
            text += '\nPassengers:\n';
            if (flight.paxBusiness !== undefined) text += `  Business: ${flight.paxBusiness}\n`;
            if (flight.paxEconomy !== undefined) text += `  Economy: ${flight.paxEconomy}\n`;
            if (flight.children !== undefined) text += `  Children: ${flight.children}\n`;
            if (flight.infants !== undefined) text += `  Infants: ${flight.infants}\n`;
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
            text += `\nConnecting: ${flight.connecting.count} pax → ${flight.connecting.flight}`;
            text += ` @ ${flight.connecting.time}`;
            if (flight.connecting.destinationName) text += ` to ${flight.connecting.destinationName}`;
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

        if (flight.cargo) {
            text += `Cargo: ${flight.cargo.toLocaleString()} kg\n`;
        } else if (flight.cargoNil) {
            text += `Cargo: NIL\n`;
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

        // Clone the card for rendering
        const cardClone = outputCard.cloneNode(true);
        cardClone.style.cssText = `
            position: absolute;
            left: -9999px;
            top: 0;
            animation: none;
        `;
        document.body.appendChild(cardClone);

        // Wait a frame for styles to apply
        await new Promise(resolve => setTimeout(resolve, 50));

        // Render to canvas - just the card, no wrapper
        const canvas = await html2canvas(cardClone, {
            backgroundColor: null,
            scale: 2,
            logging: false,
            useCORS: true,
            allowTaint: true
        });

        // Clean up
        document.body.removeChild(cardClone);

        // Generate filename with flight number if available
        let filename = 'squawk';
        if (lastParsedFlights.length > 0 && lastParsedFlights[0].number) {
            filename += `-${lastParsedFlights[0].number}`;
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

        // Clone the card for rendering
        const cardClone = outputCard.cloneNode(true);
        cardClone.style.cssText = `
            position: absolute;
            left: -9999px;
            top: 0;
            animation: none;
        `;
        document.body.appendChild(cardClone);

        // Wait a frame for styles to apply
        await new Promise(resolve => setTimeout(resolve, 50));

        // Render to canvas - just the card, no wrapper
        const canvas = await html2canvas(cardClone, {
            backgroundColor: null,
            scale: 2,
            logging: false,
            useCORS: true,
            allowTaint: true
        });

        // Clean up
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
