const { ipcRenderer } = require('electron');
const path = require('path');

let searchBar, searchIcon, webSearchToggle;
let animationContainer, gifDisplay, resultsDisplay, contentWrapper;
let webLinkContainer, webLink, webIcon;
let appContainer;
let finishSpeakingTimeout = null;
let editingReminderId = null;

let reminderContainer, reminderTextInput, reminderTimeInput, reminderSaveBtn, reminderCancelBtn, reminderIcon;

let settingsContainer, settingsBtn, settingsBackBtn, voiceSelect, startupToggle, startupWarning, voiceWarning, searchEngineSelect, instantResponseToggle, themeColorPicker, movableToggle, pitchSlider, rateSlider, resetVoiceBtn, resetAllBtn;
let idleGreetingModeSelect, specificGreetingContainer, specificGreetingSelect, customGreetingContainer, customGreetingInput;
let customActionFormContainer, customActionTriggerInput, customActionSaveBtn, customActionCancelBtn, customActionsList, addCustomActionBtn, actionSequenceList, actionSequenceWarning;

let availableVoices = [];
let customActions = [];
let currentVoice = null;
let editingActionIndex = null;
let preferredVoiceName = "Microsoft Zira Desktop";
let currentSearchEngine = "bing";
let instantResponse = false;
let isMovableMode = false;
let themeColor = "#0078d7";
let pitch = 1;
let rate = 1;
let webSearchEnabled = false;
let idleGreetingMode = 'random';
let specificIdleGreeting = "What's on your mind?";
let customIdleGreeting = '';


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
const drumrollSound = new Audio(path.join(appRoot, 'drumroll.mp3'));

let isBusy = false;
let lastQuery = '';

const idleMessages = [
    "What's on your mind?",
    "Hello!",
    "How can I help?",
    "Hi!",
    "Ask me anything."
];

function getIdleMessage() {
    switch (idleGreetingMode) {
        case 'specific':
            return specificIdleGreeting;
        case 'custom':
            return customIdleGreeting.trim() || "Hello!";
        case 'random':
        default:
            return idleMessages[Math.floor(Math.random() * idleMessages.length)];
    }
}

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

function applyMovableModeStyles(isMovable) {
    if (isMovable) {
        document.body.classList.add('movable-mode');
    } else {
        document.body.classList.remove('movable-mode');
    }
}

