console.log("script.js loaded");

// DOM Elements
const tapeElement = document.getElementById('tape');
const tapeContainerElement = document.getElementById('tape-container');
const currentStateValueElement = document.getElementById('current-state-value');
const logOutputElement = document.getElementById('log-output');
const shortStepsOutputElement = document.getElementById('short-steps-output');
const programTableOutputElement = document.getElementById('program-table-output');

// Audio elements
const audioMove = document.getElementById('audio-move');
const audioWrite = document.getElementById('audio-write');

// Inputs from controls-container
const alphabetInput = document.getElementById('alphabet-input');
// Удаляем ссылку на blankSymbolInput, так как мы его убрали из HTML
const wordInput = document.getElementById('word-input');
const programInput = document.getElementById('program-input');
const setConfigButton = document.getElementById('set-config-button');

// Execution Control Buttons
const runButton = document.getElementById('run-button');
const pauseButton = document.getElementById('pause-button');
const stepButton = document.getElementById('step-button');
const resetButton = document.getElementById('reset-button');
const speedSelect = document.getElementById('speed-select');

// Global machine configuration variables
let tapeAlphabet = new Set();
let programRules = new Map();
let initialWord = "";

// Global machine state variables
let currentMachineState = 'q1';
let isHalted = false;
const HALT_STATE = 'q0'; // Define the explicit halt state
let stepCounter = 0;

// Execution control variables
let runIntervalId = null;
let executionSpeed = 500; // ms, default medium

// --- Core Tape and Head variables ---
let tapeArray = [];
let BLANK_SYMBOL = ''; // Пустая ячейка теперь имеет пустой символ
let currentHeadPosition = 0;

// --- Constants for visual calculations ---
const CELL_WIDTH = 50;
const CELL_MARGIN_RIGHT = 5;
const EFFECTIVE_CELL_WIDTH = CELL_WIDTH + CELL_MARGIN_RIGHT;
const HEAD_WIDTH = 36; // Новая ширина головки
const TAPE_CONTAINER_PADDING_LEFT = 20;
const TAPE_DIV_PADDING_LEFT = 10;

// --- Audio Playback Function ---
function playAudio(audioElement) {
    if (audioElement) {
        audioElement.currentTime = 0;
        audioElement.play().catch(error => { /* console.warn("Audio playback failed:", error); */ });
    }
}

// --- Functions for Tape/Head visualization and manipulation ---
function updateHeadVisualPosition() {
    if (!tapeElement || !tapeContainerElement || currentHeadPosition < 0) return;
    
    // Получаем текущую ячейку и её положение
    if (currentHeadPosition < tapeElement.children.length) {
        const currentCell = tapeElement.children[currentHeadPosition];
        if (currentCell) {
            // Определяем центр ячейки
            const cellRect = currentCell.getBoundingClientRect();
            const tapeRect = tapeElement.getBoundingClientRect();
            
            // Вычисляем точное положение центра относительно ленты
            const cellCenter = cellRect.left + (cellRect.width / 2) - tapeRect.left;
            
            // Устанавливаем левую позицию указателя (margin-left в CSS делает смещение)
            tapeElement.style.left = `${cellCenter}px`;
            return;
        }
    }
    
    // Запасной вариант - вычисление позиции программно
    const cellCenter = TAPE_CONTAINER_PADDING_LEFT + 
                     TAPE_DIV_PADDING_LEFT + 
                     (currentHeadPosition * EFFECTIVE_CELL_WIDTH) + 
                     (CELL_WIDTH / 2);
    
    tapeElement.style.left = `${cellCenter}px`;
}

