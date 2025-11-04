// --- 1. DOM & JUEGO SETUP ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const restartButton = document.getElementById('restartButton');

// Elementos UI
const livesDisplayEl = document.getElementById('livesDisplay');
const controlsEl = document.getElementById('controls');
const bombButtonEl = document.getElementById('bombButton');
const infoHeaderEl = document.getElementById('info-header');
const bottomPanelEl = document.getElementById('bottom-panel');
const toastContainerEl = document.getElementById('toast-container');
const controlToggleContainerEl = document.getElementById('control-toggle-container');

const TILE_SIZE = 40;
let ROWS = 13;
let COLS = 17;
let LOGICAL_WIDTH = COLS * TILE_SIZE;
let LOGICAL_HEIGHT = ROWS * TILE_SIZE;

const MAP_KEY = { EMPTY: 0, SOLID: 1, DESTRUCTIBLE: 2, CLUE_HIDDEN: 3, CLUE_REVEALED: 4 };

const GAME_CONFIG = {
    playerSpeed: 4, playerLives: 3, playerSizeFactor: 0.8, playerSpriteScale: 1.5, playerInvincibilityTime: 120,
    bombTimer: 90, bombRange: 2,
    explosionTimer: 20,
    fakeClueMessageTimer: 100,
    blockDestructibleProbability: 0.1
};

let map = [], bombs = [], explosions = [], clues = [];
let fakeClueMessage = { timer: 0, color: null };
let gameWon = false, gameOver = false;
let lastTime = performance.now();

// --- 2. MANEJO DEL LAYOUT RESPONSIVE Y UI ---
function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toastContainerEl.appendChild(toast);
    setTimeout(() => {
        toast.remove();
    }, 3000); // Corresponde a la duración de la animación
}

function handleLayout() {
    const isPortrait = window.innerHeight > window.innerWidth;

    if (isPortrait) {
        if (!infoHeaderEl.contains(livesDisplayEl)) {
            infoHeaderEl.appendChild(livesDisplayEl);
        }
        if (controlToggleContainerEl && !infoHeaderEl.contains(controlToggleContainerEl)) {
            infoHeaderEl.appendChild(controlToggleContainerEl);
        }
        if (!bottomPanelEl.contains(controlsEl)) {
            bottomPanelEl.appendChild(controlsEl);
            bottomPanelEl.appendChild(bombButtonEl);
        }
    } else { // Landscape
        const leftPanel = document.getElementById('left-panel');
        if (!leftPanel.contains(livesDisplayEl)) {
            leftPanel.insertBefore(livesDisplayEl, controlsEl);
        }
        if (controlToggleContainerEl && !leftPanel.contains(controlToggleContainerEl)) {
            leftPanel.insertBefore(controlToggleContainerEl, controlsEl);
        }
    }
    resizeGame();
}

