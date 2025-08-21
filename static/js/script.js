  // Ensure external URLs are absolute (avoid relative paths like /store/... on localhost)
function normalizeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  // Already absolute
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  // Protocol-relative
  if (/^\/\//.test(trimmed)) return `https:${trimmed}`;
  // Known provider path-only URLs -> prefix with proper host
  if (/^\/store\//i.test(trimmed)) return `https://play.google.com${trimmed}`;
  if (/^\/books\//i.test(trimmed)) return `https://books.google.com${trimmed}`;
  // Some APIs may return domains without scheme
  if (/^[\w.-]+\.[a-z]{2,}\/?.*/i.test(trimmed)) return `https://${trimmed}`;
  return trimmed; // leave as-is for in-app routes
}

// Lightweight toast notifications
function showToast(message, type = 'warn', timeout = 4000) {
  try {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
      try { container.removeChild(el); } catch (_) {}
    }, timeout);
  } catch (_) {}
}

// Function to create a single book item HTML
function createBookItem(book) {
  const bookItem = document.createElement('div');
  bookItem.classList.add('book-item');
  bookItem.dataset.bookId = book.id;

  // Generate a placeholder with the first letter of the title if no cover
  const titleText = book.title ? book.title.charAt(0).toUpperCase() : 'B';
  const bgColor = stringToColor(book.title || '');
  const textColor = getContrastYIQ(bgColor);
  
  const description = book.description || 'No description available.';
  const buyLink = book.buy_link || '#';
  const author = book.author || 'Unknown Author';
  
  // Determine book status (free/paid)
  let statusBadge = '';
  if (book.is_free) {
    statusBadge = '<span class="item-pill free">Free</span>';
  } else if (book.saleability === 'FOR_SALE') {
    statusBadge = '<span class="item-pill paid">Paid</span>';
  }
  
  // Add rating display
  const rating = book.rating ? `⭐ ${book.rating.toFixed(1)}` : '⭐ N/A';


  bookItem.innerHTML = `
    <div class="book-cover-container" style="background-color: ${!book.cover ? bgColor : 'transparent'}">
      ${book.cover ? 
        `<img src="${book.cover}" alt="${book.title}" class="book-cover" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\'placeholder-cover\' style=\'background-color:${bgColor}; color:${textColor}\'>${titleText}</div>';" />` : 
        `<div class="placeholder-cover" style="background-color:${bgColor}; color:${textColor}">${titleText}</div>`
      }
    </div>
    <div class="item-badges">
      ${statusBadge}
    </div>
    <div class="rating">${rating}</div>
    <div class="item-info">
      <span class="item-pill">${author.split(',')[0] || 'Book'}</span>
      <div class="item-title" title="${book.title}">${book.title}</div>
      <div class="item-description" title="${description}">${description}</div>
    </div>
  `;

  // Attach full book data to the element for later retrieval (e.g., preview modal)
  bookItem.bookData = book;

  // Remove the automatic buy link redirect - we'll handle this in preview modal

  return bookItem;
}

// Helper functions for color generation
function stringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = hash % 360;
  return `hsl(${hue}, 70%, 30%)`;
}

function getContrastYIQ(hexcolor) {
  // For HSL, we can check the lightness
  const match = hexcolor.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
  if (match) {
    const lightness = parseInt(match[3]);
    return lightness > 50 ? '#000' : '#fff';
  }
  return '#fff';
}

// Modern scroll controls: buttons and wheel-to-horizontal scrolling
function addScrollButtons(carousel) {
  const container = carousel.parentElement;
  container.style.position = 'relative';

  const mkBtn = (cls, label, dir) => {
    const btn = document.createElement('button');
    btn.className = `scroll-btn ${cls}`;
    btn.setAttribute('aria-label', label);
    btn.innerHTML = cls.includes('left') ? '&lsaquo;' : '&rsaquo;';
    btn.addEventListener('click', () => {
      carousel.scrollBy({ left: dir * Math.max(300, carousel.clientWidth * 0.7), behavior: 'smooth' });
    });
    return btn;
  };

  const leftBtn = mkBtn('left-scroll', 'Scroll left', -1);
  const rightBtn = mkBtn('right-scroll', 'Scroll right', 1);
  container.appendChild(leftBtn);
  container.appendChild(rightBtn);

  const update = () => {
    const maxLeft = carousel.scrollWidth - carousel.clientWidth - 5;
    leftBtn.style.display = carousel.scrollLeft > 5 ? 'block' : 'none';
    rightBtn.style.display = carousel.scrollLeft < maxLeft ? 'block' : 'none';
  };
  carousel.addEventListener('scroll', update);
  window.addEventListener('resize', update);
  update();

  // Convert vertical wheel to horizontal scroll for this carousel
  carousel.addEventListener('wheel', (e) => {
    // Let horizontal wheels pass-through naturally; convert vertical to horizontal
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      carousel.scrollBy({ left: e.deltaY, behavior: 'smooth' });
    }
  }, { passive: false });
}

// Function to fetch and display books for a given section
async function loadBooksBySection(sectionName, elementId) {
  const carousel = document.getElementById(elementId);
  if (!carousel) return;

  // Add loading indicator
  carousel.innerHTML = '<div class="loading-spinner"></div>';
  
  try {
    const limit = 12; // keep carousels lightweight
    const response = await fetch(`/api/books/section/${sectionName}?limit=${limit}&_=${Date.now()}`);
    const books = await response.json();

    carousel.innerHTML = '';
    if (!Array.isArray(books) || books.length === 0) {
      carousel.innerHTML = '<div class="no-books">No books found in this section.</div>';
      return;
    }
    
    books.forEach(book => {
      const bookElement = createBookItem(book);
      carousel.appendChild(bookElement);
    });
    // Drag-to-scroll is enabled globally in DOMContentLoaded via enableDragScroll

  } catch (error) {
    console.error(`Error fetching books for section ${sectionName}:`, error);
    carousel.innerHTML = '<div class="error">Failed to load books. Please try again later.</div>';
  }
}

// Function to show book preview
function showBookPreview(book) {
  const modal = document.getElementById('preview-modal');
  const title = document.getElementById('preview-title');
  const cover = document.getElementById('preview-cover');
  const author = document.getElementById('preview-author');
  const year = document.getElementById('preview-year');
  const genre = document.getElementById('preview-genre');
  const description = document.getElementById('preview-description');
  const communityLinks = document.getElementById('community-links');
  const communitySection = modal.querySelector('.preview-community');
  const relatedBooks = document.getElementById('related-books');
  const playBtn = modal.querySelector('.preview-play');
  const addBtn = modal.querySelector('.preview-add');

  // Set book details
  title.textContent = book.title || 'Untitled';
  cover.src = book.cover || '';
  cover.onerror = () => {
    const bgColor = stringToColor(book.title || '');
    const textColor = getContrastYIQ(bgColor);
    cover.outerHTML = `<div class="placeholder-cover" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background-color:${bgColor};color:${textColor};font-size:4rem;font-weight:bold;">${(book.title || 'B').charAt(0).toUpperCase()}</div>`;
  };
  
  author.textContent = book.author || 'Unknown Author';
  year.textContent = book.publishedDate ? new Date(book.publishedDate).getFullYear() : 'N/A';
  genre.textContent = book.categories ? book.categories[0] : 'N/A';
  description.textContent = book.description || 'No description available.';

  // Enhanced community and action links with better preview handling
  const goodreadsUrl = `https://www.goodreads.com/search?q=${encodeURIComponent(book.title || '')}+${encodeURIComponent(book.author || '')}`;
  const infoUrl = normalizeUrl(book.info_link || '#');
  let previewUrl = normalizeUrl(book.preview_link || infoUrl);
  const buyUrl = book.buy_link && book.buy_link !== '#' ? normalizeUrl(book.buy_link) : null;
  const isManga = Array.isArray(book.categories) && book.categories.some(c => /manga/i.test(c));
  
  // Enhanced preview availability check
  const hasPreview = book.viewability && book.viewability !== 'NO_PAGES';
  const previewText = book.is_free ? 'Read Free' : (hasPreview ? 'Preview' : 'Info');

  // Tachiyomi-friendly fallback: if manga and no preview/buy, suggest MangaDex search
  let tachiyomiUrl = '';
  if (isManga && (!previewUrl || previewUrl === '#') && !buyUrl) {
    tachiyomiUrl = `https://mangadex.org/search?q=${encodeURIComponent(book.title || '')}`;
    previewUrl = tachiyomiUrl; // make the Preview button useful
  }

  const communityLinkHtml = [
    `<a href="${goodreadsUrl}" class="community-link" target="_blank" rel="noopener noreferrer">📚 Goodreads</a>`,
    (infoUrl && infoUrl !== '#') ? `<a href="${infoUrl}" class="community-link" target="_blank" rel="noopener noreferrer">ℹ️ Google Books</a>` : '',
    (previewUrl && previewUrl !== '#') ? `<a href="${previewUrl}" class="community-link" target="_blank" rel="noopener noreferrer">👁️ ${previewText}</a>` : '',
    buyUrl ? `<a href="${buyUrl}" class="community-link" target="_blank" rel="noopener noreferrer">💰 Buy (${book.saleability === 'FOR_SALE' ? 'Paid' : 'Available'})</a>` : '',
    tachiyomiUrl ? `<a href="${tachiyomiUrl}" class="community-link" target="_blank" rel="noopener noreferrer">📖 MangaDex</a>` : ''
  ].filter(Boolean).join("\n");

  if (communityLinkHtml) {
    communityLinks.innerHTML = communityLinkHtml;
    communitySection.style.display = '';
  } else {
    communityLinks.innerHTML = '';
    communitySection.style.display = 'none';
  }

  // Update Play button label based on availability
  try {
    if (book.is_free) {
      playBtn.textContent = 'Read Free';
      playBtn.classList.add('btn-free');
    } else if (book.saleability === 'FOR_SALE' && buyUrl) {
      playBtn.textContent = 'Buy';
      playBtn.classList.remove('btn-free');
    } else {
      playBtn.textContent = previewText;
      playBtn.classList.remove('btn-free');
    }
  } catch (_) {}

  // Wire action buttons (preview-first logic, no local PDF usage)
  playBtn.onclick = (e) => {
    e.preventDefault();

    const previewUrl = normalizeUrl(book.preview_link);
    const infoUrl = normalizeUrl(book.info_link);
    const buyUrl = book.buy_link && book.buy_link !== '#' ? normalizeUrl(book.buy_link) : null;
    const isReaderUrl = typeof previewUrl === 'string' && /play\.google\.com\/books\/reader/i.test(previewUrl);

    // If free or previewable, prefer the direct preview link
    if (book.is_free || (book.viewability && book.viewability !== 'NO_PAGES')) {
      if (previewUrl && previewUrl !== '#') {
        if (isReaderUrl) {
          showToast('Opening Google Reader. May be restricted by Google in your region.', 'warn', 5000);
        }
        const w = window.open(previewUrl, '_blank');
        if (!w) {
          showToast('Popup blocked. Please allow popups for this site.', 'error');
        }
      } else if (infoUrl && infoUrl !== '#') {
        const w = window.open(infoUrl, '_blank');
        if (!w) {
          showToast('Popup blocked. Please allow popups for this site.', 'error');
        }
      }
      return;
    }

    // Paid flow: open store/buy link when available
    if (book.saleability === 'FOR_SALE' && buyUrl) {
      const w = window.open(buyUrl, '_blank');
      if (!w) {
        showToast('Popup blocked. Please allow popups for this site.', 'error');
      }
      return;
    }

    // Fallback: open info link
    if (infoUrl && infoUrl !== '#') {
      const w = window.open(infoUrl, '_blank');
      if (!w) {
        showToast('Popup blocked. Please allow popups for this site.', 'error');
      }
    }
  };
  addBtn.onclick = (e) => {
    e.preventDefault();
    addBtn.classList.add('added');
    setTimeout(() => addBtn.classList.remove('added'), 1000);
  };

  // Load related books
  relatedBooks.innerHTML = '<div class="loading-spinner"></div>';
  (async () => {
    try {
      const resp = await fetch(`/api/books/related?title=${encodeURIComponent(book.title || '')}&author=${encodeURIComponent(book.author || '')}`);
      const items = await resp.json();
      relatedBooks.innerHTML = '';
      if (Array.isArray(items) && items.length) {
        items.forEach(rb => {
          const el = document.createElement('div');
          el.className = 'related-book';
          el.innerHTML = `
            <img src="${rb.cover || ''}" alt="${rb.title}" onerror="this.style.display='none'">
            <div class="related-title" style="color:#e5e5e5;font-size:0.9rem;margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${rb.title}</div>
          `;
          el.addEventListener('click', () => showBookPreview(rb));
          relatedBooks.appendChild(el);
        });
      } else {
        relatedBooks.innerHTML = '<div class="no-results">No related books found.</div>';
      }
    } catch (err) {
      console.error('Related books error:', err);
      relatedBooks.innerHTML = '<div class="error">Failed to load related books.</div>';
    }
  })();

  // Show modal
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';

  // Close modal when clicking outside content
  modal.querySelector('.preview-backdrop').addEventListener('click', () => {
    closePreview();
  });

  // Close button
  modal.querySelector('.preview-close').addEventListener('click', (e) => {
    e.stopPropagation();
    closePreview();
  });

  // Close with Escape key
  document.addEventListener('keydown', function handleEscape(e) {
    if (e.key === 'Escape') {
      closePreview();
      document.removeEventListener('keydown', handleEscape);
    }
  });

  function closePreview() {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
}

