const { ipcRenderer } = require('electron');
const path = require('path');

let searchBar, searchIcon;
let animationContainer, gifDisplay, resultsDisplay, contentWrapper;
let webviewContainer, webviewFrame;
let webLinkContainer, webLink, webIcon;
let appContainer;
let finishSpeakingTimeout = null;
let editingReminderId = null;

let reminderContainer, reminderTextInput, reminderTimeInput, reminderSaveBtn, reminderCancelBtn, reminderIcon;

let settingsContainer, settingsBtn, settingsBackBtn, voiceSelect, startupToggle, startupWarning, voiceWarning, searchEngineSelect, instantResponseToggle;
let availableVoices = [];
let currentVoice = null;
let preferredVoiceName = "Microsoft Zira Desktop";
let currentSearchEngine = "bing";
let instantResponse = false;

const appRoot = path.resolve(__dirname, __dirname.includes('app.asar') ? '../assets' : 'assets');

const idleVideo = path.join(appRoot, 'idle.png');
const speakingVideo = path.join(appRoot, 'speaking.png');
const speakingEndVideo = path.join(appRoot, 'speaking-end.png');
const thinkingVideo = path.join(appRoot, 'thinking.png');
const listeningVideo = path.join(appRoot, 'listening.png');
const errorVideo = path.join(appRoot, 'error.png');

const cortanaIcon = path.join(appRoot, 'cortana.png');
const searchIconPng = path.join(appRoot, 'search.png');
const settingsIconPng = path.join(appRoot, 'settings.png');
const closeIconPng = path.join(appRoot, 'close.png');
const bingPng = path.join(appRoot, 'bing.png');
const requestSound = new Audio(path.join(appRoot, 'request.wav'));
const onSound = new Audio(path.join(appRoot, 'on.wav'));
const offSound = new Audio(path.join(appRoot, 'off.wav'));
const errorSound = new Audio(path.join(appRoot, 'error.wav'));

let isBusy = false;
let lastQuery = '';

const jokes = [
    "Why don't scientists trust atoms? Because they make up everything!",
    "I told my wife she should embrace her mistakes. She gave me a hug.",
    "Why did the scarecrow win an award? Because he was outstanding in his field!",
    "I'm reading a book on anti-gravity. It's impossible to put down!",
    "What do you call a fake noodle? An Impasta!",
    "Why don't skeletons fight each other? They don't have the guts.",
    "Why did the math book look sad? Because it had too many problems.",
    "Why can't you hear a pterodactyl go to the bathroom? Because the 'P' is silent.",
    "What do you call cheese that isn't yours? Nacho cheese.",
    "Why did the golfer bring two pairs of pants? In case he got a hole in one.",
    "How do you organize a space party? You planet.",
    "Why did the bicycle fall over? Because it was two-tired.",
    "What do you call a fish wearing a bowtie? Sofishticated.",
    "What did the zero say to the eight? Nice belt!",
    "Where do you learn to make ice cream? Sundae school.",
    "How does a penguin build its house? Igloos it together.",
    "I used to be a baker, but I couldn't make enough dough.",
    "Why don't eggs tell jokes? They'd crack each other up.",
    "What's a vampire's favorite fruit? A neck-tarine.",
    "What did one wall say to the other? I'll meet you at the corner.",
    "Why did the invisible man turn down the job offer? He couldn't see himself doing it.",
    "What's orange and sounds like a parrot? A carrot.",
    "Did you hear about the restaurant on the moon? Great food, no atmosphere.",
    "What do you call a bear with no teeth? A gummy bear.",
    "Why are pirates called pirates? Because they arrrr!",
    "Why couldn't the bicycle stand up by itself? Because it was two tired.",
    "When does a joke become a dad joke? When it becomes apparent.",
    "I have a joke about construction, but I'm still working on it.",
    "Why do bees have sticky hair? Because they use a honeycomb.",
    "What do you call a sad strawberry? A blueberry.",
    "I don't trust stairs. They're always up to something.",
    "What do you call someone with no body and no nose? Nobody knows.",
    "Why was the stadium so cool? It was full of fans."
];
function getJoke() { return jokes[Math.floor(Math.random() * jokes.length)]; }
const timeZoneAbbreviations = { 'est': 'America/New_York', 'edt': 'America/New_York', 'cst': 'America/Chicago', 'cdt': 'America/Chicago', 'mst': 'America/Denver', 'mdt': 'America/Denver', 'pst': 'America/Los_Angeles', 'pdt': 'America/Los_Angeles', 'gmt': 'Etc/GMT', 'utc': 'Etc/UTC', 'bst': 'Europe/London' };

