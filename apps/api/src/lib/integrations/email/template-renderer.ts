import Handlebars from 'handlebars';
import { readFileSync } from 'fs';
import { join } from 'path';
import { logger } from '@aop/utils';

// ---------------------------------------------------------------------------
// Handlebars template renderer
// Templates live in apps/api/src/email-templates/
// ---------------------------------------------------------------------------

// __dirname is available in both CJS (default) and when compiled.
// In ESM mode (ts-node --esm), __dirname may be undefined — fall back to cwd.
const baseDir: string = typeof __dirname !== 'undefined' ? __dirname : process.cwd();

// Walk three levels up from lib/integrations/email/ → apps/api/src/ → email-templates/
const TEMPLATES_DIR = join(baseDir, '..', '..', '..', 'email-templates');

// Register Handlebars helpers
Handlebars.registerHelper('year', () => new Date().getFullYear());
Handlebars.registerHelper('upper', (str: string) => String(str).toUpperCase());
Handlebars.registerHelper(
  'ifEq',
  function (this: unknown, a: unknown, b: unknown, options: Handlebars.HelperOptions) {
    return a === b ? options.fn(this) : options.inverse(this);
  },
);

// Cache compiled templates
const cache = new Map<string, HandlebarsTemplateDelegate>();

function loadTemplate(name: string): HandlebarsTemplateDelegate {
  const cached = cache.get(name);
  if (cached) return cached;

  const filePath = join(TEMPLATES_DIR, `${name}.hbs`);
  let source: string;
  try {
    source = readFileSync(filePath, 'utf-8');
  } catch {
    logger.error({ filePath }, 'Email template not found');
    throw new Error(`Email template '${name}' not found at ${filePath}`);
  }

  const compiled = Handlebars.compile(source);
  cache.set(name, compiled);
  return compiled;
}

// Load and register the base layout as a partial
function registerBaseLayout() {
  const basePath = join(TEMPLATES_DIR, 'base.hbs');
  try {
    const baseSource = readFileSync(basePath, 'utf-8');
    Handlebars.registerPartial('base', baseSource);
  } catch {
    // Base layout is optional — templates can be self-contained
    logger.warn({ basePath }, 'Base email layout not found — skipping partial registration');
  }
}

registerBaseLayout();

export interface RenderedEmail {
  html: string;
  text: string;
}

/**
 * Render a named template with the given data context.
 * Falls back to plain text if HTML is not present in the template output.
 */
export function renderTemplate(templateName: string, data: Record<string, unknown>): RenderedEmail {
  const compiledHtml = loadTemplate(templateName);
  const html = compiledHtml({ ...data, _isHtml: true });

  // Try to load a plain-text version ({name}.txt.hbs) or strip tags as fallback
  let text: string;
  try {
    const compiledText = loadTemplate(`${templateName}.txt`);
    text = compiledText({ ...data, _isHtml: false });
  } catch {
    // Strip HTML tags for plain-text version
    text = html
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  return { html, text };
}