function resizeGame() {
    const isPortrait = window.innerHeight > window.innerWidth;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let availableWidth, availableHeight;

    if (isPortrait) {
        const headerHeight = document.querySelector('h1').offsetHeight + infoHeaderEl.offsetHeight;
        const footerHeight = bottomPanelEl.offsetHeight;
        availableWidth = vw * 0.95;
        availableHeight = vh - headerHeight - footerHeight - 40;
    } else { // Landscape
        const sidePanelWidth = document.getElementById('left-panel').offsetWidth + document.getElementById('right-panel').offsetWidth;
        const headerHeight = document.querySelector('h1')?.offsetHeight || 0;
        availableWidth = vw - sidePanelWidth - 40;
        availableHeight = vh - headerHeight - 20;
    }

    // Ajustar dinámicamente el número de filas/columnas
    let maxCols = Math.floor(availableWidth / TILE_SIZE);
    let maxRows = Math.floor(availableHeight / TILE_SIZE);

    // Asegurar dimensiones impares y un mínimo jugable
    COLS = Math.max(5, Math.min(17, Math.floor(maxCols / 2) * 2 + 1));
    ROWS = Math.max(5, Math.min(13, Math.floor(maxRows / 2) * 2 + 1));

    LOGICAL_WIDTH = COLS * TILE_SIZE;
    LOGICAL_HEIGHT = ROWS * TILE_SIZE;

    const scale = Math.min(availableWidth / LOGICAL_WIDTH, availableHeight / LOGICAL_HEIGHT);

    canvas.style.width = (LOGICAL_WIDTH * scale) + 'px';
    canvas.style.height = (LOGICAL_HEIGHT * scale) + 'px';
    canvas.width = LOGICAL_WIDTH;
    canvas.height = LOGICAL_HEIGHT;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// --- 3. ASSETS ---
const ASSET_PATHS = {
    blockDestructible: 'assets/Nube3.png', blockSolid: 'assets/Mamadera.png', background: 'assets/Cielo.png',
    player: 'assets/Bebe.png', bomb: 'assets/BombaCorazon.png', explosion: 'assets/Fuego.png', clue: 'assets/Panal.png'
};
const assets = { loaded: false };

function loadAssets() {
    return new Promise((resolve) => {
        const keys = Object.keys(ASSET_PATHS);
        let loadedCount = 0;
        if (keys.length === 0) { resolve(); return; }
        
        keys.forEach(key => {
            const img = new Image();
            img.onload = () => {
                loadedCount++;
                assets[key] = img;
                if (loadedCount === keys.length) {
                    assets.loaded = true;
                    resolve();
                }
            };
            img.onerror = () => {
                console.warn(`Failed to load asset: ${ASSET_PATHS[key]}`);
                loadedCount++;
                assets[key] = null;
                if (loadedCount === keys.length) resolve();
            };
            img.src = ASSET_PATHS[key];
        });
    });
}

// --- 4. JUGADOR ---
let player = {
    x: TILE_SIZE * 1.5, y: TILE_SIZE * 1.5,
    initialX: TILE_SIZE * 1.5, initialY: TILE_SIZE * 1.5,
    size: TILE_SIZE * GAME_CONFIG.playerSizeFactor,
    speed: GAME_CONFIG.playerSpeed,
    color: '#FFDAB9', lives: GAME_CONFIG.playerLives,
    invincible: false, invincibleTimer: 0
};

// --- 5. GENERACIÓN DEL MAPA ---
function generateMap() {
    clues = [];
    let destructibleBlocks = [];
    map = Array.from({ length: ROWS }, (_, r) =>
        Array.from({ length: COLS }, (_, c) => {
            if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1 || (r % 2 === 0 && c % 2 === 0)) {
                return MAP_KEY.SOLID;
            }
            if ((r === 1 && c === 1) || (r === 1 && c === 2) || (r === 2 && c === 1)) {
                return MAP_KEY.EMPTY;
            }
            if (Math.random() > GAME_CONFIG.blockDestructibleProbability) {
                destructibleBlocks.push({ r, c });
                return MAP_KEY.DESTRUCTIBLE;
            }
            return MAP_KEY.EMPTY;
        })
    );

    // Colocar pistas (máximo 10% de los bloques destructibles)
    const totalClues = Math.max(1, Math.floor(destructibleBlocks.length * 0.1));
    destructibleBlocks.sort(() => 0.5 - Math.random());

    // Pista real
    if (destructibleBlocks.length > 0) {
        const pos = destructibleBlocks.pop();
        map[pos.r][pos.c] = MAP_KEY.CLUE_HIDDEN;
        clues.push({ r: pos.r, c: pos.c, type: 'real', color: '#ADD8E6', revealed: false });
    }

    // Pistas falsas
    const fakeColors = ['#FFC0CB', '#FFB6C1', '#F08080', '#FA8072', '#72CAFA', '#08A8FF', '#056599'];
    for (let i = 0; i < totalClues - 1 && destructibleBlocks.length > 0; i++) {
        const pos = destructibleBlocks.pop();
        map[pos.r][pos.c] = MAP_KEY.CLUE_HIDDEN;
        clues.push({ r: pos.r, c: pos.c, type: 'fake', color: fakeColors[i % fakeColors.length], revealed: false });
    }
}

