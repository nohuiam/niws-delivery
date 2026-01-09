// Plain Text Exporter for Teleprompter
// Creates simple text files optimized for readability

export interface PlainTextOptions {
  uppercase: boolean;       // Convert all text to uppercase
  lineWidth: number;        // Max characters per line (0 = no wrapping)
  paragraphSpacing: number; // Number of blank lines between paragraphs
  sectionDivider: string;   // Character(s) for section dividers
  includeHeader: boolean;   // Include title header
  includeTimestamps: boolean; // Include reading time estimates
}

const DEFAULT_PLAINTEXT_OPTIONS: PlainTextOptions = {
  uppercase: true,
  lineWidth: 0,             // No wrapping by default
  paragraphSpacing: 2,
  sectionDivider: '=',
  includeHeader: true,
  includeTimestamps: false
};

export function exportToPlainText(content: string, title: string, options?: Partial<PlainTextOptions>): string {
  const opts = { ...DEFAULT_PLAINTEXT_OPTIONS, ...options };

  let output = '';

  // Add header
  if (opts.includeHeader) {
    const divider = opts.sectionDivider.repeat(50);
    const titleLine = opts.uppercase ? title.toUpperCase() : title;
    output += `${divider}\n${titleLine}\n${divider}\n\n`;
  }

  // Add timestamp header if enabled
  if (opts.includeTimestamps) {
    const wordCount = content.split(/\s+/).length;
    const readingTime = Math.ceil(wordCount / 150); // ~150 words per minute for teleprompter
    output += `[Words: ${wordCount} | Estimated Time: ${readingTime} min]\n\n`;
  }

  // Process content
  let processed = content;

  // Apply uppercase
  if (opts.uppercase) {
    processed = processed.toUpperCase();
  }

  // Apply word wrapping if lineWidth > 0
  if (opts.lineWidth > 0) {
    processed = wrapText(processed, opts.lineWidth);
  }

  // Normalize paragraph spacing
  const paragraphBreak = '\n'.repeat(opts.paragraphSpacing + 1);
  processed = processed
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(p => p.length > 0)
    .join(paragraphBreak);

  output += processed;

  // Add footer
  if (opts.includeHeader) {
    const divider = opts.sectionDivider.repeat(50);
    output += `\n\n${divider}\nEND OF SCRIPT\n${divider}`;
  }

  return output;
}

// Word wrap helper function
function wrapText(text: string, maxWidth: number): string {
  const lines: string[] = [];

  for (const paragraph of text.split('\n')) {
    if (paragraph.length <= maxWidth) {
      lines.push(paragraph);
      continue;
    }

    const words = paragraph.split(' ');
    let currentLine = '';

    for (const word of words) {
      if (currentLine.length + word.length + 1 <= maxWidth) {
        currentLine += (currentLine ? ' ' : '') + word;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }

    if (currentLine) lines.push(currentLine);
  }

  return lines.join('\n');
}

// Export with centered text (for narrow displays)
export function exportToPlainTextCentered(content: string, title: string, width: number = 60, options?: Partial<PlainTextOptions>): string {
  const text = exportToPlainText(content, title, { ...options, lineWidth: width });

  return text.split('\n').map(line => {
    const padding = Math.max(0, Math.floor((width - line.length) / 2));
    return ' '.repeat(padding) + line;
  }).join('\n');
}

// Export with reading cues (/ for pauses)
export function exportToPlainTextWithCues(content: string, title: string, options?: Partial<PlainTextOptions>): string {
  let processed = content;

  // Add pause cues after sentences
  processed = processed.replace(/\. /g, '. / ');
  processed = processed.replace(/\? /g, '? / ');
  processed = processed.replace(/! /g, '! / ');

  // Add longer pause for paragraph breaks
  processed = processed.replace(/\n\n/g, '\n\n// \n\n');

  return exportToPlainText(processed, title, options);
}
