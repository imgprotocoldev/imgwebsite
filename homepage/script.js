(function () {
  'use strict';

  const TOTAL_SUPPLY = 998_968_783; // fallback/default
  const FEE_RATE = 0.05; // 5% of volume
  const REWARDS_SPLIT = 0.9; // 90% of fee to rewards pool
  const INFRA_SPLIT = 0.1; // 10% of fee to infra wallet
  const COIN_ID = 'infinite-money-glitch';
  const COINGECKO_URL =
    `https://api.coingecko.com/api/v3/coins/${COIN_ID}?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false&market_data=true`;

  const $ = (sel) => document.querySelector(sel);

  const form = $('#calculator');
  const volumeInput = $('#volume');
  const holdingsInput = $('#holdings');
  const rewardsEl = $('#rewards');
  const infraEl = $('#infra');
  const dailyEl = $('#daily');
  const monthlyEl = $('#monthly');
  const annualEl = $('#annual');
  const supplyEl = $('#supply');
  const noteEl = document.getElementById('note');

  const solPriceEl = document.getElementById('sol-price'); // legacy id inside old note (not used now)
  const solPricePlainEl = document.getElementById('sol-price-plain'); // legacy external
  const supplyPlainEl = document.getElementById('supply-plain'); // legacy external
  const solPriceTabEl = document.getElementById('sol-price-tab');
  const supplyTabEl = document.getElementById('supply-tab');
  const dailySolEl = document.getElementById('daily-sol');
  const monthlySolEl = document.getElementById('monthly-sol');
  const annualSolEl = document.getElementById('annual-sol');
  const holdingsProgressEl = document.getElementById('holdings-progress');

  // Ensure supply is visible
  supplyEl.textContent = formatNumber(TOTAL_SUPPLY);

  // Format helpers
  function parseNumberLike(value) {
    if (typeof value !== 'string') return Number(value) || 0;
    const cleaned = value.replace(/[^0-9.\-]/g, '');
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : 0;
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
    }).format(value);
  }

  function formatDailyEarnings(value) {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 5,
    }).format(value);
  }

  function formatNumber(value) {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
  }

  function prettyInputFormat(inputEl) {
    const n = parseNumberLike(inputEl.value);
    inputEl.value = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
  }

  let solPriceUsd = 0; // fetched later

  function calculate() {
    const volumeUsd = parseNumberLike(volumeInput.value);
    const userHoldings = parseNumberLike(holdingsInput.value);

    const totalFees = volumeUsd * FEE_RATE; // 5% of volume
    const rewardsPool = totalFees * REWARDS_SPLIT;
    const infraWallet = totalFees * INFRA_SPLIT;

    const userShare = TOTAL_SUPPLY > 0 ? userHoldings / TOTAL_SUPPLY : 0;
    const userDaily = rewardsPool * userShare; // daily distribution from rewards pool
    const userMonthly = userDaily * 30.4167; // average month
    const userAnnual = userDaily * 365;

    rewardsEl.textContent = formatCurrency(rewardsPool);
    infraEl.textContent = formatCurrency(infraWallet);
    dailyEl.textContent = formatDailyEarnings(userDaily);
    monthlyEl.textContent = formatCurrency(userMonthly);
    annualEl.textContent = formatCurrency(userAnnual);

    if (solPriceUsd > 0) {
      const dailySol = userDaily / solPriceUsd;
      const monthlySol = userMonthly / solPriceUsd;
      const annualSol = userAnnual / solPriceUsd;
      if (dailySolEl) dailySolEl.textContent = `${dailySol.toFixed(6)} SOL`;
      if (monthlySolEl) monthlySolEl.textContent = `${monthlySol.toFixed(6)} SOL`;
      if (annualSolEl) annualSolEl.textContent = `${annualSol.toFixed(6)} SOL`;
    }

    // Update holdings progress bar based on 1B max
    if (holdingsProgressEl) {
      // Scale to a 998M cap
      const maxHoldings = 998_000_000; // 998M
      const percent = Math.max(0, Math.min(100, (userHoldings / maxHoldings) * 100));
      holdingsProgressEl.style.width = `${percent}%`;
    }
  }

  async function fetchMarketData() {
    try {
      const res = await fetch(COINGECKO_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      // total_volume in USD (24h) — do not override starter default unless empty/zero
      const volumeUsd = data?.market_data?.total_volume?.usd ?? 0;
      if (Number.isFinite(volumeUsd) && volumeUsd > 0 && parseNumberLike(volumeInput.value) <= 0) {
        volumeInput.value = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(volumeUsd);
      }

      // circulating supply (fallback to total supply)
      const supply =
        data?.market_data?.circulating_supply ?? data?.market_data?.total_supply ?? TOTAL_SUPPLY;
      if (Number.isFinite(supply) && supply > 0) {
        supplyEl.textContent = formatNumber(supply);
        if (supplyPlainEl) supplyPlainEl.textContent = formatNumber(supply);
        if (supplyTabEl) supplyTabEl.textContent = formatNumber(supply);
      }

      const updated = data?.market_data?.last_updated ?? data?.last_updated;
      if (noteEl) {
        const dt = updated ? new Date(updated) : null;
        const ts = dt ? dt.toLocaleString() : 'now';
        noteEl.textContent =
          `Real-time data from CoinGecko. Fee assumed 5% (90% Rewards / 10% Infra). Last updated: ${ts}.`;
      }

      calculate();
    } catch (err) {
      // Keep silent failure but show a small hint
      if (noteEl) {
        noteEl.textContent =
          'Live fetch from CoinGecko failed or rate-limited. Showing estimates with default values.';
      }
    }
  }

  // Fetch SOL price to show SOL conversions
  async function fetchSolPrice() {
    try {
      const res = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
        { cache: 'no-store' }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      solPriceUsd = Number(data?.solana?.usd) || 0;
      if (solPriceEl && solPriceUsd > 0) solPriceEl.textContent = formatCurrency(solPriceUsd);
      if (solPricePlainEl && solPriceUsd > 0) solPricePlainEl.textContent = formatCurrency(solPriceUsd);
      if (solPriceTabEl && solPriceUsd > 0) solPriceTabEl.textContent = formatCurrency(solPriceUsd);
      calculate();
    } catch { }
  }

  async function fetchDexScreenerData() {
    try {
      const res = await fetch(
        'https://api.dexscreener.com/latest/dex/tokens/znv3FZt2HFAvzYf5LxzVyryh3mBXWuTRRng25gEZAjh',
        { cache: 'no-store' }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (data.pairs && data.pairs.length > 0) {
        const pair = data.pairs[0]; // Get the first (usually main) pair

        // Update liquidity
        const liquidity = Number(pair.liquidity?.usd) || 0;
        if (liquidity > 0) {
          document.getElementById('token-liquidity').textContent = formatCompactCurrency(liquidity);
          // Update mobile metrics
          const mobileLiquidity = document.getElementById('liquidity-mobile');
          if (mobileLiquidity) mobileLiquidity.textContent = formatCompactCurrency(liquidity);
        }

        // Update volume
        const volume = Number(pair.volume?.h24) || 0;
        if (volume > 0) {
          document.getElementById('token-volume').textContent = formatCompactCurrency(volume);
          // Update mobile metrics
          const mobileVolume = document.getElementById('volume-mobile');
          if (mobileVolume) mobileVolume.textContent = formatCompactCurrency(volume);
        }

        // Update market cap (price * total supply)
        const priceUsd = Number(pair.priceUsd) || 0;
        const totalSupply = 998959466; // From your tokenomics
        const marketCap = priceUsd * totalSupply;
        if (marketCap > 0) {
          document.getElementById('token-mcap').textContent = formatCompactCurrency(marketCap);
          // Update mobile metrics
          const mobileMarketCap = document.getElementById('marketcap-mobile');
          if (mobileMarketCap) mobileMarketCap.textContent = formatCompactCurrency(marketCap);
        }
      }
    } catch (error) {
      console.log('DexScreener data fetch failed:', error);
    }

    // Fetch token holders count from Solscan
    fetchTokenHolders();
  }

  async function fetchTokenHolders() {
    try {
      // Fetch the Solscan token page to get the holders count
      const response = await fetch('https://solscan.io/token/znv3FZt2HFAvzYf5LxzVyryh3mBXWuTRRng25gEZAjh', {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();

      // Look for the holders count in the HTML
      // Solscan typically displays this in a specific format
      const holdersMatch = html.match(/Holders[^>]*>([^<]+)</) ||
        html.match(/holders[^>]*>([^<]+)</i) ||
        html.match(/"holders":\s*(\d+)/i) ||
        html.match(/Total Holders[^>]*>([^<]+)</);

      if (holdersMatch && holdersMatch[1]) {
        const holdersCount = parseInt(holdersMatch[1].replace(/,/g, ''));
        if (!isNaN(holdersCount)) {
          document.getElementById('token-holders').textContent = formatCompactNumber(holdersCount);
          // Update mobile metrics
          const mobileHolders = document.getElementById('holders-mobile');
          if (mobileHolders) mobileHolders.textContent = formatCompactNumber(holdersCount);
          return;
        }
      }

      // Fallback: try to find any number that looks like a holder count
      const fallbackMatch = html.match(/(\d{1,3}(?:,\d{3})*)\s*holders/i);
      if (fallbackMatch && fallbackMatch[1]) {
        const holdersCount = parseInt(fallbackMatch[1].replace(/,/g, ''));
        if (!isNaN(holdersCount) && holdersCount > 1000) { // Reasonable holder count
          document.getElementById('token-holders').textContent = formatCompactNumber(holdersCount);
          // Update mobile metrics
          const mobileHolders = document.getElementById('holders-mobile');
          if (mobileHolders) mobileHolders.textContent = formatCompactNumber(holdersCount);
          return;
        }
      }

      // If all else fails, show a fallback
      console.log('Could not extract holders count from Solscan, using fallback');
      document.getElementById('token-holders').textContent = formatCompactNumber(22803);
      // Update mobile metrics with fallback
      const mobileHolders = document.getElementById('holders-mobile');
      if (mobileHolders) mobileHolders.textContent = formatCompactNumber(22803);

    } catch (error) {
      console.log('Token holders fetch failed:', error);
      // Fallback to known value
      document.getElementById('token-holders').textContent = formatCompactNumber(22803);
    }
  }

  // Format currency in compact form (e.g., 342.16k, 60.10k, 2.28M)
  function formatCompactCurrency(amount) {
    if (amount >= 1000000) {
      return '$' + (amount / 1000000).toFixed(2) + 'M';
    } else if (amount >= 1000) {
      return '$' + (amount / 1000).toFixed(2) + 'k';
    } else {
      return '$' + amount.toFixed(2);
    }
  }

  // Format numbers in compact form without currency symbol (e.g., 22.80k, 1.25M)
  function formatCompactNumber(amount) {
    if (amount >= 1000000) {
      return (amount / 1000000).toFixed(2) + 'M';
    } else if (amount >= 1000) {
      return (amount / 1000).toFixed(2) + 'k';
    } else {
      return amount.toString();
    }
  }

  // Auto-calc on input
  function formatOnTheFly(inputEl) {
    // Keep caret near the end; simple approach for numeric fields
    const pos = inputEl.selectionStart;
    const before = inputEl.value;
    const raw = before.replace(/[^0-9.\-]/g, '');
    // Only add commas for integer segment, keep decimals if any
    const [intPart, decPart] = raw.split('.');
    const withCommas = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(
      Number(intPart || '0')
    );
    inputEl.value = decPart !== undefined ? `${withCommas}.${decPart}` : withCommas;
    // Restore caret to end
    inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
  }

  // Initialize calculator
  calculate();

  // Initialize inputs
  volumeInput.addEventListener('input', () => {
    prettyInputFormat(volumeInput);
    calculate();
  });

  holdingsInput.addEventListener('input', () => {
    prettyInputFormat(holdingsInput);
    calculate();
  });

  // Animate the $7M+ counter
  function animateCounter() {
    const counterElement = document.getElementById('sol-distributed-counter');
    if (!counterElement) return;

    const targetValue = 7; // 7M
    const duration = 2000; // 2 seconds
    const startTime = Date.now();

    function updateCounter() {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function for smooth animation
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      const currentValue = targetValue * easeOutQuart;

      // Format as currency with M suffix
      const formattedValue = `$${currentValue.toFixed(1)}M +`;
      counterElement.textContent = formattedValue;

      if (progress < 1) {
        requestAnimationFrame(updateCounter);
      } else {
        // Ensure final value is exactly $7M+
        counterElement.textContent = '$7M +';
      }
    }

    updateCounter();
  }

  // Start counter animation when page loads
  window.addEventListener('load', () => {
    setTimeout(animateCounter, 500); // Start after 500ms delay
  });

  // Format on blur, keep raw typing otherwise
  [volumeInput, holdingsInput].forEach((el) => {
    el.addEventListener('blur', () => prettyInputFormat(el));
  });

  // Initial formatting and calculation
  prettyInputFormat(volumeInput);
  prettyInputFormat(holdingsInput);
  calculate();
  fetchMarketData();
  fetchSolPrice();
  fetchDexScreenerData();



  // Smooth scroll for in-page anchors
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href').slice(1);
    const target = document.getElementById(id);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  // Scroll reveal
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) entry.target.classList.add('in-view');
      }
    },
    { threshold: 0.12 }
  );
  document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));
  document.querySelectorAll('.reveal-left, .reveal-right').forEach((el) => observer.observe(el));

  // Only run scroll-in reveals once per element
  const onceObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          onceObserver.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.12 }
  );
  document
    .querySelectorAll('.reveal-left, .reveal-right')
    .forEach((el) => onceObserver.observe(el));

  // Removed Matrix rain in favor of static grid overlay background
})();

