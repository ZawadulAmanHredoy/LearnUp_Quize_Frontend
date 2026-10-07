/**
 * Robust CSV parser & exporter for LearnUp Question Bank.
 * Supports RFC 4180 (quoted fields, commas, escaped quotes, multiline).
 */

export function parseCSV(text) {
  if (!text || typeof text !== 'string') return [];

  // Strip UTF-8 Byte Order Mark (BOM) if present
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
  }

  const rows = [];
  let currentRow = [];
  let currentField = '';
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        // Escaped quote: "" -> "
        currentField += '"';
        i++; // skip next quote
      } else {
        // Toggle quote state
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      currentRow.push(currentField.trim());
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++; // skip \n in CRLF
      }
      currentRow.push(currentField.trim());
      // Only push non-empty rows
      if (currentRow.some((f) => f.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }

  // Final field & row if not ended with newline
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((f) => f.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Normalizes rows into question objects for the given round.
 * Accepts flexible column names (supports English, Bangla, Math, and Unicode).
 */
export function rowsToQuestions(rows, targetRoundType = 'BUZZER') {
  if (rows.length === 0) return [];

  // Check if first row is header
  const rawFirstRow = rows[0].map((c) => String(c || '').trim().toLowerCase());
  const hasHeader = rawFirstRow.some((c) =>
    c.includes('question') || c.includes('option') || c.includes('prompt') ||
    c.includes('প্রশ্ন') || c.includes('অপশন')
  );

  const header = hasHeader ? rawFirstRow : null;
  const dataRows = hasHeader ? rows.slice(1) : rows;

  const questions = [];

  for (const row of dataRows) {
    if (!row || row.length === 0 || !row[0]) continue;

    let questionText = '';
    let optA = '', optB = '', optC = '', optD = '';
    let optionsRaw = '';
    let correctRaw = '0';
    let explanation = '';
    let mediaType = 'NONE';
    let mediaUrl = '';
    let points = targetRoundType === 'AUDIO_VISUAL' ? 15 : (targetRoundType === 'RAPID_FIRE' ? 10 : 10);
    let negativePoints = targetRoundType === 'BUZZER' ? 5 : 0;

    if (header) {
      // Map columns using header names
      header.forEach((rawCol, idx) => {
        const colName = rawCol.replace(/[^a-z0-9\u0980-\u09FF]/g, '');
        const val = row[idx] || '';
        if (colName.includes('question') || colName.includes('prompt') || colName === 'q' || rawCol.includes('প্রশ্ন')) {
          questionText = val;
        } else if (colName.includes('optiona') || colName === 'a' || colName === 'opt1' || colName === 'choicea' || rawCol.includes('ক')) {
          optA = val;
        } else if (colName.includes('optionb') || colName === 'b' || colName === 'opt2' || colName === 'choiceb' || rawCol.includes('খ')) {
          optB = val;
        } else if (colName.includes('optionc') || colName === 'c' || colName === 'opt3' || colName === 'choicec' || rawCol.includes('গ')) {
          optC = val;
        } else if (colName.includes('optiond') || colName === 'd' || colName === 'opt4' || colName === 'choiced' || rawCol.includes('ঘ')) {
          optD = val;
        } else if (colName === 'options' || colName === 'choices' || rawCol.includes('অপশন')) {
          optionsRaw = val;
        } else if (colName.includes('correct') || colName.includes('answer') || rawCol.includes('উত্তর') || rawCol.includes('সঠিক')) {
          correctRaw = val;
        } else if (colName.includes('explain') || colName.includes('note') || colName.includes('hint') || rawCol.includes('ব্যাখ্যা')) {
          explanation = val;
        } else if (colName.includes('mediatype') || colName === 'type') {
          mediaType = val.toUpperCase();
        } else if (colName.includes('mediaurl') || colName.includes('media') || colName.includes('file')) {
          mediaUrl = val;
        } else if (colName.includes('point') && !colName.includes('negative')) {
          const p = Number(val);
          if (!isNaN(p)) points = p;
        } else if (colName.includes('negative')) {
          const np = Number(val);
          if (!isNaN(np)) negativePoints = np;
        }
      });
    } else {
      // Positional fallback:
      // Col 0: Question
      // Col 1: Option A
      // Col 2: Option B
      // Col 3: Option C
      // Col 4: Option D
      // Col 5: Correct Answer (A, B, C, D or 0, 1, 2, 3 or ক, খ, গ, ঘ)
      // Col 6: Explanation
      // Col 7: Media Type
      // Col 8: Media URL
      questionText = row[0] || '';
      optA = row[1] || '';
      optB = row[2] || '';
      optC = row[3] || '';
      optD = row[4] || '';
      correctRaw = row[5] || '0';
      explanation = row[6] || '';
      mediaType = row[7] || (targetRoundType === 'AUDIO_VISUAL' ? 'VIDEO' : 'NONE');
      mediaUrl = row[8] || '';
    }

    if (!questionText.trim()) continue;

    // Build options array
    let options = [];
    if (optA || optB || optC || optD) {
      const labels = ['A', 'B', 'C', 'D'];
      const rawOpts = [optA, optB, optC, optD].filter(Boolean);
      options = rawOpts.map((text, idx) => ({
        label: labels[idx] || String(idx + 1),
        text: text.trim()
      }));
    } else if (optionsRaw) {
      // Split by semicolon or pipe
      const split = optionsRaw.split(/[;|]/).map((s) => s.trim()).filter(Boolean);
      const labels = ['A', 'B', 'C', 'D'];
      options = split.map((text, idx) => ({
        label: labels[idx] || String(idx + 1),
        text
      }));
    }

    // Parse correct index (e.g. 'A' -> 0, 'B' -> 1, 'ক' -> 0, 'খ' -> 1, '2' -> 2, etc.)
    let correctOptionIndex = 0;
    const cleanCorrect = String(correctRaw).trim().toUpperCase();
    if (['A', '0', 'ক', '১'].includes(cleanCorrect) || (cleanCorrect === '1' && options[0]?.text.toUpperCase() === cleanCorrect)) {
      correctOptionIndex = 0;
    } else if (['B', '1', 'খ', '২'].includes(cleanCorrect)) {
      correctOptionIndex = 1;
    } else if (['C', '2', 'গ', '৩'].includes(cleanCorrect)) {
      correctOptionIndex = 2;
    } else if (['D', '3', 'ঘ', '৪'].includes(cleanCorrect)) {
      correctOptionIndex = 3;
    } else {
      const numeric = parseInt(cleanCorrect, 10);
      if (!isNaN(numeric) && numeric >= 0 && numeric < 4) {
        correctOptionIndex = numeric;
      } else {
        // Find matching option text
        const matchedIdx = options.findIndex(
          (o) => o.text.trim().toLowerCase() === cleanCorrect.toLowerCase()
        );
        if (matchedIdx !== -1) correctOptionIndex = matchedIdx;
      }
    }

    // Default media type for AV round if not specified
    if (targetRoundType === 'AUDIO_VISUAL' && (!mediaType || mediaType === 'NONE')) {
      if (mediaUrl.endsWith('.mp3') || mediaUrl.endsWith('.wav') || mediaUrl.endsWith('.ogg')) {
        mediaType = 'AUDIO';
      } else if (mediaUrl.endsWith('.png') || mediaUrl.endsWith('.jpg') || mediaUrl.endsWith('.jpeg')) {
        mediaType = 'IMAGE';
      } else {
        mediaType = 'VIDEO';
      }
    }

    questions.push({
      roundType: targetRoundType,
      order: questions.length + 1,
      questionText: questionText.trim(),
      options,
      correctOptionIndex,
      points,
      negativePoints,
      mediaType: mediaType.toUpperCase(),
      mediaUrl: mediaUrl.trim() || null,
      explanation: explanation.trim()
    });
  }

  return questions;
}

/**
 * Generate sample CSV template for download
 */
export function getSampleCsvTemplate(roundType) {
  if (roundType === 'AUDIO_VISUAL') {
    return `Question,Option A,Option B,Option C,Option D,Correct Option,Media Type,Media URL,Explanation,Points
"Identify the iconic invention and milestone presented in this clip:","First Computer Mouse by Douglas Engelbart","First Electronic Microprocessor (Intel 4004)","First Graphic User Interface by Xerox PARC","First Optical Fiber Transmission",A,VIDEO,/media/tech_history.mp4,"Douglas Engelbart revealed the wooden computer mouse prototype at The Mother of All Demos in 1968.",15
"Listen to the vintage audio sequence and identify the classic computing artifact:","Early Modem Dial-up Handshake (V.90)","8-Bit Synthesizer Chiptune Sequence","Cassette Data Stream Loading Tone","Floppy Disk Drive Read Head Stepper",B,AUDIO,/media/retro_beeps.mp3,"The signature sound is an 8-bit programmable sound generator playing synthesized chiptunes.",15
`;
  }

  if (roundType === 'RAPID_FIRE') {
    return `Question,Option A,Option B,Option C,Option D,Correct Option,Explanation,Points
"What is the average time complexity of searching an element in a balanced Binary Search Tree?","O(1)","O(log n)","O(n)","O(n log n)",B,"Balanced BST has height log n, giving O(log n) search.",10
"Which OSI layer does the Internet Protocol (IP) operate at?","Data Link Layer","Transport Layer","Network Layer","Session Layer",C,"IP is the fundamental Layer 3 Network protocol.",10
"What is the primary memory management data structure used for function calls and recursion?","Queue","Call Stack","Max Heap","Graph Adjacency List",B,"The call stack manages function execution frames and local variables.",10
`;
  }

  // Default BUZZER
  return `Question,Option A,Option B,Option C,Option D,Correct Option,Explanation,Points,Negative Points
"Which data structure operates strictly on a First-In, First-Out (FIFO) principle?","Stack","Queue","Priority Queue","Binary Heap",B,"A Queue follows FIFO where elements are added at the rear and removed from the front.",10,5
"In distributed computing, what does the CAP theorem state is impossible to guarantee simultaneously?","Consistency, Availability, Partition Tolerance","Concurrency, Accuracy, Persistence","Cacheability, Atomicity, Performance","Compatibility, Agility, Portability",A,"CAP states a distributed system can only provide two out of Consistency, Availability, and Partition tolerance.",10,5
"What is the time complexity of looking up a key in an ideal hash table with no collisions?","O(log n)","O(n)","O(1)","O(n log n)",C,"With a uniform hash distribution and direct addressing, hash table lookup is average O(1).",10,5
`;
}