// --- 6. CONTROLES ---
let keys = {};
let joystickDirection = { x: 0, y: 0 };
let joystickActive = false;
let useButtons = false; // false = joystick, true = botones

function getJoystickCenter() {
    const joystickContainer = document.getElementById('joystick-container');
    if (!joystickContainer) return { x: 0, y: 0, maxDistance: 0 };
    
    const containerRect = joystickContainer.getBoundingClientRect();
    return {
        x: containerRect.left + containerRect.width / 2,
        y: containerRect.top + containerRect.height / 2,
        maxDistance: containerRect.width / 2 - 30
    };
}

function switchControls(useButtonsMode) {
    useButtons = useButtonsMode;
    const joystickContainer = document.getElementById('joystick-container');
    const buttonControls = document.getElementById('button-controls');
    
    if (useButtonsMode) {
        joystickContainer.classList.remove('control-active');
        joystickContainer.classList.add('control-hidden');
        buttonControls.classList.remove('control-hidden');
        buttonControls.classList.add('control-active');
        // Resetear joystick cuando se desactiva
        joystickActive = false;
        joystickDirection.x = 0;
        joystickDirection.y = 0;
        const joystickStick = document.getElementById('joystick-stick');
        if (joystickStick) joystickStick.style.transform = 'translate(0, 0)';
    } else {
        joystickContainer.classList.remove('control-hidden');
        joystickContainer.classList.add('control-active');
        buttonControls.classList.remove('control-active');
        buttonControls.classList.add('control-hidden');
    }
    
    // Guardar preferencia
    localStorage.setItem('babyBomberControlType', useButtonsMode ? 'buttons' : 'joystick');
}