// Function to create a search result item
function createSearchResultItem(book) {
  const item = document.createElement('div');
  item.className = 'search-result-item';
  
  const titleText = book.title ? book.title.charAt(0).toUpperCase() : 'B';
  const bgColor = stringToColor(book.title || '');
  const textColor = getContrastYIQ(bgColor);
  
  item.innerHTML = `
    <div class="search-result-cover" style="background-color: ${!book.cover ? bgColor : 'transparent'}">
      ${book.cover ? 
        `<img src="${book.cover}" alt="${book.title}" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\'placeholder-cover\' style=\'background-color:${bgColor}; color:${textColor}\'>${titleText}</div>';" />` : 
        `<div class="placeholder-cover" style="background-color:${bgColor}; color:${textColor}">${titleText}</div>`
      }
    </div>
    <div class="search-result-info">
      <h4>${book.title || 'Untitled'}</h4>
      <p>${book.author || 'Unknown Author'}</p>
      <p class="search-result-description">${book.description ? book.description.substring(0, 200) + '...' : 'No description available.'}</p>
    </div>
  `;

  // Attach full book data to the search result element
  item.bookData = book;

  item.addEventListener('click', () => {
    showBookPreview(book);
  });

  return item;
}

// Global variables
let searchTimeout;
const searchTrigger = document.querySelector('.search-trigger');
const searchOverlay = document.querySelector('.search-overlay');
const searchInput = document.querySelector('.search-input');
const searchClose = document.querySelector('.search-close');
const searchResultsGrid = document.getElementById('search-results-grid');
const searchResultsSection = document.getElementById('search-results-section');
const searchResultsCarousel = document.getElementById('search-results-carousel');

// Initialize the application when DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
  // Initialize carousels
  const carousels = document.querySelectorAll('.carousel');
  carousels.forEach(carousel => {
    carousel.style.display = 'flex';
    carousel.style.overflowX = 'auto';
    carousel.style.scrollBehavior = 'smooth';
    carousel.style.scrollbarWidth = 'none';
    addScrollButtons(carousel);
  });

  // Set up search functionality
  if (searchTrigger && searchOverlay && searchInput && searchClose) {
    // Toggle search overlay
    searchTrigger.addEventListener('focus', (e) => {
      e.preventDefault();
      searchOverlay.classList.add('active');
      searchInput.focus();
    });

    // Close search overlay
    searchClose.addEventListener('click', (e) => {
      e.preventDefault();
      searchOverlay.classList.remove('active');
      searchInput.value = '';
      searchResultsGrid.innerHTML = '';
    });

    // Search as you type with debounce
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.trim();
      clearTimeout(searchTimeout);
      
      if (query.length < 2) {
        searchResultsGrid.innerHTML = '<p class="no-results">Type at least 2 characters to search</p>';
        return;
      }

      searchResultsGrid.innerHTML = '<div class="loading-spinner"></div>';
      
      searchTimeout = setTimeout(async () => {
        try {
          const response = await fetch(`/api/books/search?q=${encodeURIComponent(query)}`);
          const data = await response.json();
          const items = Array.isArray(data) ? data : (data.items || []);
          
          searchResultsGrid.innerHTML = '';
          
          if (items.length > 0) {
            items.forEach(book => {
              searchResultsGrid.appendChild(createSearchResultItem(book));
            });
          } else {
            searchResultsGrid.innerHTML = '<p class="no-results">No results found. Try a different search term.</p>';
          }
        } catch (error) {
          console.error('Search error:', error);
          searchResultsGrid.innerHTML = '<p class="error">An error occurred while searching. Please try again.</p>';
        }
      }, 500);
    });
  }

  // Close search with Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && searchOverlay?.classList.contains('active')) {
      searchOverlay.classList.remove('active');
      searchInput.value = '';
      searchResultsGrid.innerHTML = '';
    }
  });

  // Make book items clickable to show preview
  document.addEventListener('click', (e) => {
    const bookItem = e.target.closest('.book-item, .search-result-item');
    if (bookItem && bookItem.bookData) {
      e.preventDefault();
      // Always use the full bookData object attached to the element.
      // This ensures 'preview_link' and 'pdf_link' are available.
      showBookPreview(bookItem.bookData);
    }
  });

  // Load default sections
  const sections = [
    ['manga', 'manga-carousel'],
    ['fiction', 'fiction-carousel'],
    ['scifi', 'scifi-carousel'],
    ['philosophy', 'philosophy-carousel'],
    ['comics', 'comics-carousel'],
  ];

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  (async () => {
    for (const [section, elId] of sections) {
      try {
        await loadBooksBySection(section, elId);
      } catch (e) {
        // Errors are handled/logged inside loadBooksBySection; continue
      }
      await sleep(250); // small delay between requests
    }
  })();
});
