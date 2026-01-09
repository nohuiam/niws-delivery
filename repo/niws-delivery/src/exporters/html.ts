// HTML Exporter for Teleprompter
// Creates standalone HTML files for web-based teleprompter display

export interface HTMLOptions {
  fontSize: string;        // CSS font size (e.g., '48px', '3rem')
  fontFamily: string;      // CSS font family
  lineHeight: number;      // Line height multiplier
  textColor: string;       // CSS color
  backgroundColor: string; // CSS background color
  maxWidth: string;        // Max content width
  autoScroll?: boolean;    // Enable auto-scroll JS
  scrollSpeed?: number;    // Scroll speed in pixels per second
}

const DEFAULT_HTML_OPTIONS: HTMLOptions = {
  fontSize: '48px',
  fontFamily: 'Arial, Helvetica, sans-serif',
  lineHeight: 2,
  textColor: '#000000',
  backgroundColor: '#ffffff',
  maxWidth: '1200px',
  autoScroll: false,
  scrollSpeed: 50
};

export function exportToHTML(content: string, title: string, options?: Partial<HTMLOptions>): string {
  const opts = { ...DEFAULT_HTML_OPTIONS, ...options };

  // Convert newlines to paragraphs
  const paragraphs = content
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(p => p.length > 0)
    .map(p => `<p>${escapeHTML(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n    ');

  // Build auto-scroll script if enabled
  const autoScrollScript = opts.autoScroll ? `
  <script>
    let scrollSpeed = ${opts.scrollSpeed};
    let isScrolling = false;
    let scrollInterval;

    function startScroll() {
      isScrolling = true;
      scrollInterval = setInterval(() => {
        window.scrollBy(0, 1);
        if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight) {
          stopScroll();
        }
      }, 1000 / scrollSpeed);
    }

    function stopScroll() {
      isScrolling = false;
      clearInterval(scrollInterval);
    }

    function toggleScroll() {
      if (isScrolling) {
        stopScroll();
      } else {
        startScroll();
      }
    }

    // Space bar toggles scroll
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        toggleScroll();
      }
      // Arrow keys adjust speed
      if (e.code === 'ArrowUp') {
        scrollSpeed = Math.min(200, scrollSpeed + 10);
      }
      if (e.code === 'ArrowDown') {
        scrollSpeed = Math.max(10, scrollSpeed - 10);
      }
    });
  </script>
  ` : '';

  // Build HTML document
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHTML(title)} - Teleprompter</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: ${opts.fontFamily};
      font-size: ${opts.fontSize};
      line-height: ${opts.lineHeight};
      color: ${opts.textColor};
      background-color: ${opts.backgroundColor};
      padding: 2rem;
      min-height: 100vh;
    }
    .container {
      max-width: ${opts.maxWidth};
      margin: 0 auto;
    }
    h1 {
      font-size: 1.5em;
      margin-bottom: 2rem;
      padding-bottom: 1rem;
      border-bottom: 3px solid currentColor;
    }
    p {
      margin-bottom: 1.5em;
    }
    .section-header {
      font-weight: bold;
      text-transform: uppercase;
      font-size: 0.8em;
      opacity: 0.7;
      margin-top: 2em;
      margin-bottom: 1em;
    }
    .controls {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: rgba(0,0,0,0.8);
      color: white;
      padding: 10px 15px;
      border-radius: 8px;
      font-size: 14px;
      z-index: 1000;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>${escapeHTML(title)}</h1>
    ${paragraphs}
  </div>
  ${opts.autoScroll ? '<div class="controls">Space: Play/Pause | ↑↓: Speed</div>' : ''}
  ${autoScrollScript}
</body>
</html>`;

  return html;
}

// Export with dark mode theme
export function exportToHTMLDarkMode(content: string, title: string, options?: Partial<HTMLOptions>): string {
  return exportToHTML(content, title, {
    ...options,
    textColor: '#ffffff',
    backgroundColor: '#000000'
  });
}

// Helper function to escape HTML special characters
function escapeHTML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
