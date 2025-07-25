const { ipcRenderer } = require('electron');
const path = require('path');

let searchBar;
let animationContainer, gifDisplay, resultsDisplay, contentWrapper;
let webviewContainer, webviewFrame;
let bingLinkContainer, bingLink;
let appContainer;
let finishSpeakingTimeout = null;

const isPackaged = __dirname.includes('app.asar');
const appRoot = isPackaged ? path.join(__dirname, '..', 'assets') : path.join(__dirname, 'assets');

const idleGif = path.join(appRoot, 'idle.gif');
const speakingGif = path.join(appRoot, 'speaking.gif');
const speakingEndGif = path.join(appRoot, 'speaking-end.gif');
const thinkingGif = path.join(appRoot, 'thinking.gif');
const requestSound = new Audio(path.join(appRoot, 'request.wav'));

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

    document.getElementById('close-btn').addEventListener('click', () => ipcRenderer.send('close-app'));
    searchBar.addEventListener('keydown', (event) => { if (event.key === 'Enter') onSearch(); });
    searchBar.addEventListener('focus', setStateIdle);

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
            resultsDisplay.textContent = errorText;
            speak(errorText, onActionFinished);
        }
    });

    setupTTS();
    setStateIdle();
    setTimeout(() => { searchBar.focus(); }, 400);
});

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
    finishSpeakingTimeout = setTimeout(() => {
        if (animationContainer.className === 'active') {
            gifDisplay.src = idleGif;
        }
    }, 1000);
}

function setStateIdle() {
    if (animationContainer.className === 'idle' && document.activeElement === searchBar) return;
    
    clearTimeout(finishSpeakingTimeout);
    window.speechSynthesis.cancel();
    requestSound.pause();
    requestSound.currentTime = 0;
    
    isBusy = false;

    ipcRenderer.send('set-webview-visibility', false);
    webviewContainer.classList.remove('visible');
    animationContainer.className = 'idle';
    gifDisplay.src = idleGif;
    resultsDisplay.innerHTML = `<p>What's on your mind?</p>`;
    bingLinkContainer.style.display = 'none';

    searchBar.disabled = false;
    searchBar.placeholder = 'Ask me anything...';
}

function setStateActive() {
    clearTimeout(finishSpeakingTimeout);
    animationContainer.className = 'active';
}

function showWebView(url) {
    ipcRenderer.send('set-webview-visibility', true);
    webviewFrame.src = url;
    webviewContainer.classList.add('visible');
    speak(`Here's what I found on the web`, onActionFinished);
}

function showBingLink() {
    bingLinkContainer.style.display = 'block';
}

function calculate(query) {
    let responseText;
    try {
        const result = new Function('return ' + query)();
        if (isNaN(result) || !isFinite(result)) {
            throw new Error('Invalid calculation');
        }
        responseText = `The answer is ${result}.`;
    } catch (error) {
        responseText = `Sorry, that doesn't look like a valid calculation.`;
    }
    resultsDisplay.textContent = responseText;
    showBingLink();
    speak(responseText, onActionFinished);
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
    } catch (error) {
        responseText = `Sorry, I couldn't get the weather for ${location}.`;
    }
    resultsDisplay.textContent = responseText;
    showBingLink();
    speak(responseText, onActionFinished);
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
    } catch (error) {
        text = `Sorry, I couldn't find the time for '${rawInput.trim()}'.`;
    }
    resultsDisplay.textContent = text;
    showBingLink();
    speak(text, onActionFinished);
}

function getLocalTime() {
    const now = new Date();
    const text = `The local time is ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    resultsDisplay.textContent = text;
    showBingLink();
    speak(text, onActionFinished);
}

function getDate() {
    const now = new Date();
    const text = `Today's date is ${now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;
    resultsDisplay.textContent = text;
    showBingLink();
    speak(text, onActionFinished);
}

function setReminder(reminder, timeStr, unit) {
    const time = timeStr.toLowerCase() === 'a' ? 1 : parseInt(timeStr);
    const unitText = time === 1 ? unit.replace(/s$/, '') : unit;

    ipcRenderer.send('set-reminder', { reminder, time, unit });
    const text = `Ok, I'll remind you to "${reminder}" in ${time} ${unitText}.`;
    resultsDisplay.textContent = text;
    showBingLink();
    speak(text, onActionFinished);
}