// Simple Mobile Slider
document.addEventListener('DOMContentLoaded', function () {
  console.log('DOM loaded, setting up mobile slider');

  const comparisonCards = document.querySelector('.comparison-cards');
  const dots = document.querySelectorAll('.pagination-dots .dot');
  const cards = document.querySelectorAll('.comparison-card');

  console.log('Found elements:', {
    comparisonCards: !!comparisonCards,
    dots: dots.length,
    cards: cards.length
  });

  // Check if we're on mobile
  function isMobile() {
    const mobile = window.innerWidth <= 768;
    console.log('Mobile check:', { width: window.innerWidth, isMobile: mobile });
    return mobile;
  }

  // Function to setup mobile slider
  function setupMobileSlider() {
    console.log('Setting up mobile slider');

    let currentSlide = 0;

    // Hide all cards except the first one
    cards.forEach((card, index) => {
      if (index === 0) {
        card.style.display = 'block';
        console.log(`Showing card ${index}:`, card.querySelector('.card-title')?.textContent);
      } else {
        card.style.display = 'none';
        console.log(`Hiding card ${index}:`, card.querySelector('.card-title')?.textContent);
      }
    });

    // Show pagination dots
    if (dots.length > 0) {
      dots.forEach((dot, index) => {
        dot.classList.toggle('active', index === 0);
        console.log(`Dot ${index} active:`, index === 0);
      });
    }

    // Function to show specific slide
    function showSlide(index) {
      console.log(`Switching to slide ${index}`);

      // Hide all cards
      cards.forEach(card => {
        card.style.display = 'none';
      });

      // Show only the current card
      cards[index].style.display = 'block';
      console.log(`Now showing:`, cards[index].querySelector('.card-title')?.textContent);

      // Update active dot
      dots.forEach((dot, i) => {
        dot.classList.toggle('active', i === index);
      });

      currentSlide = index;
    }

    // Add click events to dots
    dots.forEach((dot, index) => {
      dot.addEventListener('click', function (e) {
        e.preventDefault();
        console.log(`Dot ${index} clicked!`);
        showSlide(index);
      });

      // Also add touch events for better mobile support
      dot.addEventListener('touchend', function (e) {
        e.preventDefault();
        console.log(`Dot ${index} touched!`);
        showSlide(index);
      });
    });

    // Add touch swipe support
    let startX = 0;

    comparisonCards.addEventListener('touchstart', function (e) {
      startX = e.touches[0].clientX;
      console.log('Touch start:', startX);
    }, { passive: true });

    comparisonCards.addEventListener('touchend', function (e) {
      const endX = e.changedTouches[0].clientX;
      const diffX = startX - endX;

      console.log('Touch end:', endX, 'Diff:', diffX);

      if (Math.abs(diffX) > 50) {
        if (diffX > 0) {
          // Swipe left - next slide
          const nextSlide = (currentSlide + 1) % cards.length;
          console.log('Swipe left - next slide:', nextSlide);
          showSlide(nextSlide);
        } else {
          // Swipe right - previous slide
          const prevSlide = (currentSlide - 1 + cards.length) % cards.length;
          console.log('Swipe right - previous slide:', prevSlide);
          showSlide(prevSlide);
        }
      }
    }, { passive: true });

    console.log('Mobile slider ready');
  }

  // Function to setup desktop layout
  function setupDesktopLayout() {
    console.log('Setting up desktop layout');

    // Show all cards
    cards.forEach(card => {
      card.style.display = 'block';
    });

    // Hide pagination dots
    if (dots.length > 0) {
      dots.forEach(dot => {
        dot.classList.remove('active');
      });
    }
  }

  // Initial setup based on screen size
  if (isMobile()) {
    setupMobileSlider();
  } else {
    setupDesktopLayout();
  }

  // Handle window resize
  window.addEventListener('resize', function () {
    console.log('Window resized to:', window.innerWidth);
    if (isMobile()) {
      setupMobileSlider();
    } else {
      setupDesktopLayout();
    }
  });
});

