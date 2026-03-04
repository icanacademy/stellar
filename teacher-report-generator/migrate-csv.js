const fs = require('fs');

const CSV_PATH = './reports.csv';
const OUTPUT_PATH = './reports-migrated.csv';

// Read the entire file
const content = fs.readFileSync(CSV_PATH, 'utf-8');

// Simple CSV parser that handles quoted fields with embedded commas/quotes
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current);
    return result;
}

// Convert array back to CSV line with proper quoting
function toCSVLine(arr) {
    return arr.map(val => {
        // Remove existing quotes if present
        let v = val;
        if (v.startsWith('"') && v.endsWith('"')) {
            v = v.slice(1, -1);
        }
        // Escape internal quotes and wrap in quotes
        return `"${v.replace(/"/g, '""')}"`;
    }).join(',');
}

// Split into lines (handle multi-line quoted fields)
const lines = [];
let currentLine = '';
let inQuotes = false;

for (let i = 0; i < content.length; i++) {
    const char = content[i];

    if (char === '"') {
        inQuotes = !inQuotes;
        currentLine += char;
    } else if (char === '\n' && !inQuotes) {
        if (currentLine.trim()) {
            lines.push(currentLine);
        }
        currentLine = '';
    } else if (char === '\r') {
        // Skip carriage returns
    } else {
        currentLine += char;
    }
}
if (currentLine.trim()) {
    lines.push(currentLine);
}

console.log(`Read ${lines.length} lines (including header)`);

// Parse header
const oldHeader = parseCSVLine(lines[0]);
console.log(`Old header has ${oldHeader.length} columns`);
console.log('Columns 13-17:', oldHeader.slice(13, 18));

// Create new header by inserting Materials after Current Lesson (index 14) and Next Lesson after Homework (index 15)
// Old: ..., 13:Current Lesson, 14:Homework, 15:Activities Finished, ...
// New: ..., 13:Current Lesson, 14:Materials, 15:Homework, 16:Next Lesson, 17:Activities Finished, ...
const newHeader = [...oldHeader];
newHeader.splice(14, 0, 'Materials');  // Insert at position 14
newHeader.splice(16, 0, 'Next Lesson');  // Insert at position 16 (after inserting Materials)

console.log(`New header has ${newHeader.length} columns`);
console.log('New columns 13-18:', newHeader.slice(13, 19));

// Process data rows
const output = [toCSVLine(newHeader)];

for (let i = 1; i < lines.length; i++) {
    const oldValues = parseCSVLine(lines[i]);

    // Insert empty values at the same positions
    const newValues = [...oldValues];
    newValues.splice(14, 0, '');  // Insert empty Materials at position 14
    newValues.splice(16, 0, '');  // Insert empty Next Lesson at position 16

    output.push(toCSVLine(newValues));
}

// Write output
fs.writeFileSync(OUTPUT_PATH, output.join('\n') + '\n');

console.log(`\nMigration complete!`);
console.log(`- Processed ${lines.length - 1} data rows`);
console.log(`- Output written to: ${OUTPUT_PATH}`);
console.log('\nTo apply: cp reports-migrated.csv reports.csv');