function centerHeadInView() {
    if (!tapeContainerElement || !tapeElement) return;
    
    // Получаем элемент активной ячейки
    const activeCell = tapeElement.querySelector('.active');
    
    if (activeCell) {
        // Получаем размеры и позиции активной ячейки и контейнера
        const cellRect = activeCell.getBoundingClientRect();
        const containerRect = tapeContainerElement.getBoundingClientRect();
        
        // Рассчитываем необходимую позицию скролла для центрирования активной ячейки
        const desiredScrollLeft = 
            tapeContainerElement.scrollLeft + 
            (cellRect.left - containerRect.left) + 
            (cellRect.width / 2) - 
            (containerRect.width / 2);
        
        // Используем плавную прокрутку
        tapeContainerElement.scrollTo({
            left: Math.max(0, desiredScrollLeft),
            behavior: window.innerWidth <= 768 ? 'smooth' : 'auto'
        });
        
        return;
    }
    
    // Запасной вариант, если активная ячейка не найдена
    const headCenterAbsolute = tapeElement.offsetLeft + (HEAD_WIDTH / 2);
    
    // Вычисляем позицию скролла для центрирования головки
    let desiredScrollLeft = headCenterAbsolute - (tapeContainerElement.clientWidth / 2);
    
    // Используем плавную прокрутку для мобильных устройств
    tapeContainerElement.scrollTo({
        left: Math.max(0, desiredScrollLeft),
        behavior: window.innerWidth <= 768 ? 'smooth' : 'auto'
    });
}

function createCellElement(symbol) {
    const cell = document.createElement('div');
    cell.classList.add('tape-cell');
    cell.textContent = symbol === "" ? "\u00A0" : symbol; // Use non-breaking space for visual empty if symbol is ""
    return cell;
}

function renderTape() {
    tapeElement.innerHTML = '';
    tapeArray.forEach((symbol, index) => {
        const cell = createCellElement(symbol);
        if (index === currentHeadPosition) {
            cell.classList.add('active');
            const cellText = symbol === "" ? "&nbsp;" : symbol;
            cell.innerHTML = `<div class="head-indicator"></div>${cellText}`;
        }
        tapeElement.appendChild(cell);
    });
    
    // Обновляем позицию визуальной головки
    updateHeadVisualPosition();
    
    // Обеспечиваем видимость активной ячейки
    ensureActiveCellIsVisible();
    
    // Для мобильных устройств добавляем дополнительное центрирование
    if (window.innerWidth <= 768) {
        setTimeout(() => {
            updateHeadVisualPosition();
            centerHeadInView();
        }, 50);
    }
    
    updateStateDisplay();
}

function addCellToLeft(silent = false) {
    tapeArray.unshift(BLANK_SYMBOL);
    currentHeadPosition = 0;
    const newCell = createCellElement(BLANK_SYMBOL);
    tapeElement.insertBefore(newCell, tapeElement.firstChild);
    if (!silent) updateHeadVisualPosition();
}

function addCellToRight(silent = false) {
    tapeArray.push(BLANK_SYMBOL);
    const newCell = createCellElement(BLANK_SYMBOL);
    tapeElement.appendChild(newCell);
    if (!silent) updateHeadVisualPosition();
}

function writeSymbolToCell(index, symbol) {
    if (index >= 0 && index < tapeArray.length) {
        tapeArray[index] = symbol;
        const cellElement = tapeElement.children[index];
        if (cellElement) {
            // Удаляем предыдущий класс модификации, если он был
            cellElement.classList.remove('modified');
            
            // Ставим новый текст
            cellElement.textContent = symbol === "" ? "\u00A0" : symbol;
            
            // Добавляем класс модификации для анимации
            // Используем setTimeout чтобы анимация срабатывала при каждом изменении
            setTimeout(() => {
                cellElement.classList.add('modified');
            }, 10);
        }
    } else {
        console.error(`Index ${index} out of bounds for writing symbol.`);
    }
}

function writeSymbolToCurrentCell(symbol) {
    writeSymbolToCell(currentHeadPosition, symbol);
    playAudio(audioWrite);
}

function readSymbolUnderHead() {
    if (currentHeadPosition < 0 || currentHeadPosition >= tapeArray.length) {
        logMessage(`Ошибка: попытка чтения за пределами ленты (позиция ${currentHeadPosition})`, "error");
        return '0'; // Возвращаем '0' вместо пустого символа для случаев ошибки
    }
    // Если текущая ячейка пустая, возвращаем '0'
    return tapeArray[currentHeadPosition] === BLANK_SYMBOL ? '0' : tapeArray[currentHeadPosition];
}

