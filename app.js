// Squawk - Airline Ops Message Translator
// Dictionary + regex based parsing (no AI)

// DOM Elements
const inputText = document.getElementById('input-text');
const translateBtn = document.getElementById('translate-btn');
const copyBtn = document.getElementById('copy-btn');
const saveBtn = document.getElementById('save-btn');
const outputSection = document.getElementById('output-section');
const cardBody = document.getElementById('card-body');
const outputCard = document.getElementById('output-card');

// Dictionaries for translation
const aircraftTypes = {
    '7M8': 'Boeing 737 MAX 8',
    '73H': 'Boeing 737-800',
    '320': 'Airbus A320',
    '321': 'Airbus A321',
    '789': 'Boeing 787-9',
    '77W': 'Boeing 777-300ER',
    '359': 'Airbus A350-900',
    '388': 'Airbus A380-800'
};

const airlines = {
    'AC': 'Air Canada',
    'PD': 'Porter Airlines',
    'WS': 'WestJet',
    'AA': 'American Airlines',
    'UA': 'United',
    'DL': 'Delta',
    'FI': 'Icelandair',
    'BA': 'British Airways',
    'LH': 'Lufthansa'
};

const airports = {
    'YYZ': 'Toronto',
    'KEF': 'Reykjavik',
    'JFK': 'New York',
    'LAX': 'Los Angeles',
    'LHR': 'London Heathrow',
    'LAS': 'Las Vegas',
    'ORD': 'Chicago',
    'SFO': 'San Francisco',
    'MIA': 'Miami',
    'SEA': 'Seattle'
};

const wheelchairTypes = {
    'WCHR': { name: 'Wheelchair', detail: 'can walk to seat' },
    'WCHS': { name: 'Wheelchair', detail: 'cannot climb stairs' },
    'WCHC': { name: 'Wheelchair', detail: 'fully immobile' }
};

// Event listeners
translateBtn.addEventListener('click', translate);
copyBtn.addEventListener('click', copyToClipboard);
saveBtn.addEventListener('click', saveAsPNG);

// Main translate function
function translate() {
    const input = inputText.value.trim();
    if (!input) return;

    const flights = parseFlights(input);
    if (flights.length === 0) return;

    renderFlights(flights);

    outputSection.style.display = 'block';
    copyBtn.disabled = false;
    saveBtn.disabled = false;
}

// Parse input into flight objects
function parseFlights(input) {
    // Split on flight number patterns
    const flightPattern = /(?=\*[A-Z]{2}\d+\*)|(?=🛫[A-Z]{2}\d+)|(?=🛬[A-Z]{2}\d+)/;
    const blocks = input.split(flightPattern).filter(b => b.trim());

    return blocks.map(block => parseSingleFlight(block)).filter(f => f);
}

