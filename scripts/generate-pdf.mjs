import puppeteer from 'puppeteer';
import handler from 'serve-handler';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, '..', 'dist');
const publicResumesDir = path.join(__dirname, '..', 'public', 'resumes');

const PORT = 3000;

// Read drafts config to get names and IDs
const resumesDir = path.join(__dirname, '..', 'src', 'data', 'resumes');
const getResumeName = (resumeFile) => {
    try {
        const content = fs.readFileSync(path.join(resumesDir, resumeFile), 'utf-8');
        const json = JSON.parse(content);
        return json.basics?.name?.toLowerCase().replace(/[^a-z0-9]/g, '-') || 'jack-stehn';
    } catch {
        return 'jack-stehn';
    }
}

/**
 * Check if a PDF needs regeneration by comparing mtimes.
 * Returns true if the PDF doesn't exist or the JSON is newer than the PDF.
 */
function needsRegeneration(jsonPath, pdfPath) {
    if (!fs.existsSync(pdfPath)) return true;
    const jsonMtime = fs.statSync(jsonPath).mtimeMs;
    const pdfMtime = fs.statSync(pdfPath).mtimeMs;
    return jsonMtime > pdfMtime;
}

/**
 * Set the PDF's mtime to match its source JSON, so that identical
 * source data always produces files with the same timestamp.
 */
function syncMtime(jsonPath, pdfPath) {
    const jsonStat = fs.statSync(jsonPath);
    fs.utimesSync(pdfPath, jsonStat.atime, jsonStat.mtime);
}

// Determine which drafts need PDF regeneration
const resumePdfDir = path.join(distDir, 'resume-pdf');
if (!fs.existsSync(resumePdfDir)) {
    console.error('resume-pdf directory not found in dist. Ensure Astro build completed successfully.');
    process.exit(1);
}

const allDrafts = fs.readdirSync(resumePdfDir).filter(f => fs.statSync(path.join(resumePdfDir, f)).isDirectory());

// Pre-filter: only regenerate PDFs whose source JSON is newer
const draftsToGenerate = [];
const skippedDrafts = [];

for (const draftId of allDrafts) {
    const jsonFileName = `${draftId}.json`;
    const jsonPath = path.join(resumesDir, jsonFileName);
    let targetName = 'jack-stehn';

    if (fs.existsSync(jsonPath)) {
        targetName = getResumeName(jsonFileName);
    }

    const pdfFilename = `${targetName}-resume-${draftId}.pdf`;
    const pdfPath = path.join(publicResumesDir, pdfFilename);

    if (needsRegeneration(jsonPath, pdfPath)) {
        draftsToGenerate.push({ draftId, jsonPath, pdfPath, pdfFilename, targetName });
    } else {
        skippedDrafts.push(draftId);
    }
}

if (skippedDrafts.length > 0) {
    console.log(`⏭ Skipping ${skippedDrafts.length} up-to-date PDF(s): ${skippedDrafts.join(', ')}`);
}

if (draftsToGenerate.length === 0) {
    console.log('✓ All PDFs are up-to-date. Nothing to generate.');
    process.exit(0);
}

console.log(`📄 ${draftsToGenerate.length} PDF(s) need regeneration...`);

// Create server to serve static files from dist
const server = http.createServer((request, response) => {
    return handler(request, response, {
        public: distDir
    });
});

server.listen(PORT, async () => {
    console.log(`Running PDF generation server on http://localhost:${PORT}`);

    try {
        console.log('Launching browser...');
        let browser;
        try {
            browser = await puppeteer.launch({
                headless: 'new',
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
        } catch (launchError) {
            console.warn('⚠️ Could not launch Puppeteer. Skipping PDF generation.');
            console.warn('This is expected in environments like Cloudflare Pages that lack Chrome system dependencies.');
            console.warn(launchError.message);
            process.exitCode = 0; // Exit cleanly so the build doesn't fail
            return;
        }

        const page = await browser.newPage();

        for (const { draftId, jsonPath, pdfPath, pdfFilename } of draftsToGenerate) {
            console.log(`Generating PDF for ${draftId}...`);

            await page.goto(`http://localhost:${PORT}/resume-pdf/${draftId}`, {
                waitUntil: 'networkidle0'
            });

            await page.pdf({
                path: pdfPath,
                format: 'Letter',
                printBackground: true,
                margin: {
                    top: '0',
                    right: '0',
                    bottom: '0',
                    left: '0'
                }
            });

            // Sync the PDF's mtime to the source JSON's mtime
            syncMtime(jsonPath, pdfPath);

            console.log(`✓ Saved ${pdfFilename}`);
        }

        console.log('All PDFs generated successfully!');
        await browser.close();
    } catch (error) {
        console.error('Error generating PDF:', error);
        process.exitCode = 1;
    } finally {
        server.close();
        console.log('Server closed.');
    }
});