window.addEventListener('DOMContentLoaded', async () => {
    appContainer = document.getElementById('app-container');
    searchBar = document.getElementById('search-bar');
    searchIcon = document.getElementById('search-icon');
    animationContainer = document.getElementById('animation-container');
    gifDisplay = document.getElementById('gif-display');
    resultsDisplay = document.getElementById('results-display');
    contentWrapper = document.getElementById('content-wrapper');
    webviewContainer = document.getElementById('webview-container');
    webviewFrame = document.getElementById('webview-frame');
    webLinkContainer = document.getElementById('web-link-container');
    webLink = document.getElementById('web-link');
    webIcon = document.getElementById('web-icon');

    reminderContainer = document.getElementById('reminder-container');
    reminderIcon = document.getElementById('reminder-icon');
    reminderTextInput = document.getElementById('reminder-text-input');
    reminderTimeInput = document.getElementById('reminder-time-input');
    reminderSaveBtn = document.getElementById('reminder-save-btn');
    reminderCancelBtn = document.getElementById('reminder-cancel-btn');

    settingsContainer = document.getElementById('settings-container');
    settingsBtn = document.getElementById('settings-btn');
    settingsBackBtn = document.getElementById('settings-back-btn');
    voiceSelect = document.getElementById('voice-select');
    startupToggle = document.getElementById('startup-toggle');
    startupWarning = document.getElementById('startup-warning');
    voiceWarning = document.getElementById('voice-warning');
    searchEngineSelect = document.getElementById('search-engine-select');
    instantResponseToggle = document.getElementById('instant-response-toggle');

    document.getElementById('settings-btn-icon').src = settingsIconPng;
    document.getElementById('close-btn-icon').src = closeIconPng;
    searchIcon.src = cortanaIcon;
    reminderIcon.src = idleVideo;

    document.getElementById('close-btn').addEventListener('click', () => ipcRenderer.send('close-app'));
    searchBar.addEventListener('keydown', (event) => { if (event.key === 'Enter') onSearch(); });
    searchBar.addEventListener('focus', () => {
        if (animationContainer.className === 'active') {
            setStateIdle();
        } else {
            gifDisplay.src = listeningVideo;
        }
        onSound.play();
        searchIcon.src = searchIconPng;
    });
    searchBar.addEventListener('blur', () => {
        if (animationContainer.className === 'idle') {
            gifDisplay.src = idleVideo;
        }
        offSound.play();
        searchIcon.src = cortanaIcon;
    });

    webLink.addEventListener('click', (e) => {
        e.preventDefault();
        if (lastQuery) {
            const url = getSearchUrl(lastQuery);
            ipcRenderer.send('open-external-link', url);
        }
    });

    webviewFrame.addEventListener('will-navigate', (e) => {
        e.preventDefault();
        ipcRenderer.send('open-external-link', e.url);
    });

    reminderSaveBtn.addEventListener('click', onSaveReminder);
    reminderCancelBtn.addEventListener('click', setStateIdle);
    reminderTextInput.addEventListener('input', updateSaveButtonState);
    reminderTimeInput.addEventListener('input', updateSaveButtonState);

    settingsBtn.addEventListener('click', showSettingsUI);
    settingsBackBtn.addEventListener('click', setStateIdle);
    voiceSelect.addEventListener('change', onVoiceChanged);
    startupToggle.addEventListener('change', onStartupToggleChanged);
    searchEngineSelect.addEventListener('change', onSearchEngineChanged);
    instantResponseToggle.addEventListener('change', onInstantResponseToggleChanged);

    const mobileUserAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Mobile/15E148 Safari/604.1';
    webviewFrame.setAttribute('useragent', mobileUserAgent);

    ipcRenderer.on('go-idle-and-close', () => {
        if (!appContainer.classList.contains('visible')) return;

        const onAnimationEnd = () => {
            if (!appContainer.classList.contains('visible')) {
                ipcRenderer.send('hide-window');
                setStateIdle();
            }
        };

        appContainer.addEventListener('transitionend', onAnimationEnd, { once: true });
        appContainer.classList.remove('visible');
    });

    ipcRenderer.on('trigger-enter-animation', () => {
        requestAnimationFrame(() => {
            appContainer.classList.add('visible');
            searchBar.focus();
        });
    });

    ipcRenderer.on('command-failed', (event, { command }) => {
        if (command === 'open-application') {
            const errorText = `Sorry, I had trouble opening that. Make sure it's installed correctly.`;
            displayAndSpeak(errorText, onActionFinished, {}, true);
        }
    });

    await loadAndApplySettings();
    setupTTS();
    setStateIdle();
});