// Parse a single flight block
function parseSingleFlight(block) {
    const flight = {
        type: detectFlightType(block),
        raw: block
    };

    // Flight number
    const flightNumMatch = block.match(/\*?([A-Z]{2}\d+)\*?/);
    if (flightNumMatch) flight.number = flightNumMatch[1];

    // Date
    const dateMatch = block.match(/(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec))/i);
    if (dateMatch) flight.date = dateMatch[1];

    // Registration and aircraft type
    const regMatch = block.match(/REG[:\s]*([A-Z0-9-]+)/i);
    if (regMatch) flight.registration = regMatch[1];

    const aircraftMatch = block.match(/\((\w{2,3})\)/);
    if (aircraftMatch) {
        flight.aircraftCode = aircraftMatch[1];
        flight.aircraft = aircraftTypes[aircraftMatch[1]] || aircraftMatch[1];
    }

    // Times
    const etaMatch = block.match(/ETA[:\s]*(\d{1,2}:\d{2})/i);
    if (etaMatch) flight.eta = etaMatch[1];

    const staMatch = block.match(/STA[:\s]*(\d{1,2}:\d{2})/i);
    if (staMatch) flight.sta = staMatch[1];

    const stdMatch = block.match(/STD[:\s]*(\d{1,2}:\d{2})/i);
    if (stdMatch) flight.std = stdMatch[1];

    const etdMatch = block.match(/ETD[:\s]*(\d{1,2}:\d{2})/i);
    if (etdMatch) flight.etd = etdMatch[1];

    // Gate
    const gateMatch = block.match(/Gate[:\s*]*([A-Z0-9\/]+)/i);
    if (gateMatch) flight.gate = gateMatch[1].replace(/\*+/g, '');

    // Route (for departures)
    const routeMatch = block.match(/([A-Z]{3})-([A-Z]{3})/);
    if (routeMatch) {
        flight.origin = routeMatch[1];
        flight.destination = routeMatch[2];
        flight.originName = airports[routeMatch[1]] || routeMatch[1];
        flight.destinationName = airports[routeMatch[2]] || routeMatch[2];
    }

    // Passengers
    const paxMatch = block.match(/(?:Pax(?:\s+count)?|PAX)[:\s]*C?(\d+)\s*M?(\d+)/i);
    if (paxMatch) {
        flight.paxBusiness = parseInt(paxMatch[1]);
        flight.paxEconomy = parseInt(paxMatch[2]);
    }

    // Also try format like "C13 M113"
    const paxAltMatch = block.match(/C(\d+)\s+M(\d+)/i);
    if (paxAltMatch && !flight.paxBusiness) {
        flight.paxBusiness = parseInt(paxAltMatch[1]);
        flight.paxEconomy = parseInt(paxAltMatch[2]);
    }

    // Infants
    const infMatch = block.match(/(?:INF|INFT)\s*(\d+)|(\d+)\s*(?:INF|INFT)/i);
    if (infMatch) flight.infants = parseInt(infMatch[1] || infMatch[2]);

    // Total
    const ttlMatch = block.match(/TTL\s*[=:]\s*(\d+)/i);
    if (ttlMatch) flight.total = parseInt(ttlMatch[1]);

    // Wheelchair
    const wchrMatch = block.match(/(\d+)\s*(WCHR|WCHS|WCHC)/i);
    if (wchrMatch) {
        const type = wchrMatch[2].toUpperCase();
        flight.wheelchair = {
            count: parseInt(wchrMatch[1]),
            type: type,
            ...wheelchairTypes[type]
        };
    }

    // Connecting passengers
    const conxMatch = block.match(/Conx\s+Pax\s*(\d+)[:\s]*.*?(\d{1,2}:\d{2})\s*([A-Z]{2}\d+)\s*([A-Z]+)/i);
    if (conxMatch) {
        flight.connecting = {
            count: parseInt(conxMatch[1]),
            time: conxMatch[2],
            flight: conxMatch[3],
            destination: conxMatch[4],
            destinationName: airports[conxMatch[4].toUpperCase()] || conxMatch[4]
        };
    }

    // Bags
    const bagsMatch = block.match(/Bags[:\s]*(\d+)/i);
    if (bagsMatch) flight.bags = parseInt(bagsMatch[1]);

    // Carousel
    const carouselMatch = block.match(/Carousel[:\s]*(\d+)/i);
    if (carouselMatch) flight.carousel = carouselMatch[1];

    // Cargo
    const cargoMatch = block.match(/Cargo[:\s*]*(\d+)\s*KGS?/i);
    if (cargoMatch) flight.cargo = parseInt(cargoMatch[1]);

    const cargoNilMatch = block.match(/Cargo[:\s*]*NIL/i);
    if (cargoNilMatch) flight.cargoNil = true;

    // Counters
    const countersMatch = block.match(/Counters[:\s]*([0-9\-]+)/i);
    if (countersMatch) flight.counters = countersMatch[1];

    // Lateral
    const lateralMatch = block.match(/Lateral[:\s]*(\d+)/i);
    if (lateralMatch) flight.lateral = lateralMatch[1];

    // Incoming carrier passengers (IN CARR)
    const inCarrMatch = block.match(/IN\s*CARR[^:]*:[:\s]*(.+?)(?:\n|$)/i);
    if (inCarrMatch) {
        const transfers = [];
        const transferPattern = /(\d+)\s*([A-Z]{2})/g;
        let match;
        while ((match = transferPattern.exec(inCarrMatch[1])) !== null) {
            transfers.push({
                count: parseInt(match[1]),
                airline: match[2],
                airlineName: airlines[match[2]] || match[2]
            });
        }
        if (transfers.length) flight.incomingTransfers = transfers;
    }

    // Country flag emoji detection
    const flagMatch = block.match(/[\u{1F1E0}-\u{1F1FF}]{2}/u);
    if (flagMatch) flight.flag = flagMatch[0];

    return flight;
}

// Detect if flight is arrival or departure
function detectFlightType(block) {
    if (/ETA|STA|🛬/i.test(block)) return 'arrival';
    if (/STD|ETD|🛫/i.test(block)) return 'departure';
    if (/[A-Z]{3}-[A-Z]{3}/.test(block)) return 'departure';
    return 'unknown';
}

// Render parsed flights to the card
function renderFlights(flights) {
    cardBody.innerHTML = '';

    flights.forEach(flight => {
        const section = document.createElement('div');
        section.className = 'flight-section';
        section.innerHTML = renderSingleFlight(flight);
        cardBody.appendChild(section);
    });
}

