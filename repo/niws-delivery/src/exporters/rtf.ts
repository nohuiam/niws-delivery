// RTF Exporter for Teleprompter
// Creates RTF files with large font, high contrast, easy readability

export interface RTFOptions {
  fontSize: number;        // Font size in half-points (e.g., 96 = 48pt)
  fontFamily: string;      // Font family name
  lineSpacing: number;     // Line spacing multiplier (240 = single, 480 = double)
  textColor: string;       // RGB color (e.g., '0,0,0' for black)
  backgroundColor: string; // RGB color (e.g., '255,255,255' for white)
}

const DEFAULT_RTF_OPTIONS: RTFOptions = {
  fontSize: 96,            // 48pt - large teleprompter size
  fontFamily: 'Arial',
  lineSpacing: 480,        // Double spacing
  textColor: '0,0,0',
  backgroundColor: '255,255,255'
};

export function exportToRTF(content: string, options?: Partial<RTFOptions>): string {
  const opts = { ...DEFAULT_RTF_OPTIONS, ...options };

  // Parse RGB colors
  const [textR, textG, textB] = opts.textColor.split(',').map(n => parseInt(n.trim()));
  const [bgR, bgG, bgB] = opts.backgroundColor.split(',').map(n => parseInt(n.trim()));

  // Escape special RTF characters and convert newlines
  const escapedContent = content
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\n/g, '\\par\\par ')
    .replace(/\t/g, '\\tab ');

  // Build RTF document
  const rtf = `{\\rtf1\\ansi\\ansicpg1252\\deff0
{\\fonttbl{\\f0\\fswiss\\fcharset0 ${opts.fontFamily};}}
{\\colortbl;\\red${textR}\\green${textG}\\blue${textB};\\red${bgR}\\green${bgG}\\blue${bgB};}
\\viewkind4\\uc1
\\pard\\plain\\f0\\fs${opts.fontSize}\\cf1\\cb2\\sl${opts.lineSpacing}\\slmult1
${escapedContent}
\\par}`;

  return rtf;
}

// Export with high-contrast dark mode (white on black)
export function exportToRTFDarkMode(content: string, options?: Partial<Omit<RTFOptions, 'textColor' | 'backgroundColor'>>): string {
  return exportToRTF(content, {
    ...options,
    textColor: '255,255,255',
    backgroundColor: '0,0,0'
  });
}

// Export with custom theme
export function exportToRTFWithTheme(content: string, theme: 'light' | 'dark' | 'sepia', options?: Partial<RTFOptions>): string {
  const themes: Record<string, { textColor: string; backgroundColor: string }> = {
    light: { textColor: '0,0,0', backgroundColor: '255,255,255' },
    dark: { textColor: '255,255,255', backgroundColor: '0,0,0' },
    sepia: { textColor: '59,54,42', backgroundColor: '249,241,228' }
  };

  return exportToRTF(content, {
    ...options,
    ...themes[theme]
  });
}
