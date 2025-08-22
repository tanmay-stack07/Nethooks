  // Ensure external URLs are absolute (avoid relative paths like /store/... on localhost)
function normalizeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  // Already absolute
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  // Protocol-relative
  if(/^\/\//.test(trimmed)) return `https:${trimmed}`;
  // Known provider path-only URLs -> prefix with proper host
  if(/^\/store\//i.test(trimmed)) return `https://play.google.com${trimmed}`;
  if(/^\/books\//i.test(trimmed)) return `https://books.google.com${trimmed}`;
  // Some APIs may return domains without scheme
  if(/^[\w.-]+\.[a-z]{2,}\/?.*/i.test(trimmed)) return `https://${trimmed}`;
  return trimmed; // leave as-is for in-app routes
}

// Helper: determine if a book has a usable online preview
function hasPreviewAvailable(book) {
  try {
    const hasLink = !!(book.preview_link && book.preview_link !== '#');
    const canView = !!(book.viewability && book.viewability !== 'NO_PAGES');
    return hasLink && canView;
  } catch (_) {
    return false;
  }
}

// Helper: determine if a book should be treated as unavailable for online preview
function isUnavailable(book) {
  try {
    // Unavailable only when there is no usable preview and it isn't a free book.
    return !hasPreviewAvailable(book) && !book.is_free;
  } catch (_) {
    return false;
  }
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
  
  // Determine book status (free/paid/unavailable)
  let statusBadge = '';
  if (book.is_free) {
    statusBadge = '<span class="item-pill free">Free</span>';
  } else if (book.saleability === 'FOR_SALE') {
    statusBadge = '<span class="item-pill paid">Paid</span>';
  }
  const unavailable = isUnavailable(book);
  
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
      ${unavailable ? '<span class="item-pill unavailable" title="No online preview available">Not available</span>' : ''}
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
  // Support both legacy '.video-row' and new '.books-container' wrappers
  const section = carousel.closest('.books-container') || carousel.closest('.video-row');

  // Add loading indicator
  carousel.innerHTML = '<div class="loading-spinner"></div>';
  
  try {
    const limit = 12; // keep carousels lightweight
    const response = await fetch(`/api/books/section/${sectionName}?limit=${limit}&_=${Date.now()}`);
    const books = await response.json();

    carousel.innerHTML = '';
    if (!Array.isArray(books) || books.length === 0) {
      if (section) section.style.display = 'none';
      else carousel.innerHTML = '<div class="no-books">No books found in this section.</div>';
      return;
    }
    
    // Filter out unavailable books (no online preview)
    const usable = books.filter(b => !isUnavailable(b));
    if (!usable.length) {
      if (section) section.style.display = 'none';
      else carousel.innerHTML = '<div class="no-books">No available books in this section.</div>';
      return;
    }
    usable.forEach(book => {
      const bookElement = createBookItem(book);
      if (isUnavailable(book)) {
        bookElement.setAttribute('aria-disabled', 'true');
      }
      carousel.appendChild(bookElement);
    });
    // Drag-to-scroll is enabled globally in DOMContentLoaded via enableDragScroll

  } catch (error) {
    console.error(`Error fetching books for section ${sectionName}:`, error);
    if (section) section.style.display = 'none';
    else carousel.innerHTML = '<div class="error">Failed to load books. Please try again later.</div>';
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
  const unavailable = isUnavailable(book);
  
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
    // Keep Info link, but completely remove Preview links per request
    (!unavailable && infoUrl && infoUrl !== '#') ? `<a href="${infoUrl}" class="community-link" target="_blank" rel="noopener noreferrer">ℹ️ Google Books</a>` : '',
    // Show Buy link when available
    (buyUrl ? `<a href="${buyUrl}" class="community-link" target="_blank" rel="noopener noreferrer">💰 Buy (${book.saleability === 'FOR_SALE' ? 'Paid' : 'Available'})</a>` : ''),
    tachiyomiUrl ? `<a href="${tachiyomiUrl}" class="community-link" target="_blank" rel="noopener noreferrer">📖 MangaDex</a>` : ''
  ].filter(Boolean).join("\n");

  if (communityLinkHtml) {
    communityLinks.innerHTML = communityLinkHtml;
    communitySection.style.display = '';
  } else {
    communityLinks.innerHTML = '';
    communitySection.style.display = 'none';
  }

  // Update Play button label based on availability (disable/remove Preview globally)
  try {
    if (book.saleability === 'FOR_SALE' && buyUrl) {
      // Show active Buy button
      playBtn.style.display = '';
      playBtn.textContent = 'Buy';
      playBtn.title = 'Purchase from store';
      playBtn.classList.remove('btn-free');
      playBtn.removeAttribute('aria-disabled');
      playBtn.disabled = false;
    } else {
      // For any case that would have shown Preview/Read, remove the button
      playBtn.style.display = 'none';
      playBtn.setAttribute('aria-disabled', 'true');
      playBtn.disabled = true;
    }
  } catch (_) {}

  // Wire action buttons (preview-first logic, no local PDF usage)
  playBtn.onclick = (e) => {
    e.preventDefault();
    if (isUnavailable(book)) {
      showToast('This book is not available to preview online.', 'warn');
      return;
    }

    const previewUrl = normalizeUrl(book.preview_link);
    const infoUrl = normalizeUrl(book.info_link);
    const buyUrl = book.buy_link && book.buy_link !== '#' ? normalizeUrl(book.buy_link) : null;
    const hasPreview = book.viewability && book.viewability !== 'NO_PAGES';

    // Disable Preview open: no preview action even if available
    if (book.is_free || hasPreview) {
      showToast('Preview disabled. Use Buy or Info options.', 'warn');
      return;
    }

    // Paid flow: open store/buy link when available
    if (book.saleability === 'FOR_SALE' && buyUrl) {
      const w = window.open(buyUrl, '_blank');
      if (!w) showToast('Popup blocked. Please allow popups for this site.', 'error');
      return;
    }

    // Fallback: open info link (but do not open Google Reader)
    if (infoUrl && infoUrl !== '#') {
      const w = window.open(infoUrl, '_blank');
      if (!w) showToast('Popup blocked. Please allow popups for this site.', 'error');
    }
  };
  addBtn.onclick = (e) => {
    e.preventDefault();
    try {
      const KEY = 'myList';
      const raw = localStorage.getItem(KEY);
      const parsed = (() => { try { return JSON.parse(raw); } catch { return []; } })();
      const list = Array.isArray(parsed) ? parsed : [];

      // Ensure a stable unique id (prefer API id, then volumeId, else fallback)
      const entryId = book.id || book.volumeId || ('gb:' + Math.random().toString(36).slice(2, 10));

      // Deduplicate by id or (title+author) as a fallback
      const normTitle = (book.title || '').toLowerCase().trim();
      const normAuthor = (book.author || '').toLowerCase().trim();
      const exists = list.some(it => it && (
        it.id === entryId ||
        (((it.title||'').toLowerCase().trim() === normTitle) && ((it.author||'').toLowerCase().trim() === normAuthor))
      ));

      if (!exists) {
        const entry = {
          id: entryId,
          title: book.title || '',
          author: book.author || '',
          cover: book.cover || '',
          buy_link: normalizeUrl(book.buy_link || ''),
          info_link: normalizeUrl(book.info_link || book.link || ''),
          added_at: Date.now()
        };
        list.unshift(entry);
        localStorage.setItem(KEY, JSON.stringify(list));
        // Notify same-page listeners (storage event won't fire in the same document)
        try { window.dispatchEvent(new CustomEvent('myList:changed')); } catch {}
        showToast('Added to My List', 'success');
      } else {
        showToast('Already in My List', 'success');
      }
      addBtn.classList.add('added');
      setTimeout(() => addBtn.classList.remove('added'), 1000);
    } catch (err) {
      console.error('mylist local save error:', err);
      showToast('Failed to add locally', 'error');
    }
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
          // Mark and block unavailable related items
          if (isUnavailable(rb)) {
            el.setAttribute('aria-disabled', 'true');
            el.classList.add('unavailable');
          }
          el.addEventListener('click', (e) => {
            e.preventDefault();
            if (isUnavailable(rb)) {
              showToast('This book is not available to preview online.', 'warn');
              return;
            }
            showBookPreview(rb);
          });
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

  // Mark and block unavailable books from opening
  if (isUnavailable(book)) {
    item.setAttribute('aria-disabled', 'true');
    item.classList.add('unavailable');
  }

  item.addEventListener('click', (e) => {
    e.preventDefault();
    if (isUnavailable(book)) {
      showToast('This book is not available to preview online.', 'warn');
      return;
    }
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

// Function to initialize the hero carousel
async function initializeHeroCarousel() {
    const slidesContainer = document.getElementById('hero-carousel-slides');
    const prevButton = document.getElementById('hero-prev');
    const nextButton = document.getElementById('hero-next');

    if (!slidesContainer || !prevButton || !nextButton) {
        return;
    }

    let currentIndex = 0;
    let slides = [];
    let autoPlayInterval;
    let videos = [];

    // Map a video item to hero overlay metadata (title/description/CTA)
    function getHeroMeta(video) {
        const t = (video.title || video.filename || '').toLowerCase();
        // Defaults
        let meta = {
            title: 'Featured',
            description: 'Discover curated books and media.',
            ctaText: 'Explore',
            ctaHref: '#manga-carousel'
        };
        if (/(philosophy|stoic|plato|aristotle|nietzsche)/.test(t)) {
            meta = {
                title: 'The Power of Philosophy',
                description: 'Explore the depths of human thought and wisdom through our curated collection of philosophical works.',
                ctaText: 'Philosophy',
                ctaHref: '#philosophy-carousel'
            };
        } else if (/(sci[-\s]?fi|science fiction|space|alien|cyberpunk)/.test(t)) {
            meta = {
                title: 'Beyond the Stars',
                description: 'Dive into worlds of advanced technology, distant galaxies, and daring exploration.',
                ctaText: 'Sci‑Fi',
                ctaHref: '#scifi-carousel'
            };
        } else if (/(spider|batman|avenger|comic|marvel|dc)/.test(t)) {
            meta = {
                title: 'With Great Power',
                description: 'Swing into iconic heroes and groundbreaking comic sagas.',
                ctaText: 'Comics',
                ctaHref: '#comics-carousel'
            };
        } else if (/(anime|manga|naruto|one piece|aot|bleach|demon slayer|jujutsu|haikyuu)/.test(t)) {
            meta = {
                title: 'World of Anime',
                description: 'Epic arcs, unforgettable heroes, and breathtaking animation await.',
                ctaText: 'Manga',
                ctaHref: '#manga-carousel'
            };
        }
        return meta;
    }

    function updateOverlayFor(video) {
        const meta = getHeroMeta(video);
        const titleEl = document.querySelector('.hero-content-overlay .hero-title');
        const descEl = document.querySelector('.hero-content-overlay .hero-description');
        const btnWrap = document.querySelector('.hero-content-overlay .hero-buttons');
        if (titleEl) titleEl.textContent = meta.title;
        if (descEl) descEl.textContent = meta.description;
        if (btnWrap) {
            btnWrap.innerHTML = '';
            const a = document.createElement('a');
            a.href = meta.ctaHref;
            a.className = 'btn btn-primary';
            a.textContent = meta.ctaText;
            btnWrap.appendChild(a);
        }
    }

    async function fetchAndBuildCarousel() {
        try {
            const response = await fetch(`/api/videos?limit=5&_=${Date.now()}`);
            videos = await response.json();

            if (!videos || videos.length === 0) {
                console.warn('No videos found for hero carousel');
                return;
            }

            // Clear existing slides
            slidesContainer.innerHTML = '';
            
            // Create slides with video backgrounds
            videos.forEach((video, index) => {
                const slide = document.createElement('div');
                slide.className = 'hero-carousel-slide' + (index === 0 ? ' active' : '');
                const poster = video.poster || '/static/images/throfinn.jpg';
                
                slide.innerHTML = `
                    <div class="hero-background">
                        <video src="${video.url}" poster="${poster}" ${index === 0 ? 'autoplay' : ''} muted loop playsinline></video>
                    </div>
                    <div class="hero-vignette"></div>
                `;
                
                slidesContainer.appendChild(slide);
            });

            slides = document.querySelectorAll('.hero-carousel-slide');
            // Start at a random slide each load
            if (slides.length > 0) {
                currentIndex = Math.floor(Math.random() * slides.length);
            }
            updateCarousel();
            startAutoPlay();

        } catch (error) {
            console.error('Failed to load hero carousel videos:', error);
        }
    }

    function updateCarousel() {
        if (slides.length === 0) return;
        
        // Update active class for fade effect
        slides.forEach((slide, index) => {
            if (index === currentIndex) {
                slide.classList.add('active');
                // Play the video for the active slide
                const video = slide.querySelector('video');
                if (video) {
                    video.play().catch(e => console.error('Video play failed:', e));
                }
            } else {
                slide.classList.remove('active');
                // Pause videos for inactive slides
                const video = slide.querySelector('video');
                if (video) {
                    video.pause();
                    video.currentTime = 0;
                }
            }
        });

        // Update overlay content for the current video
        if (Array.isArray(videos) && videos.length) {
            const v = videos[currentIndex % videos.length];
            if (v) updateOverlayFor(v);
        }
    }

    function showNextSlide() {
        currentIndex = (currentIndex + 1) % slides.length;
        updateCarousel();
        startAutoPlay();
    }

    function showPrevSlide() {
        currentIndex = (currentIndex - 1 + slides.length) % slides.length;
        updateCarousel();
        startAutoPlay();
    }

    function startAutoPlay() {
        stopAutoPlay();
        autoPlayInterval = setInterval(showNextSlide, 7000);
    }

    function stopAutoPlay() {
        clearInterval(autoPlayInterval);
    }

    // Event Listeners
    nextButton.addEventListener('click', showNextSlide);
    prevButton.addEventListener('click', showPrevSlide);
    
    // Pause autoplay on hover
    const heroSection = document.querySelector('.hero-carousel-container');
    if (heroSection) {
        heroSection.addEventListener('mouseenter', stopAutoPlay);
        heroSection.addEventListener('mouseleave', startAutoPlay);
    }

    // Touch events for mobile
    let touchStartX = 0;
    let touchEndX = 0;
    
    slidesContainer.addEventListener('touchstart', e => {
        touchStartX = e.changedTouches[0].screenX;
        stopAutoPlay();
    }, { passive: true });
    
    slidesContainer.addEventListener('touchend', e => {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
        startAutoPlay();
    }, { passive: true });
    
    function handleSwipe() {
        const minSwipeDistance = 50;
        const difference = touchStartX - touchEndX;
        
        if (Math.abs(difference) < minSwipeDistance) return;
        
        if (difference > 0) {
            // Swipe left - next slide
            showNextSlide();
        } else {
            // Swipe right - previous slide
            showPrevSlide();
        }
    }

    // Initialize the carousel
    await fetchAndBuildCarousel();
    
    // Add keyboard navigation
    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') {
            showNextSlide();
        } else if (e.key === 'ArrowLeft') {
            showPrevSlide();
        }
    });
}

// Initialize the application when DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
  initializeHeroCarousel();

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
      if (isUnavailable(bookItem.bookData)) {
        showToast('This book is not available to preview online.', 'warn');
        return;
      }
      showBookPreview(bookItem.bookData);
    }
  });

  // Load supported book sections (match the new IDs in home_page.html)
  const sections = [
    ['manga', 'manga-carousel'],
    ['scifi', 'scifi-carousel'],
    ['philosophy', 'philosophy-carousel'],
    ['comics', 'comics-carousel'],
  ];

  // Load videos for the single "More Like This" row
  (async () => {
    try {
      const cont = document.getElementById('video-carousel');
      if (!cont) return;
      cont.innerHTML = '<div class="loading-spinner"></div>';
      const resp = await fetch('/api/videos?_=' + Date.now());
      const videos = await resp.json();
      cont.innerHTML = '';
      videos.forEach(v => {
        const el = document.createElement('div');
        el.className = 'video-item';
        const poster = v.poster || '/static/images/throfinn.jpg';
        el.innerHTML = `
          <div class="video-thumb">
            <img src="${poster}" alt="${v.title}" loading="lazy"/>
          </div>
          <div class="video-title" title="${v.title}">${v.title}</div>
        `;
        // Open in new tab (no modal)
        el.addEventListener('click', () => window.open(v.url, '_blank'));
        cont.appendChild(el);
      });
      addScrollButtons(cont);

      // Helper to render into a specific carousel
      function renderTopicRow(containerId, sectionId, items) {
        const el = document.getElementById(containerId);
        const section = sectionId ? document.getElementById(sectionId) : null;
        if (!el) return;
        el.innerHTML = '';
        if (!items || !items.length) {
          if (section) section.style.display = 'none';
          return;
        }
        items.forEach(v => {
          const node = document.createElement('div');
          node.className = 'video-item';
          const poster = v.poster || '/static/images/throfinn.jpg';
          node.innerHTML = `
            <div class="video-thumb">
              <img src="${poster}" alt="${v.title}" loading="lazy"/>
            </div>
            <div class="video-title" title="${v.title}">${v.title}</div>
          `;
          node.addEventListener('click', () => window.open(v.url, '_blank'));
          el.appendChild(node);
        });
        addScrollButtons(el);
      }

      // Topic filters (extendable map)
      const lc = s => (s || '').toLowerCase();
      const topicMap = {
        manga: ['manga'],
        philosophy: ['philosophy'],
        anime: ['anime', 'naruto', 'one piece', 'bleach', 'aot', 'attack on titan', 'demon slayer', 'jujutsu', 'haikyuu'],
        action: ['action', 'fight', 'battle', 'war', 'avenger', 'mission', 'gun', 'chase'],
        thriller: ['thriller', 'suspense', 'mystery', 'crime'],
        romance: ['romance', 'love', 'rom-com', 'romcom'],
        documentary: ['documentary', 'doc', 'biography', 'history', 'nature'],
        comedy: ['comedy', 'funny', 'humor', 'sitcom'],
        scifi: ['sci-fi', 'scifi', 'science fiction', 'space', 'alien', 'cyberpunk'],
        horror: ['horror', 'scary', 'fear', 'ghost', 'haunt'],
        drama: ['drama']
      };

      function filterByKeywords(vids, words) {
        return vids.filter(v => {
          const t = lc(v.title); const f = lc(v.filename);
          return words.some(w => t.includes(w) || f.includes(w));
        });
      }

    } catch (e) {
      console.error('videos load error', e);
    }
  })();

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
