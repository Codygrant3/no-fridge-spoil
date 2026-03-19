/**
 * Quick image splitter using Canvas API (Node.js)
 *
 * Place your composite image as "onboarding-full.png" or "onboarding-full.jpg"
 * in the project root, then run:
 *
 *   node split-image.js
 *
 * This will create the three onboarding images in the public folder.
 */

const fs = require('fs');
const path = require('path');

// Try to use sharp if available (faster), otherwise instruct user
try {
    const sharp = require('sharp');

    async function splitImage() {
        const inputFile = fs.existsSync('onboarding-full.png')
            ? 'onboarding-full.png'
            : fs.existsSync('onboarding-full.jpg')
            ? 'onboarding-full.jpg'
            : null;

        if (!inputFile) {
            console.error('Error: No composite image found.');
            console.error('Please save your composite image as "onboarding-full.png" or "onboarding-full.jpg"');
            process.exit(1);
        }

        console.log(`📸 Processing: ${inputFile}`);

        // Get image metadata
        const metadata = await sharp(inputFile).metadata();
        const { width, height } = metadata;

        console.log(`Image size: ${width}x${height}`);

        const panelWidth = Math.floor(width / 3);
        console.log(`Each panel: ${panelWidth}x${height}`);

        // Create output directory
        const outputDir = 'public';
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // Extract each panel
        const panels = [
            { file: 'onboarding-step1.jpg', left: 0, name: 'Step 1: Mindful Selection' },
            { file: 'onboarding-step2.jpg', left: panelWidth, name: 'Step 2: The Ticking Clock' },
            { file: 'onboarding-step3.jpg', left: panelWidth * 2, name: 'Step 3: The Rescue Scan' }
        ];

        for (const panel of panels) {
            const outputPath = path.join(outputDir, panel.file);

            await sharp(inputFile)
                .extract({
                    left: panel.left,
                    top: 0,
                    width: panelWidth,
                    height: height
                })
                .jpeg({ quality: 90 })
                .toFile(outputPath);

            console.log(`✅ Created: ${outputPath} - ${panel.name}`);
        }

        console.log('\n🎉 Success! All onboarding images created.');
        console.log('You can now run: npm run dev');
    }

    splitImage().catch(err => {
        console.error('Error:', err);
        process.exit(1);
    });

} catch (err) {
    console.log('📦 Installing required package: sharp');
    console.log('\nRun this command first:');
    console.log('  npm install sharp');
    console.log('\nThen run this script again:');
    console.log('  node split-image.js');
}