function moveHead(direction) {
    const upperDirection = direction.toUpperCase();
    let hasMoved = false;
    
    // Сначала убираем класс active со всех ячеек
    for (let i = 0; i < tapeElement.children.length; i++) {
        tapeElement.children[i].classList.remove('active');
        tapeElement.children[i].innerHTML = tapeElement.children[i].textContent === " " ? "&nbsp;" : tapeElement.children[i].textContent;
    }

    if (upperDirection === 'L') { // Already normalized from П
        currentHeadPosition--;
        if (currentHeadPosition < 0) addCellToLeft();
        hasMoved = true;
    } else if (upperDirection === 'R') { // Already normalized from П
        currentHeadPosition++;
        if (currentHeadPosition >= tapeArray.length) addCellToRight();
        hasMoved = true;
    } else if (upperDirection === 'S' || upperDirection === 'N') { // Stay, normalized from Н
        // No change in position
    } else {
        console.warn(`Unknown move direction in moveHead: ${direction}`);
        return; // Do not play sound or vibrate if direction is invalid
    }

    if (hasMoved) {
        playAudio(audioMove);
        if (tapeContainerElement) {
            tapeContainerElement.classList.add('vibrate-effect');
            setTimeout(() => tapeContainerElement.classList.remove('vibrate-effect'), 150);
        }
    }
    
    // Добавляем класс active к текущей ячейке
    if (currentHeadPosition >= 0 && currentHeadPosition < tapeElement.children.length) {
        const currentCell = tapeElement.children[currentHeadPosition];
        currentCell.classList.add('active');
        
        // Добавляем треугольник непосредственно в ячейку
        const cellText = currentCell.textContent === " " ? "&nbsp;" : currentCell.textContent;
        currentCell.innerHTML = `<div class="head-indicator"></div>${cellText}`;
    }
    
    // Обеспечиваем видимость активной ячейки
    ensureActiveCellIsVisible();
    
    // Дополнительная проверка для мобильных устройств
    setTimeout(ensureActiveCellIsVisible, 100);
}

// Новая функция для обеспечения видимости активной ячейки
function ensureActiveCellIsVisible() {
    if (!tapeContainerElement || currentHeadPosition < 0 || 
        currentHeadPosition >= tapeElement.children.length) return;
        
    const currentCell = tapeElement.children[currentHeadPosition];
    if (!currentCell) return;
    
    const cellRect = currentCell.getBoundingClientRect();
    const containerRect = tapeContainerElement.getBoundingClientRect();
    
    // Проверяем, полностью ли видна ячейка
    const isFullyVisible = 
        cellRect.left >= containerRect.left && 
        cellRect.right <= containerRect.right;
        
    if (!isFullyVisible) {
        // Вычисляем положение для скролла - центрируем ячейку
        const scrollLeft = cellRect.left - containerRect.left - 
                         (containerRect.width / 2) + (cellRect.width / 2) + 
                         tapeContainerElement.scrollLeft;
                         
        // Применяем плавную прокрутку
        tapeContainerElement.scrollTo({
            left: scrollLeft,
            behavior: 'smooth'
        });
    }
}

function initializeTape(word = "", numExtraCells = 10) {
    const wordChars = word.split('');
    const minTapeSize = Math.max(15, wordChars.length + numExtraCells);
    tapeArray = new Array(minTapeSize).fill(BLANK_SYMBOL);
    
    // Размещаем слово по центру ленты
    const wordStartIndex = Math.floor((minTapeSize - wordChars.length) / 2);
    
    for (let i = 0; i < wordChars.length; i++) {
        tapeArray[wordStartIndex + i] = wordChars[i];
    }

    // Устанавливаем начальную позицию на последний символ входного слова
    if (word.length > 0) {
        currentHeadPosition = wordStartIndex + wordChars.length - 1;
    } else {
        currentHeadPosition = Math.floor(minTapeSize / 2); // Если слово пустое, устанавливаем головку по центру
    }
    
    renderTape(); // Calls updateStateDisplay
    logShortStep(); // Добавляем начальную краткую запись
    
    // Явно вызываем функции центрирования, особенно важно для мобильных устройств
    updateHeadVisualPosition();
    centerHeadInView();
    
    // Дополнительные вызовы с задержкой для надежной работы на мобильных устройствах
    setTimeout(() => {
        updateHeadVisualPosition();
        centerHeadInView();
    }, 100);
    
    // Еще один вызов с большей задержкой для случаев медленной загрузки
    if (window.innerWidth <= 768) {
        setTimeout(() => {
            updateHeadVisualPosition();
            centerHeadInView();
        }, 300);
    }
}

