#!/usr/bin/env python3
"""
Image to Base64 Converter

Convert image files to base64 format for embedding in Markdown files.

Usage:
    python image_to_base64.py <image_path>

Example:
    python image_to_base64.py diagram.png

Output:
    ![alt text](data:image/png;base64,iVBORw0KGgo...)
"""

import sys
import base64
from pathlib import Path


def image_to_base64(image_path: str) -> str:
    """Convert image file to base64 Markdown format."""
    path = Path(image_path)

    if not path.exists():
        raise FileNotFoundError(f"Image file not found: {image_path}")

    # Detect image type from extension
    ext = path.suffix.lower()
    mime_types = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
    }

    mime_type = mime_types.get(ext, 'image/png')

    # Read and encode image
    with open(path, 'rb') as f:
        image_data = f.read()

    base64_data = base64.b64encode(image_data).decode('utf-8')

    # Generate Markdown format
    markdown = f"![{path.stem}](data:{mime_type};base64,{base64_data})"

    return markdown


def main():
    if len(sys.argv) < 2:
        print("Usage: python image_to_base64.py <image_path>")
        print("\nExample:")
        print("  python image_to_base64.py diagram.png")
        sys.exit(1)

    image_path = sys.argv[1]

    try:
        markdown = image_to_base64(image_path)
        print("\n✅ Base64 Markdown generated successfully!")
        print("\nCopy and paste this into your Markdown file:")
        print("-" * 80)
        print(markdown)
        print("-" * 80)

        # Also save to clipboard if possible
        try:
            import pyperclip
            pyperclip.copy(markdown)
            print("\n📋 Copied to clipboard!")
        except ImportError:
            print("\n💡 Tip: Install pyperclip to auto-copy to clipboard")
            print("   pip install pyperclip")

    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