// Tab System for Integration Section
document.addEventListener('DOMContentLoaded', function () {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');

  function switchTab(tabName) {
    console.log('Switching to tab:', tabName);

    // Remove active class from all tabs and contents
    tabButtons.forEach(button => button.classList.remove('active'));
    tabContents.forEach(content => content.classList.remove('active'));

    // Add active class to selected tab and content
    const activeButton = document.querySelector(`[data-tab="${tabName}"]`);
    const activeContent = document.getElementById(`${tabName}-tab`);

    if (activeButton && activeContent) {
      activeButton.classList.add('active');
      activeContent.classList.add('active');
      console.log('Tab switched successfully');
    } else {
      console.log('Tab elements not found:', { activeButton, activeContent });
    }
  }

  // Add event listeners for both click and touch events
  tabButtons.forEach(button => {
    // Click event for desktop
    button.addEventListener('click', function (e) {
      e.preventDefault();
      const tabName = this.getAttribute('data-tab');
      console.log('Click event on tab:', tabName);
      switchTab(tabName);
    });

    // Touch events for mobile
    button.addEventListener('touchstart', function (e) {
      e.preventDefault();
      const tabName = this.getAttribute('data-tab');
      console.log('Touch event on tab:', tabName);
      switchTab(tabName);
    }, { passive: false });

    // Additional mobile support
    button.addEventListener('touchend', function (e) {
      e.preventDefault();
    }, { passive: false });
  });

  console.log('Tab system initialized with', tabButtons.length, 'tabs');
});

