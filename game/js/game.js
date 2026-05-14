const GRID_SIZE = 6;
const NUM_COLORS = 6;
const MAX_LEVEL = 25;

let currentLevel = 1;
let lives = 2;
let winStreak = 0;
let bestStreak = 0;
let hints = 9999;
let stars = 0;
let affection = 0;
let completedLevels = new Set();

let colorGrid = [];
let solution = {};
let playerGrid = [];
let placedCount = 0;
let history = [];
let validatedStartColor = 0;

let lastClickTime = 0;
let lastClickCell = null;
const DOUBLE_CLICK_THRESHOLD = 300;

function init() {
    loadProgress();
    renderLevelGrid();
    updateResourceDisplay();
}

function loadProgress() {
    try {
        const saved = localStorage.getItem('xiaomagame_progress');
        if (saved) {
            const data = JSON.parse(saved);
            currentLevel = data.currentLevel || 1;
            bestStreak = data.bestStreak || 0;
            stars = data.stars || 0;
            affection = data.affection || 0;
            completedLevels = new Set(data.completedLevels || []);
        }
    } catch (e) {}
}

function saveProgress() {
    try {
        localStorage.setItem('xiaomagame_progress', JSON.stringify({
            currentLevel,
            bestStreak,
            stars,
            affection,
            completedLevels: [...completedLevels]
        }));
    } catch (e) {}
}

function renderLevelGrid() {
    const grid = document.getElementById('levelGrid');
    grid.innerHTML = '';

    for (let i = 1; i <= MAX_LEVEL; i++) {
        const btn = document.createElement('button');
        btn.className = 'level-btn';
        btn.textContent = i;

        if (completedLevels.has(i)) {
            btn.classList.add('unlocked', 'completed');
        } else if (i <= currentLevel) {
            btn.classList.add('unlocked');
            if (i === currentLevel) btn.classList.add('current');
        } else {
            btn.classList.add('locked');
        }

        btn.onclick = () => {
            if (i <= currentLevel) {
                currentLevel = i;
                startGame();
            }
        };

        grid.appendChild(btn);
    }
}

function updateResourceDisplay() {
    document.getElementById('totalStars').textContent = stars;
    document.getElementById('affection').textContent = affection;
}

function startGame() {
    document.getElementById('startScreen').classList.add('hidden');
    document.getElementById('gameScreen').classList.add('active');

    initGame();
}

function showStartScreen() {
    document.getElementById('winModal').classList.remove('show');
    document.getElementById('loseModal').classList.remove('show');
    document.getElementById('gameScreen').classList.remove('active');
    document.getElementById('startScreen').classList.remove('hidden');

    renderLevelGrid();
    updateResourceDisplay();
}

function initGame() {
    let validPuzzle = false;
    let attempts = 0;

    while (!validPuzzle && attempts < 50) {
        attempts++;
        generateSolution();
        generateColorRegionsFromSolution();
        validPuzzle = validatePuzzleSolvability();
    }

    createGrid();

    const startPos = solution[validatedStartColor];
    revealPony(startPos.row, startPos.col);

    updateUI();
}

function generateSolution() {
    solution = {};

    const cols = new Set();
    const positions = [];

    const tryPlace = (row) => {
        if (row === GRID_SIZE) return true;

        const colOrder = [0, 1, 2, 3, 4, 5].sort(() => Math.random() - 0.5);

        for (const col of colOrder) {
            if (cols.has(col)) continue;

            let adjacent = false;
            for (const pos of positions) {
                if (Math.abs(pos.row - row) <= 1 && Math.abs(pos.col - col) <= 1) {
                    adjacent = true;
                    break;
                }
            }
            if (adjacent) continue;

            positions.push({ row, col });
            cols.add(col);

            if (tryPlace(row + 1)) return true;

            positions.pop();
            cols.delete(col);
        }
        return false;
    };

    if (tryPlace(0)) {
        for (let i = 0; i < positions.length; i++) {
            solution[i] = { row: positions[i].row, col: positions[i].col };
        }
    }
}

