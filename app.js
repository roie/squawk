// Squawk - Airline Ops Message Translator
// Dictionary + regex based parsing (no AI)

// ============================================================================
// DICTIONARIES
// ============================================================================

// Aircraft type codes to full names
const aircraftTypes = {
    // Boeing 737 family
    '7M8': 'Boeing 737 MAX 8',
    '7M9': 'Boeing 737 MAX 9',
    '738': 'Boeing 737-800',
    '73H': 'Boeing 737-800',
    '73W': 'Boeing 737-700',
    '737': 'Boeing 737',
    // Boeing widebody
    '744': 'Boeing 747-400',
    '748': 'Boeing 747-8',
    '763': 'Boeing 767-300',
    '767': 'Boeing 767',
    '772': 'Boeing 777-200',
    '77W': 'Boeing 777-300ER',
    '777': 'Boeing 777',
    '787': 'Boeing 787',
    '788': 'Boeing 787-8',
    '789': 'Boeing 787-9',
    '78X': 'Boeing 787-10',
    // Airbus narrowbody
    '319': 'Airbus A319',
    '320': 'Airbus A320',
    '32N': 'Airbus A320neo',
    '321': 'Airbus A321',
    '32Q': 'Airbus A321neo',
    // Airbus widebody
    '332': 'Airbus A330-200',
    '333': 'Airbus A330-300',
    '339': 'Airbus A330-900neo',
    '359': 'Airbus A350-900',
    '35K': 'Airbus A350-1000',
    '388': 'Airbus A380-800',
    // Regional
    'E75': 'Embraer E175',
    'E90': 'Embraer E190',
    'E95': 'Embraer E195',
    'CR9': 'Bombardier CRJ-900',
    'CRJ': 'Bombardier CRJ',
    'DH4': 'Dash 8-400',
    'AT7': 'ATR 72'
};

// Airline codes (IATA 2-letter)
const airlines = {
    // North America
    'AC': 'Air Canada',
    'WS': 'WestJet',
    'PD': 'Porter Airlines',
    'TS': 'Air Transat',
    'AA': 'American Airlines',
    'UA': 'United Airlines',
    'DL': 'Delta Air Lines',
    'WN': 'Southwest Airlines',
    'B6': 'JetBlue',
    'AS': 'Alaska Airlines',
    'NK': 'Spirit Airlines',
    'F9': 'Frontier Airlines',
    // Europe
    'BA': 'British Airways',
    'LH': 'Lufthansa',
    'AF': 'Air France',
    'KL': 'KLM',
    'IB': 'Iberia',
    'AZ': 'ITA Airways',
    'SK': 'SAS',
    'AY': 'Finnair',
    'FI': 'Icelandair',
    'EI': 'Aer Lingus',
    'LX': 'Swiss',
    'OS': 'Austrian',
    'SN': 'Brussels Airlines',
    'TP': 'TAP Portugal',
    'TK': 'Turkish Airlines',
    'VS': 'Virgin Atlantic',
    // Middle East / Asia
    'EK': 'Emirates',
    'QR': 'Qatar Airways',
    'EY': 'Etihad Airways',
    'SQ': 'Singapore Airlines',
    'CX': 'Cathay Pacific',
    'QF': 'Qantas',
    'NZ': 'Air New Zealand',
    'NH': 'ANA',
    'JL': 'Japan Airlines',
    'KE': 'Korean Air',
    'OZ': 'Asiana Airlines',
    'CI': 'China Airlines',
    'BR': 'EVA Air',
    'MH': 'Malaysia Airlines',
    'TG': 'Thai Airways',
    'AI': 'Air India'
};