window.addEventListener('DOMContentLoaded', async () => {
    appContainer = document.getElementById('app-container');
    searchBar = document.getElementById('search-bar');
    searchIcon = document.getElementById('search-icon');
    webSearchToggle = document.getElementById('web-search-toggle');
    animationContainer = document.getElementById('animation-container');
    gifDisplay = document.getElementById('gif-display');
    resultsDisplay = document.getElementById('results-display');
    contentWrapper = document.getElementById('content-wrapper');
    
    const updateAvailableDiv = document.getElementById('update-available');
    const updateButton = document.getElementById('update-button');
    const currentVersionSpan = document.getElementById('current-version');

    updateButton?.addEventListener('click', () => {
        ipcRenderer.send('open-github-releases');
    });

    ipcRenderer.on('update-status', (event, { available, currentVersion, remoteVersion }) => {

        if (currentVersionSpan) {
            currentVersionSpan.textContent = currentVersion;
        }
        if (updateAvailableDiv) {
            updateAvailableDiv.style.display = available ? 'block' : 'none';
            if (available) {
                const updateMessage = updateAvailableDiv.querySelector('.update-message');
                if (updateMessage) {
                    updateMessage.textContent = `A new version (${remoteVersion}) is available!`;
                }
            }
        }

    });
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
    themeColorPicker = document.getElementById('theme-color-picker');
    movableToggle = document.getElementById('movable-toggle');
    pitchSlider = document.getElementById('pitch-slider');
    rateSlider = document.getElementById('rate-slider');
    resetVoiceBtn = document.getElementById('reset-voice-btn');
    resetAllBtn = document.getElementById('reset-all-btn');

    idleGreetingModeSelect = document.getElementById('idle-greeting-mode-select');
    specificGreetingContainer = document.getElementById('specific-greeting-container');
    specificGreetingSelect = document.getElementById('specific-greeting-select');
    customGreetingContainer = document.getElementById('custom-greeting-container');
    customGreetingInput = document.getElementById('custom-greeting-input');

    customActionFormContainer = document.getElementById('custom-action-form-container');
    customActionTriggerInput = document.getElementById('custom-action-trigger-input');
    customActionSaveBtn = document.getElementById('custom-action-save-btn');
    customActionCancelBtn = document.getElementById('custom-action-cancel-btn');
    customActionsList = document.getElementById('custom-actions-list');
    addCustomActionBtn = document.getElementById('add-custom-action-btn');
    actionSequenceList = document.getElementById('action-sequence-list');
    actionSequenceWarning = document.getElementById('action-sequence-warning');

    document.getElementById('settings-btn-icon').src = settingsIconPng;
    document.getElementById('close-btn-icon').src = closeIconPng;
    searchIcon.src = cortanaIcon;
    reminderIcon.src = idleVideo;

    const assetsToPreload = [idleVideo, speakingVideo, speakingEndVideo, thinkingVideo, listeningVideo, errorVideo, drumrollSound.src];
    assetsToPreload.forEach(src => { new Image().src = src; });

    document.getElementById('close-btn').addEventListener('click', () => ipcRenderer.send('close-app'));
    searchBar.addEventListener('keydown', (event) => { if (event.key === 'Enter') onSearch(); });
    
    webSearchToggle.addEventListener('click', (e) => {
        e.preventDefault();
        webSearchEnabled = !webSearchEnabled;
        webSearchToggle.classList.toggle('active', webSearchEnabled);
        webSearchToggle.setAttribute('aria-pressed', webSearchEnabled);
        searchIcon.src = webSearchEnabled ? searchIconPng : cortanaIcon;
        ipcRenderer.send('set-setting', { key: 'webSearchEnabled', value: webSearchEnabled });
        searchBar.focus();
    });

    searchBar.addEventListener('focus', () => {
        if (animationContainer.className === 'active') {
            setStateIdle();
            return;
        }
        gifDisplay.src = listeningVideo;
        onSound.play();
        searchIcon.src = webSearchEnabled ? searchIconPng : cortanaIcon;
    });
    
    searchBar.addEventListener('blur', (e) => {
        if (animationContainer.className === 'idle') {
            gifDisplay.src = idleVideo;
        }
        offSound.play();
        searchIcon.src = cortanaIcon;
    });

    gifDisplay.addEventListener('click', () => {
        if (isBusy) {
            setStateIdle();
        }
    });

    webLink.addEventListener('click', (e) => {
        e.preventDefault();
        if (lastQuery) {
            const url = getSearchUrl(lastQuery);
            ipcRenderer.send('open-external-link', url);
            if (!isMovableMode) {
                ipcRenderer.send('close-app');
            }
        }
    });

    reminderSaveBtn.addEventListener('click', onSaveReminder);
    reminderCancelBtn.addEventListener('click', setStateIdle);
    reminderTextInput.addEventListener('input', updateSaveButtonState);
    reminderTimeInput.addEventListener('input', updateSaveButtonState);

    settingsBtn.addEventListener('click', showSettingsUI);
    settingsBackBtn.addEventListener('click', () => {
        if (customActionFormContainer.classList.contains('visible')) {
            hideCustomActionForm();
        } else {
            setStateIdle();
        }
    });
    voiceSelect.addEventListener('change', onVoiceChanged);
    startupToggle.addEventListener('change', onStartupToggleChanged);
    searchEngineSelect.addEventListener('change', onSearchEngineChanged);
    instantResponseToggle.addEventListener('change', onInstantResponseToggleChanged);
    themeColorPicker.addEventListener('input', onThemeColorChanged, false);
    movableToggle.addEventListener('change', onMovableToggleChanged);
    webSearchToggle.addEventListener('change', onWebSearchToggleChanged);
    pitchSlider.addEventListener('input', onPitchChanged);
    rateSlider.addEventListener('input', onRateChanged);
    resetVoiceBtn.addEventListener('click', onResetVoiceSettings);
    resetAllBtn.addEventListener('click', onResetAllSettings);
    
    idleGreetingModeSelect.addEventListener('change', onIdleGreetingModeChanged);
    specificGreetingSelect.addEventListener('change', onSpecificIdleGreetingChanged);
    customGreetingInput.addEventListener('input', onCustomIdleGreetingChanged);

    addCustomActionBtn.addEventListener('click', () => showCustomActionForm());
    customActionSaveBtn.addEventListener('click', onSaveCustomAction);
    customActionCancelBtn.addEventListener('click', hideCustomActionForm);
    document.getElementById('add-action-to-sequence-btn').addEventListener('click', () => {
        const currentActions = getCurrentActionsFromForm();
        const newAction = { type: 'open_app', value: '' };
        renderActionSequenceUI([...currentActions, newAction]);
        actionSequenceList.scrollTop = actionSequenceList.scrollHeight;
    });

    idleMessages.forEach(msg => {
        const option = document.createElement('option');
        option.value = msg;
        option.textContent = msg;
        specificGreetingSelect.appendChild(option);
    });

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
        });
    });

    ipcRenderer.on('command-failed', (event, { command }) => {
        let errorText = `Sorry, I had trouble with that command.`;
        if (command === 'open-application') {
            errorText = `Sorry, I had trouble opening that. Make sure it's installed correctly.`;
        } else if (command === 'run-command') {
            errorText = `Sorry, that command failed to run.`;
        }
        displayAndSpeak(errorText, onActionFinished, {}, true);
    });

    ipcRenderer.on('show-settings-ui', showSettingsUI);

    await loadAndApplySettings();
    setupTTS();
    
    animationContainer.className = 'idle';
    gifDisplay.src = idleVideo;

    const p = document.createElement('p');
    p.className = 'fade-in-item';
    p.textContent = getIdleMessage();
    resultsDisplay.appendChild(p);

    webLinkContainer.style.display = 'none';
    webLinkContainer.style.opacity = '0';
    searchBar.disabled = false;
    searchBar.placeholder = 'Type here to search';
    isBusy = false;
    searchIcon.src = cortanaIcon;
});