function generateColorRegionsFromSolution() {
    colorGrid = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(-1));

    for (let color = 0; color < NUM_COLORS; color++) {
        const pos = solution[color];
        colorGrid[pos.row][pos.col] = color;
    }

    const unassigned = new Set();
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            if (colorGrid[r][c] === -1) unassigned.add(`${r},${c}`);
        }
    }

    const colorCounts = {};
    for (let color = 0; color < NUM_COLORS; color++) {
        colorCounts[color] = 1;
    }

    const directions = [[-1,0], [1,0], [0,-1], [0,1], [-1,-1], [-1,1], [1,-1], [1,1]];

    while (unassigned.size > 0) {
        let minColor = -1;
        let minCount = Infinity;

        for (let color = 0; color < NUM_COLORS; color++) {
            if (colorCounts[color] < 6 && colorCounts[color] < minCount) {
                minCount = colorCounts[color];
                minColor = color;
            }
        }

        if (minColor === -1) break;

        const frontier = [];
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                if (colorGrid[r][c] === minColor) {
                    for (const [dr, dc] of directions) {
                        const nr = r + dr;
                        const nc = c + dc;
                        if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE) {
                            if (unassigned.has(`${nr},${nc}`)) {
                                frontier.push({ row: nr, col: nc });
                            }
                        }
                    }
                }
            }
        }

        if (frontier.length === 0) {
            colorCounts[minColor] = 99;
            continue;
        }

        const chosen = frontier[Math.floor(Math.random() * frontier.length)];
        colorGrid[chosen.row][chosen.col] = minColor;
        unassigned.delete(`${chosen.row},${chosen.col}`);
        colorCounts[minColor]++;
    }

    for (const key of unassigned) {
        const [r, c] = key.split(',').map(Number);
        for (const [dr, dc] of directions) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE && colorGrid[nr][nc] >= 0) {
                colorGrid[r][c] = colorGrid[nr][nc];
                break;
            }
        }
    }
}

function validatePuzzleSolvability() {
    for (let startColor = 0; startColor < NUM_COLORS; startColor++) {
        const testGrid = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill('empty'));

        const startPos = solution[startColor];
        testGrid[startPos.row][startPos.col] = 'pony';

        markExcluded(startPos.row, startPos.col, startColor, testGrid);

        let foundCount = 1;

        for (let iter = 0; iter < 100; iter++) {
            let madeProgress = false;

            for (let color = 0; color < NUM_COLORS; color++) {
                if (testGrid[solution[color].row][solution[color].col] === 'pony') continue;

                const availableCells = [];
                for (let r = 0; r < GRID_SIZE; r++) {
                    for (let c = 0; c < GRID_SIZE; c++) {
                        if (colorGrid[r][c] === color && testGrid[r][c] === 'empty') {
                            availableCells.push({ row: r, col: c });
                        }
                    }
                }

                if (availableCells.length === 1) {
                    const cell = availableCells[0];
                    if (solution[color].row === cell.row && solution[color].col === cell.col) {
                        testGrid[cell.row][cell.col] = 'pony';
                        markExcluded(cell.row, cell.col, color, testGrid);
                        foundCount++;
                        madeProgress = true;
                    }
                }
            }

            if (!madeProgress) {
                for (let color = 0; color < NUM_COLORS; color++) {
                    if (testGrid[solution[color].row][solution[color].col] === 'pony') continue;

                    const availableCells = [];
                    for (let r = 0; r < GRID_SIZE; r++) {
                        for (let c = 0; c < GRID_SIZE; c++) {
                            if (colorGrid[r][c] === color && testGrid[r][c] === 'empty') {
                                availableCells.push({ row: r, col: c });
                            }
                        }
                    }

                    if (availableCells.length === 2) {
                        const validCells = availableCells.filter(cell => {
                            return canPlacePonyInTestGrid(cell.row, cell.col, testGrid);
                        });

                        if (validCells.length === 1) {
                            const cell = validCells[0];
                            if (solution[color].row === cell.row && solution[color].col === cell.col) {
                                testGrid[cell.row][cell.col] = 'pony';
                                markExcluded(cell.row, cell.col, color, testGrid);
                                foundCount++;
                                madeProgress = true;
                            }
                        }
                    }
                }
            }

            if (foundCount === NUM_COLORS) {
                validatedStartColor = startColor;
                return true;
            }

            if (!madeProgress) {
                break;
            }
        }
    }

    return false;
}

function canPlacePonyInTestGrid(row, col, testGrid) {
    for (let c = 0; c < GRID_SIZE; c++) {
        if (testGrid[row][c] === 'pony') return false;
    }

    for (let r = 0; r < GRID_SIZE; r++) {
        if (testGrid[r][col] === 'pony') return false;
    }

    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = row + dr;
            const nc = col + dc;
            if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE) {
                if (testGrid[nr][nc] === 'pony') return false;
            }
        }
    }

    return true;
}