// --- UI Update Functions ---
function updateStateDisplay() {
    if (currentStateValueElement) {
        currentStateValueElement.textContent = currentMachineState;
        if (isHalted) {
            currentStateValueElement.textContent += " (ЗАВЕРШЕНО)";
        }
    }
}

function logMessage(message, type = "info") { // type can be 'info', 'error', 'halt'
    if (logOutputElement) {
        const p = document.createElement('p');
        p.textContent = message;
        if (type === "error") p.style.color = "red";
        if (type === "halt") p.style.fontWeight = "bold";
        logOutputElement.appendChild(p);
        logOutputElement.scrollTop = logOutputElement.scrollHeight;
    }
    console.log(message);
}

function logStep(oldState, symbolRead, newState, symbolWritten, move) {
    stepCounter++;
    let moveDisplay = move;
    if (move === 'S' || move === 'N') moveDisplay = 'Н'; // Display 'Н' for Stay/Neutral
    if (move === 'L') moveDisplay = 'Л';
    if (move === 'R') moveDisplay = 'П';

    // Теперь пустые символы и символы B отображаются как '0'
    const message = `Шаг ${stepCounter}: (${oldState}, '${symbolRead === "" ? '0' : symbolRead}') -> (${newState}, '${symbolWritten === "" ? '0' : symbolWritten}', ${moveDisplay})`;
    logMessage(message);
    
    // Добавляем краткую запись текущего шага
    logShortStep();
}

function clearLog() {
    if (logOutputElement) {
        logOutputElement.innerHTML = ''; // Clear all messages
    }
    if (shortStepsOutputElement) {
        shortStepsOutputElement.innerHTML = ''; // Clear short steps
    }
    stepCounter = 0;
}

// Функция для форматирования ленты с указанием текущего состояния
function formatTapeWithState(tapeArray, headPosition, state) {
    // Создаем строковое представление ленты
    let result = '';
    
    // Фильтруем пустые ячейки в начале и в конце, оставляя только значимую часть
    let start = 0;
    let end = tapeArray.length - 1;
    
    // Находим первый непустой символ слева
    while (start <= end && (tapeArray[start] === '' || tapeArray[start] === BLANK_SYMBOL)) {
        start++;
    }
    
    // Находим последний непустой символ справа
    while (end >= start && (tapeArray[end] === '' || tapeArray[end] === BLANK_SYMBOL)) {
        end--;
    }
    
    // Если головка находится за пределами непустой части, расширяем границы
    if (headPosition < start) start = headPosition;
    if (headPosition > end) end = headPosition;
    
    // Строим строку ленты
    for (let i = start; i <= end; i++) {
        // Добавляем символ (или '0' для пустых ячеек)
        const cellSymbol = (tapeArray[i] === '' || tapeArray[i] === BLANK_SYMBOL) ? '0' : tapeArray[i];
        
        if (i === headPosition) {
            // Вставляем текущее состояние перед символом под головкой
            // Модифицируем для отображения номера состояния как нижнего индекса
            const stateMatch = state.match(/^q(\d+)$/);
            if (stateMatch) {
                result += `q<sub>${stateMatch[1]}</sub>`;
            } else {
                result += state; // Для состояний типа q0 или других, не соответствующих шаблону q[число]
            }
        }
        
        result += cellSymbol;
    }
    
    return result;
}

