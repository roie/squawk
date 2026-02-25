/**
 * Render all flight sections into the card body
 */
export function renderFlights(flights, cardBody) {
    cardBody.innerHTML = '';
    flights.forEach(flight => {
        const section = document.createElement('div');
        section.className = 'flight-section';
        section.innerHTML = renderSingleFlight(flight);
        cardBody.appendChild(section);
    });
}

/**
 * Generate HTML for a single flight card
 */
export function renderSingleFlight(flight) {
    const isArrival = flight.type === 'arrival';
    const headerClass = isArrival ? 'arriving' : 'departing';
    const headerIcon = isArrival ? '🛬' : '🛫';
    const headerText = isArrival ? 'ARRIVING' : 'DEPARTING';

    let routeDisplay = '';
    if (flight.origin && flight.destination) {
        routeDisplay = `${flight.originName} → ${flight.destinationName}`;
    } else if (flight.country && flight.flag) {
        routeDisplay = `from ${flight.country} ${flight.flag}`;
    } else if (flight.flag) {
        routeDisplay = `${flight.flag}`;
    }

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