function markExcluded(ponyRow, ponyCol, ponyColor, testGrid) {
    for (let c = 0; c < GRID_SIZE; c++) {
        if (testGrid[ponyRow][c] === 'empty') {
            testGrid[ponyRow][c] = 'excluded';
        }
    }

    for (let r = 0; r < GRID_SIZE; r++) {
        if (testGrid[r][ponyCol] === 'empty') {
            testGrid[r][ponyCol] = 'excluded';
        }
    }

    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = ponyRow + dr;
            const nc = ponyCol + dc;
            if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE) {
                if (testGrid[nr][nc] === 'empty') {
                    testGrid[nr][nc] = 'excluded';
                }
            }
        }
    }

    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            if (colorGrid[r][c] === ponyColor && testGrid[r][c] === 'empty') {
                testGrid[r][c] = 'excluded';
            }
        }
    }
}

function createGrid() {
    const grid = document.getElementById('grid');
    grid.innerHTML = '';

    playerGrid = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill('empty'));
    placedCount = 0;
    history = [];

    for (let row = 0; row < GRID_SIZE; row++) {
        for (let col = 0; col < GRID_SIZE; col++) {
            const cell = document.createElement('div');
            const colorIndex = colorGrid[row][col];
            cell.className = `cell color-${colorIndex}`;
            cell.dataset.row = row;
            cell.dataset.col = col;
            cell.dataset.color = colorIndex;

            const label = document.createElement('span');
            label.className = 'region-label';
            label.textContent = colorIndex + 1;
            cell.appendChild(label);

            cell.addEventListener('click', () => handleCellClick(row, col));
            grid.appendChild(cell);
        }
    }

    document.getElementById('levelNum').textContent = currentLevel;
}

function handleCellClick(row, col) {
    const now = Date.now();
    const cellKey = `${row},${col}`;

    if (lastClickCell === cellKey && now - lastClickTime < DOUBLE_CLICK_THRESHOLD) {
        const state = playerGrid[row][col];
        if (state === 'empty' || state === 'marked') {
            if (isCorrectPonyPosition(row, col)) {
                revealPony(row, col);
                checkWin();
            } else {
                showError(row, col);
                loseLife();
            }
        }
        lastClickCell = null;
        updateUI();
        return;
    }

    lastClickTime = now;
    lastClickCell = cellKey;

    const state = playerGrid[row][col];
    const cell = getCell(row, col);

    if (state === 'empty') {
        playerGrid[row][col] = 'marked';
        cell.classList.add('marked');
        history.push({ row, col, prev: 'empty' });
    } else if (state === 'marked') {
        playerGrid[row][col] = 'empty';
        cell.classList.remove('marked');
        history.push({ row, col, prev: 'marked' });
    }

    updateUI();
}

function isCorrectPonyPosition(row, col) {
    for (let color = 0; color < NUM_COLORS; color++) {
        if (solution[color] && solution[color].row === row && solution[color].col === col) {
            return true;
        }
    }
    return false;
}

function getPonyColor(row, col) {
    for (let color = 0; color < NUM_COLORS; color++) {
        if (solution[color] && solution[color].row === row && solution[color].col === col) {
            return color;
        }
    }
    return -1;
}

function canPlacePony(row, col) {
    return isCorrectPonyPosition(row, col);
}

function revealPony(row, col) {
    const cell = getCell(row, col);
    const colorIndex = getPonyColor(row, col);

    cell.classList.remove('marked', 'system-marked');
    cell.classList.add('placed');
    cell.innerHTML = '';
    cell.appendChild(createPony(colorIndex));

    playerGrid[row][col] = 'pony';
    placedCount++;

    checkLogicHints();
}

function createPony(colorIndex) {
    const pony = document.createElement('div');
    pony.className = `pony pony-color-${colorIndex}`;

    pony.innerHTML = `
        <div class="pony-body">
            <div class="pony-face">
                <div class="pony-ear left"><div class="pony-ear-inner"></div></div>
                <div class="pony-ear right"><div class="pony-ear-inner"></div></div>
                <div class="pony-eyes">
                    <div class="pony-eye"></div>
                    <div class="pony-eye"></div>
                </div>
                <div class="pony-nose"></div>
                <div class="pony-mouth"></div>
            </div>
            <div class="pony-mane">
                <div class="mane-strand"></div>
                <div class="mane-strand"></div>
                <div class="mane-strand"></div>
                <div class="mane-strand"></div>
                <div class="mane-strand"></div>
            </div>
            <div class="pony-tail"></div>
        </div>
    `;

    return pony;
}

function getCell(row, col) {
    return document.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
}