// Airport codes (IATA 3-letter)
const airports = {
    // Canada
    'YYZ': 'Toronto Pearson',
    'YVR': 'Vancouver',
    'YUL': 'Montreal',
    'YYC': 'Calgary',
    'YEG': 'Edmonton',
    'YOW': 'Ottawa',
    'YHZ': 'Halifax',
    'YWG': 'Winnipeg',
    // USA - Major hubs
    'JFK': 'New York JFK',
    'LGA': 'New York LaGuardia',
    'EWR': 'Newark',
    'LAX': 'Los Angeles',
    'SFO': 'San Francisco',
    'ORD': 'Chicago O\'Hare',
    'ATL': 'Atlanta',
    'DFW': 'Dallas/Fort Worth',
    'DEN': 'Denver',
    'SEA': 'Seattle',
    'MIA': 'Miami',
    'BOS': 'Boston',
    'IAD': 'Washington Dulles',
    'DCA': 'Washington Reagan',
    'PHX': 'Phoenix',
    'LAS': 'Las Vegas',
    'MCO': 'Orlando',
    'MSP': 'Minneapolis',
    'DTW': 'Detroit',
    'PHL': 'Philadelphia',
    'IAH': 'Houston',
    'SAN': 'San Diego',
    'TPA': 'Tampa',
    'FLL': 'Fort Lauderdale',
    'PDX': 'Portland',
    'HNL': 'Honolulu',
    // Europe
    'LHR': 'London Heathrow',
    'LGW': 'London Gatwick',
    'CDG': 'Paris CDG',
    'ORY': 'Paris Orly',
    'AMS': 'Amsterdam',
    'FRA': 'Frankfurt',
    'MUC': 'Munich',
    'MAD': 'Madrid',
    'BCN': 'Barcelona',
    'FCO': 'Rome',
    'MXP': 'Milan',
    'ZRH': 'Zurich',
    'VIE': 'Vienna',
    'CPH': 'Copenhagen',
    'ARN': 'Stockholm',
    'OSL': 'Oslo',
    'HEL': 'Helsinki',
    'DUB': 'Dublin',
    'LIS': 'Lisbon',
    'BRU': 'Brussels',
    'KEF': 'Reykjavik',
    'IST': 'Istanbul',
    'ATH': 'Athens',
    // Middle East / Asia
    'DXB': 'Dubai',
    'DOH': 'Doha',
    'AUH': 'Abu Dhabi',
    'SIN': 'Singapore',
    'HKG': 'Hong Kong',
    'NRT': 'Tokyo Narita',
    'HND': 'Tokyo Haneda',
    'ICN': 'Seoul Incheon',
    'PEK': 'Beijing',
    'PVG': 'Shanghai',
    'BKK': 'Bangkok',
    'KUL': 'Kuala Lumpur',
    'DEL': 'Delhi',
    'BOM': 'Mumbai',
    // Oceania
    'SYD': 'Sydney',
    'MEL': 'Melbourne',
    'AKL': 'Auckland',
    // Latin America
    'MEX': 'Mexico City',
    'CUN': 'Cancun',
    'GRU': 'São Paulo',
    'EZE': 'Buenos Aires',
    'SCL': 'Santiago',
    'BOG': 'Bogota',
    'LIM': 'Lima'
};

// Wheelchair/mobility assistance codes
const wheelchairTypes = {
    'WCHR': { name: 'Wheelchair (Ramp)', detail: 'can walk to seat' },
    'WCHS': { name: 'Wheelchair (Steps)', detail: 'cannot climb stairs' },
    'WCHC': { name: 'Wheelchair (Cabin)', detail: 'fully immobile' },
    'WCHP': { name: 'Wheelchair (Own)', detail: 'has own wheelchair' },
    'BLND': { name: 'Blind passenger', detail: 'requires assistance' },
    'DEAF': { name: 'Deaf passenger', detail: 'requires assistance' },
    'DPNA': { name: 'Disabled passenger', detail: 'intellectual/developmental' },
    'MAAS': { name: 'Meet & Assist', detail: 'requires escort' }
};

// Special service codes
const specialServices = {
    'UMNR': { name: 'Unaccompanied Minor', icon: '👶' },
    'CHD': { name: 'Child', icon: '🧒' },
    'INF': { name: 'Infant', icon: '👶' },
    'INFT': { name: 'Infant', icon: '👶' },
    'PETC': { name: 'Pet in Cabin', icon: '🐕' },
    'AVIH': { name: 'Animal in Hold', icon: '🐕' },
    'DEPA': { name: 'Deportee (accompanied)', icon: '⚠️' },
    'DEPU': { name: 'Deportee (unaccompanied)', icon: '⚠️' },
    'STCR': { name: 'Stretcher', icon: '🛏️' },
    'MEDA': { name: 'Medical Case', icon: '🏥' },
    'OXYG': { name: 'Oxygen Required', icon: '💨' },
    'VIP': { name: 'VIP', icon: '⭐' },
    'CIP': { name: 'Commercially Important', icon: '⭐' },
    'LANG': { name: 'Language assistance', icon: '🗣️' }
};

