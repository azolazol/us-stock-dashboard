const GAS_URL = 'https://script.google.com/macros/s/AKfycby-zsMkxWrtZkjVjTi21crPAFdelskUJUj_Mzm658yZ2sdMbl8AGI1BitBHu7eVk7U3wg/exec';

let allData = [];
let groupedData = {};
let currentTabDate = null;

// DOM Elements
const loadingEl = document.getElementById('loading');
const resultsContainer = document.getElementById('resultsContainer');
const noResultsEl = document.getElementById('noResults');
const dateTabsContainer = document.getElementById('dateTabs');
const searchInput = document.getElementById('searchInput');

document.addEventListener('DOMContentLoaded', () => {
  fetchData();
  setupTabScrolling();
  
  // Search functionality
  searchInput.addEventListener('input', (e) => {
    renderCards(currentTabDate, e.target.value.trim());
  });
});

async function fetchData() {
  try {
    const response = await fetch(GAS_URL, { redirect: "follow" });
    const result = await response.json();
    
    if (result && result.length > 0) {
      allData = result;
      processGroupedData();
      renderTabs();
    } else {
      showError("저장된 뉴스 요약 데이터가 없습니다.");
    }
  } catch (error) {
    console.error('Fetch error:', error);
    showError("서버에서 데이터를 불러오는데 실패했습니다.");
  }
}

function processGroupedData() {
  groupedData = {};
  
  allData.forEach(item => {
    if (!item.updated) return;
    
    // YYYY-MM-DD 형식으로 날짜 키 생성 (시간 제외)
    const dateObj = new Date(item.updated);
    const dateKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth()+1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
    
    if (!groupedData[dateKey]) {
      groupedData[dateKey] = [];
    }
    groupedData[dateKey].push(item);
  });
}

function renderTabs() {
  // 날짜 내림차순 정렬 (최신순)
  const dates = Object.keys(groupedData).sort((a, b) => new Date(b) - new Date(a));
  
  if (dates.length === 0) return;
  
  dateTabsContainer.innerHTML = '';
  
  const weekDays = ['일','월','화','수','목','금','토'];
  
  dates.forEach((date, index) => {
    const dateObj = new Date(date);
    const label = `${dateObj.getMonth()+1}/${dateObj.getDate()} (${weekDays[dateObj.getDay()]})`;
    
    const btn = document.createElement('button');
    btn.className = 'tab-btn';
    btn.textContent = label;
    btn.dataset.date = date;
    
    // 초기 로딩시 첫 번째 탭 활성화
    if (index === 0) {
      btn.classList.add('active');
      currentTabDate = date;
    }
    
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTabDate = date;
      // 탭 전환시 검색어도 유지하면서 렌더링
      renderCards(date, searchInput.value.trim());
    });
    
    dateTabsContainer.appendChild(btn);
  });
  
  loadingEl.classList.add('hidden');
  renderCards(currentTabDate, searchInput.value.trim());
}

function renderCards(dateKey, searchQuery = "") {
  resultsContainer.innerHTML = '';
  
  if (!groupedData[dateKey]) return;
  
  let items = groupedData[dateKey];
  
  // 검색어 필터링
  if (searchQuery) {
    const lowerQ = searchQuery.toLowerCase();
    items = items.filter(item => {
      const summaryMatch = item.summary && item.summary.toLowerCase().includes(lowerQ);
      const newsMatch = item.news && item.news.toLowerCase().includes(lowerQ);
      return summaryMatch || newsMatch;
    });
  }
  
  if (items.length === 0) {
    noResultsEl.classList.remove('hidden');
    return;
  } else {
    noResultsEl.classList.add('hidden');
  }
  
  items.forEach(item => {
    const dateObj = new Date(item.updated);
    const timeString = dateObj.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    
    // 뉴스 데이터 파싱 (업데이트된 JSON 형식 혹은 기존 Text 형식 모두 호환)
    let newsLinksHtml = '';
    if (item.news) {
      try {
        const parsedNews = JSON.parse(item.news);
        if (Array.isArray(parsedNews)) {
          newsLinksHtml = parsedNews.map(n => {
            const title = n.title.replace(/^- /, ''); // 기존 대시 제거
            if (n.link && n.link !== "") {
              return `<li><a href="${n.link}" target="_blank" rel="noopener noreferrer">${title}</a></li>`;
            } else {
              // 링크가 없는 경우 (이전 데이터)
              return `<li><a href="#" class="disabled-link" onclick="event.preventDefault();">${title}</a></li>`;
            }
          }).join('');
        }
      } catch(e) {
        // 기존 텍스트 기반 데이터 처리 (하위 호환성)
        newsLinksHtml = item.news.split('\\n')
          .filter(line => line.trim() !== '')
          .map(line => `<li><a href="#" class="disabled-link" onclick="event.preventDefault();">${line.replace(/^- /, '')}</a></li>`)
          .join('');
      }
    }
    
    // 개행문자 처리
    const formattedSummary = item.summary ? item.summary.replace(/\\n/g, '<br>') : '';
    
    const card = document.createElement('div');
    card.className = 'news-card';
    
    card.innerHTML = `
      <div class="card-header">
        <div class="time-badge">
          <i class="ri-time-line"></i> ${timeString} 업데이트
        </div>
      </div>
      <div class="ai-summary">
        <h3><i class="ri-sparkling-2-line" style="color: #fbbf24;"></i> AI 핵심 요약</h3>
        <p>${formattedSummary}</p>
      </div>
      <div class="news-links">
        <h4><i class="ri-article-line"></i> 관련 원문 기사</h4>
        <ul>
          ${newsLinksHtml || '<li>뉴스 링크가 없습니다.</li>'}
        </ul>
      </div>
    `;
    
    resultsContainer.appendChild(card);
  });
}

function setupTabScrolling() {
  const scrollLeftBtn = document.getElementById('scrollLeft');
  const scrollRightBtn = document.getElementById('scrollRight');
  
  scrollLeftBtn.addEventListener('click', () => {
    dateTabsContainer.scrollBy({ left: -250, behavior: 'smooth' });
  });
  
  scrollRightBtn.addEventListener('click', () => {
    dateTabsContainer.scrollBy({ left: 250, behavior: 'smooth' });
  });
}

function showError(msg) {
  loadingEl.classList.add('hidden');
  noResultsEl.classList.remove('hidden');
  noResultsEl.innerHTML = `<i class="ri-error-warning-line"></i><p>${msg}</p>`;
}
