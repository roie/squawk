import { aircraftTypes, airlines, airports, wheelchairTypes, specialServices, flagToCountry } from './dictionaries.js';
import { sanitizeInput, fuzzyCorrectLabels } from './scanner.js';

/**
 * Detect flight type based on keywords
 */
export function detectFlightType(block) {
    if (/\bETA[:\s]/i.test(block)) return 'arrival';
    if (/\bSTA[:\s]/i.test(block)) return 'arrival';
    if (/\bSTD[:\s]/i.test(block)) return 'departure';
    if (/\bETD[:\s]/i.test(block)) return 'departure';
    if (/Carousel[:\s]/i.test(block)) return 'arrival';
    if (/Arr\s*Gate/i.test(block)) return 'arrival';
    if (/Tow\s*(Gate|IFC)/i.test(block)) return 'arrival';
    if (/Counters?[:\s]/i.test(block)) return 'departure';
    if (/Lateral[:\s]/i.test(block)) return 'departure';
    if (/[A-Z]{3}\s*[-–—→]\s*[A-Z]{3}/.test(block)) return 'departure';
    if (block.includes('🛬')) return 'arrival';
    if (block.includes('🛫')) return 'departure';
    return 'unknown';
}

/**
 * Parse passenger counts
 */
export function parsePassengers(block, flight) {
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

        const simpleCount = line.match(/^\s*(\d+)\s*$/);
        if (simpleCount && !flight.paxBusiness && !flight.paxEconomy && !flight.paxMain) {
            flight.paxMain = parseInt(simpleCount[1]);
            flight.total = flight.paxMain + (flight.infants || 0);
        }
    }

    const ttlMatch = block.match(/\b(?:TTL|TOTAL)\s*[=:]\s*(\d+)\b(?!\s*(?:pcs|pzs|pieces?|kg|kgs|kilos|lbs))/i);
    if (ttlMatch) flight.total = parseInt(ttlMatch[1]);

    if (!flight.total && (flight.paxBusiness || flight.paxEconomy)) {
        flight.total = (flight.paxBusiness || 0) + (flight.paxEconomy || 0) + (flight.infants || 0);
    }
}

/**
 * Parse wheelchairs
 */
export function parseWheelchairs(block, flight) {
    const wheelchairs = [];
    const foundTypes = new Set();
    const shorthandMatch = block.match(/(?:WCHC|WCHR|WCHS|WCH)[:\s]*(\d+)\s*([RCS])(?:\s*[\+&]\s*(\d+)\s*([RCS]))?/i);
    if (shorthandMatch) {
        const typeMap = { 'R': 'WCHR', 'C': 'WCHC', 'S': 'WCHS' };
        const count1 = parseInt(shorthandMatch[1]) || 0;
        const type1 = typeMap[shorthandMatch[2].toUpperCase()];
        if (count1 > 0 && type1 && wheelchairTypes[type1]) {
            wheelchairs.push({ count: count1, type: type1, name: wheelchairTypes[type1].name });
            foundTypes.add(type1);
        }
        if (shorthandMatch[3] && shorthandMatch[4]) {
            const count2 = parseInt(shorthandMatch[3]) || 0;
            const type2 = typeMap[shorthandMatch[4].toUpperCase()];
            if (count2 > 0 && type2 && wheelchairTypes[type2]) {
                wheelchairs.push({ count: count2, type: type2, name: wheelchairTypes[type2].name });
                foundTypes.add(type2);
            }
        }
        foundTypes.add('WCHR'); foundTypes.add('WCHC'); foundTypes.add('WCHS');
    }

    const standardPattern = /(\d+)\s*(WCHR|WCHS|WCHC|WCHP|BLND|DEAF|DPNA|MAAS)\b|\b(WCHR|WCHS|WCHC|WCHP|BLND|DEAF|DPNA|MAAS)[:\s]+(\d+)/gi;
    let match;
    while ((match = standardPattern.exec(block)) !== null) {
        const type = (match[2] || match[3]).toUpperCase();
        if (foundTypes.has(type)) continue;
        foundTypes.add(type);
        const count = parseInt(match[1] || match[4]) || 1;
        if (wheelchairTypes[type]) wheelchairs.push({ count, type, name: wheelchairTypes[type].name });
    }
    if (wheelchairs.length > 0) flight.wheelchairs = wheelchairs;
}

