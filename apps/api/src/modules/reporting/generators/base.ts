import puppeteer from 'puppeteer';
import Handlebars from 'handlebars';

export async function renderPdf(
  templateHtml: string,
  context: Record<string, unknown>,
): Promise<Buffer> {
  const template = Handlebars.compile(templateHtml);
  const html = template(context);
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