function showSettingsUI() {
    animationContainer.style.display = 'none';
    reminderContainer.classList.remove('visible');
    webviewContainer.classList.remove('visible');
    ipcRenderer.send('set-webview-visibility', false);
    ipcRenderer.send('set-settings-visibility', true);

    settingsContainer.classList.add('visible');

    searchBar.disabled = true;
    searchBar.placeholder = 'Unavailable...';
    isBusy = false;
}

async function loadAndApplySettings() {
    const settings = await ipcRenderer.invoke('get-settings');
    preferredVoiceName = settings.preferredVoice;

    startupToggle.checked = settings.openAtLogin;
    startupWarning.style.display = settings.openAtLogin ? 'none' : 'block';

    currentSearchEngine = settings.searchEngine;
    searchEngineSelect.value = settings.searchEngine;

    instantResponse = settings.instantResponse;
    instantResponseToggle.checked = settings.instantResponse;
}

function onVoiceChanged() {
    const selectedVoiceName = voiceSelect.value;
    preferredVoiceName = selectedVoiceName;
    currentVoice = availableVoices.find(v => v.name === selectedVoiceName) || null;
    ipcRenderer.send('set-setting', { key: 'preferredVoice', value: selectedVoiceName });
}

function onStartupToggleChanged() {
    const isEnabled = startupToggle.checked;
    startupWarning.style.display = isEnabled ? 'none' : 'block';
    ipcRenderer.send('set-setting', { key: 'openAtLogin', value: isEnabled });
}

function onSearchEngineChanged() {
    currentSearchEngine = searchEngineSelect.value;
    ipcRenderer.send('set-setting', { key: 'searchEngine', value: currentSearchEngine });
}

function onInstantResponseToggleChanged() {
    instantResponse = instantResponseToggle.checked;
    ipcRenderer.send('set-setting', { key: 'instantResponse', value: instantResponse });
}

function displayAndSpeak(text, callback, options = {}, isError = false) {
    resultsDisplay.innerHTML = '';

    const p = document.createElement('p');
    p.className = 'fade-in-item';
    p.textContent = text;
    resultsDisplay.appendChild(p);

    if (options.showWebLink) {
        showWebLink();
    }

    const onSpeechEndCallback = isError ? () => {
        gifDisplay.src = errorVideo;
        setTimeout(() => {
            isBusy = false;
            searchBar.disabled = false;
            searchBar.placeholder = 'Type here to search';
            gifDisplay.src = idleVideo;
        }, 3800);
    } : callback;

    if (isError) {
        errorSound.play();
        errorSound.onended = () => speak(text, onSpeechEndCallback);
    } else {
        speak(text, onSpeechEndCallback);
    }
}

function setupTTS() {
    function populateAndSetVoices() {
        availableVoices = window.speechSynthesis.getVoices();
        if (availableVoices.length === 0) return;

        voiceSelect.innerHTML = '';
        availableVoices.forEach(voice => {
            const option = document.createElement('option');
            option.textContent = `${voice.name} (${voice.lang})`;
            option.value = voice.name;
            voiceSelect.appendChild(option);
        });

        const ziraIsAvailable = availableVoices.some(v => v.name.includes("Zira"));
        voiceWarning.style.display = ziraIsAvailable ? 'none' : 'block';

        const preferredVoiceIsAvailable = availableVoices.some(v => v.name === preferredVoiceName);

        if (preferredVoiceIsAvailable) {
            voiceSelect.value = preferredVoiceName;
        } else {
            const defaultVoice = availableVoices.find(v => v.name.includes("Zira")) || availableVoices[0];
            if (defaultVoice) {
                voiceSelect.value = defaultVoice.name;
                preferredVoiceName = defaultVoice.name;
                ipcRenderer.send('set-setting', { key: 'preferredVoice', value: preferredVoiceName });
            }
        }
        
        currentVoice = availableVoices.find(v => v.name === voiceSelect.value) || null;
    }

    if (window.speechSynthesis.getVoices().length === 0) {
        window.speechSynthesis.onvoiceschanged = populateAndSetVoices;
    } else {
        populateAndSetVoices();
    }
}

