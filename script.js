const searchForm = document.getElementById('searchForm');
const cityInput = document.getElementById('cityInput');
const loadingState = document.getElementById('loadingState');
const errorState = document.getElementById('errorState');
const weatherContent = document.getElementById('weatherContent');

const weatherCodeMap = {
  0: ['Clear sky', '☀️'],
  1: ['Mainly clear', '🌤️'],
  2: ['Partly cloudy', '⛅'],
  3: ['Overcast', '☁️'],
  45: ['Fog', '🌫️'],
  48: ['Depositing rime fog', '🌫️'],
  51: ['Light drizzle', '🌦️'],
  53: ['Drizzle', '🌦️'],
  55: ['Dense drizzle', '🌧️'],
  61: ['Light rain', '🌦️'],
  63: ['Rain', '🌧️'],
  65: ['Heavy rain', '🌧️'],
  71: ['Light snow', '🌨️'],
  73: ['Snow', '🌨️'],
  75: ['Heavy snow', '❄️'],
  80: ['Rain showers', '🌦️'],
  81: ['Rain showers', '🌧️'],
  82: ['Violent showers', '⛈️'],
  95: ['Thunderstorm', '⛈️'],
  96: ['Thunderstorm w/ hail', '⛈️'],
  99: ['Severe thunderstorm', '⛈️']
};

function getWeatherInfo(code) {
  return weatherCodeMap[code] || ['Unknown', '🌡️'];
}

function showLoading() {
  loadingState.classList.remove('hidden');
  errorState.classList.add('hidden');
  weatherContent.classList.add('hidden');
}

function showError(message) {
  loadingState.classList.add('hidden');
  weatherContent.classList.add('hidden');
  errorState.classList.remove('hidden');
  errorState.textContent = message;
}

function showContent() {
  loadingState.classList.add('hidden');
  errorState.classList.add('hidden');
  weatherContent.classList.remove('hidden');
}

async function geocodeCity(city) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Geocoding request failed.');
  const data = await res.json();
  if (!data.results || data.results.length === 0) {
    throw new Error(`City "${city}" not found. Try another spelling.`);
  }
  return data.results[0];
}

async function fetchWeather(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,is_day',
    hourly: 'temperature_2m,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
    timezone: 'auto',
    forecast_days: 7
  });
  const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Weather request failed. Please try again.');
  return res.json();
}

function renderWeather(location, weather) {
  document.getElementById('cityName').textContent = `${location.name}, ${location.country || ''}`;
  document.getElementById('dateNow').textContent = new Date().toLocaleDateString(undefined, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const current = weather.current;
  const [condition, icon] = getWeatherInfo(current.weather_code);

  document.getElementById('currentIcon').textContent = icon;
  document.getElementById('currentTemp').textContent = `${Math.round(current.temperature_2m)}°C`;
  document.getElementById('currentCondition').textContent = condition;
  document.getElementById('feelsLike').textContent = `${Math.round(current.apparent_temperature)}°C`;
  document.getElementById('humidity').textContent = `${current.relative_humidity_2m}%`;
  document.getElementById('wind').textContent = `${Math.round(current.wind_speed_10m)} km/h`;
  document.getElementById('precipValue').textContent = `${current.precipitation} mm`;

  // 7-day forecast
  const forecastGrid = document.getElementById('forecastGrid');
  forecastGrid.innerHTML = '';
  weather.daily.time.forEach((date, i) => {
    const [, dayIcon] = getWeatherInfo(weather.daily.weather_code[i]);
    const dayName = i === 0 ? 'Today' : new Date(date).toLocaleDateString(undefined, { weekday: 'short' });
    const div = document.createElement('div');
    div.className = 'forecast-day';
    div.innerHTML = `
      <div class="day-name">${dayName}</div>
      <div class="day-icon">${dayIcon}</div>
      <div class="day-temps">
        <span class="hi">${Math.round(weather.daily.temperature_2m_max[i])}°</span>
        <span class="lo">${Math.round(weather.daily.temperature_2m_min[i])}°</span>
      </div>
    `;
    forecastGrid.appendChild(div);
  });

  // Next 24 hours
  const hourlyScroll = document.getElementById('hourlyScroll');
  hourlyScroll.innerHTML = '';
  const nowIndex = weather.hourly.time.findIndex(t => new Date(t) >= new Date());
  const startIndex = nowIndex === -1 ? 0 : nowIndex;
  for (let i = startIndex; i < startIndex + 24 && i < weather.hourly.time.length; i++) {
    const [, hIcon] = getWeatherInfo(weather.hourly.weather_code[i]);
    const time = new Date(weather.hourly.time[i]);
    const div = document.createElement('div');
    div.className = 'hourly-item';
    div.innerHTML = `
      <div class="hour-time">${time.getHours()}:00</div>
      <div class="hour-icon">${hIcon}</div>
      <div class="hour-temp">${Math.round(weather.hourly.temperature_2m[i])}°</div>
    `;
    hourlyScroll.appendChild(div);
  }

  renderLiveSky(current.weather_code, current.is_day === 1);

  showContent();
}

async function loadCity(city) {
  showLoading();
  try {
    const location = await geocodeCity(city);
    const weather = await fetchWeather(location.latitude, location.longitude);
    renderWeather(location, weather);
  } catch (err) {
    showError(err.message || 'Something went wrong. Please try again.');
  }
}

searchForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const city = cityInput.value.trim();
  if (city) loadCity(city);
});