// Render a single flight
function renderSingleFlight(flight) {
    const isArrival = flight.type === 'arrival';
    const headerClass = isArrival ? 'arriving' : 'departing';
    const headerIcon = isArrival ? '🛬' : '🛫';
    const headerText = isArrival ? 'ARRIVING' : 'DEPARTING';

    let html = `
        <div class="section-header ${headerClass}">
            ${headerIcon} ${headerText}
        </div>
        <div class="flight-title">
            <div>
                <div class="flight-number">✈️ ${flight.number || 'Unknown'}</div>
                ${flight.flag ? `<div class="flight-origin">from Iceland ${flight.flag}</div>` : ''}
                ${flight.origin ? `<div class="flight-origin">${flight.origin} → ${flight.destination} (${flight.originName} → ${flight.destinationName})</div>` : ''}
            </div>
            ${flight.date ? `<div class="flight-date">${flight.date}</div>` : ''}
        </div>
    `;

    // Info boxes (registration, gate, time)
    html += '<div class="info-grid">';

    if (flight.registration) {
        html += `
            <div class="info-box">
                <div class="icon">🛩️</div>
                <div class="value">${flight.registration}</div>
                <div class="label">${flight.aircraft || ''}</div>
            </div>
        `;
    }

    if (flight.gate) {
        html += `
            <div class="info-box">
                <div class="icon">📍</div>
                <div class="value">${flight.gate}</div>
                <div class="label">Gate</div>
            </div>
        `;
    }

    if (flight.counters) {
        html += `
            <div class="info-box">
                <div class="icon">📍</div>
                <div class="value">${flight.counters}</div>
                <div class="label">Counters</div>
            </div>
        `;
    }

    const time = flight.eta || flight.sta || flight.std || flight.etd;
    const timeLabel = flight.eta ? 'ETA' : flight.sta ? 'STA' : flight.std ? 'STD' : 'ETD';
    if (time) {
        html += `
            <div class="info-box">
                <div class="icon">⏰</div>
                <div class="value">${time}</div>
                <div class="label">${timeLabel}</div>
            </div>
        `;
    }

    if (flight.lateral) {
        html += `
            <div class="info-box">
                <div class="icon">🎫</div>
                <div class="value">Belt ${flight.lateral}</div>
                <div class="label">Lateral</div>
            </div>
        `;
    }

    html += '</div>';

    // Passenger counts
    if (flight.paxBusiness || flight.paxEconomy || flight.infants || flight.total) {
        html += '<div class="pax-grid">';
        if (flight.paxBusiness !== undefined) {
            html += `<div class="pax-box"><div class="count">${flight.paxBusiness}</div><div class="type">Business</div></div>`;
        }
        if (flight.paxEconomy !== undefined) {
            html += `<div class="pax-box"><div class="count">${flight.paxEconomy}</div><div class="type">Economy</div></div>`;
        }
        if (flight.infants !== undefined) {
            html += `<div class="pax-box"><div class="count">${flight.infants}</div><div class="type">Infant</div></div>`;
        }
        if (flight.total !== undefined) {
            html += `<div class="pax-box"><div class="count">${flight.total}</div><div class="type">Total</div></div>`;
        }
        html += '</div>';
    }

    // Wheelchair
    if (flight.wheelchair) {
        html += `
            <div class="special-box">
                <div class="header">♿ ${flight.wheelchair.count}</div>
                <div class="details">${flight.wheelchair.name} - ${flight.wheelchair.detail}</div>
            </div>
        `;
    }

    // Connecting passengers
    if (flight.connecting) {
        html += `
            <div class="special-box">
                <div class="header">🔄 ${flight.connecting.count} connecting</div>
                <div class="details">→ ${flight.connecting.flight} @ ${flight.connecting.time} to ${flight.connecting.destinationName}</div>
            </div>
        `;
    }

    // Incoming transfers
    if (flight.incomingTransfers) {
        const transferText = flight.incomingTransfers
            .map(t => `${t.count} ${t.airlineName}`)
            .join(', ');
        html += `
            <div class="special-box">
                <div class="header">🔄 Incoming transfers</div>
                <div class="details">${transferText}</div>
            </div>
        `;
    }

    // Bags and cargo
    html += '<div class="info-grid">';
    if (flight.bags) {
        html += `
            <div class="info-box">
                <div class="icon">🧳</div>
                <div class="value">${flight.bags}</div>
                <div class="label">Bags${flight.carousel ? ` • Carousel ${flight.carousel}` : ''}</div>
            </div>
        `;
    }
    if (flight.cargo) {
        html += `
            <div class="info-box">
                <div class="icon">📦</div>
                <div class="value">${flight.cargo.toLocaleString()} kg</div>
                <div class="label">Cargo</div>
            </div>
        `;
    }
    if (flight.cargoNil) {
        html += `
            <div class="info-box">
                <div class="icon">📦</div>
                <div class="value">NIL</div>
                <div class="label">No cargo</div>
            </div>
        `;
    }
    html += '</div>';

    return html;
}

// Copy card to clipboard
async function copyToClipboard() {
    try {
        const canvas = await html2canvas(outputCard, {
            backgroundColor: '#0d0d0d',
            scale: 2
        });

        canvas.toBlob(async (blob) => {
            await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob })
            ]);

            // Visual feedback
            const originalText = copyBtn.textContent;
            copyBtn.textContent = 'Copied!';
            setTimeout(() => {
                copyBtn.textContent = originalText;
            }, 2000);
        });
    } catch (err) {
        console.error('Failed to copy:', err);
        alert('Failed to copy to clipboard');
    }
}

// Save card as PNG
async function saveAsPNG() {
    try {
        const canvas = await html2canvas(outputCard, {
            backgroundColor: '#0d0d0d',
            scale: 2
        });

        const link = document.createElement('a');
        link.download = 'squawk-flight-info.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
    } catch (err) {
        console.error('Failed to save:', err);
        alert('Failed to save as PNG');
    }
}