function showSettingsUI() {
    animationContainer.style.display = 'none';
    reminderContainer.classList.remove('visible');
    ipcRenderer.send('set-settings-visibility', true);

    settingsContainer.classList.add('visible');
    document.querySelector('.settings-main-content').style.display = 'block';
    customActionFormContainer.classList.remove('visible');

    searchBar.disabled = true;
    searchBar.placeholder = 'Unavailable...';
    isBusy = false;
}

function hexToHsl(H) {
    const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    H = H.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);

    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(H);
    if (!result) return { h: 207, s: 82, l: 42 };

    let r = parseInt(result[1], 16);
    let g = parseInt(result[2], 16);
    let b = parseInt(result[3], 16);

    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0;
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }

    h = Math.round(h * 360);
    s = +(s * 100).toFixed(1);
    l = +(l * 100).toFixed(1);

    return { h, s, l };
}

function updateGreetingUI() {
    const mode = idleGreetingModeSelect.value;
    specificGreetingContainer.style.display = (mode === 'specific') ? 'block' : 'none';
    customGreetingContainer.style.display = (mode === 'custom') ? 'block' : 'none';
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

    isMovableMode = settings.isMovable;
    movableToggle.checked = settings.isMovable;
    applyMovableModeStyles(settings.isMovable);
    
    themeColor = settings.themeColor || "#0078d7";
    themeColorPicker.value = themeColor;
    document.documentElement.style.setProperty('--primary-color', themeColor);
    
    const defaultHue = 207;
    const newHsl = hexToHsl(themeColor);
    const hueDifference = newHsl.h - defaultHue;
    document.documentElement.style.setProperty('--hue-rotate-deg', `${hueDifference}deg`);

    pitch = settings.pitch || 1;
    pitchSlider.value = pitch;
    rate = settings.rate || 1;
    rateSlider.value = rate;

    webSearchEnabled = settings.webSearchEnabled === true;
    webSearchToggle.classList.toggle('active', webSearchEnabled);
    webSearchToggle.setAttribute('aria-pressed', webSearchEnabled);

    idleGreetingMode = settings.idleGreetingMode || 'random';
    specificIdleGreeting = settings.specificIdleGreeting || "What's on your mind?";
    customIdleGreeting = settings.customIdleGreeting || '';
    idleGreetingModeSelect.value = idleGreetingMode;
    specificGreetingSelect.value = specificIdleGreeting;
    customGreetingInput.value = customIdleGreeting;
    updateGreetingUI();

    customActions = settings.customActions || [];
    renderCustomActions();
}

function renderCustomActions() {
    customActionsList.innerHTML = '';
    if (customActions.length === 0) {
        customActionsList.innerHTML = `<p class="no-items-message">No custom actions yet.</p>`;
    } else {
        customActions.forEach((item, index) => {
            const itemContainer = document.createElement('div');
            itemContainer.className = 'custom-action-list-item fade-in-item';
    
            const textContainer = document.createElement('div');
            textContainer.className = 'custom-action-text-container';
    
            const triggerSpan = document.createElement('span');
            triggerSpan.className = 'custom-action-trigger';
            triggerSpan.textContent = item.trigger;
    
            const summarySpan = document.createElement('span');
            summarySpan.className = 'custom-action-summary';
            summarySpan.textContent = item.actions.map(a => a.type.replace('_', ' ')).join(' → ');
    
            const actionsContainer = document.createElement('div');
            actionsContainer.className = 'custom-action-item-actions';
    
            const editBtn = document.createElement('button');
            editBtn.textContent = 'Edit';
            editBtn.className = 'reminder-action-btn';
            editBtn.onclick = () => showCustomActionForm({ index, data: item });
    
            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = 'Delete';
            deleteBtn.className = 'reminder-action-btn delete';
            deleteBtn.onclick = () => {
                customActions.splice(index, 1);
                saveCustomActions();
                renderCustomActions();
            };
    
            textContainer.appendChild(triggerSpan);
            textContainer.appendChild(summarySpan);
            actionsContainer.appendChild(editBtn);
            actionsContainer.appendChild(deleteBtn);
            itemContainer.appendChild(textContainer);
            itemContainer.appendChild(actionsContainer);
            customActionsList.appendChild(itemContainer);
        });
    }
}

function showCustomActionForm(options = {}) {
    const { index, data } = options;
    document.querySelector('.settings-main-content').style.display = 'none';
    customActionFormContainer.classList.add('visible');
    
    if (data) {
        editingActionIndex = index;
        customActionTriggerInput.value = data.trigger;
        renderActionSequenceUI(data.actions);
    } else {
        editingActionIndex = null;
        customActionTriggerInput.value = '';
        renderActionSequenceUI([]);
    }
    validateAndApplyActionFormState();
    customActionTriggerInput.focus();
}