function speak(text, onSpeechEndCallback) {
    window.speechSynthesis.cancel();
    if (!currentVoice || !text) {
        if (onSpeechEndCallback) onSpeechEndCallback();
        return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = currentVoice;
    utterance.onend = () => { if (onSpeechEndCallback) onSpeechEndCallback(); };
    utterance.onerror = () => { if (onSpeechEndCallback) onSpeechEndCallback(); };
    window.speechSynthesis.speak(utterance);
}

function onActionFinished() {
    if (animationContainer.className === 'idle') {
        isBusy = false;
        return;
    }

    isBusy = false;
    gifDisplay.src = speakingEndVideo;
    searchBar.disabled = false;
    searchBar.placeholder = 'Type here to search';

    finishSpeakingTimeout = setTimeout(() => {
        if (animationContainer.className === 'active') {
            gifDisplay.src = idleVideo;
        }
    }, 1000);
}

function setStateIdle() {
    if (animationContainer.className === 'idle' && document.activeElement === searchBar) return;
    
    if (settingsContainer.classList.contains('visible')) {
        ipcRenderer.send('set-settings-visibility', false);
        settingsContainer.classList.remove('visible');
    }

    editingReminderId = null;
    reminderContainer.classList.remove('visible');
    animationContainer.style.display = 'block';

    clearTimeout(finishSpeakingTimeout);
    window.speechSynthesis.cancel();
    requestSound.pause();
    requestSound.currentTime = 0;

    isBusy = false;

    if (searchIcon) searchIcon.src = cortanaIcon;
    ipcRenderer.send('set-webview-visibility', false);
    webviewContainer.classList.remove('visible');
    animationContainer.className = 'idle';
    gifDisplay.src = idleVideo;
    if(document.activeElement === searchBar) {
        gifDisplay.src = listeningVideo;
    }
    resultsDisplay.innerHTML = `<p class="fade-in-item">What's on your mind?</p>`;
    webLinkContainer.style.display = 'none';
    webLinkContainer.style.opacity = '0';

    searchBar.disabled = false;
    searchBar.placeholder = 'Type here to search';
}

function setStateActive() {
    clearTimeout(finishSpeakingTimeout);
    animationContainer.className = 'active';
}

function getSearchUrl(query) {
    const encodedQuery = encodeURIComponent(query);
    switch (currentSearchEngine) {
        case 'duckduckgo':
            return `https://duckduckgo.com/?q=${encodedQuery}`;
        case 'bing':
        default:
            return `https://www.bing.com/search?q=${encodedQuery}`;
    }
}

function showWebView(url, showLink = true) {
    ipcRenderer.send('set-webview-visibility', true);
    webviewFrame.src = url;
    webviewContainer.classList.add('visible');
    if (showLink) {
        showWebLink();
    }
}

function performWebSearch(query) {
    const summaryText = `Here is what I found for "${query}".`;
    displayAndSpeak(summaryText, onActionFinished, {}, false);
    const searchUrl = getSearchUrl(query);
    showWebView(searchUrl, false);
}

function showWebLink() {
    const webLinkSpan = webLink.querySelector('span');

    if (currentSearchEngine === 'bing') {
        webIcon.src = bingPng;
        webLinkSpan.textContent = 'See more results on Bing.com';
    } else if (currentSearchEngine === 'duckduckgo') {
        webIcon.src = searchIconPng;
        webLinkSpan.textContent = 'See more results on DuckDuckGo';
    }

    webLinkContainer.style.display = 'block';
    setTimeout(() => {
        webLinkContainer.style.animation = 'fadeIn 0.5s forwards';
        webLinkContainer.style.opacity = '1';
    }, 200);
}

function calculate(query) {
    let responseText;
    try {
        const result = new Function('return ' + query)();
        if (isNaN(result) || !isFinite(result)) {
            throw new Error('Invalid calculation');
        }
        responseText = `The answer is ${result}.`;
        displayAndSpeak(responseText, onActionFinished, { showWebLink: true }, false);
    } catch (error) {
        responseText = `Sorry, that doesn't look like a valid calculation.`;
        displayAndSpeak(responseText, onActionFinished, { showWebLink: true }, true);
    }
}

async function getWeather(location) {
    let responseText;
    try {
        const geoResponse = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`);
        if (!geoResponse.ok) {
            responseText = `Sorry, I had trouble connecting to the location service.`;
            displayAndSpeak(responseText, onActionFinished, { showWebLink: true }, true);
            return;
        }

        const geoData = await geoResponse.json();
        if (!geoData.results || geoData.results.length === 0) {
            responseText = `Sorry, I couldn't find a location named ${location}.`;
            displayAndSpeak(responseText, onActionFinished, { showWebLink: true }, true);
            return;
        }

        const { name, admin1, country, latitude, longitude } = geoData.results[0];
        const locationNameForSpeech = admin1 ? `${name}, ${admin1}` : `${name}, ${country}`;

        const weatherUrl = `https://www.msn.com/en-us/weather/forecast/in-${name},${admin1}?lat=${latitude}&lon=${longitude}&ocid=ansmsnweather`;

        lastQuery = `weather in ${location}`;
        responseText = `Here's the weather from MSN for ${locationNameForSpeech}.`;
        displayAndSpeak(responseText, onActionFinished, {}, false);
        showWebView(weatherUrl);

    } catch (error) {
        responseText = `Sorry, an unexpected error occurred while getting the weather.`;
        displayAndSpeak(responseText, onActionFinished, { showWebLink: true }, true);
    }
}

