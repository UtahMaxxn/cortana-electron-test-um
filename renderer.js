const { ipcRenderer } = require('electron');
const path = require('path');

let searchBar;
let animationContainer, gifDisplay, resultsDisplay, contentWrapper;
let webviewContainer, webviewFrame;
let bingLinkContainer, bingLink;
let appContainer;
let finishSpeakingTimeout = null;

let reminderContainer, reminderTextInput, reminderTimeInput, reminderSaveBtn, reminderCancelBtn, reminderIcon;

const isPackaged = __dirname.includes('app.asar');
const appRoot = isPackaged ? path.join(__dirname, '..', 'assets') : path.join(__dirname, 'assets');

const idleGif = path.join(appRoot, 'idle.gif');
const speakingGif = path.join(appRoot, 'speaking.gif');
const speakingEndGif = path.join(appRoot, 'speaking-end.gif');
const thinkingGif = path.join(appRoot, 'thinking.gif');
const requestSound = new Audio(path.join(appRoot, 'request.wav'));
const onSound = new Audio(path.join(appRoot, 'on.wav'));
const offSound = new Audio(path.join(appRoot, 'off.wav'));
const errorSound = new Audio(path.join(appRoot, 'error.wav'));

const PREFERRED_VOICE_NAME = "Microsoft Zira Desktop";

let isBusy = false;
let ziraVoice = null;
let lastQuery = '';

const jokes = [
    "Why don't scientists trust atoms? Because they make up everything!",
    "I told my wife she should embrace her mistakes. She gave me a hug.",
    "Why did the scarecrow win an award? Because he was outstanding in his field!",
    "I'm reading a book on anti-gravity. It's impossible to put down!",
    "What do you call a fake noodle? An Impasta!",
    "Why don't skeletons fight each other? They don't have the guts."
];
function getJoke() { return jokes[Math.floor(Math.random() * jokes.length)]; }
const timeZoneAbbreviations = { 'est': 'America/New_York', 'edt': 'America/New_York', 'cst': 'America/Chicago', 'cdt': 'America/Chicago', 'mst': 'America/Denver', 'mdt': 'America/Denver', 'pst': 'America/Los_Angeles', 'pdt': 'America/Los_Angeles', 'gmt': 'Etc/GMT', 'utc': 'Etc/UTC', 'bst': 'Europe/London' };