function setupControls() {
    // Cargar preferencia guardada
    const savedControlType = localStorage.getItem('babyBomberControlType');
    const controlToggle = document.getElementById('control-toggle');
    if (controlToggle) {
        if (savedControlType === 'buttons') {
            controlToggle.checked = true;
            switchControls(true);
        } else {
            controlToggle.checked = false;
            switchControls(false);
        }
        
        // Listener para el toggle
        controlToggle.addEventListener('change', (e) => {
            switchControls(e.target.checked);
        });
    }
    
    // Controles de teclado
    document.addEventListener('keydown', e => {
        keys[e.code] = true;
        if (e.code === 'Space' && !gameWon && !gameOver) placeBomb();
    });
    document.addEventListener('keyup', e => { keys[e.code] = false; });

    // Joystick virtual
    const joystickContainer = document.getElementById('joystick-container');
    const joystickStick = document.getElementById('joystick-stick');
    
    if (joystickContainer && joystickStick) {
        function getJoystickPosition(e) {
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            return { x: clientX, y: clientY };
        }
        
        function updateJoystick(x, y) {
            const center = getJoystickCenter();
            const dx = x - center.x;
            const dy = y - center.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > center.maxDistance) {
                const angle = Math.atan2(dy, dx);
                const stickX = Math.cos(angle) * center.maxDistance;
                const stickY = Math.sin(angle) * center.maxDistance;
                joystickStick.style.transform = `translate(${stickX}px, ${stickY}px)`;
                
                // Normalizar dirección
                joystickDirection.x = Math.cos(angle);
                joystickDirection.y = Math.sin(angle);
            } else {
                joystickStick.style.transform = `translate(${dx}px, ${dy}px)`;
                
                // Normalizar dirección basada en distancia
                if (distance > 5) { // Dead zone
                    joystickDirection.x = dx / center.maxDistance;
                    joystickDirection.y = dy / center.maxDistance;
                } else {
                    joystickDirection.x = 0;
                    joystickDirection.y = 0;
                }
            }
        }
        
        function startJoystick(e) {
            if (useButtons) return;
            e.preventDefault();
            joystickActive = true;
            const pos = getJoystickPosition(e);
            updateJoystick(pos.x, pos.y);
        }
        
        function moveJoystick(e) {
            if (!joystickActive || useButtons) return;
            e.preventDefault();
            const pos = getJoystickPosition(e);
            updateJoystick(pos.x, pos.y);
        }
        
        function endJoystick(e) {
            if (useButtons) return;
            e.preventDefault();
            joystickActive = false;
            joystickDirection.x = 0;
            joystickDirection.y = 0;
            joystickStick.style.transform = 'translate(0, 0)';
        }
        
        // Event listeners para touch
        joystickContainer.addEventListener('touchstart', startJoystick, { passive: false });
        joystickContainer.addEventListener('touchmove', moveJoystick, { passive: false });
        joystickContainer.addEventListener('touchend', endJoystick, { passive: false });
        joystickContainer.addEventListener('touchcancel', endJoystick, { passive: false });
        
        // Event listeners para mouse
        joystickContainer.addEventListener('mousedown', startJoystick);
        document.addEventListener('mousemove', moveJoystick);
        document.addEventListener('mouseup', endJoystick);
    }
    
    // Botones digitales
    const keyMap = { 'btn-up': 'KeyW', 'btn-down': 'KeyS', 'btn-left': 'KeyA', 'btn-right': 'KeyD' };
    for (const btnId in keyMap) {
        const btn = document.getElementById(btnId);
        if (!btn) continue;
        const key = keyMap[btnId];
        ['touchstart', 'mousedown'].forEach(evt => btn.addEventListener(evt, e => { 
            if (!useButtons) return;
            e.preventDefault(); 
            keys[key] = true; 
        }, { passive: false }));
        ['touchend', 'mouseup', 'mouseleave'].forEach(evt => btn.addEventListener(evt, e => { 
            if (!useButtons) return;
            e.preventDefault(); 
            keys[key] = false; 
        }, { passive: false }));
    }
    
    // Botón de bomba
    ['touchstart', 'mousedown'].forEach(evt => bombButtonEl.addEventListener(evt, e => { e.preventDefault(); placeBomb(); }, { passive: false }));
    
    restartButton.addEventListener('click', restartGame);
    restartButton.addEventListener('touchstart', (e) => { e.preventDefault(); restartGame(); }, { passive: false });
}

// --- 7. LÓGICA DEL JUEGO (UPDATE) ---
function update() {
    if (gameWon || gameOver) return;

    const delta = (performance.now() - lastTime) / (1000 / 60);
    lastTime = performance.now();
    const normalizedDelta = Math.min(Math.max(delta, 0.1), 2.0);

    if (fakeClueMessage.timer > 0) {
        fakeClueMessage.timer -= normalizedDelta;
        return;
    }

    movePlayer(normalizedDelta);
    updateBombs(normalizedDelta);
    updateExplosions(normalizedDelta);
    updatePlayer(normalizedDelta);
    checkCluePickup();
}

function movePlayer(delta) {
    let dx = 0, dy = 0;
    
    // Prioridad al joystick si está activo y no estamos usando botones
    if (!useButtons && joystickActive && (Math.abs(joystickDirection.x) > 0.1 || Math.abs(joystickDirection.y) > 0.1)) {
        dx = joystickDirection.x * player.speed;
        dy = joystickDirection.y * player.speed;
    } else {
        // Controles de teclado (funciona con ambos sistemas)
        if (keys['KeyW'] || keys['ArrowUp']) dy = -player.speed;
        if (keys['KeyS'] || keys['ArrowDown']) dy = player.speed;
        if (keys['KeyA'] || keys['ArrowLeft']) dx = -player.speed;
        if (keys['KeyD'] || keys['ArrowRight']) dx = player.speed;
    }

    if (dx !== 0 && !isSolid(player.x + (dx * delta), player.y)) player.x += dx * delta;
    if (dy !== 0 && !isSolid(player.x, player.y + (dy * delta))) player.y += dy * delta;
}

