import type { Script, ScriptSection, FormatOptions, DEFAULT_FORMAT_OPTIONS } from '../types.js';

export class TeleprompterFormatter {
  private options: FormatOptions;

  constructor(options?: Partial<FormatOptions>) {
    this.options = {
      fontSize: options?.fontSize || 'large',
      uppercase: options?.uppercase ?? true,
      sentenceBreaks: options?.sentenceBreaks ?? true,
      lineSpacing: options?.lineSpacing || 2
    };
  }

  format(script: Script): string {
    const sections = [...script.sections].sort((a, b) => a.position - b.position);

    let output = this.formatHeader(script);

    for (const section of sections) {
      output += this.formatSection(section);
    }

    output += this.formatFooter();

    return output;
  }

  private formatHeader(script: Script): string {
    const title = this.options.uppercase ? script.title.toUpperCase() : script.title;
    const divider = '='.repeat(50);
    const lineBreaks = '\n'.repeat(this.options.lineSpacing);

    return `${divider}${lineBreaks}${title}${lineBreaks}${divider}${lineBreaks}${lineBreaks}`;
  }

  private formatSection(section: ScriptSection): string {
    const sectionLabel = this.getSectionLabel(section.sectionType);
    const header = `=== ${sectionLabel} ===${'\n'.repeat(this.options.lineSpacing)}`;
    const content = this.applyTeleprompterFormatting(section.content);
    const lineBreaks = '\n'.repeat(this.options.lineSpacing + 1);

    return header + content + lineBreaks;
  }

  private getSectionLabel(type: ScriptSection['sectionType']): string {
    const labels: Record<ScriptSection['sectionType'], string> = {
      intro: 'INTRODUCTION',
      story: 'STORY',
      opinion: 'OPINION / COMMENTARY',
      transition: 'TRANSITION',
      close: 'CLOSING'
    };
    return labels[type] || type.toUpperCase();
  }

  private applyTeleprompterFormatting(text: string): string {
    let formatted = text;

    // Apply uppercase if enabled
    if (this.options.uppercase) {
      formatted = formatted.toUpperCase();
    }

    // Add line breaks after sentences for pacing
    if (this.options.sentenceBreaks) {
      // Break on sentence endings
      formatted = formatted.replace(/\. /g, '.\n\n');
      formatted = formatted.replace(/\? /g, '?\n\n');
      formatted = formatted.replace(/! /g, '!\n\n');

      // Add extra space around important punctuation
      formatted = formatted.replace(/ - /g, '\n  -  \n');
      formatted = formatted.replace(/: /g, ':\n\n');
    }

    // Remove multiple consecutive newlines (more than lineSpacing + 1)
    const maxNewlines = '\n'.repeat(this.options.lineSpacing + 1);
    while (formatted.includes(maxNewlines + '\n')) {
      formatted = formatted.replace(maxNewlines + '\n', maxNewlines);
    }

    return formatted;
  }

  private formatFooter(): string {
    const divider = '='.repeat(50);
    const lineBreaks = '\n'.repeat(this.options.lineSpacing);
    return `${lineBreaks}${divider}${lineBreaks}END OF SCRIPT${lineBreaks}${divider}`;
  }

  // Format raw text without script structure
  formatRawText(text: string, title?: string): string {
    const header = title ? `=== ${this.options.uppercase ? title.toUpperCase() : title} ===\n\n` : '';
    return header + this.applyTeleprompterFormatting(text);
  }
}

export const teleprompterFormatter = new TeleprompterFormatter();
