'use client';

import { useEffect } from 'react';

export default function SearchHighlight() {
  useEffect(() => {
    // Check if we came from search
    const searchTerm = sessionStorage.getItem('wiki-search-term');
    const hash = window.location.hash.slice(1);

    if (hash) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        const element = document.getElementById(hash);
        if (element) {
          // Scroll to element with offset for fixed header
          const yOffset = -80;
          const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset;
          window.scrollTo({ top: y, behavior: 'smooth' });

          // Add highlight animation
          element.classList.add('search-highlight');
          setTimeout(() => {
            element.classList.remove('search-highlight');
          }, 2000);
        }
      }, 100);
    }

    // Highlight search terms in content if we have them
    if (searchTerm) {
      setTimeout(() => {
        highlightSearchTerms(searchTerm);
        // Clear the search term after highlighting
        sessionStorage.removeItem('wiki-search-term');
      }, 200);
    }
  }, []);

  return null;
}

function highlightSearchTerms(term: string) {
  const article = document.querySelector('article.prose');
  if (!article) return;

  const walker = document.createTreeWalker(
    article,
    NodeFilter.SHOW_TEXT,
    null
  );

  const matches: { node: Text; start: number; end: number }[] = [];
  const termLower = term.toLowerCase();

  let node;
  while ((node = walker.nextNode())) {
    const text = node.textContent || '';
    const textLower = text.toLowerCase();
    let idx = 0;

    while ((idx = textLower.indexOf(termLower, idx)) !== -1) {
      matches.push({
        node: node as Text,
        start: idx,
        end: idx + term.length,
      });
      idx += term.length;
    }
  }

  // Highlight first 5 matches (to avoid performance issues)
  const toHighlight = matches.slice(0, 5);

  // Process in reverse to avoid offset issues
  for (let i = toHighlight.length - 1; i >= 0; i--) {
    const match = toHighlight[i];
    const text = match.node.textContent || '';

    // Create highlight wrapper
    const before = text.slice(0, match.start);
    const highlighted = text.slice(match.start, match.end);
    const after = text.slice(match.end);

    const wrapper = document.createElement('span');
    wrapper.innerHTML = `${escapeHtml(before)}<mark class="search-term-highlight">${escapeHtml(highlighted)}</mark>${escapeHtml(after)}`;

    match.node.parentNode?.replaceChild(wrapper, match.node);
  }

  // Remove highlights after animation
  setTimeout(() => {
    const highlights = document.querySelectorAll('.search-term-highlight');
    highlights.forEach((el) => {
      el.classList.add('fade-out');
      setTimeout(() => {
        const parent = el.parentNode;
        if (parent) {
          parent.replaceChild(document.createTextNode(el.textContent || ''), el);
          parent.normalize();
        }
      }, 500);
    });
  }, 2500);
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