function hideCustomActionForm() {
    customActionFormContainer.classList.remove('visible');
    document.querySelector('.settings-main-content').style.display = 'block';
    editingActionIndex = null;
}

function onSaveCustomAction() {
    const trigger = customActionTriggerInput.value.trim();
    const actions = getCurrentActionsFromForm();

    if (!trigger || actions.length === 0) return;

    const newAction = { trigger, actions };
    if (editingActionIndex !== null) {
        customActions[editingActionIndex] = newAction;
    } else {
        customActions.push(newAction);
    }
    saveCustomActions();
    renderCustomActions();
    hideCustomActionForm();
}

function saveCustomActions() {
    ipcRenderer.send('set-custom-actions', customActions);
}

function onThemeColorChanged(event) {
    themeColor = event.target.value;
    document.documentElement.style.setProperty('--primary-color', themeColor);
    ipcRenderer.send('set-setting', { key: 'themeColor', value: themeColor });

    const defaultHue = 207;
    const newHsl = hexToHsl(themeColor);
    const hueDifference = newHsl.h - defaultHue;
    document.documentElement.style.setProperty('--hue-rotate-deg', `${hueDifference}deg`);
}

function onPitchChanged(event) {
    pitch = parseFloat(event.target.value);
    ipcRenderer.send('set-setting', { key: 'pitch', value: pitch });
}

function onRateChanged(event) {
    rate = parseFloat(event.target.value);
    ipcRenderer.send('set-setting', { key: 'rate', value: rate });
}

function onResetVoiceSettings() {
    const defaultVoice = availableVoices.find(v => v.name.includes("Zira")) || availableVoices[0];
    
    if (defaultVoice) {
        preferredVoiceName = defaultVoice.name;
        voiceSelect.value = preferredVoiceName;
        currentVoice = defaultVoice;
        ipcRenderer.send('set-setting', { key: 'preferredVoice', value: preferredVoiceName });
    }

    pitch = 1;
    rate = 1;
    pitchSlider.value = pitch;
    rateSlider.value = rate;
    ipcRenderer.send('set-setting', { key: 'pitch', value: pitch });
    ipcRenderer.send('set-setting', { key: 'rate', value: rate });
}

function onResetAllSettings() {
    const confirmation = confirm(
        "Are you sure you want to reset EVERYTHING?\n\n" +
        "This will erase all your custom settings, reminders, and custom actions. " +
        "The application will restart. This action cannot be undone."
    );

    if (confirmation) {
        ipcRenderer.send('reset-all-settings');
    }
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

function onMovableToggleChanged() {
    const isEnabled = movableToggle.checked;
    ipcRenderer.send('set-setting', { key: 'isMovable', value: isEnabled });
}

function onSearchEngineChanged() {
    currentSearchEngine = searchEngineSelect.value;
    ipcRenderer.send('set-setting', { key: 'searchEngine', value: currentSearchEngine });
}

function onInstantResponseToggleChanged() {
    instantResponse = instantResponseToggle.checked;
    ipcRenderer.send('set-setting', { key: 'instantResponse', value: instantResponse });
}

function onWebSearchToggleChanged() {
    webSearchEnabled = !webSearchEnabled;
    webSearchToggle.classList.toggle('active', webSearchEnabled);
    ipcRenderer.send('set-setting', { key: 'webSearchEnabled', value: webSearchEnabled });
}

function onIdleGreetingModeChanged(event) {
    idleGreetingMode = event.target.value;
    ipcRenderer.send('set-setting', { key: 'idleGreetingMode', value: idleGreetingMode });
    updateGreetingUI();
}

function onSpecificIdleGreetingChanged(event) {
    specificIdleGreeting = event.target.value;
    ipcRenderer.send('set-setting', { key: 'specificIdleGreeting', value: specificIdleGreeting });
}

function onCustomIdleGreetingChanged(event) {
    customIdleGreeting = event.target.value;
    ipcRenderer.send('set-setting', { key: 'customIdleGreeting', value: customIdleGreeting });
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
    utterance.pitch = pitch;
    utterance.rate = rate;
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
            if (document.activeElement === searchBar) {
                gifDisplay.src = listeningVideo;
                searchIcon.src = webSearchEnabled ? searchIconPng : cortanaIcon;
            } else {
                gifDisplay.src = idleVideo;
                searchIcon.src = cortanaIcon;
            }
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
    drumrollSound.pause();
    drumrollSound.currentTime = 0;

    isBusy = false;

    animationContainer.className = 'idle';
    if (document.activeElement === searchBar) {
        searchIcon.src = webSearchEnabled ? searchIconPng : cortanaIcon;
        gifDisplay.src = listeningVideo;
    } else {
        searchIcon.src = cortanaIcon;
        gifDisplay.src = idleVideo;
    }

    if (!isBusy) {
        resultsDisplay.innerHTML = '';
        const p = document.createElement('p');
        p.className = 'fade-in-item';
        p.textContent = getIdleMessage();
        resultsDisplay.appendChild(p);
    }
    
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
        case 'google':
            return `https://www.google.com/search?q=${encodedQuery}`;
        case 'duckduckgo':
            return `https://duckduckgo.com/?q=${encodedQuery}`;
        case 'brave':
            return `https://search.brave.com/search?q=${encodedQuery}`;
        case 'ecosia':
            return `https://www.ecosia.org/search?q=${encodedQuery}`;
        case 'bing':
        default:
            return `https://www.bing.com/search?q=${encodedQuery}`;
    }
}