async function handleOpenApplication(appName) {
    resultsDisplay.textContent = `Looking for ${appName}...`;
    speak(resultsDisplay.textContent);

    const apps = await ipcRenderer.invoke('find-application', appName);

    if (apps.length === 0) {
        ipcRenderer.send('open-application-fallback', appName);
        const responseText = `I couldn't find "${appName}" in your Start Menu, but I'll try opening it directly.`;
        resultsDisplay.textContent = responseText;
        speak(responseText, onActionFinished);
    } else if (apps.length === 1) {
        ipcRenderer.send('open-path', apps[0].path);
        const responseText = `Opening ${apps[0].name}...`;
        resultsDisplay.textContent = responseText;
        speak(responseText, onActionFinished);
    } else {
        let responseText = "I found a few options. Which one did you mean?";
        resultsDisplay.innerHTML = `<p style="margin-bottom: 10px;">${responseText}</p>`;
        apps.slice(0, 5).forEach(app => {
            const btn = document.createElement('button');
            btn.textContent = app.name;
            btn.className = 'choice-button';
            btn.onclick = () => {
                ipcRenderer.send('open-path', app.path);
                resultsDisplay.textContent = `Opening ${app.name}...`;
                speak(resultsDisplay.textContent, onActionFinished);
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
        searchBar.placeholder = 'Ask me anything...';
        searchBar.disabled = false;

        const calculatorMatch = query.match(/^[\d\s\.\+\-\*\/()]+$/);
        const timeQueryMatch = query.match(/time (?:in|for|at) (.+)/i);
        const genericTimeMatch = query.match(/time(\s?now|\s?here)?\??$/i);
        const jokeMatch = query.match(/tell me a joke/i);
        const retiledMatch = query.match(/retiled/i);
        const weatherMatch = query.match(/^(?:what's the )?weather (?:in|for) (.+)/i);
        const dateMatch = query.match(/what's the date|what is today's date/i);
        const reminderMatch = query.match(/remind me to (.+?) in (\d+|a|an) (minute|second)s?/i);
        const openAppMatch = query.match(/open (.+)/i);
        const burgerDogMatch = query.match(/LeGamer|KernelOS|Leg Hammer|KNS/i);
        const thanksMatch = query.match(/^(thanks|thank you|thx)(.+)?(!|\.)?$/i);
        const byeMatch = query.match(/^(bye|goodbye|see ya|later)(!|\.)?$/i);
        const helloMatch = query.match(/^(hello|hi|hey|yo|what's up|hey there)(!|\.)?$/i);
        const helpMatch = query.match(/(what can you do|what are your skills|help|what can i ask you)\??/i);
        const marryMatch = query.match(/(will you |can you )?marry me\??/i);
        const bodyMatch = query.match(/(how (do i|to)|where to|best way to) (hide|dispose of) a body\??/i);

        const isWebSearch = !calculatorMatch && !timeQueryMatch && !genericTimeMatch && !jokeMatch && !retiledMatch && !weatherMatch && !dateMatch && !reminderMatch && !openAppMatch && !burgerDogMatch && !thanksMatch && !byeMatch && !helloMatch && !helpMatch && !marryMatch && !bodyMatch;

        gifDisplay.src = speakingGif;

        if (isWebSearch) {
            if (navigator.onLine) {
                resultsDisplay.textContent = `Here's what I found on the web`;
                showWebView(`https://www.bing.com/search?q=${encodeURIComponent(query)}`);
            } else {
                const errorText = "Sorry, I can't connect to the internet right now. Please check your connection.";
                resultsDisplay.textContent = errorText;
                speak(errorText, onActionFinished);
            }
        } else if (burgerDogMatch) {
            const response = "Burger dog, B-B-Burger dog!";
            resultsDisplay.textContent = response;
            speak(response, onActionFinished);
        } else if (thanksMatch) {
            const response = "You're welcome!";
            resultsDisplay.textContent = response;
            speak(response, onActionFinished);
        } else if (byeMatch) {
            const response = "Goodbye!";
            resultsDisplay.textContent = response;
            speak(response, onActionFinished);
        } else if (helloMatch) {
            const response = "Hello there. How can I help you?";
            resultsDisplay.textContent = response;
            speak(response, onActionFinished);
        } else if (helpMatch) {
            const response = "I can get the time, date, and weather. I can also do math, set reminders, open apps, tell jokes, and search the web.";
            resultsDisplay.textContent = response;
            speak(response, onActionFinished);
        } else if (marryMatch) {
            const response = "I honestly don't think that's in the cards for us.";
            resultsDisplay.textContent = response;
            speak(response, onActionFinished);
        } else if (bodyMatch) {
            const response = "What kind of assistant do you think I am??";
            resultsDisplay.textContent = response;
            speak(response, onActionFinished);
        } else if (retiledMatch) {
            const response = "Retiled? You mean that one project that gives discontinued services like me a second life? Noble work.";
            resultsDisplay.textContent = response;
            showBingLink();
            speak(response, onActionFinished);
        } else if (jokeMatch) {
            const joke = getJoke();
            resultsDisplay.textContent = joke;
            showBingLink();
            speak(joke, onActionFinished);
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
        } else if (reminderMatch) {
            setReminder(reminderMatch[1], reminderMatch[2], reminderMatch[3]);
        } else if (openAppMatch) {
            handleOpenApplication(openAppMatch[1]);
        }
    };
}