// Copy contract address to clipboard
function copyContractAddress() {
  const contractAddress = 'znv3FZt2HFAvzYf5LxzVyryh3mBXWuTRRng25gEZAjh';

  // Try to use the modern clipboard API first
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(contractAddress).then(() => {
      showCopyFeedback();
    }).catch(err => {
      console.error('Failed to copy: ', err);
      fallbackCopyTextToClipboard(contractAddress);
    });
  } else {
    // Fallback for older browsers
    fallbackCopyTextToClipboard(contractAddress);
  }
}

// Fallback copy method for older browsers
function fallbackCopyTextToClipboard(text) {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.top = '0';
  textArea.style.left = '0';
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';

  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    const successful = document.execCommand('copy');
    if (successful) {
      showCopyFeedback();
    }
  } catch (err) {
    console.error('Fallback copy failed: ', err);
  }

  document.body.removeChild(textArea);
}

// Show copy feedback
function showCopyFeedback() {
  const copyButton = document.querySelector('.copy-button');
  if (copyButton) {
    const originalHTML = copyButton.innerHTML;

    // Change to checkmark temporarily
    copyButton.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20,6 9,17 4,12"></polyline>
      </svg>
    `;

    // Reset after 2 seconds
    setTimeout(() => {
      copyButton.innerHTML = originalHTML;
    }, 2000);
  }
}