function isSolid(x, y) {
    const radius = player.size / 2;
    const checkPoints = [
        [x - radius, y - radius], [x + radius, y - radius],
        [x - radius, y + radius], [x + radius, y + radius]
    ];
    const solidTypes = [MAP_KEY.SOLID, MAP_KEY.DESTRUCTIBLE, MAP_KEY.CLUE_HIDDEN];
    
    for (const [px, py] of checkPoints) {
        const c = Math.floor(px / TILE_SIZE);
        const r = Math.floor(py / TILE_SIZE);
        if (r < 0 || r >= ROWS || c < 0 || c >= COLS || solidTypes.includes(map[r][c])) {
            return true;
        }
    }
    return false;
}

function placeBomb() {
    const r = Math.floor(player.y / TILE_SIZE);
    const c = Math.floor(player.x / TILE_SIZE);
    if (!bombs.some(b => b.r === r && b.c === c)) {
        bombs.push({ r, c, timer: GAME_CONFIG.bombTimer, range: GAME_CONFIG.bombRange });
    }
}

function updateBombs(delta) {
    for (let i = bombs.length - 1; i >= 0; i--) {
        bombs[i].timer -= delta;
        if (bombs[i].timer <= 0) {
            explode(bombs[i]);
            bombs.splice(i, 1);
        }
    }
}

function explode(bomb) {
    const dirs = [[0, 0], [0, 1], [0, -1], [1, 0], [-1, 0]];
    for (const dir of dirs) {
        for (let i = 0; i <= bomb.range; i++) {
            const r = bomb.r + dir[0] * i;
            const c = bomb.c + dir[1] * i;
            if (r < 0 || r >= ROWS || c < 0 || c >= COLS) break;

            const tile = map[r][c];
            explosions.push({ r, c, timer: GAME_CONFIG.explosionTimer });

            if (tile === MAP_KEY.SOLID) break;
            if (tile === MAP_KEY.DESTRUCTIBLE || tile === MAP_KEY.CLUE_HIDDEN) {
                const clue = clues.find(clue => clue.r === r && clue.c === c);
                if (clue) {
                    clue.revealed = true;
                    map[r][c] = MAP_KEY.CLUE_REVEALED;
                    showToast("¡Encontraste algo!");
                } else {
                    map[r][c] = MAP_KEY.EMPTY;
                }
                break;
            }
        }
    }
}

function updateExplosions(delta) {
    for (let i = explosions.length - 1; i >= 0; i--) {
        const exp = explosions[i];
        exp.timer -= delta;
        const playerCol = Math.floor(player.x / TILE_SIZE);
        const playerRow = Math.floor(player.y / TILE_SIZE);
        if (exp.r === playerRow && exp.c === playerCol && !player.invincible) {
            playerHit();
        }
        if (exp.timer <= 0) explosions.splice(i, 1);
    }
}

function playerHit() {
    if (player.invincible) return;
    player.lives--;
    if (player.lives <= 0) {
        gameOver = true;
        showToast("GAME OVER");
        restartButton.classList.add('show');
    } else {
        player.x = player.initialX;
        player.y = player.initialY;
        player.invincible = true;
        player.invincibleTimer = GAME_CONFIG.playerInvincibilityTime;
    }
}

function updatePlayer(delta) {
    if (player.invincible) {
        player.invincibleTimer -= delta;
        if (player.invincibleTimer <= 0) {
            player.invincible = false;
        }
    }
}

function checkCluePickup() {
    const r = Math.floor(player.y / TILE_SIZE);
    const c = Math.floor(player.x / TILE_SIZE);
    if (map[r][c] !== MAP_KEY.CLUE_REVEALED) return;

    const index = clues.findIndex(clue => clue.revealed && clue.r === r && clue.c === c);
    if (index === -1) return;

    const pickedClue = clues[index];
    if (pickedClue.type === 'real') {
        gameWon = true;
    } else {
        fakeClueMessage = { timer: GAME_CONFIG.fakeClueMessageTimer, color: pickedClue.color };
        map[r][c] = MAP_KEY.EMPTY;
        clues.splice(index, 1);
    }
}