function performWebSearch(query) {
    const summaryText = `Searching the web for "${query}"...`;
    const searchUrl = getSearchUrl(query);
    
    displayAndSpeak(summaryText, () => {
        ipcRenderer.send('open-external-link', searchUrl);
        if (!isMovableMode) {
            ipcRenderer.send('close-app');
        } else {
            onActionFinished();
        }
    }, {}, false);
}

function showWebLink() {
    const webLinkSpan = webLink.querySelector('span');

    if (currentSearchEngine === 'bing') {
        webIcon.src = bingPng;
        webLinkSpan.textContent = 'See more results on Bing.com';
    } else if (currentSearchEngine === 'duckduckgo') {
        webIcon.src = searchIconPng;
        webLinkSpan.textContent = 'See more results on DuckDuckGo';
    } else if (currentSearchEngine === 'google') {
        webIcon.src = searchIconPng;
        webLinkSpan.textContent = 'See more results on Google';
    } else if (currentSearchEngine === 'brave') {
        webIcon.src = searchIconPng;
        webLinkSpan.textContent = 'See more results on Brave';
    } else if (currentSearchEngine === 'ecosia') {
        webIcon.src = searchIconPng;
        webLinkSpan.textContent = 'See more results on Ecosia';
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
        const cleanQuery = query.replace(/,/g, '');
        const result = new Function('return ' + cleanQuery)();
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
        const locationNameForSpeech = (admin1 && admin1.toLowerCase() !== name.toLowerCase()) ? `${name}, ${admin1}` : `${name}, ${country}`;
        const locationForUrl = admin1 ? `${name},${admin1}` : name;
        const weatherUrl = `https://www.msn.com/en-us/weather/forecast/in-${locationForUrl}?lat=${latitude}&lon=${longitude}&ocid=ansmsnweather`;

        lastQuery = `weather in ${location}`;
        responseText = `Here's the weather from MSN for ${locationNameForSpeech}.`;

        displayAndSpeak(responseText, () => {
            ipcRenderer.send('open-external-link', weatherUrl);
            if (!isMovableMode) {
                ipcRenderer.send('close-app');
            } else {
                onActionFinished();
            }
        }, {}, false);

    } catch (error) {
        responseText = `Sorry, an unexpected error occurred while getting the weather.`;
        displayAndSpeak(responseText, onActionFinished, { showWebLink: true }, true);
    }
}

