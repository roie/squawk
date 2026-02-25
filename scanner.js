import { opsLabels } from './dictionaries.js';

/**
 * 1. SANITIZER: Clean invisible junk, markdown formatting, and normalize text
 */
export function sanitizeInput(text) {
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
 */
export function fuzzyCorrectLabels(block) {
    // Fuse is expected to be available globally from CDN
    if (typeof Fuse === 'undefined') return block;

    const fuseOptions = {
        includeScore: true,
        threshold: 0.2,
        keys: ['matches']
    };
    const labelSearch = new Fuse(opsLabels, fuseOptions);

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
        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) return line;

        const labelPart = line.substring(0, colonIndex).trim();
        const valuePart = line.substring(colonIndex + 1);

        if (labelPart.length > 25 || labelPart.length < 2 || /^\d+$/.test(labelPart)) return line;

        const labelUpper = labelPart.toUpperCase();
        for (const valid of validLabels) {
            if (labelUpper === valid.toUpperCase()) return line;
        }

        const results = labelSearch.search(labelPart);
        if (results.length > 0 && results[0].score < 0.15 && results[0].score > 0) {
            const canonicalLabel = results[0].item.matches[0];
            return canonicalLabel + ':' + valuePart;
        }
        return line;
    });
    return correctedLines.join('\n');
}

/**
 * 3. BLOCK SPLITTER: Stateful line-by-line scanner
 */
export function parseInputToBlocks(input) {
    const normalized = input
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*\n]+)\*/g, '$1');

    if (normalized.includes('----------')) {
        return normalized.split(/----------+/).filter(b => b.trim());
    }

    const lines = normalized.split('\n');
    const blocks = [];
    let currentBlock = [];

    const headerPatterns = [
        /^🛫\s*[A-Z]{2}\d{1,4}/,
        /^🛬\s*[A-Z]{2}\d{1,4}/,
        /^Flight[:\s]+[A-Z]{2}\d{1,4}/i,
        /^[A-Z]{2}\d{1,4}\s+[\u{1F1E6}-\u{1F1FF}]/u
    ];

    for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine && currentBlock.length === 0) continue;
        const isHeader = headerPatterns.some(pattern => pattern.test(trimmedLine));

        if (isHeader && currentBlock.length > 0) {
            blocks.push(currentBlock.join('\n').trim());
            currentBlock = [line];
        } else {
            currentBlock.push(line);
        }
    }

    if (currentBlock.length > 0) {
        blocks.push(currentBlock.join('\n').trim());
    }

    return blocks.length > 0 ? blocks : [normalized];
}
