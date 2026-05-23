"""
Markdown Parser for Immersive Lecture
Converts Markdown content into structured JSON blocks for streaming
"""

import re
from typing import List, Dict, Any
import uuid


class MarkdownParser:
    """Parse Markdown into structured content blocks"""

    def __init__(self):
        self.blocks = []
        self.current_section = 0

    def parse(self, markdown_content: str) -> List[Dict[str, Any]]:
        """
        Parse markdown content into structured blocks

        Args:
            markdown_content: Raw markdown text

        Returns:
            List of content blocks with type and content
        """
        self.blocks = []
        self.current_section = 0

        lines = markdown_content.split('\n')
        i = 0

        while i < len(lines):
            line = lines[i]

            # Skip empty lines
            if not line.strip():
                i += 1
                continue

            # Parse different block types
            if line.startswith('# '):
                # Main title (H1)
                self._add_block('title', line[2:].strip(), level=1)
                i += 1

            elif line.startswith('## '):
                # Section title (H2) - marks new section
                self.current_section += 1
                self._add_block('title', line[3:].strip(), level=2, section=self.current_section)
                i += 1

            elif line.startswith('### '):
                # Subsection title (H3)
                self._add_block('title', line[4:].strip(), level=3, section=self.current_section)
                i += 1

            elif line.startswith('> 💡') or line.startswith('> **💡'):
                # Insight block
                content, i = self._parse_blockquote(lines, i)
                self._add_block('insight', content, section=self.current_section)

            elif line.startswith('$$'):
                # Formula block
                content, i = self._parse_formula(lines, i)
                if content:
                    self._add_block('formula', content, section=self.current_section)

            elif line.startswith('```'):
                # Code block
                content, language, i = self._parse_code_block(lines, i)
                self._add_block('code', content, language=language, section=self.current_section)

            elif line.startswith('- ') or line.startswith('* ') or re.match(r'^\d+\. ', line):
                # List block
                items, i = self._parse_list(lines, i)
                self._add_block('list', items, section=self.current_section)

            else:
                # Regular text paragraph
                content, i = self._parse_paragraph(lines, i)
                if content.strip():
                    self._add_block('text', content, section=self.current_section)

        return self.blocks

    def _add_block(self, block_type: str, content: Any, **metadata):
        """Add a content block"""
        block = {
            'id': str(uuid.uuid4()),
            'type': block_type,
            'content': content,
            'metadata': metadata
        }
        self.blocks.append(block)

    def _parse_blockquote(self, lines: List[str], start: int) -> tuple:
        """Parse blockquote (insight) block"""
        content_lines = []
        i = start

        while i < len(lines) and (lines[i].startswith('> ') or lines[i].strip() == '>'):
            line = lines[i][2:] if len(lines[i]) > 2 else ''
            # Remove emoji and bold markers
            line = re.sub(r'^💡\s*\*?\*?', '', line)
            line = re.sub(r'\*\*', '', line)
            if line.strip():
                content_lines.append(line.strip())
            i += 1

        return ' '.join(content_lines), i

    def _parse_formula(self, lines: List[str], start: int) -> tuple:
        """Parse LaTeX formula block"""
        # Check if it's inline formula ($$...$$) on same line
        line = lines[start]
        if line.count('$$') >= 2:
            # Inline formula
            content = line.split('$$')[1] if '$$' in line else ''
            return content.strip(), start + 1

        # Multi-line formula
        content_lines = []
        i = start + 1  # Skip opening $$

        while i < len(lines) and not lines[i].startswith('$$'):
            content_lines.append(lines[i])
            i += 1

        if i < len(lines):
            i += 1  # Skip closing $$

        return '\n'.join(content_lines).strip(), i

    def _parse_code_block(self, lines: List[str], start: int) -> tuple:
        """Parse code block"""
        first_line = lines[start]
        language = first_line[3:].strip() or 'text'

        content_lines = []
        i = start + 1

        while i < len(lines) and not lines[i].startswith('```'):
            content_lines.append(lines[i])
            i += 1

        if i < len(lines):
            i += 1  # Skip closing ```

        return '\n'.join(content_lines), language, i

    def _parse_list(self, lines: List[str], start: int) -> tuple:
        """Parse list items"""
        items = []
        i = start

        while i < len(lines):
            line = lines[i].strip()

            if not line:
                i += 1
                break

            # Check if it's a list item
            if line.startswith('- ') or line.startswith('* '):
                items.append(line[2:].strip())
                i += 1
            elif re.match(r'^\d+\. ', line):
                items.append(re.sub(r'^\d+\. ', '', line).strip())
                i += 1
            else:
                break

        return items, i

    def _parse_paragraph(self, lines: List[str], start: int) -> tuple:
        """Parse regular text paragraph"""
        content_lines = []
        i = start

        while i < len(lines):
            line = lines[i].strip()

            # Stop at empty line or special markers
            if not line or line.startswith('#') or line.startswith('>') or \
               line.startswith('$$') or line.startswith('```') or \
               line.startswith('- ') or line.startswith('* ') or \
               re.match(r'^\d+\. ', line):
                break

            content_lines.append(line)
            i += 1

        return ' '.join(content_lines), i

    def get_total_sections(self) -> int:
        """Get total number of sections"""
        return self.current_section


def parse_markdown_to_blocks(markdown_content: str) -> Dict[str, Any]:
    """
    Convenience function to parse markdown and return structured data

    Args:
        markdown_content: Raw markdown text

    Returns:
        Dictionary with blocks and metadata
    """
    parser = MarkdownParser()
    blocks = parser.parse(markdown_content)

    return {
        'blocks': blocks,
        'total_sections': parser.get_total_sections(),
        'total_blocks': len(blocks)
    }