// --- 8. RENDERIZADO (DRAW) ---
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (gameWon) { drawWinScreen(); return; }
    if (fakeClueMessage.timer > 0) { drawFakeClueScreen(); return; }

    drawMap();
    drawBombs();
    drawExplosions();
    drawPlayer();
    drawUI();
}

function drawMap() {
    if (assets.background) {
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
            ctx.drawImage(assets.background, c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
    } else {
        ctx.fillStyle = '#4a5d23';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const x = c * TILE_SIZE, y = r * TILE_SIZE;
            const tile = map[r][c];
            let asset = null;
            if (tile === MAP_KEY.SOLID) asset = assets.blockSolid;
            else if (tile === MAP_KEY.DESTRUCTIBLE || tile === MAP_KEY.CLUE_HIDDEN) asset = assets.blockDestructible;
            else if (tile === MAP_KEY.CLUE_REVEALED) asset = assets.clue;
            
            if (asset) ctx.drawImage(asset, x, y, TILE_SIZE, TILE_SIZE);
        }
    }
}

function drawPlayer() {
    if (player.invincible && Math.floor(player.invincibleTimer / 10) % 2 === 0) return; // Blink
    if (assets.player) {
        const size = player.size * GAME_CONFIG.playerSpriteScale;
        ctx.drawImage(assets.player, player.x - size / 2, player.y - size / 2, size, size);
    }
}

function drawBombs() {
    for (const bomb of bombs) {
        const x = bomb.c * TILE_SIZE, y = bomb.r * TILE_SIZE;
        if (assets.bomb) {
            const scale = (bomb.timer % 20 < 10) ? 0.9 : 1.0;
            const size = TILE_SIZE * scale;
            ctx.drawImage(assets.bomb, x + (TILE_SIZE - size) / 2, y + (TILE_SIZE - size) / 2, size, size);
        }
    }
}

function drawExplosions() {
    ctx.globalAlpha = 0.8;
    for (const exp of explosions) {
        if (assets.explosion) {
            ctx.drawImage(assets.explosion, exp.c * TILE_SIZE, exp.r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
    }
    ctx.globalAlpha = 1.0;
}

function drawUI() {
    livesDisplayEl.textContent = `Vidas: ${player.lives}`;
}

function drawWinScreen() {
    ctx.fillStyle = '#ADD8E6';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'white';
    ctx.font = `bold ${Math.min(LOGICAL_WIDTH / 8, 60)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText("¡ES UN NIÑO!", canvas.width / 2, canvas.height / 2);
    showToast("🎉 ¡FELICIDADES! 🎉");
}

function drawFakeClueScreen() {
    ctx.fillStyle = fakeClueMessage.color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'white';
    ctx.font = `bold ${Math.min(LOGICAL_WIDTH / 15, 40)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText("Pista falsa, siga jugando", canvas.width / 2, canvas.height / 2);
}

// --- 9. BUCLE PRINCIPAL Y REINICIO ---
function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

function restartGame() {
    restartButton.classList.remove('show');
    lastTime = performance.now();
    player = { ...player, lives: GAME_CONFIG.playerLives, x: player.initialX, y: player.initialY, invincible: false };
    bombs = []; explosions = [];
    gameWon = false; gameOver = false;
    showToast("🎯 Objetivo: ¡Encuentra la pista escondida!");
    
    resizeGame();
    generateMap();
}

// --- 10. INICIO ---
async function initGame() {
    await loadAssets();
    setupControls();
    
    window.addEventListener('resize', handleLayout);
    window.addEventListener('orientationchange', () => setTimeout(handleLayout, 100));
    
    handleLayout();
    generateMap();
    lastTime = performance.now();
    showToast("🎯 Objetivo: ¡Encuentra la pista escondida!");
    gameLoop();
}

initGame();