// Country flag emoji to country name mapping
const flagToCountry = {
    '🇮🇸': 'Iceland',
    '🇨🇦': 'Canada',
    '🇺🇸': 'United States',
    '🇬🇧': 'United Kingdom',
    '🇩🇪': 'Germany',
    '🇫🇷': 'France',
    '🇪🇸': 'Spain',
    '🇮🇹': 'Italy',
    '🇳🇱': 'Netherlands',
    '🇧🇪': 'Belgium',
    '🇨🇭': 'Switzerland',
    '🇦🇹': 'Austria',
    '🇸🇪': 'Sweden',
    '🇳🇴': 'Norway',
    '🇩🇰': 'Denmark',
    '🇫🇮': 'Finland',
    '🇮🇪': 'Ireland',
    '🇵🇹': 'Portugal',
    '🇬🇷': 'Greece',
    '🇹🇷': 'Turkey',
    '🇦🇪': 'UAE',
    '🇶🇦': 'Qatar',
    '🇸🇬': 'Singapore',
    '🇭🇰': 'Hong Kong',
    '🇯🇵': 'Japan',
    '🇰🇷': 'South Korea',
    '🇨🇳': 'China',
    '🇦🇺': 'Australia',
    '🇳🇿': 'New Zealand',
    '🇲🇽': 'Mexico',
    '🇧🇷': 'Brazil'
};

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
    // - FI603 at start of line (bare flight number)
    const flightPattern = /(?=\*[A-Z]{2}\d{1,4}\*)|(?=🛫\s*[A-Z]{2}\d{1,4})|(?=🛬\s*[A-Z]{2}\d{1,4})|(?=^[A-Z]{2}\d{1,4}\s)/m;

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
    // *FI603*, 🛫FI602, FI603, FI 603
    const flightNumPatterns = [
        /\*([A-Z]{2}\d{1,4})\*/,           // *FI603*
        /🛫\s*([A-Z]{2}\d{1,4})/,          // 🛫FI602
        /🛬\s*([A-Z]{2}\d{1,4})/,          // 🛬FI602
        /(?:^|\n)\s*([A-Z]{2}\d{1,4})\b/,  // FI603 at line start
        /(?:Flight|FLT)[:\s]*([A-Z]{2}\d{1,4})/i  // Flight: FI603
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

    // Date formats: "26 Jan", "Jan 26" (avoid numeric patterns that match counters/times)
    const datePatterns = [
        /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i,
        /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\b/i
    ];

    for (const pattern of datePatterns) {
        const match = block.match(pattern);
        if (match) {
            if (pattern === datePatterns[0]) {
                flight.date = `${match[2]} ${match[1]}`;
            } else {
                flight.date = `${match[1]} ${match[2]}`;
            }
            break;
        }
    }

    // ========== AIRCRAFT ==========

    // Registration: REG:TF-ICJ, REG: TF-ICJ, Registration: TF-ICJ
    const regMatch = block.match(/(?:REG|Registration)[:\s]*([A-Z]{1,2}-?[A-Z0-9]{2,5})/i);
    if (regMatch) {
        flight.registration = regMatch[1].toUpperCase();
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

    // ETA, STA (arrivals)
    const etaMatch = block.match(/ETA[:\s]*(\d{1,2}:\d{2})/i);
    if (etaMatch) flight.eta = etaMatch[1];

    const staMatch = block.match(/STA[:\s]*(\d{1,2}:\d{2})/i);
    if (staMatch) flight.sta = staMatch[1];

    // STD, ETD (departures)
    const stdMatch = block.match(/STD[:\s]*(\d{1,2}:\d{2})/i);
    if (stdMatch) flight.std = stdMatch[1];

    const etdMatch = block.match(/ETD[:\s]*(\d{1,2}:\d{2})/i);
    if (etdMatch) flight.etd = etdMatch[1];

    // Actual times
    const ataMatch = block.match(/ATA[:\s]*(\d{1,2}:\d{2})/i);
    if (ataMatch) flight.ata = ataMatch[1];

    const atdMatch = block.match(/ATD[:\s]*(\d{1,2}:\d{2})/i);
    if (atdMatch) flight.atd = atdMatch[1];

    // ========== LOCATION / GATES ==========

    // Gate: C39A, Gate: **C39A/B39*, GATE C39, Gate: B39
    const gateMatch = block.match(/Gate[:\s*]*\**([\w\d]+(?:\/[\w\d]+)?)\**/i);
    if (gateMatch) {
        flight.gate = gateMatch[1].replace(/\*+/g, '').toUpperCase();
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

    // Carousel: Carousel: 10, Belt: 5 (arrival)
    const carouselMatch = block.match(/Carousel[:\s]*(\d{1,2})(?:\s+(.+?))?(?:\n|$)/i);
    if (carouselMatch) {
        flight.carousel = carouselMatch[1];
        // Check for notes like "might change"
        if (carouselMatch[2] && carouselMatch[2].trim()) {
            flight.carouselNote = carouselMatch[2].trim();
        }
    }

    // ========== CARGO ==========

    // Cargo weight: Cargo: **2195KGS **, CARGO: 1500 KG
    const cargoMatch = block.match(/\*?Cargo\*?[:\s*]*(\d+)\s*(?:KGS?|KG)/i);
    if (cargoMatch) {
        flight.cargo = parseInt(cargoMatch[1]);
    }

    // Cargo NIL: *CARGO* : NIl, Cargo: NIL
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
    const paxLineMatch = block.match(/Pax(?:\s+count)?[:\s]*(.+?)(?:\n|$)/i);

    if (paxLineMatch) {
        const paxLine = paxLineMatch[1];

        // Business/First class: C13, J5, F2
        const businessMatch = paxLine.match(/[CJF](\d+)/i);
        if (businessMatch) flight.paxBusiness = parseInt(businessMatch[1]);

        // Economy: M113, Y95
        const economyMatch = paxLine.match(/[MY](\d+)/i);
        if (economyMatch) flight.paxEconomy = parseInt(economyMatch[1]);

        // Infants: INF1, 2INFT, INFT2 (no space allowed between number and INF)
        const infantMatch = paxLine.match(/(\d+)(?:INF|INFT)|(?:INF|INFT)(\d+)/i);
        if (infantMatch) flight.infants = parseInt(infantMatch[1] || infantMatch[2]);
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

    // Match patterns like: 1WCHR, 2 WCHS, WCHC x 3
    const wchrPattern = /(\d+)\s*(WCHR|WCHS|WCHC|WCHP|BLND|DEAF|DPNA|MAAS)|(?:(WCHR|WCHS|WCHC|WCHP|BLND|DEAF|DPNA|MAAS)\s*[x×]?\s*(\d+))/gi;

    let match;
    while ((match = wchrPattern.exec(block)) !== null) {
        const count = parseInt(match[1] || match[4]) || 1;
        const type = (match[2] || match[3]).toUpperCase();

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
    // Format: Conx Pax6 :first flight 19:45 PD655 LAs
    // Also: CNX: 6 pax to PD655 19:45 LAS
    const conxPatterns = [
        /Conx\s+Pax\s*(\d+)\s*[:\s]*.+?(\d{1,2}:\d{2})\s*([A-Z]{2}\d{1,4})\s*([A-Z]{2,3})/i,
        /(?:Conx|CNX|Connecting)[:\s]*(\d+)\s*(?:pax\s*)?(?:to\s+)?([A-Z]{2}\d{1,4})\s*(?:@\s*)?(\d{1,2}:\d{2})\s*([A-Z]{2,3})?/i
    ];

    for (const pattern of conxPatterns) {
        const match = block.match(pattern);
        if (match) {
            const destCode = (match[4] || '').toUpperCase();
            flight.connecting = {
                count: parseInt(match[1]),
                flight: match[pattern === conxPatterns[0] ? 3 : 2].toUpperCase(),
                time: match[pattern === conxPatterns[0] ? 2 : 3],
                destination: destCode,
                destinationName: airports[destCode] || destCode
            };
            break;
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
        infoBoxes += `
            <div class="info-box">
                <div class="value">🚪 ${flight.gate}</div>
                <div class="label">Arrival Gate</div>
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
        flight.infants !== undefined || flight.children !== undefined || flight.total !== undefined) {

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
        if (flight.total !== undefined) {
            html += `<div class="pax-box total"><div class="count">${flight.total}</div><div class="type">Total Pax</div></div>`;
        }

        html += '</div></div>';
    }

    // ===== SPECIAL ASSISTANCE =====
    if (flight.wheelchairs && flight.wheelchairs.length > 0) {
        for (const wc of flight.wheelchairs) {
            html += `
                <div class="special-box assist">
                    <div class="header">♿ ${wc.count}× Wheelchair Assistance Required</div>
                    <div class="details">${wc.name} — ${wc.detail}</div>
                </div>
            `;
        }
    }

    // Other special services (UMNR, etc)
    if (flight.specialServices && flight.specialServices.length > 0) {
        for (const svc of flight.specialServices) {
            html += `
                <div class="special-box assist">
                    <div class="header">${svc.icon} ${svc.count}× ${svc.name}</div>
                </div>
            `;
        }
    }

    // ===== CONNECTIONS =====

    // Connecting passengers (outbound)
    if (flight.connecting) {
        html += `
            <div class="special-box">
                <div class="header">🔄 ${flight.connecting.count} Passengers Connecting</div>
                <div class="details">Next flight: ${flight.connecting.flight} at ${flight.connecting.time}${flight.connecting.destinationName ? ` to ${flight.connecting.destinationName}` : ''}</div>
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
            html += `
                <div class="info-box">
                    <div class="value">🧳 ${flight.bags}</div>
                    <div class="label">Checked Bags</div>
                </div>
            `;
        }

        if (flight.carousel) {
            html += `
                <div class="info-box">
                    <div class="value">🔄 ${flight.carousel}</div>
                    <div class="label">Baggage Carousel${flight.carouselNote ? ' (' + flight.carouselNote + ')' : ''}</div>
                </div>
            `;
        }

        if (flight.cargo) {
            html += `
                <div class="info-box">
                    <div class="value">📦 ${flight.cargo.toLocaleString()} kg</div>
                    <div class="label">Cargo Weight</div>
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