/**
 * Parse special services
 */
export function parseSpecialServices(block, flight) {
    const services = [];
    for (const [code, info] of Object.entries(specialServices)) {
        if (code === 'INF' || code === 'INFT') continue;
        const pattern = new RegExp(`(\\d+)\\s*${code}|${code}\\s*[x×]?\\s*(\\d+)`, 'gi');
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
export function parseConnections(block, flight) {
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
export function parseIncomingTransfers(block, flight) {
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
export function parseBaggageAndCargo(block, flight) {
    const xqsMatch = block.match(/XQS[:\s]*(\d+)(?:\s+BIN\s*([^\n]+))?/i);
    if (xqsMatch) {
        flight.bags = parseInt(xqsMatch[1]);
        if (xqsMatch[2]) flight.bagsBin = xqsMatch[2].trim();
    }
    if (!flight.bags) {
        const bagsMatch = block.match(/(?<!Priority\s)Bags?[:\s]*(\d+)/i);
        if (bagsMatch) flight.bags = parseInt(bagsMatch[1]);
    }
    const carouselMatch = block.match(/Carousel[:\s]*(\d{1,2})\s*([a-z].*)?/i);
    if (carouselMatch) {
        flight.carousel = carouselMatch[1];
        if (carouselMatch[2] && !/OVZ/i.test(carouselMatch[2])) {
            flight.carouselNote = carouselMatch[2].trim();
        }
    }
    const ovzMatch = block.match(/OVZ[:\s]*([A-Z])/i);
    if (ovzMatch) flight.oversizeBelt = ovzMatch[1];
    
    const cargoBlockMatch = block.match(/CARGO\s*:([\s\S]*?)(?=(?:STD|ETD|Pax[:\s]|Special[:\s]|IN\s*CARR|Counters|Lateral|$))/i);
    let specialItems = [];
    if (cargoBlockMatch) {
        const cargoText = cargoBlockMatch[1];
        const totalPcsMatch = cargoText.match(/TOTAL\s*[=:]\s*(\d+)\s*(?:pcs|pzs|pieces?)/i);
        if (totalPcsMatch) flight.cargoPieces = parseInt(totalPcsMatch[1]);
        const totalKgMatch = cargoText.match(/(\d+(?:[.,]\d+)?)\s*kgs?/i);
        if (totalKgMatch) flight.cargo = parseFloat(totalKgMatch[1].replace(/,/g, ''));
        const lines = cargoText.split('\n').map(l => l.trim()).filter(l => l);
        for (const line of lines) {
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
    const pcsKg = block.match(/(\d+)\s*(?:pcs|pzs|pc|pieces?)\s*[\/\s]+\s*([0-9,.]+)\s*kgs?/i);
    if (pcsKg) {
        if (!flight.cargoPieces) flight.cargoPieces = parseInt(pcsKg[1]);
        if (!flight.cargo) flight.cargo = parseFloat(pcsKg[2].replace(/,/g, ''));
    }
    if (!flight.cargo) {
        const simpleKg = block.match(/Cargo[:\s]*([0-9,.]+)\s*kgs?/i);
        if (simpleKg) flight.cargo = parseFloat(simpleKg[1].replace(/,/g, ''));
    }
    if (specialItems.length === 0) {
        const lobsters = block.match(/(\d+)\s*(?:pcs|pzs)?\s*(?:LIVE\s*)?LOBSTERS/i);
        if (lobsters) specialItems.push(`🦞 ${lobsters[1]} Live Lobsters`);
        const consol = block.match(/(\d+)\s*(?:pcs|pc|pzs)?\s*CONSOLIDATION/i);
        if (consol) specialItems.push(`📦 ${consol[1]} Consolidation`);
    }
    if (specialItems.length > 0) flight.specialCargo = specialItems;
    if (/Cargo[:\s]*NIL/i.test(block)) flight.cargoNil = true;
    if (/Cargo[:\s]*TBD/i.test(block)) flight.cargoTBD = true;
}

/**
 * Main parser for a single flight block
 */
export function parseSingleFlight(block) {
    const sanitized = sanitizeInput(block);
    const corrected = fuzzyCorrectLabels(sanitized);

    const flight = {
        type: detectFlightType(corrected),
        raw: block
    };

    const flightNumPatterns = [
        /🛫\s*([A-Z]{2}\d{1,4})/,
        /🛬\s*([A-Z]{2}\d{1,4})/,
        /(?:Flight|FLT)[:\s]*([A-Z]{2}\d{1,4})/i,
        /^([A-Z]{2}\d{1,4})\s+[\u{1F1E6}-\u{1F1FF}]/mu,
        /(?:^|\n)\s*([A-Z]{2}\d{1,4})\s+[A-Z]{3}-[A-Z]{3}/m,
        /(?:^|\n)\s*([A-Z]{2}\d{1,4})\b/
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

    const regMatch = corrected.match(/(?:AC\s*)?REG[:\s]*([A-Z]{1,2}-?[A-Z0-9]{2,5})/i) || corrected.match(/Registration[:\s]*([A-Z]{1,2}-?[A-Z0-9]{2,5})/i);
    if (regMatch) flight.registration = regMatch[1].toUpperCase();
    const acMatch = corrected.match(/\((\d{2,3}[A-Z]?|[A-Z]\d{2}|7M[89]|E\d{2}|CR[9J]|DH4|AT7)\)/i) || corrected.match(/(?:A\/C|Aircraft|Type)[:\s]*(\d{2,3}[A-Z]?|[A-Z]\d{2}|7M[89])/i);
    if (acMatch) { flight.aircraftCode = acMatch[1].toUpperCase(); flight.aircraft = aircraftTypes[flight.aircraftCode] || flight.aircraftCode; }

    const extractTime = (regex) => {
        const m = corrected.match(regex);
        return m ? { time: m[1], local: m[0].toLowerCase().includes('lt') } : null;
    };
    const eta = extractTime(/ETA[:\s]*(\d{1,2}:\d{2})(?:lt)?/i); if (eta) { flight.eta = eta.time; flight.etaLocal = eta.local; }
    const sta = extractTime(/STA[:\s]*(\d{1,2}:\d{2})(?:lt)?/i); if (sta) { flight.sta = sta.time; flight.staLocal = sta.local; }
    const std = extractTime(/STD[:\s]*(\d{1,2}:\d{2})(?:lt)?/i); if (std) { flight.std = std.time; flight.stdLocal = std.local; }
    const etd = extractTime(/ETD[:\s]*(\d{1,2}:\d{2})(?:lt)?/i); if (etd) { flight.etd = etd.time; flight.etdLocal = etd.local; }

    const gateMatch = corrected.match(/Arr\s*Gate[:\s]*([A-Z0-9]+(?:\s*\/\s*[A-Z0-9]+)?)/i) ||
                      corrected.match(/Gate[:\s]*([A-Z0-9]+(?:\/[A-Z0-9]+)?)/i);
    if (gateMatch) flight.gate = gateMatch[1].replace(/\s+/g, '').toUpperCase();
    const towMatch = corrected.match(/Tow\s*(?:IFC\s*)?Gate[:\s]*([A-Z0-9]+)\s*@\s*(\d{1,2}:\d{2})(?:lt)?/i);
    if (towMatch) { flight.towGate = towMatch[1]; flight.towTime = towMatch[2]; }

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