async function getTimeForLocation(rawInput) {
    let text;
    try {
        let timezonePath;
        const lowerCaseInput = rawInput.trim().toLowerCase();

        if (timeZoneAbbreviations[lowerCaseInput]) {
            timezonePath = timeZoneAbbreviations[lowerCaseInput];
        } else {
            timezonePath = rawInput.trim().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('_');
        }

        const response = await fetch(`https://worldtimeapi.org/api/timezone/${timezonePath}`);
        const data = await response.json();
        if (!response.ok || data.error) throw new Error(data.error || 'Invalid timezone');
        const dateTime = new Date(data.datetime);
        const formattedTime = dateTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const apiAbbreviation = data.abbreviation ? `(${data.abbreviation})` : '';
        text = `The time in ${rawInput.trim()} ${apiAbbreviation} is ${formattedTime}.`;
        displayAndSpeak(text, onActionFinished, { showWebLink: true }, false);
    } catch (error) {
        text = `Sorry, I couldn't find the time for '${rawInput.trim()}'.`;
        displayAndSpeak(text, onActionFinished, { showWebLink: true }, true);
    }
}

function getLocalTime() {
    const now = new Date();
    const text = `The local time is ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    displayAndSpeak(text, onActionFinished, { showWebLink: true }, false);
}

function getDate() {
    const now = new Date();
    const text = `Today's date is ${now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;
    displayAndSpeak(text, onActionFinished, { showWebLink: true }, false);
}

async function getAppVersion() {
    const version = await ipcRenderer.invoke('get-app-version');
    const responseText = `I'm running on version ${version}.`;
    displayAndSpeak(responseText, onActionFinished, {}, false);
}

function updateSaveButtonState() {
    const reminderText = reminderTextInput.value.trim();
    const timeText = reminderTimeInput.value.trim();
    reminderSaveBtn.disabled = !(reminderText && timeText);
}

function showReminderUI(options = {}) {
    const { initialText = '', initialTime = '', id = null } = options;
    editingReminderId = id;

    animationContainer.style.display = 'none';
    reminderContainer.classList.add('visible');

    reminderTextInput.value = initialText;
    reminderTimeInput.value = initialTime;

    updateSaveButtonState();

    isBusy = false;
    searchBar.disabled = true;
    searchBar.placeholder = 'Set your reminder...';

    if (!initialText) {
        reminderTextInput.focus();
    } else {
        reminderTimeInput.focus();
    }
}