// Функция для добавления краткого шага в лог
function logShortStep() {
    if (!shortStepsOutputElement) return;

    // Теперь formatTapeWithState возвращает HTML
    const currentTapeStateHTML = formatTapeWithState(tapeArray, currentHeadPosition, currentMachineState);

    // Используем innerHTML для корректного отображения HTML
    if (shortStepsOutputElement.innerHTML === '') {
        // Первый шаг: устанавливаем innerHTML элемента
        shortStepsOutputElement.innerHTML = currentTapeStateHTML;
    } else {
        // Последующие шаги: добавляем стрелку и HTML текущего состояния
        shortStepsOutputElement.innerHTML += ` --> ${currentTapeStateHTML}`;
    }
    // Прокручиваем в конец
    shortStepsOutputElement.scrollTop = shortStepsOutputElement.scrollHeight; // Прокрутка по вертикали
    // Для горизонтальной прокрутки потребуется дополнительный CSS и, возможно, JS
}

// --- Функции для работы с таблицей программы ---
function generateProgramTable() {
    if (!programTableOutputElement) return;
    
    // Очищаем контейнер таблицы
    programTableOutputElement.innerHTML = '';
    
    if (programRules.size === 0) {
        programTableOutputElement.textContent = 'Программа не задана';
        return;
    }
    
    // Собираем все уникальные состояния и входные символы
    const states = new Set();
    const inputSymbols = new Set();
    
    // Создаем структуру данных для хранения правил в форме таблицы
    const tableData = new Map();
    
    // Заполняем множества и структуру данных
    for (const [key, value] of programRules.entries()) {
        const [state, symbol] = key.split(',');
        states.add(state);
        inputSymbols.add(symbol);
        
        if (!tableData.has(state)) {
            tableData.set(state, new Map());
        }
        tableData.get(state).set(symbol, value);
    }
    
    // Добавляем состояние останова q0 если его еще нет
    if (!tableData.has('q0')) {
        states.add('q0');
    }
    
    // Преобразуем множества в отсортированные массивы
    const sortedStates = Array.from(states).sort((a, b) => {
        // Специальная сортировка для состояний q с числовыми индексами
        const aMatch = a.match(/^q(\d+)$/);
        const bMatch = b.match(/^q(\d+)$/);
        
        if (aMatch && bMatch) {
            return parseInt(aMatch[1]) - parseInt(bMatch[1]);
        }
        return a.localeCompare(b);
    });
    
    const sortedSymbols = Array.from(inputSymbols).sort();
    
    // Создаем таблицу
    const table = document.createElement('table');
    table.className = 'program-table';
    
    // Создаем заголовок таблицы
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const cornerCell = document.createElement('th');
    cornerCell.textContent = 'Состояние \\ Символ';
    headerRow.appendChild(cornerCell);
    
    // Добавляем символы в заголовок
    sortedSymbols.forEach(symbol => {
        const th = document.createElement('th');
        th.textContent = symbol === '' ? '0' : symbol;
        headerRow.appendChild(th);
    });
    
    thead.appendChild(headerRow);
    table.appendChild(thead);
    
    // Создаем тело таблицы
    const tbody = document.createElement('tbody');
    
    sortedStates.forEach(state => {
        const tr = document.createElement('tr');
        
        // Если это текущее состояние, выделяем его
        if (state === currentMachineState) {
            tr.className = 'current-state';
        }
        
        // Если это состояние останова, применяем соответствующий стиль
        if (state === 'q0') {
            tr.className = 'halt-state';
        }
        
        // Добавляем ячейку с названием состояния
        const stateCell = document.createElement('th');
        const stateMatch = state.match(/^q(\d+)$/);
        if (stateMatch) {
            stateCell.innerHTML = `q<sub>${stateMatch[1]}</sub>`;
        } else {
            stateCell.textContent = state;
        }
        tr.appendChild(stateCell);
        
        // Добавляем ячейки для каждого входного символа
        sortedSymbols.forEach(symbol => {
            const td = document.createElement('td');
            
            const stateRules = tableData.get(state);
            if (stateRules && stateRules.has(symbol)) {
                const rule = stateRules.get(symbol);
                const { q_new: newState, s_new: newSymbol, move: direction } = rule;
                
                // Форматируем направление
                let dirDisplay = direction;
                if (direction === 'L') dirDisplay = 'Л';
                if (direction === 'R') dirDisplay = 'П';
                if (direction === 'S') dirDisplay = 'Н';
                
                // Состояние с нижним индексом
                const newStateMatch = newState.match(/^q(\d+)$/);
                let newStateDisplay;
                if (newStateMatch) {
                    newStateDisplay = `q<sub>${newStateMatch[1]}</sub>`;
                } else {
                    newStateDisplay = newState;
                }
                
                td.innerHTML = `(${newStateDisplay}, ${newSymbol === '' ? '0' : newSymbol}, ${dirDisplay})`;
            } else {
                td.textContent = '-';
            }
            
            tr.appendChild(td);
        });
        
        tbody.appendChild(tr);
    });
    
    table.appendChild(tbody);
    programTableOutputElement.appendChild(table);
}