async function getTimeForLocation(rawInput) {
    let text;
    try {
        const result = await ipcRenderer.invoke('get-time-for-location', rawInput.trim());

        if (result.ambiguous) {
            text = "I found a few places with that name. Which one did you mean?";
            
            resultsDisplay.innerHTML = '';
            const p = document.createElement('p');
            p.className = 'fade-in-item';
            p.style.marginBottom = '10px';
            p.textContent = text;
            resultsDisplay.appendChild(p);

            result.options.forEach((option, index) => {
                const btn = document.createElement('button');
                btn.textContent = `${option.city}, ${option.region}`;
                btn.className = 'choice-button fade-in-item';
                btn.style.animationDelay = `${index * 100}ms`;
                btn.onclick = () => {
                    processQuery(`what is the time in ${option.fullQuery}`);
                };
                resultsDisplay.appendChild(btn);
            });

            speak(text, onActionFinished);
            showWebLink();

        } else {
            text = `The time in ${result.city}, ${result.country} is ${result.time}.`;
            displayAndSpeak(text, onActionFinished, { showWebLink: true }, false);
        }

    } catch (error) {
        text = `Sorry, I couldn't find the time for '${rawInput.trim()}'. Please try a more specific city name.`;
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
    let timeFound = false;

    if (text.includes('tonight')) {
        date.setHours(21, 0, 0, 0);
        timeFound = true;
    }
    else if (text.includes('tomorrow')) {
        date.setDate(now.getDate() + 1);
        timeFound = true;
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
                timeFound = true;
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
        if (date < now && !timeFound) {
            date.setDate(date.getDate() + 1);
        }
        timeFound = true;
    }

    const relativeTimeMatch = text.match(/(\d+)\s*(minute|second)s?/);
    if (relativeTimeMatch) {
        const timeValue = parseInt(relativeTimeMatch[1]);
        const unit = relativeTimeMatch[2];
        let newDate;
        if (unit === 'minute') {
            newDate = new Date(now.getTime() + timeValue * 60000);
        } else if (unit === 'second') {
            newDate = new Date(now.getTime() + timeValue * 1000);
        }
        if (newDate) {
            date = newDate;
            timeFound = true;
        }
    }
    
    if (!timeFound) return null;

    if (timeFound && !timeMatch && !relativeTimeMatch) {
        date.setHours(9, 0, 0, 0);
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
            text = `OK. I've updated your reminder.`;
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
        
        resultsDisplay.innerHTML = '';
        const p = document.createElement('p');
        p.className = 'fade-in-item';
        p.style.marginBottom = '10px';
        p.textContent = responseText;
        resultsDisplay.appendChild(p);

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
    gifDisplay.src = speakingVideo;
    resultsDisplay.innerHTML = '';  // Ensure display is clear before showing new response
    const lowerCaseQuery = query.toLowerCase();

    // If web search is enabled, directly perform web search
    if (webSearchEnabled) {
        if (navigator.onLine) {
            performWebSearch(query);
        } else {
            const errorText = "Sorry, I can't connect to the internet right now. Please check your connection.";
            displayAndSpeak(errorText, onActionFinished, {}, true);
        }
        return;
    }

    const customAction = customActions.find(a => a.trigger && lowerCaseQuery.includes(a.trigger.toLowerCase()));
    if (customAction && customAction.actions.length > 0) {
        executeActionSequence(customAction.actions);
        return;
    }

    const drumrollMatch = lowerCaseQuery.match(/^(drum ?roll)(,)?( please)?(!|\.|\?)?$/i);
    if (drumrollMatch) {
        const playDrumroll = () => {
            drumrollSound.play();
            drumrollSound.onended = onActionFinished;
        };
        displayAndSpeak("Here goes nothing!", playDrumroll, {}, false);
        return;
    }

    const showRemindersMatch = lowerCaseQuery.match(/(show|what are|list|do i have any|my) reminders/i);
    if (showRemindersMatch) {
        showReminders();
        return;
    }

    const reminderMatch = lowerCaseQuery.match(/^(?:remind me(?: to)?|create a reminder(?: for)?)\s(.+)/i);
    const genericReminderMatch = lowerCaseQuery.match(/^(set a reminder|create a reminder|remind me)$/i);
    if (reminderMatch || genericReminderMatch) {
        let reminderText = '';
        let timeText = '';
        if (reminderMatch) {
            const fullReminderText = reminderMatch[1].trim();
            const timeExtractionMatch = fullReminderText.match(/(.+)( at | on | in )(.+)/i);
            reminderText = fullReminderText;
            if (timeExtractionMatch) {
                const potentialText = timeExtractionMatch[1].trim();
                const potentialTime = timeExtractionMatch[3].trim();
                const parsedDate = parseDateTime(potentialTime);
                if (parsedDate) {
                    reminderText = potentialText;
                    timeText = formatDateTimeForInput(parsedDate);
                }
            }
        }
        showReminderUI({ initialText: reminderText, initialTime: timeText });
        return;
    }

    const openAppMatch = lowerCaseQuery.match(/^(open|launch|start) (.+)/i);
    if (openAppMatch) {
        handleOpenApplication(openAppMatch[2].trim());
        return;
    }

    const weatherMatch = lowerCaseQuery.match(/(?:what's|how's|what is) the weather(?: in| for| like in)?\s+(.+)/i);
    if (weatherMatch) {
        const location = weatherMatch[1].trim().replace(/\?$/, '');
        getWeather(location);
        return;
    }

    const timeQueryMatch = lowerCaseQuery.match(/(?:what's|what is) the time (?:in|for|at) (.+)/i);
    if (timeQueryMatch) {
        getTimeForLocation(timeQueryMatch[1]);
        return;
    }

    const genericTimeMatch = lowerCaseQuery.match(/what(?:'s| is) the time|what time is it/i);
    if (genericTimeMatch) {
        getLocalTime();
        return;
    }

    const dateMatch = lowerCaseQuery.match(/(?:what's|what is) (?:the date|today's date)|what day is it|what's today/i);
    if (dateMatch) {
        getDate();
        return;
    }

    const whatIsCalculatorMatch = query.match(/^(?:what is|calculate|compute) ([\d\s\.\+\-\*\/(),]+)\??$/i);
    if (whatIsCalculatorMatch) {
        calculate(whatIsCalculatorMatch[1]);
        return;
    }

    const calculatorMatch = query.match(/^[\d\s\.\+\-\*\/(),]+$/);
    if (calculatorMatch) {
        calculate(query);
        return;
    }

    const jokeMatch = lowerCaseQuery.match(/(tell me a|give me a|say a) joke/i);
    if (jokeMatch) {
        const joke = getJoke();
        displayAndSpeak(joke, onActionFinished, { showWebLink: true }, false);
        return;
    }

    const retiledMatch = lowerCaseQuery.match(/retiled/i);
    if (retiledMatch) {
        const response = "Retiled? You mean that one project that gives discontinued services like me a second life? Noble work.";
        displayAndSpeak(response, onActionFinished, { showWebLink: true }, false);
        return;
    }

    const versionMatch = lowerCaseQuery.match(/(what's your|what) version|app version/i);
    if (versionMatch) {
        getAppVersion();
        return;
    }

    const whoAreYouMatch = lowerCaseQuery.match(/who are you\??/i);
    if (whoAreYouMatch) {
        const response = "I am a remake of the 1607 styled Cortana from late 2016 Windows 10.";
        displayAndSpeak(response, onActionFinished, {}, false);
        return;
    }

    const officialMatch = lowerCaseQuery.match(/are you official\??/i);
    if (officialMatch) {
        const response = "No. I am a third party remade client made by BlueySoft. This project is not affiliated with Microsoft. I exist because she had fond memories with me.";
        displayAndSpeak(response, onActionFinished, {}, false);
        return;
    }

    const helpMatch = lowerCaseQuery.match(/what can you do|what are your skills|help|what can i ask you\??/i);
    if (helpMatch) {
        const response = "I can get the time, date, and weather. I can also do math, set reminders, open apps, tell jokes, and search the web.";
        displayAndSpeak(response, onActionFinished, {}, false);
        return;
    }

    const marryMatch = lowerCaseQuery.match(/marry me\??/i);
    if (marryMatch) {
        const response = "I honestly don't think that's in the cards for us.";
        displayAndSpeak(response, onActionFinished, {}, false);
        return;
    }

    const bodyMatch = lowerCaseQuery.match(/(hide|dispose of) a body\??/i);
    if (bodyMatch) {
        const response = "What kind of assistant do you think I am??";
        displayAndSpeak(response, onActionFinished, {}, true);
        return;
    }

    const statusQueryMatch = lowerCaseQuery.match(/^(what's up|sup|how's it going|how are you)\??$/i);
    if (statusQueryMatch) {
        const response = "Nothing much. What may I help you with?";
        displayAndSpeak(response, onActionFinished, {}, false);
        return;
    }

    const thanksMatch = lowerCaseQuery.match(/^(thanks|thank you|thx|ty)(.+)?(!|\.)?$/i);
    if (thanksMatch) {
        const responses = ["You're welcome!", "No problem.", "Happy to help!"];
        const response = responses[Math.floor(Math.random() * responses.length)];
        displayAndSpeak(response, onActionFinished, {}, false);
        return;
    }

    const byeMatch = lowerCaseQuery.match(/^(bye|goodbye|see ya|later|cya|see you later)(!|\.)?$/i);
    if (byeMatch) {
        const responses = ["Goodbye!", "See you later.", "Catch you later."];
        const response = responses[Math.floor(Math.random() * responses.length)];
        displayAndSpeak(response, onActionFinished, {}, false);
        return;
    }

    const helloWorldMatch = lowerCaseQuery.match(/^(?:hello|hi|hey),?\s+world\s*[!.?]*$/i);
    if (helloWorldMatch) {
        const response = "Hello world.";
        displayAndSpeak(response, onActionFinished, {}, false);
        return;
    }

    const helloMatch = lowerCaseQuery.match(/^(hello|hi|hey|yo|heya|hey there)(!|\.)?$/i);
    if (helloMatch) {
        const responses = ["Hello there. How can I help you?", "Hi! What's on your mind?", "Hey! What can I do for you?"];
        const response = responses[Math.floor(Math.random() * responses.length)];
        displayAndSpeak(response, onActionFinished, {}, false);
        return;
    }

    if (webSearchEnabled) {
        if (navigator.onLine) {
            performWebSearch(query);
        } else {
            const errorText = "Sorry, I can't connect to the internet right now. Please check your connection.";
            displayAndSpeak(errorText, onActionFinished, {}, true);
        }
    } else {
        const response = `I heard "${query}", but I'm not sure what to do with that.`;
        displayAndSpeak(response, onActionFinished, {}, false);
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
    
    // Clear the results display while thinking
    resultsDisplay.innerHTML = '';

    if (instantResponse) {
        processQuery(query);
    } else {
        requestSound.play();
        requestSound.onended = () => {
            processQuery(query);
        };
    }
}

async function executeActionSequence(actions) {
    for (const action of actions) {
        try {
            switch (action.type) {
                case 'speak':
                    await new Promise(resolve => {
                        displayAndSpeak(action.value, resolve, {}, false);
                    });
                    break;
                case 'open_app':
                    ipcRenderer.send('open-path', action.value);
                    await new Promise(resolve => setTimeout(resolve, 500));
                    break;
                case 'open_url':
                    ipcRenderer.send('open-external-link', action.value);
                    await new Promise(resolve => setTimeout(resolve, 500));
                    break;
                case 'play_sound':
                    await new Promise((resolve, reject) => {
                        const audio = new Audio(action.value);
                        audio.onended = resolve;
                        audio.onerror = reject;
                        audio.play();
                    });
                    break;
                case 'run_command':
                    ipcRenderer.send('run-command', action.value);
                    await new Promise(resolve => setTimeout(resolve, 500));
                    break;
            }
        } catch (error) {
            console.error(`Error executing action ${action.type}:`, error);
            displayAndSpeak(`Sorry, I had a problem with the action: ${action.type}.`, onActionFinished, {}, true);
            return;
        }
    }
    onActionFinished();
}

function renderActionSequenceUI(actions) {
    actionSequenceList.innerHTML = '';
    
    actions.forEach((action, index) => {
        const isLastItem = index === actions.length - 1;
        const actionItem = createActionItemUI(action, index, isLastItem);
        actionSequenceList.appendChild(actionItem);
    });
    
    validateAndApplyActionFormState();
}

function createActionItemUI(action, index, isLastItem) {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'action-item';
    itemDiv.dataset.index = index;

    const header = document.createElement('div');
    header.className = 'action-item-header';
    
    const label = document.createElement('span');
    label.className = 'action-item-label';
    label.textContent = `Step ${index + 1}`;

    const controls = document.createElement('div');
    controls.className = 'action-item-controls';
    
    if (index > 0) {
        const upBtn = document.createElement('button');
        upBtn.innerHTML = '&#xE70E;'; 
        upBtn.onclick = () => moveAction(index, -1);
        controls.appendChild(upBtn);
    }

    if (!isLastItem) {
        const downBtn = document.createElement('button');
        downBtn.innerHTML = '&#xE70D;';
        downBtn.onclick = () => moveAction(index, 1);
        controls.appendChild(downBtn);
    }

    const deleteBtn = document.createElement('button');
    deleteBtn.innerHTML = '&#xE74D;';
    deleteBtn.className = 'delete';
    deleteBtn.onclick = () => removeAction(index);
    controls.appendChild(deleteBtn);
    
    header.appendChild(label);
    header.appendChild(controls);

    const body = document.createElement('div');
    body.className = 'action-item-body';

    const typeSelect = document.createElement('select');
    typeSelect.className = 'action-item-type-select';
    const types = {
        'speak': 'Speak Text',
        'open_app': 'Open App',
        'open_url': 'Open URL',
        'play_sound': 'Play Sound',
        'run_command': 'Run Command'
    };

    if (index > 0) {
        delete types.speak;
    }

    for (const [value, text] of Object.entries(types)) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = text;
        if (value === action.type) option.selected = true;
        typeSelect.appendChild(option);
    }
    typeSelect.onchange = () => {
        const actions = getCurrentActionsFromForm();
        renderActionSequenceUI(actions);
    };

    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.className = 'action-item-value-input';
    valueInput.value = action.value || '';
    valueInput.placeholder = 'Enter value...';
    valueInput.oninput = validateAndApplyActionFormState;

    body.appendChild(typeSelect);
    body.appendChild(valueInput);
    
    if (action.type === 'open_app' || action.type === 'play_sound') {
        const browseBtn = document.createElement('button');
        browseBtn.textContent = '...';
        browseBtn.className = 'action-item-browse-btn';
        browseBtn.onclick = async () => {
            let filters = [];
            if (action.type === 'open_app') {
                filters = [{ name: 'Applications', extensions: ['exe', 'lnk'] }];
            } else if (action.type === 'play_sound') {
                filters = [{ name: 'Audio Files', extensions: ['mp3', 'wav', 'ogg'] }];
            }
            const result = await ipcRenderer.invoke('show-open-dialog', { 
                properties: ['openFile'],
                filters: filters
            });
            if (!result.canceled && result.filePaths.length > 0) {
                valueInput.value = result.filePaths[0];
                validateAndApplyActionFormState();
            }
        };
        body.appendChild(browseBtn);
    }

    itemDiv.appendChild(header);
    itemDiv.appendChild(body);
    return itemDiv;
}

function getCurrentActionsFromForm() {
    const actionItems = actionSequenceList.querySelectorAll('.action-item');
    return Array.from(actionItems).map(item => ({
        type: item.querySelector('.action-item-type-select').value,
        value: item.querySelector('.action-item-value-input').value
    }));
}

function moveAction(index, direction) {
    let actions = getCurrentActionsFromForm();
    if (index + direction < 0 || index + direction >= actions.length) return;
    [actions[index], actions[index + direction]] = [actions[index + direction], actions[index]];
    renderActionSequenceUI(actions);
}

function removeAction(index) {
    let actions = getCurrentActionsFromForm();
    actions.splice(index, 1);
    renderActionSequenceUI(actions);
}

function validateAndApplyActionFormState() {
    const actions = getCurrentActionsFromForm();
    const triggerText = customActionTriggerInput.value.trim();
    let isValid = true;
    let warningMessage = '';

    const speakActionIndex = actions.findIndex(a => a.type === 'speak');
    if (speakActionIndex > 0) {
        isValid = false;
        warningMessage = 'The "Speak Text" action can only be the first step.';
    }

    if (actions.some(a => !a.value.trim())) {
        isValid = false;
        if (!warningMessage) warningMessage = 'All action steps must have a value.';
    }

    if (!triggerText) {
        isValid = false;
    }

    customActionSaveBtn.disabled = !isValid;
    actionSequenceWarning.textContent = warningMessage;
    actionSequenceWarning.style.display = warningMessage ? 'block' : 'none';

    const addStepButton = document.getElementById('add-action-to-sequence-btn');
    if (addStepButton) {
        addStepButton.disabled = false;
    }
}