window.addEventListener('DOMContentLoaded', () => {
    appContainer = document.getElementById('app-container');
    searchBar = document.getElementById('search-bar');
    animationContainer = document.getElementById('animation-container');
    gifDisplay = document.getElementById('gif-display');
    resultsDisplay = document.getElementById('results-display');
    contentWrapper = document.getElementById('content-wrapper');
    webviewContainer = document.getElementById('webview-container');
    webviewFrame = document.getElementById('webview-frame');
    bingLinkContainer = document.getElementById('bing-link-container');
    bingLink = document.getElementById('bing-link');
    
    reminderContainer = document.getElementById('reminder-container');
    reminderIcon = document.getElementById('reminder-icon');
    reminderTextInput = document.getElementById('reminder-text-input');
    reminderTimeInput = document.getElementById('reminder-time-input');
    reminderSaveBtn = document.getElementById('reminder-save-btn');
    reminderCancelBtn = document.getElementById('reminder-cancel-btn');

    reminderIcon.src = idleGif;

    document.getElementById('close-btn').addEventListener('click', () => ipcRenderer.send('close-app'));
    searchBar.addEventListener('keydown', (event) => { if (event.key === 'Enter') onSearch(); });
    searchBar.addEventListener('focus', () => {
        setStateIdle();
        onSound.play();
    });
    searchBar.addEventListener('blur', () => offSound.play());

    bingLink.addEventListener('click', (e) => {
        e.preventDefault();
        if (lastQuery) {
            const url = `https://www.bing.com/search?q=${encodeURIComponent(lastQuery)}`;
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


    const mobileUserAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Mobile/15E148 Safari/604.1';
    webviewFrame.setAttribute('useragent', mobileUserAgent);

    ipcRenderer.on('go-idle-and-close', () => {
        setStateIdle();
        setTimeout(() => {
            appContainer.classList.remove('visible');
            setTimeout(() => ipcRenderer.send('hide-window'), 400);
        }, 50);
    });

    ipcRenderer.on('trigger-enter-animation', () => { appContainer.classList.add('visible'); });
    
    ipcRenderer.on('command-failed', (event, { command }) => {
        if (command === 'open-application') {
            const errorText = `Sorry, I had trouble opening that. Make sure it's installed correctly.`;
            displayAndSpeak(errorText, onActionFinished, {}, true);
        }
    });

    setupTTS();
    setStateIdle();
    setTimeout(() => { searchBar.focus(); }, 400);
});

function displayAndSpeak(text, callback, options = {}, isError = false) {
    resultsDisplay.innerHTML = '';

    const p = document.createElement('p');
    p.textContent = text;
    p.className = 'fade-in-item';
    resultsDisplay.appendChild(p);

    if (options.showBingLink) {
        showBingLink();
    }

    if (isError) {
        errorSound.play();
        errorSound.onended = () => speak(text, callback);
    } else {
        speak(text, callback);
    }
}

function setupTTS() {
    function findVoice() {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length === 0) return;

        const voicePriorities = [
            v => v.name === PREFERRED_VOICE_NAME,
            v => v.lang === 'en-US' && v.name.includes('Desktop'),
            v => v.lang === 'en-US' && v.name.includes('Zira'),
            v => v.lang === 'en-US',
            v => v
        ];

        for (const priority of voicePriorities) {
            const foundVoice = voices.find(priority);
            if (foundVoice) {
                ziraVoice = foundVoice;
                return;
            }
        }
    }

    if (window.speechSynthesis.getVoices().length === 0) {
        window.speechSynthesis.onvoiceschanged = findVoice;
    } else {
        findVoice();
    }
}

function speak(text, onSpeechEndCallback) {
    window.speechSynthesis.cancel();
    if (!ziraVoice || !text) {
        if (onSpeechEndCallback) onSpeechEndCallback();
        return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = ziraVoice;
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
    gifDisplay.src = speakingEndGif;
    searchBar.disabled = false;
    searchBar.placeholder = 'Type here to search';

    finishSpeakingTimeout = setTimeout(() => {
        if (animationContainer.className === 'active') {
            gifDisplay.src = idleGif;
        }
    }, 1000);
}

function setStateIdle() {
    if (animationContainer.className === 'idle' && document.activeElement === searchBar) return;
    
    reminderContainer.classList.remove('visible');
    animationContainer.style.display = 'block';
    
    clearTimeout(finishSpeakingTimeout);
    window.speechSynthesis.cancel();
    requestSound.pause();
    requestSound.currentTime = 0;
    
    isBusy = false;

    ipcRenderer.send('set-webview-visibility', false);
    webviewContainer.classList.remove('visible');
    animationContainer.className = 'idle';
    gifDisplay.src = idleGif;
    resultsDisplay.innerHTML = `<p class="fade-in-item">What's on your mind?</p>`;
    bingLinkContainer.style.display = 'none';
    bingLinkContainer.style.opacity = '0';

    searchBar.disabled = false;
    searchBar.placeholder = 'Type here to search';
}

function setStateActive() {
    clearTimeout(finishSpeakingTimeout);
    animationContainer.className = 'active';
}

function showWebView(url) {
    ipcRenderer.send('set-webview-visibility', true);
    webviewFrame.src = url;
    webviewContainer.classList.add('visible');
    showBingLink();
}

function performWebSearch(query) {
    const summaryText = `Here is what I found for "${query}".`;
    displayAndSpeak(summaryText, onActionFinished, {}, false);
    showWebView(`https://www.bing.com/search?q=${encodeURIComponent(query)}`);
}

function showBingLink() {
    bingLinkContainer.style.display = 'block';
    setTimeout(() => {
        bingLinkContainer.style.animation = 'fadeIn 0.5s forwards';
        bingLinkContainer.style.opacity = '1';
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
        displayAndSpeak(responseText, onActionFinished, { showBingLink: true }, false);
    } catch (error) {
        responseText = `Sorry, that doesn't look like a valid calculation.`;
        displayAndSpeak(responseText, onActionFinished, { showBingLink: true }, true);
    }
}

async function getWeather(location) {
    let responseText;
    try {
        const response = await fetch(`https://wttr.in/${encodeURIComponent(location)}?format=j1`, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        if (!response.ok) throw new Error('API response not OK');
        const data = await response.json();
        const condition = data.current_condition[0];
        responseText = `The current weather in ${data.nearest_area[0].areaName[0].value} is ${condition.temp_F}°F and ${condition.weatherDesc[0].value}.`;
        displayAndSpeak(responseText, onActionFinished, { showBingLink: true }, false);
    } catch (error) {
        responseText = `Sorry, I couldn't get the weather for ${location}.`;
        displayAndSpeak(responseText, onActionFinished, { showBingLink: true }, true);
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
        displayAndSpeak(text, onActionFinished, { showBingLink: true }, false);
    } catch (error) {
        text = `Sorry, I couldn't find the time for '${rawInput.trim()}'.`;
        displayAndSpeak(text, onActionFinished, { showBingLink: true }, true);
    }
}

function getLocalTime() {
    const now = new Date();
    const text = `The local time is ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    displayAndSpeak(text, onActionFinished, { showBingLink: true }, false);
}

function getDate() {
    const now = new Date();
    const text = `Today's date is ${now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;
    displayAndSpeak(text, onActionFinished, { showBingLink: true }, false);
}


function updateSaveButtonState() {
    const reminderText = reminderTextInput.value.trim();
    const timeText = reminderTimeInput.value.trim();
    reminderSaveBtn.disabled = !(reminderText && timeText);
}

function showReminderUI(initialText = '', initialTime = '') {
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

function onSaveReminder() {
    const reminder = reminderTextInput.value.trim();
    const timeRaw = reminderTimeInput.value.trim();
    const timeMatch = timeRaw.match(/(\d+|a|an)\s*(minute|second)s?/i);

    if (reminder && timeMatch) {
        const timeStr = timeMatch[1];
        const unit = timeMatch[2].replace(/s$/, '');
        const time = (timeStr.toLowerCase() === 'a' || timeStr.toLowerCase() === 'an') ? 1 : parseInt(timeStr);
        const unitText = time === 1 ? unit : `${unit}s`;

        ipcRenderer.send('set-reminder', { reminder, time, unit: unitText });
        const text = `Ok, I'll remind you to "${reminder}" in ${time} ${unitText}.`;
        
        reminderContainer.classList.remove('visible');
        animationContainer.style.display = 'block';
        setStateActive();
        gifDisplay.src = speakingGif;

        displayAndSpeak(text, onActionFinished, {}, false);
    } else {
        errorSound.play();
        errorSound.onended = () => {
            speak("Please make sure the time is valid, for example '2 minutes' or '30 seconds'.");
        };
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
        showBingLink();
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
    gifDisplay.src = thinkingGif;
    
    requestSound.play();

    requestSound.onended = () => {
        bingLinkContainer.style.display = 'none';
        bingLinkContainer.style.opacity = '0';

        const reminderWithTimeMatch = query.match(/remind me to (.+?) in (.+)/i);
        const reminderWithoutTimeMatch = query.match(/remind me to (.+)/i);
        const genericReminderMatch = query.match(/^set a reminder$/i);
        const simplestReminderMatch = query.match(/^remind me$/i);
        
        const isReminder = reminderWithTimeMatch || reminderWithoutTimeMatch || genericReminderMatch || simplestReminderMatch;

        if (isReminder) {
            let reminderText = '';
            let timeText = '';
            if (reminderWithTimeMatch) {
                reminderText = reminderWithTimeMatch[1].trim();
                timeText = reminderWithTimeMatch[2].trim();
            } else if (reminderWithoutTimeMatch) {
                const capturedText = reminderWithoutTimeMatch[1];
                if (capturedText) {
                    reminderText = capturedText.trim();
                }
            }
            showReminderUI(reminderText, timeText);
            return;
        }
        
        const calculatorMatch = query.match(/^[\d\s\.\+\-\*\/()]+$/);
        const timeQueryMatch = query.match(/time (?:in|for|at) (.+)/i);
        const genericTimeMatch = query.match(/time(\s?now|\s?here)?\??$/i);
        const jokeMatch = query.match(/tell me a joke/i);
        const retiledMatch = query.match(/retiled/i);
        const weatherMatch = query.match(/^(?:what's the )?weather (?:in|for) (.+)/i);
        const dateMatch = query.match(/what's the date|what is today's date/i);
        const openAppMatch = query.match(/open (.+)/i);
        const burgerDogMatch = query.match(/LeGamer|KernelOS|Leg Hammer|KNS/i);
        
        const statusQueryMatch = query.match(/(what's up|sup|how's it going|how are you)\??/i);
        const thanksMatch = query.match(/^(thanks|thank you|thx|ty)(.+)?(!|\.)?$/i);
        const byeMatch = query.match(/^(bye|goodbye|see ya|later|cya|see you later)(!|\.)?$/i);
        const helloMatch = query.match(/^(hello|hi|hey|yo|heya|hey there)(!|\.)?$/i);
        const helpMatch = query.match(/(what can you do|what are your skills|help|what can i ask you)\??/i);
        const marryMatch = query.match(/(will you |can you )?marry me\??/i);
        const bodyMatch = query.match(/(how (do i|to)|where to|best way to) (hide|dispose of) a body\??/i);

        const isWebSearch = !calculatorMatch && !timeQueryMatch && !genericTimeMatch && !jokeMatch && !retiledMatch && !weatherMatch && !dateMatch && !openAppMatch && !burgerDogMatch && !thanksMatch && !byeMatch && !helloMatch && !helpMatch && !marryMatch && !bodyMatch && !statusQueryMatch;

        gifDisplay.src = speakingGif;
        
        if (isWebSearch) {
            if (navigator.onLine) {
                performWebSearch(query);
            } else {
                const errorText = "Sorry, I can't connect to the internet right now. Please check your connection.";
                displayAndSpeak(errorText, onActionFinished, {}, true);
            }
        } else if (burgerDogMatch) {
            const response = "Burger dog, B-B-Burger dog!";
            displayAndSpeak(response, onActionFinished, {}, false);
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
            displayAndSpeak(response, onActionFinished, { showBingLink: true }, false);
        } else if (jokeMatch) {
            const joke = getJoke();
            displayAndSpeak(joke, onActionFinished, { showBingLink: true }, false);
        } else if (weatherMatch) {
            getWeather(weatherMatch[1]);
        } else if (calculatorMatch) {
            calculate(query);
        } else if (genericTimeMatch) {
            getLocalTime();
        } else if (timeQueryMatch) {
            getTimeForLocation(timeQueryMatch[1]);
        } else if (dateMatch) {
            getDate();
        } else if (openAppMatch) {
            handleOpenApplication(openAppMatch[1]);
        }
    };
}