// --- Configuration Function ---
function handleSetConfig(isReset = false) {
    try {
        const alphabetStr = alphabetInput.value.trim();
        const parsedAlphabet = alphabetStr.split(',').map(s => s.trim()).filter(s => s.length > 0);
        if (parsedAlphabet.length === 0 && alphabetStr !== "") {
             throw new Error("Алфавит не может быть пустым, если указан.");
        }
        const uniqueAlphabet = new Set(parsedAlphabet);
        if (uniqueAlphabet.size !== parsedAlphabet.length) {
            throw new Error("Символы в алфавите должны быть уникальны.");
        }
        tapeAlphabet = uniqueAlphabet;

        // Пустая ячейка теперь всегда пустой символ
        BLANK_SYMBOL = '';

        initialWord = wordInput.value;
        for (const char of initialWord) {
            if (!tapeAlphabet.has(char) && char !== '') {
                throw new Error(`Символ "${char}" во входном слове отсутствует в алфавите.`);
            }
        }
        
        // Добавляем первый краткий шаг при установке конфигурации
        shortStepsOutputElement.innerHTML = '';

        programRules.clear();
        const rulesStr = programInput.value.trim();
        const ruleLines = rulesStr.split('\n').filter(line => line.trim() !== "");
        const ruleRegex = /\(\s*([^,]+?)\s*,\s*([^,]+?)\s*\)\s*->\s*\(\s*([^,]+?)\s*,\s*([^,]+?)\s*,\s*([ПЛНSRN])\s*\)/i;

        for (const line of ruleLines) {
            const match = line.match(ruleRegex);
            if (!match) {
                throw new Error(`Ошибка синтаксиса в правиле: "${line}". Формат: (q_тек, s_тек) -> (q_нов, s_нов, Движение[П,Л,Н,S,R,N])`);
            }
            const [, qCurrent, sCurrentInRule, qNew, sNewInRule, moveInput] = match.map(m => m.trim());
            
            const sCurrent = sCurrentInRule; // Keep as is, comparison with BLANK_SYMBOL will handle it
            const sNew = sNewInRule;

            if (!tapeAlphabet.has(sCurrent) && sCurrent !== '0' && sCurrent !== 'B') {
                throw new Error(`Символ "${sCurrent}" в правиле "${line}" (читаемый) не является частью алфавита.`);
            }
            if (!tapeAlphabet.has(sNew) && sNew !== '0' && sNew !== 'B') {
                throw new Error(`Символ "${sNew}" в правиле "${line}" (записываемый) не является частью алфавита.`);
            }
            
            const ruleKey = `${qCurrent},${sCurrent}`;
            if (programRules.has(ruleKey)) {
                throw new Error(`Дублирующее правило для состояния "${qCurrent}" и символа "${sCurrent}".`);
            }
            let normalizedMove = moveInput.toUpperCase();
            if (normalizedMove === 'П') normalizedMove = 'R';
            if (normalizedMove === 'Л') normalizedMove = 'L';
            if (normalizedMove === 'Н' || normalizedMove === 'N') normalizedMove = 'S'; // S for Stay

            programRules.set(ruleKey, { q_new: qNew, s_new: sNew, move: normalizedMove });
        }
        
        currentMachineState = 'q1';
        isHalted = false;
        if (!isReset) clearLog(); // Clear log only on explicit set config, not on reset if we want to keep old log for a moment
        stepCounter = 0; // Reset step counter
        logMessage(`Конфигурация ${isReset ? 'сброшена и' : ''} установлена. Начальное состояние: q1.`);
        initializeTape(initialWord); // Calls renderTape -> updateStateDisplay
        
        // Генерируем таблицу программы
        generateProgramTable();
        
        updateButtonStates();
        
        // Гарантируем, что головка правильно размещена и видна
        setTimeout(() => {
            updateHeadVisualPosition();
            centerHeadInView();
        }, 100);

        if (!isReset) alert("Конфигурация успешно установлена!");

    } catch (error) {
        logMessage(`Ошибка конфигурации: ${error.message}`, "error");
        isHalted = true;
        updateStateDisplay();
        updateButtonStates(); // Reflect halted state in buttons
    }
}