function showError(row, col) {
    const cell = getCell(row, col);
    cell.classList.add('error');
    setTimeout(() => cell.classList.remove('error'), 300);
    if (navigator.vibrate) navigator.vibrate(100);
}

function loseLife() {
    lives--;
    updateLives();
    if (lives <= 0) {
        setTimeout(() => {
            document.getElementById('loseModal').classList.add('show');
        }, 500);
    }
}

function updateLives() {
    const hearts = document.getElementById('lives');
    hearts.innerHTML = '';
    for (let i = 0; i < 2; i++) {
        const heart = document.createElement('span');
        heart.className = 'heart';
        heart.textContent = i < lives ? '❤️' : '🖤';
        hearts.appendChild(heart);
    }
}

function checkLogicHints() {}

function checkWin() {
    if (placedCount !== NUM_COLORS) return;

    let correct = true;
    for (const [color, pos] of Object.entries(solution)) {
        if (playerGrid[pos.row][pos.col] !== 'pony' || colorGrid[pos.row][pos.col] !== parseInt(color)) {
            correct = false;
            break;
        }
    }

    if (correct) {
        winStreak++;
        if (winStreak > bestStreak) bestStreak = winStreak;
        completedLevels.add(currentLevel);
        if (currentLevel >= currentLevel) currentLevel++;
        stars += 2;
        affection += 5;
        saveProgress();
        updateResourceDisplay();
        showWinModal();
    }
}

function showWinModal() {
    const messages = ['太棒了！', '完美通关！', '你真聪明！', '继续加油！', '厉害极了！'];
    document.getElementById('modalWinStreak').textContent = winStreak;
    document.getElementById('modalBestStreak').textContent = bestStreak;
    document.getElementById('modalProgress').style.width = `${(currentLevel / MAX_LEVEL) * 100}%`;
    document.getElementById('winMessage').textContent = messages[Math.floor(Math.random() * messages.length)];
    document.getElementById('winModal').classList.add('show');
    createConfetti();
}

function nextLevel() {
    document.getElementById('winModal').classList.remove('show');
    initGame();
}

function restartLevel() {
    document.getElementById('loseModal').classList.remove('show');
    lives = 2;
    initGame();
}

function undo() {
    if (history.length === 0) return;

    const { row, col, prev } = history.pop();
    const cell = getCell(row, col);
    const currentState = playerGrid[row][col];

    if (currentState === 'marked' && prev === 'empty') {
        cell.classList.remove('marked');
        playerGrid[row][col] = 'empty';
    } else if (currentState === 'empty' && prev === 'marked') {
        cell.classList.add('marked');
        playerGrid[row][col] = 'marked';
    }

    updateUI();
}

function useHint() {
    if (hints <= 0) return;

    for (const [color, pos] of Object.entries(solution)) {
        if (playerGrid[pos.row][pos.col] !== 'pony') {
            const cell = getCell(pos.row, pos.col);
            cell.classList.add('hint');
            setTimeout(() => cell.classList.remove('hint'), 2000);
            hints--;
            document.getElementById('hintCount').textContent = hints;
            return;
        }
    }
}

function updateUI() {
    document.getElementById('winStreak').textContent = winStreak;
    document.getElementById('hintCount').textContent = hints;
    document.getElementById('toPlace').textContent = NUM_COLORS - placedCount;
    document.getElementById('progress').style.width = `${(placedCount / NUM_COLORS) * 100}%`;
    updateLives();
}

function openSettings() {
    document.getElementById('settingsModal').classList.add('show');
}

function closeSettings() {
    document.getElementById('settingsModal').classList.remove('show');
}

function resetProgress() {
    currentLevel = 1;
    bestStreak = 0;
    stars = 0;
    affection = 0;
    completedLevels.clear();
    saveProgress();
    closeSettings();
    renderLevelGrid();
    updateResourceDisplay();
}

function createConfetti() {
    const container = document.createElement('div');
    container.className = 'confetti';
    document.body.appendChild(container);

    const colors = ['#ff8a95', '#74c0fc', '#69db7c', '#ffd43b', '#ffa94d', '#b197fc'];

    for (let i = 0; i < 50; i++) {
        const piece = document.createElement('div');
        piece.className = 'confetti-piece';
        piece.style.left = Math.random() * 100 + '%';
        piece.style.background = colors[Math.floor(Math.random() * colors.length)];
        piece.style.animationDelay = Math.random() * 0.5 + 's';
        piece.style.animationDuration = (2 + Math.random() * 2) + 's';
        container.appendChild(piece);
    }

    setTimeout(() => container.remove(), 5000);
}

init();
