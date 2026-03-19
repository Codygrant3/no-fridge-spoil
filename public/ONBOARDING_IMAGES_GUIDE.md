# Onboarding Images Setup Guide

## Required Files

Place these three image files in the `public` folder:

1. **onboarding-step1.jpg** - Left panel (Shopping basket scene)
2. **onboarding-step2.jpg** - Middle panel (Stopwatch and grocery bags)
3. **onboarding-step3.jpg** - Right panel (Phone scanning food)

## How to Crop the Composite Image

The composite image has 3 panels side by side. Crop them as follows:

### Method 1: Using an Image Editor (Photoshop, GIMP, etc.)

1. Open the composite image
2. Note the total width (e.g., 3072px for a 3-panel image at 1024px each)
3. Crop each panel:
   - **Step 1**: Left 1/3 (x: 0, width: 1/3 of total)
   - **Step 2**: Middle 1/3 (x: 1/3, width: 1/3 of total)
   - **Step 3**: Right 1/3 (x: 2/3, width: 1/3 of total)

### Method 2: Using Online Tools

1. Upload to https://www.iloveimg.com/crop-image
2. Select "Crop by ratio" → choose 1:1 for square panels
3. Manually select each third and download separately

### Method 3: Using Command Line (ImageMagick)

If you have ImageMagick installed:

```bash
# Assuming the image is 3072x1024 (3 panels at 1024x1024 each)
convert onboarding-full.jpg -crop 1024x1024+0+0 onboarding-step1.jpg
convert onboarding-full.jpg -crop 1024x1024+1024+0 onboarding-step2.jpg
convert onboarding-full.jpg -crop 1024x1024+2048+0 onboarding-step3.jpg
```

## Image Specifications

- **Format**: JPG or PNG
- **Recommended dimensions**: 800x800px or larger (square)
- **Aspect ratio**: 1:1 (square) for best display
- **File size**: < 500KB each for optimal loading

## Verification

After adding the images, they will automatically appear in the empty inventory onboarding animation, cycling every 4 seconds.

The app will fall back gracefully if images are missing (currently using CSS-generated illustrations).