// --- Core Simulation Logic & Controls ---
function stepExecution() {
    if (isHalted) {
        logMessage("Машина ЗАВЕРШЕНА. Для нового запуска установите конфигурацию или сбросьте текущую.", "halt");
        updateStateDisplay();
        return true; // Indicate halt
    }

    if (currentMachineState === HALT_STATE) {
        isHalted = true;
        logMessage(`Машина достигла состояния останова: ${HALT_STATE}. ЗАВЕРШЕНО.`, "halt");
        updateStateDisplay();

        return true; // Indicate halt
    }

    const symbolUnderHead = readSymbolUnderHead();
    const ruleKey = `${currentMachineState},${symbolUnderHead}`;
    const rule = programRules.get(ruleKey);
    const oldStateForLog = currentMachineState;

    if (rule) {
        const { q_new: newState, s_new: newSymbolToWrite, move: moveDirection } = rule;
        
        // Сохраняем старое состояние и символы для логирования
        const oldSymbol = symbolUnderHead;
        
        // Выполняем действия по правилу: запись, изменение состояния, перемещение головки
        writeSymbolToCurrentCell(newSymbolToWrite);
        currentMachineState = newState;
        moveHead(moveDirection);
        
        // Теперь логируем шаг после всех изменений ленты и головки
        logStep(oldStateForLog, oldSymbol, newState, newSymbolToWrite, moveDirection);

        // Обновляем таблицу программы, чтобы выделить текущее состояние
        generateProgramTable();

        // Дополнительное центрирование для мобильных устройств после выполнения шага
        if (window.innerWidth <= 768) {
            setTimeout(() => {
                ensureActiveCellIsVisible();
            }, 200);
        }

        if (currentMachineState === HALT_STATE) {
            isHalted = true;
            logMessage(`Машина достигла состояния останова: ${HALT_STATE} после выполнения правила. ЗАВЕРШЕНО.`, "halt");
        }
    } else {
        isHalted = true;
        logMessage(`Правило не найдено для (${currentMachineState}, '${symbolUnderHead === "" ? BLANK_SYMBOL : symbolUnderHead}'). Машина ЗАВЕРШЕНА (нет правила).`, "halt");
    }
    updateStateDisplay();
    return isHalted; // Return true if halted this step, false otherwise
}

function stepExecutionWrapper() {
    if (stepExecution()) { // If stepExecution returns true (machine halted)
        handlePause(); // Stop the interval and update buttons
    }
}

function handleRun() {
    if (isHalted) {
        logMessage("Машина уже завершена. Сбросьте конфигурацию для нового запуска.", "info");
        return;
    }
    if (runIntervalId) return; // Already running

    runIntervalId = setInterval(stepExecutionWrapper, executionSpeed);
    updateButtonStates();
    logMessage("Запуск машины...", "info");
}

function handlePause() {
    if (runIntervalId) {
        clearInterval(runIntervalId);
        runIntervalId = null;
    }
    updateButtonStates();
    if (!isHalted) { // Avoid logging pause if machine halted naturally
      logMessage("Машина на паузе.", "info");
    }
}

