// Frontdocs Knowledge Base — Client-side JavaScript

(function () {
  'use strict';

  // ============================================================
  // Sidebar toggle (mobile)
  // ============================================================
  const sidebar = document.getElementById('sidebar');
  const toggle = document.getElementById('sidebar-toggle');

  if (toggle && sidebar) {
    toggle.addEventListener('click', function () {
      sidebar.classList.toggle('open');
    });

    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', function (e) {
      if (
        window.innerWidth <= 768 &&
        sidebar.classList.contains('open') &&
        !sidebar.contains(e.target) &&
        !toggle.contains(e.target)
      ) {
        sidebar.classList.remove('open');
      }
    });
  }

  // ============================================================
  // Elasticlunr Search (Zola built-in)
  // ============================================================
  const searchInput = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');

  if (searchInput && searchResults) {
    let searchIndex = null;

    searchInput.addEventListener('focus', function () {
      if (!searchIndex) {
        loadSearchIndex();
      }
    });

    searchInput.addEventListener('input', function () {
      const query = this.value.trim();
      if (query.length < 2) {
        searchResults.innerHTML = '';
        return;
      }
      if (searchIndex) {
        performSearch(query);
      }
    });

    function loadSearchIndex() {
      // Zola generates search_index.en.js that defines a variable
      const script = document.createElement('script');
      script.src = '/search_index.en.js';
      script.onload = function () {
        if (typeof window.elasticlunr !== 'undefined') {
          searchIndex = window.elasticlunr.Index.load(window.searchIndex);
        }
      };

      // Also load elasticlunr
      const elasticScript = document.createElement('script');
      elasticScript.src = '/elasticlunr.min.js';
      elasticScript.onload = function () {
        document.head.appendChild(script);
      };
      document.head.appendChild(elasticScript);
    }

    function performSearch(query) {
      if (!searchIndex) return;

      const results = searchIndex.search(query, {
        bool: 'OR',
        fields: {
          title: { boost: 2 },
          body: { boost: 1 },
        },
      });

      const maxResults = 8;
      const html = results
        .slice(0, maxResults)
        .map(function (result) {
          const item = searchIndex.documentStore.getDoc(result.ref);
          const title = item.title || 'Untitled';
          return (
            '<a class="search-result" href="' +
            result.ref +
            '">' +
            escapeHtml(title) +
            '</a>'
          );
        })
        .join('');

      searchResults.innerHTML = html || '<div class="search-result">No results found</div>';
    }
  }

  // ============================================================
  // Smooth scroll for anchor links
  // ============================================================
  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener('click', function (e) {
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        history.pushState(null, '', this.getAttribute('href'));
      }
    });
  });

  // ============================================================
  // Active nav link highlight
  // ============================================================
  const currentPath = window.location.pathname;
  document.querySelectorAll('.nav-page-link').forEach(function (link) {
    if (link.getAttribute('href') === currentPath) {
      link.classList.add('active');
    }
  });

  // ============================================================
  // Copy button for code blocks
  // ============================================================
  document.querySelectorAll('pre').forEach(function (pre) {
    const btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.textContent = 'Copy';
    btn.setAttribute('aria-label', 'Copy code');

    btn.addEventListener('click', function () {
      const code = pre.querySelector('code');
      const text = code ? code.textContent : pre.textContent;
      navigator.clipboard.writeText(text).then(function () {
        btn.textContent = 'Copied!';
        setTimeout(function () {
          btn.textContent = 'Copy';
        }, 2000);
      });
    });

    pre.style.position = 'relative';
    pre.appendChild(btn);
  });

  // ============================================================
  // Utility
  // ============================================================
  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }
})();
