#!/usr/bin/env python3
"""
Crop the composite onboarding image into three separate panels.

Usage:
    python crop-onboarding-image.py <input-image-path>

Example:
    python crop-onboarding-image.py onboarding-composite.jpg

This will create:
    - public/onboarding-step1.jpg (left panel)
    - public/onboarding-step2.jpg (middle panel)
    - public/onboarding-step3.jpg (right panel)
"""

import sys
import os

try:
    from PIL import Image
except ImportError:
    print("Error: Pillow library not installed.")
    print("Install it with: pip install Pillow")
    sys.exit(1)


def crop_onboarding_image(input_path):
    """Crop the composite image into three equal panels."""

    if not os.path.exists(input_path):
        print(f"Error: File not found: {input_path}")
        sys.exit(1)

    # Open the image
    img = Image.open(input_path)
    width, height = img.size

    print(f"Image size: {width}x{height}")

    # Calculate panel width (assume 3 equal panels)
    panel_width = width // 3

    print(f"Each panel will be: {panel_width}x{height}")

    # Create output directory
    output_dir = "public"
    os.makedirs(output_dir, exist_ok=True)

    # Crop and save each panel
    panels = [
        ("onboarding-step1.jpg", 0, "Step 1: Mindful Selection"),
        ("onboarding-step2.jpg", panel_width, "Step 2: The Ticking Clock"),
        ("onboarding-step3.jpg", panel_width * 2, "Step 3: The Rescue Scan"),
    ]

    for filename, x_offset, description in panels:
        # Crop the panel
        box = (x_offset, 0, x_offset + panel_width, height)
        panel = img.crop(box)

        # Save to public directory
        output_path = os.path.join(output_dir, filename)
        panel.save(output_path, "JPEG", quality=90, optimize=True)

        print(f"✓ Created {output_path} - {description}")

    print("\n✅ All onboarding images created successfully!")
    print(f"Images saved to: {os.path.abspath(output_dir)}/")
    print("\nYou can now run 'npm run build' and the images will appear in the onboarding.")


def main():
    if len(sys.argv) != 2:
        print("Usage: python crop-onboarding-image.py <input-image-path>")
        print("\nExample:")
        print("  python crop-onboarding-image.py onboarding-composite.jpg")
        sys.exit(1)

    input_path = sys.argv[1]
    crop_onboarding_image(input_path)


if __name__ == "__main__":
    main()
