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

        // Find all generated resume pages
        const resumePdfDir = path.join(distDir, 'resume-pdf');
        if (!fs.existsSync(resumePdfDir)) {
            console.error('resume-pdf directory not found in dist. Ensure Astro build completed successfully.');
            process.exitCode = 1;
            return;
        }

        const drafts = fs.readdirSync(resumePdfDir).filter(f => fs.statSync(path.join(resumePdfDir, f)).isDirectory());

        console.log(`Found ${drafts.length} resume drafts to convert...`);

        for (const draftId of drafts) {
            console.log(`Generating PDF for ${draftId}...`);

            let targetName = 'jack-stehn'; // fallback

            // Match the draft ID to the resume JSON file to get the name
            // Our IDs are mostly the same as the filenames (e.g. data-engineer -> data-engineer.json)
            // Except for `general` which maps to `general.json` and `everything` which maps to `everything.json`
            const jsonFileName = `${draftId}.json`;
            if (fs.existsSync(path.join(resumesDir, jsonFileName))) {
                targetName = getResumeName(jsonFileName);
            } else if (draftId === 'general') {
                targetName = getResumeName('general.json');
            } else if (draftId === 'everything') {
                targetName = getResumeName('everything.json');
            }

            const pdfFilename = `${targetName}-resume-${draftId}.pdf`;

            await page.goto(`http://localhost:${PORT}/resume-pdf/${draftId}`, {
                waitUntil: 'networkidle0'
            });

            await page.pdf({
                path: path.join(publicResumesDir, pdfFilename),
                format: 'Letter',
                printBackground: true,
                margin: {
                    top: '0',
                    right: '0',
                    bottom: '0',
                    left: '0'
                }
            });
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
