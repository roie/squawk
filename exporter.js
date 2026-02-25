/**
 * Generate a text-based summary of flights for clipboard
 */
export function generateTextSummary(flights) {
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

        if (f.total) {
            let paxStr = `Pax: ${f.total}`;
            let details = [];
            if (f.paxBusiness) details.push(`${f.paxBusiness}C`);
            if (f.paxEconomy) details.push(`${f.paxEconomy}Y`);
            if (f.infants) details.push(`${f.infants}INF`);
            if (details.length > 0) paxStr += ` (${details.join('/')})`;
            text += paxStr + '\n';
        }

        if (f.wheelchairs || f.specialServices) {
            let lines = [];
            if (f.wheelchairs) for (const wc of f.wheelchairs) lines.push(`${wc.count}x ${wc.type}`);
            if (f.specialServices) for (const svc of f.specialServices) lines.push(`${svc.count}x ${svc.code}`);
            text += `Special: ${lines.join(', ')}\n`;
        }

        if (f.connecting) {
            let conx = `Connections: ${f.connecting.count} pax`;
            if (f.connecting.flight) conx += ` to ${f.connecting.flight} @ ${f.connecting.time}`;
            text += conx + '\n';
        }

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

/**
 * Clipboard operations (Text and Image)
 */
export async function copyToClipboard(flights, btn) {
    try {
        const text = generateTextSummary(flights);
        await navigator.clipboard.writeText(text);
        showSuccess(btn);
    } catch (err) { console.error(err); }
}

export async function copyImageToClipboard(cardElement, btn) {
    const label = btn.querySelector('.btn-label');
    const originalText = label.textContent;
    try {
        label.textContent = 'Copying...';
        btn.disabled = true;
        const canvas = await generateCanvas(cardElement);
        canvas.toBlob(async (blob) => {
            try {
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                showSuccess(btn, 'Copied!', originalText);
            } catch (err) { console.error(err); btn.disabled = false; label.textContent = originalText; }
        }, 'image/png');
    } catch (err) { console.error(err); btn.disabled = false; label.textContent = originalText; }
}

/**
 * File Download (PNG)
 */
export async function saveAsPNG(cardElement, flights, btn) {
    const label = btn.querySelector('.btn-label');
    const originalText = label.textContent;
    try {
        label.textContent = 'Saving...';
        btn.disabled = true;
        const canvas = await generateCanvas(cardElement);
        
        let filename = 'squawk';
        if (flights.length > 0) {
            const flightNumbers = flights.filter(f => f.number).map(f => f.number);
            filename += `-${flightNumbers.join('-')}`;
            const fWithDate = flights.find(f => f.date);
            if (fWithDate && fWithDate.date) {
                const dateMatch = fWithDate.date.match(/(\w+)\s+(\d+),?\s*(\d{4})?/);
                if (dateMatch) filename += `-${dateMatch[2]}${dateMatch[1]}${dateMatch[3] || ''}`;
            }
        }
        
        const link = document.createElement('a');
        link.download = filename + '.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
        showSuccess(btn, 'Saved!', originalText);
    } catch (err) { console.error(err); btn.disabled = false; label.textContent = originalText; }
}

/**
 * Internal helpers
 */
async function generateCanvas(element) {
    const cardClone = element.cloneNode(true);
    cardClone.style.cssText = `position: absolute; left: -9999px; top: 0; width: 500px;`;
    document.body.appendChild(cardClone);
    await new Promise(resolve => setTimeout(resolve, 150));
    const canvas = await html2canvas(cardClone, { backgroundColor: null, scale: 2, logging: false, useCORS: true });
    document.body.removeChild(cardClone);
    return canvas;
}

function showSuccess(btn, successText = 'Copied!', originalText = 'Copy Text') {
    const label = btn.querySelector('.btn-label');
    const oldText = label.textContent;
    label.textContent = successText;
    btn.classList.add('success');
    btn.disabled = false;
    setTimeout(() => {
        label.textContent = originalText || oldText;
        btn.classList.remove('success');
    }, 2000);
}
