// Squawk - Airline Ops Message Translator
// Modular Orchestrator

import { parseInputToBlocks } from './scanner.js';
import { parseSingleFlight } from './parser.js';
import { renderFlights } from './renderer.js';
import { copyToClipboard, copyImageToClipboard, saveAsPNG } from './exporter.js';

// ============================================================================ 
// DOM ELEMENTS
// ============================================================================ 

const inputText = document.getElementById('input-text');
const translateBtn = document.getElementById('translate-btn');
const tryExampleLink = document.getElementById('try-example');
const copyBtn = document.getElementById('copy-btn');
const copyImageBtn = document.getElementById('copy-image-btn');
const saveBtn = document.getElementById('save-btn');
const outputSection = document.getElementById('output-section');
const cardBody = document.getElementById('card-body');
const outputCard = document.getElementById('output-card');

// State
let lastParsedFlights = [];

// ============================================================================ 
// EVENT LISTENERS
// ============================================================================ 

translateBtn.addEventListener('click', translate);
tryExampleLink.addEventListener('click', (e) => {
    e.preventDefault();
    inputText.value = `🛫 ICE602 🇮🇸
Date: 25Feb
A/C REG: TF-ICU (738)
Route: BIKF-CYYZ
STA 1745
ETA 1800
Pax: 150 (C12 Y138)
WCHR: 2R+1C
CARGO: 
TOTAL: 450kgs 
30pcs LIVE LOBSTERS
Remarks: 
WAITING FOR PAX FROM 🛫 FI601. 
PLEASE PRIORITIZE BGS.`;
    translate();
});
copyBtn.addEventListener('click', () => copyToClipboard(lastParsedFlights, copyBtn));
copyImageBtn.addEventListener('click', () => copyImageToClipboard(outputCard, copyImageBtn));
saveBtn.addEventListener('click', () => saveAsPNG(outputCard, lastParsedFlights, saveBtn));

// ============================================================================ 
// CORE WORKFLOW
// ============================================================================ 

function translate() {
    const input = inputText.value.trim();
    if (!input) return;

    // 1. Scanner: Split raw text into flight blocks
    const blocks = parseInputToBlocks(input);
    if (blocks.length === 0) return;

    // 2. Parser: Extract data from each block
    const flights = blocks
        .map(block => parseSingleFlight(block))
        .filter(f => f && f.number);

    if (flights.length === 0) return;

    lastParsedFlights = flights;

    // 3. Renderer: Display the results
    renderFlights(flights, cardBody);

    // UI Updates
    outputSection.style.display = 'block';
    copyBtn.disabled = false;
    copyImageBtn.disabled = false;
    saveBtn.disabled = false;

    outputSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