function handleStep() {
    if (isHalted) {
        logMessage("Машина уже завершена. Сбросьте конфигурацию для нового запуска.", "info");
        return;
    }
    if (runIntervalId) { // If it was running, pause it first
        handlePause();
    }
    stepExecution(); // Execute one step
    updateButtonStates(); // Update buttons (e.g. if it halted after this step)
}

function handleReset() {
    handlePause(); // Stop any ongoing execution
    clearLog(); // Clear the log display
    logMessage("Сброс конфигурации...", "info");
    handleSetConfig(true); // Re-apply current settings from input fields and reset state
    // handleSetConfig already calls initializeTape, updates display, and button states
}

function handleSpeedChange() {
    const speedValue = speedSelect.value;
    switch (speedValue) {
        case "slow": executionSpeed = 1000; break;
        case "medium": executionSpeed = 500; break;
        case "fast": executionSpeed = 200; break;
        default: executionSpeed = 500;
    }
    logMessage(`Скорость изменена на: ${speedValue} (${executionSpeed}ms)`, "info");
    if (runIntervalId) { // If machine is currently running, restart interval with new speed
        handlePause();
        handleRun();
    }
}

function updateButtonStates() {
    if (isHalted) {
        runButton.disabled = true;
        pauseButton.disabled = true;
        stepButton.disabled = true;
    } else if (runIntervalId) { // Running
        runButton.disabled = true;
        pauseButton.disabled = false;
        stepButton.disabled = true; // Cannot step while running
    } else { // Paused or initial state
        runButton.disabled = false;
        pauseButton.disabled = true;
        stepButton.disabled = false;
    }
    // Reset button is always enabled unless a specific condition is set
    resetButton.disabled = false; 
    // Set config button is always enabled
    setConfigButton.disabled = false;
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    // Инициализация ленты
    initializeTape("", 15); 
    updateStateDisplay();
    updateButtonStates(); // Set initial button states
    
    // Генерируем пустую таблицу программы при загрузке
    generateProgramTable();
    
    // Гарантируем, что головка видна при загрузке
    setTimeout(() => {
        updateHeadVisualPosition();
        centerHeadInView();
    }, 200);
    
    // Дополнительная проверка для мобильных устройств с большей задержкой
    if (window.innerWidth <= 768) {
        setTimeout(() => {
            updateHeadVisualPosition();
            centerHeadInView();
        }, 500);
        
        // Еще одна попытка после полной загрузки страницы
        setTimeout(() => {
            updateHeadVisualPosition();
            centerHeadInView();
        }, 1000);
    }

    if (audioMove) audioMove.load();
    if (audioWrite) audioWrite.load();

    setConfigButton.addEventListener('click', () => handleSetConfig(false));
    runButton.addEventListener('click', handleRun);
    pauseButton.addEventListener('click', handlePause);
    stepButton.addEventListener('click', handleStep);
    resetButton.addEventListener('click', handleReset);
    speedSelect.addEventListener('change', handleSpeedChange);

    // Set initial speed from select
    handleSpeedChange();

    // На мобильных устройствах устанавливаем дополнительные обработчики
    if (window.innerWidth <= 768) {
        // Установка обработчика изменения размеров окна для обновления положения головки
        window.addEventListener('resize', () => {
            updateHeadVisualPosition();
            centerHeadInView();
        });
        
        // Обработчик для ориентации экрана
        window.addEventListener('orientationchange', () => {
            setTimeout(() => {
                updateHeadVisualPosition();
                centerHeadInView();
            }, 300);
        });
    }

    // Обработчик события load для окна - дополнительная проверка после полной загрузки страницы
    window.addEventListener('load', () => {
        updateHeadVisualPosition();
        centerHeadInView();
    });

    window.DEV_TOOLS = { // Expose for debugging
        moveHead, writeSymbolToCurrentCell, readSymbolUnderHead, tapeArray, currentHeadPosition,
        initializeTape, renderTape, updateHeadVisualPosition, centerHeadInView,
        handleSetConfig, programRules, tapeAlphabet, stepExecution,
        currentMachineState, isHalted, logMessage, clearLog, playAudio, updateButtonStates,
        handleRun, handlePause, handleStep, handleReset, handleSpeedChange, generateProgramTable
    };
});