// ============ LIVE SKY BACKGROUND ENGINE ============
const skyBg = document.getElementById('skyBg');
const celestialEl = document.getElementById('celestial');
const starsEl = document.getElementById('stars');
const cloudsEl = document.getElementById('clouds');
const precipEl = document.getElementById('precip');
const flashEl = document.getElementById('flash');

let lightningInterval = null;

function classifyCondition(code) {
  if ([0, 1].includes(code)) return 'clear';
  if ([2, 3].includes(code)) return 'cloudy';
  if ([45, 48].includes(code)) return 'fog';
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return 'rain';
  if ([71, 73, 75].includes(code)) return 'snow';
  if ([95, 96, 99].includes(code)) return 'storm';
  return 'clear';
}

function clearDynamicElements() {
  cloudsEl.innerHTML = '';
  precipEl.innerHTML = '';
  starsEl.innerHTML = '';
  if (lightningInterval) {
    clearInterval(lightningInterval);
    lightningInterval = null;
  }
}

function buildStars(count) {
  for (let i = 0; i < count; i++) {
    const star = document.createElement('div');
    star.className = 'star';
    star.style.left = Math.random() * 100 + '%';
    star.style.top = Math.random() * 60 + '%';
    star.style.animationDelay = Math.random() * 3 + 's';
    starsEl.appendChild(star);
  }
}

function buildClouds(count, opacity) {
  for (let i = 0; i < count; i++) {
    const cloud = document.createElement('div');
    cloud.className = 'cloud';
    const w = 100 + Math.random() * 120;
    const h = w * 0.35;
    cloud.style.width = w + 'px';
    cloud.style.height = h + 'px';
    cloud.style.top = (5 + Math.random() * 35) + '%';
    cloud.style.left = -200 + 'px';
    cloud.style.opacity = opacity;
    const duration = 40 + Math.random() * 40;
    cloud.style.animationDuration = duration + 's';
    cloud.style.animationDelay = (-Math.random() * duration) + 's';
    cloudsEl.appendChild(cloud);
  }
}

function buildRain(count) {
  for (let i = 0; i < count; i++) {
    const drop = document.createElement('div');
    drop.className = 'drop';
    drop.style.left = Math.random() * 100 + '%';
    drop.style.height = (15 + Math.random() * 20) + 'px';
    const duration = 0.5 + Math.random() * 0.6;
    drop.style.animationDuration = duration + 's';
    drop.style.animationDelay = (-Math.random() * duration) + 's';
    precipEl.appendChild(drop);
  }
}

function buildSnow(count) {
  for (let i = 0; i < count; i++) {
    const flake = document.createElement('div');
    flake.className = 'flake';
    const size = 3 + Math.random() * 4;
    flake.style.width = size + 'px';
    flake.style.height = size + 'px';
    flake.style.left = Math.random() * 100 + '%';
    const duration = 6 + Math.random() * 8;
    flake.style.animationDuration = duration + 's';
    flake.style.animationDelay = (-Math.random() * duration) + 's';
    precipEl.appendChild(flake);
  }
}

function startLightning() {
  lightningInterval = setInterval(() => {
    flashEl.classList.remove('strike');
    void flashEl.offsetWidth; // restart animation
    flashEl.classList.add('strike');
  }, 3500 + Math.random() * 4000);
}

function renderLiveSky(weatherCode, isDay) {
  clearDynamicElements();

  const condition = classifyCondition(weatherCode);
  const period = isDay ? 'day' : 'night';

  skyBg.className = 'sky-bg ' + `${period}-${condition}`;

  // Sun / Moon
  celestialEl.className = 'celestial ' + (isDay ? 'sun' : 'moon');
  celestialEl.classList.toggle('hidden-body', condition === 'storm' || condition === 'rain' || condition === 'cloudy');

  // Stars only at night when sky is clear-ish
  starsEl.classList.toggle('show', !isDay);
  if (!isDay) buildStars(60);

  // Clouds
  if (condition === 'cloudy') buildClouds(6, 0.85);
  else if (condition === 'rain' || condition === 'storm') buildClouds(5, 0.9);
  else if (condition === 'fog') buildClouds(8, 0.5);
  else if (condition === 'clear') buildClouds(2, 0.5);
  else if (condition === 'snow') buildClouds(4, 0.7);

  // Precipitation
  if (condition === 'rain' || condition === 'storm') buildRain(70);
  if (condition === 'snow') buildSnow(50);

  // Lightning
  if (condition === 'storm') startLightning();
}

// Load a default city on first visit
loadCity('Alexandria');