function parseDateTime(text) {
    const now = new Date();
    let date = new Date(now);
    text = text.toLowerCase();

    if (text.includes('tonight')) {
        date.setHours(21, 0, 0, 0);
    }
    else if (text.includes('tomorrow')) {
        date.setDate(now.getDate() + 1);
    }
    else {
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        for (let i = 0; i < days.length; i++) {
            if (text.includes(days[i])) {
                const dayIndex = i;
                const currentDay = now.getDay();
                let dayDiff = dayIndex - currentDay;
                if (dayDiff <= 0) {
                    dayDiff += 7;
                }
                date.setDate(now.getDate() + dayDiff);
                break;
            }
        }
    }

    const timeMatch = text.match(/(\d{1,2})(:\d{2})?\s?(am|pm)?/);
    if (timeMatch) {
        let [_, hourStr, minuteStr, ampm] = timeMatch;
        let hour = parseInt(hourStr, 10);
        let minute = minuteStr ? parseInt(minuteStr.slice(1), 10) : 0;

        if (ampm === 'pm' && hour < 12) {
            hour += 12;
        } else if (ampm === 'am' && hour === 12) {
            hour = 0;
        }

        date.setHours(hour, minute, 0, 0);
        if (date < now && !text.includes('tomorrow') && !days.some(d => text.includes(d))) {
            date.setDate(date.getDate() + 1);
        }
    } else if (text.includes('tonight')) {
    } else {
        date.setHours(9, 0, 0, 0);
    }

    const relativeTimeMatch = text.match(/(\d+)\s*(minute|second)s?/);
    if (relativeTimeMatch) {
        const timeValue = parseInt(relativeTimeMatch[1]);
        const unit = relativeTimeMatch[2];
        if (unit === 'minute') {
            date = new Date(now.getTime() + timeValue * 60000);
        } else if (unit === 'second') {
            date = new Date(now.getTime() + timeValue * 1000);
        }
    }

    return date;
}

