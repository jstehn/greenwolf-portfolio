import puppeteer from 'puppeteer';
import handler from 'serve-handler';
import http from 'http';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
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
 * PDFs are rebuilt only when their inputs change. Inputs are the draft's JSON
 * plus the files that render every PDF; their content hash is stored per draft
 * in a committed manifest, so the check survives git clones and checkouts
 * (unlike mtimes). Pass --force (`npm run build:force-pdf`) or set FORCE_PDF=1
 * to rebuild everything.
 */
const force = process.argv.includes('--force') || Boolean(process.env.FORCE_PDF);
const manifestPath = path.join(__dirname, 'pdf-hashes.json');
const sharedInputs = [
    path.join(__dirname, '..', 'src', 'pages', 'resume-pdf', '[id].astro'),
    path.join(__dirname, '..', 'src', 'data', 'resumeDrafts.ts'),
];

const manifest = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
    : {};

function inputHash(jsonPath) {
    const hash = crypto.createHash('sha256');
    for (const file of [...sharedInputs, jsonPath]) {
        if (fs.existsSync(file)) hash.update(fs.readFileSync(file));
    }
    return hash.digest('hex');
}

function needsRegeneration(draftId, hash, pdfPath) {
    if (force) return true;
    if (!fs.existsSync(pdfPath)) return true;
    return manifest[draftId] !== hash;
}

function saveManifest() {
    const sorted = Object.fromEntries(Object.entries(manifest).sort());
    fs.writeFileSync(manifestPath, JSON.stringify(sorted, null, 2) + '\n');
}

// Determine which drafts need PDF regeneration
const resumePdfDir = path.join(distDir, 'resume-pdf');
if (!fs.existsSync(resumePdfDir)) {
    console.error('resume-pdf directory not found in dist. Ensure Astro build completed successfully.');
    process.exit(1);
}

const allDrafts = fs.readdirSync(resumePdfDir).filter(f => fs.statSync(path.join(resumePdfDir, f)).isDirectory());

// Pre-filter: only regenerate PDFs whose inputs changed
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
    const hash = inputHash(jsonPath);

    if (needsRegeneration(draftId, hash, pdfPath)) {
        draftsToGenerate.push({ draftId, hash, pdfPath, pdfFilename, targetName });
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
            if (process.env.PDF_STRICT) {
                console.error('Could not launch Puppeteer (PDF_STRICT is set):', launchError.message);
                process.exitCode = 1;
                return;
            }
            console.warn('⚠️ Could not launch Puppeteer. Skipping PDF generation.');
            console.warn('This is expected in environments like Cloudflare Pages that lack Chrome system dependencies.');
            console.warn(launchError.message);
            process.exitCode = 0; // Exit cleanly so the build doesn't fail
            return;
        }

        const page = await browser.newPage();

        for (const { draftId, hash, pdfPath, pdfFilename } of draftsToGenerate) {
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

            // Record the inputs this PDF was built from (saved per PDF, so a
            // failure partway through keeps the ones already finished)
            manifest[draftId] = hash;
            saveManifest();

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