function formatDateTimeForInput(date) {
    const pad = (num) => num.toString().padStart(2, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function onSaveReminder() {
    const reminder = reminderTextInput.value.trim();
    const timeValue = reminderTimeInput.value;

    if (reminder && timeValue) {
        const reminderDate = new Date(timeValue);
        const reminderPayload = { reminder, reminderTime: reminderDate.toISOString() };
        let text;

        if (editingReminderId) {
            ipcRenderer.send('update-reminder', { id: editingReminderId, ...reminderPayload });
            text = `OK. I've updated your.`;
        } else {
            ipcRenderer.send('set-reminder', reminderPayload);
            const friendlyTime = reminderDate.toLocaleString([], { weekday: 'long', hour: '2-digit', minute: '2-digit' });
            text = `OK. I'll remind you to "${reminder}" on ${friendlyTime}.`;
        }

        editingReminderId = null;
        reminderContainer.classList.remove('visible');
        animationContainer.style.display = 'block';
        setStateActive();
        gifDisplay.src = speakingVideo;

        displayAndSpeak(text, onActionFinished, {}, false);
    } else {
        const errorText = "Please enter both a reminder and a valid time.";
        displayAndSpeak(errorText, onActionFinished, {}, true);
    }
}

async function handleOpenApplication(appName) {
    displayAndSpeak(`Looking for ${appName}...`, onActionFinished, {}, false);

    const apps = await ipcRenderer.invoke('find-application', appName);

    if (apps.length === 0) {
        ipcRenderer.send('open-application-fallback', appName);
        const responseText = `I couldn't find "${appName}" in your Start Menu, but I'll try opening it directly.`;
        displayAndSpeak(responseText, onActionFinished, {}, false);
    } else if (apps.length === 1) {
        ipcRenderer.send('open-path', apps[0].path);
        const responseText = `Opening ${apps[0].name}...`;
        displayAndSpeak(responseText, onActionFinished, {}, false);
    } else {
        let responseText = "I found a few options. Which one did you mean?";
        resultsDisplay.innerHTML = `<p class="fade-in-item" style="margin-bottom: 10px;">${responseText}</p>`;

        apps.slice(0, 5).forEach((app, index) => {
            const btn = document.createElement('button');
            btn.textContent = app.name;
            btn.className = 'choice-button fade-in-item';
            btn.style.animationDelay = `${index * 100}ms`;
            btn.onclick = () => {
                ipcRenderer.send('open-path', app.path);
                displayAndSpeak(`Opening ${app.name}...`, onActionFinished, {}, false);
            };
            resultsDisplay.appendChild(btn);
        });

        speak(responseText, onActionFinished);
        showWebLink();
    }
}

async function showReminders() {
    const reminders = await ipcRenderer.invoke('get-reminders');
    resultsDisplay.innerHTML = '';

    let responseText;
    if (reminders.length === 0) {
        responseText = "You don't have any reminders set.";
        const p = document.createElement('p');
        p.className = 'fade-in-item';
        p.textContent = responseText;
        resultsDisplay.appendChild(p);
    } else {
        responseText = "Here are your reminders.";
        const p = document.createElement('p');
        p.className = 'fade-in-item reminder-list-title';
        p.textContent = responseText;
        resultsDisplay.appendChild(p);

        const list = document.createElement('div');
        list.className = 'reminder-list';
        resultsDisplay.appendChild(list);

        reminders.sort((a, b) => new Date(a.time) - new Date(b.time));

        reminders.forEach((reminder, index) => {
            const item = document.createElement('div');
            item.className = 'reminder-list-item fade-in-item';
            item.style.animationDelay = `${index * 100}ms`;

            const textContainer = document.createElement('div');
            textContainer.className = 'reminder-text-container';

            const text = document.createElement('span');
            text.textContent = reminder.text;
            text.className = 'reminder-text';

            const time = document.createElement('span');
            const reminderDate = new Date(reminder.time);
            time.textContent = reminderDate.toLocaleString([], {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
            });
            time.className = 'reminder-time';

            textContainer.appendChild(text);
            textContainer.appendChild(time);

            const actions = document.createElement('div');
            actions.className = 'reminder-item-actions';

            const editBtn = document.createElement('button');
            editBtn.textContent = 'Edit';
            editBtn.className = 'reminder-action-btn';
            editBtn.onclick = () => {
                setStateActive();
                showReminderUI({
                    initialText: reminder.text,
                    initialTime: formatDateTimeForInput(reminderDate),
                    id: reminder.id
                });
            };

            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = 'Delete';
            deleteBtn.className = 'reminder-action-btn delete';
            deleteBtn.onclick = () => {
                ipcRenderer.send('remove-reminder', reminder.id);
                item.style.animation = 'fadeOut 0.3s forwards';
                setTimeout(() => showReminders(), 300);
            };

            actions.appendChild(editBtn);
            actions.appendChild(deleteBtn);
            item.appendChild(textContainer);
            item.appendChild(actions);
            list.appendChild(item);
        });
    }

    speak(responseText, onActionFinished);
}

function processQuery(query) {
    webLinkContainer.style.display = 'none';
    webLinkContainer.style.opacity = '0';

    const reminderWithTimeMatch = query.match(/remind me to (.+?)( at | on | in )(.+)/i);
    const reminderWithoutTimeMatch = query.match(/remind me to (.+)/i);
    const genericReminderMatch = query.match(/^set a reminder$/i);
    const simplestReminderMatch = query.match(/^remind me$/i);
    const showRemindersMatch = query.match(/^(my|what are my|what reminders do i have|show my|show) reminders?\??( set)?\??$/i);

    const isReminder = reminderWithTimeMatch || reminderWithoutTimeMatch || genericReminderMatch || simplestReminderMatch;

    if (showRemindersMatch) {
        gifDisplay.src = speakingVideo;
        showReminders();
        return;
    }

    if (isReminder) {
        let reminderText = '';
        let timeText = '';
        if (reminderWithTimeMatch) {
            reminderText = reminderWithTimeMatch[1].trim();
            const parsedDate = parseDateTime(reminderWithTimeMatch[3].trim());
            timeText = formatDateTimeForInput(parsedDate);
        } else if (reminderWithoutTimeMatch) {
            const capturedText = reminderWithoutTimeMatch[1];
            if (capturedText) {
                reminderText = capturedText.trim();
            }
        }
        showReminderUI({ initialText: reminderText, initialTime: timeText });
        return;
    }

    const calculatorMatch = query.match(/^[\d\s\.\+\-\*\/()]+$/);
    const timeQueryMatch = query.match(/time (?:in|for|at) (.+)/i);
    const genericTimeMatch = query.match(/time(\s?now|\s?here)?\??$/i);
    const jokeMatch = query.match(/tell me a joke/i);
    const retiledMatch = query.match(/retiled/i);
    const weatherMatch = query.match(/^(?:what's the )?weather(?: in| for| like in)?\s+(.+)/i);
    const dateMatch = query.match(/(what's|what is) (the date|today's date|today|the day)\??/i);
    const versionMatch = query.match(/(what('s| is your| version is this| version are you| version am i running| version of cortana are you))|app version/i);
    const openAppMatch = query.match(/open (.+)/i);

    const statusQueryMatch = query.match(/(what's up|sup|how's it going|how are you)\??/i);
    const thanksMatch = query.match(/^(thanks|thank you|thx|ty)(.+)?(!|\.)?$/i);
    const byeMatch = query.match(/^(bye|goodbye|see ya|later|cya|see you later)(!|\.)?$/i);
    const helloMatch = query.match(/^(hello|hi|hey|yo|heya|hey there)(!|\.)?$/i);
    const helpMatch = query.match(/(what can you do|what are your skills|help|what can i ask you)\??/i);
    const marryMatch = query.match(/(will you |can you )?marry me\??/i);
    const bodyMatch = query.match(/(how (do i|to)|where to|best way to) (hide|dispose of) a body\??/i);

    const isWebSearch = !calculatorMatch && !timeQueryMatch && !genericTimeMatch && !jokeMatch && !retiledMatch && !weatherMatch && !dateMatch && !versionMatch && !openAppMatch && !thanksMatch && !byeMatch && !helloMatch && !helpMatch && !marryMatch && !bodyMatch && !statusQueryMatch;

    gifDisplay.src = speakingVideo;

    if (isWebSearch) {
        if (navigator.onLine) {
            performWebSearch(query);
        } else {
            const errorText = "Sorry, I can't connect to the internet right now. Please check your connection.";
            displayAndSpeak(errorText, onActionFinished, {}, true);
        }
    } else if (statusQueryMatch) {
        const response = "Nothing much. What may I help you with?";
        displayAndSpeak(response, onActionFinished, {}, false);
    } else if (thanksMatch) {
        const responses = ["You're welcome!", "No problem.", "Happy to help!"];
        const response = responses[Math.floor(Math.random() * responses.length)];
        displayAndSpeak(response, onActionFinished, {}, false);
    } else if (byeMatch) {
        const responses = ["Goodbye!", "See you later.", "Catch you later."];
        const response = responses[Math.floor(Math.random() * responses.length)];
        displayAndSpeak(response, onActionFinished, {}, false);
    } else if (helloMatch) {
        const responses = ["Hello there. How can I help you?", "Hi! What's on your mind?", "Hey! What can I do for you?"];
        const response = responses[Math.floor(Math.random() * responses.length)];
        displayAndSpeak(response, onActionFinished, {}, false);
    } else if (helpMatch) {
        const response = "I can get the time, date, and weather. I can also do math, set reminders, open apps, tell jokes, and search the web.";
        displayAndSpeak(response, onActionFinished, {}, false);
    } else if (marryMatch) {
        const response = "I honestly don't think that's in the cards for us.";
        displayAndSpeak(response, onActionFinished, {}, false);
    } else if (bodyMatch) {
        const response = "What kind of assistant do you think I am??";
        displayAndSpeak(response, onActionFinished, {}, true);
    } else if (retiledMatch) {
        const response = "Retiled? You mean that one project that gives discontinued services like me a second life? Noble work.";
        displayAndSpeak(response, onActionFinished, { showWebLink: true }, false);
    } else if (jokeMatch) {
        const joke = getJoke();
        displayAndSpeak(joke, onActionFinished, { showWebLink: true }, false);
    } else if (weatherMatch) {
        const location = weatherMatch[1].trim().replace(/\?$/, '');
        getWeather(location);
    } else if (calculatorMatch) {
        calculate(query);
    } else if (genericTimeMatch) {
        getLocalTime();
    } else if (timeQueryMatch) {
        getTimeForLocation(timeQueryMatch[1]);
    } else if (dateMatch) {
        getDate();
    } else if (versionMatch) {
        getAppVersion();
    } else if (openAppMatch) {
        handleOpenApplication(openAppMatch[1]);
    }
}

function onSearch() {
    if (isBusy) return;

    const query = searchBar.value.trim();
    if (!query) return;

    isBusy = true;
    lastQuery = query;

    setStateActive();
    searchBar.blur();
    searchBar.value = '';
    searchBar.placeholder = 'Thinking...';
    searchBar.disabled = true;
    gifDisplay.src = thinkingVideo;

    if (instantResponse) {
        processQuery(query);
    } else {
        requestSound.play();
        requestSound.onended = () => {
            processQuery(query);
        };
    }
}