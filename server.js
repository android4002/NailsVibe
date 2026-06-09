const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3005;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || (process.env.NODE_ENV === 'production' ? (() => {
    throw new Error('ADMIN_PASSWORD must be defined in production env');
})() : 'nailsvibe2026');
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

// Настройка CORS с ограничением доверенных доменов (строгое соответствие)
const allowedOrigins = [
    'https://android4002.github.io',
    'http://localhost:3005',
    'http://127.0.0.1:3005'
];
if (process.env.ALLOWED_CORS_ORIGINS) {
    const envOrigins = process.env.ALLOWED_CORS_ORIGINS.split(',').map(o => o.trim());
    allowedOrigins.push(...envOrigins);
}

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Лимитер запросов на авторизацию (защита от Brute Force)
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 5, // максимум 5 попыток с одного IP
    message: { error: 'Слишком много попыток входа, пожалуйста, попробуйте позже через 15 минут.' },
    standardHeaders: true,
    legacyHeaders: false
});

// Перехват запроса к site_data.json для автоматического фонового импорта
app.get('/data/site_data.json', (req, res, next) => {
    autoImportDikidiReviews().catch(err => console.error('[Auto-Import] Ошибка в фоне:', err));
    next();
});

// Ограничение раздачи статики: разрешаем только конкретные папки и файлы (защита от Root Exposure & Path Traversal)
app.use('/src', express.static(path.join(__dirname, 'src')));
app.use('/public', express.static(path.join(__dirname, 'public')));

// Явный роутинг для разрешенных статических HTML-страниц с валидацией путей
const ALLOWED_HTML_FILES = [
    'index.html',
    'portfolio.html',
    'faq.html',
    'tips.html',
    'privacy-policy.html',
    'personal-data-agreement.html',
    'admin.html'
];

ALLOWED_HTML_FILES.forEach(file => {
    app.get(`/${file}`, (req, res) => {
        const safePath = path.resolve(__dirname, file);
        if (!safePath.startsWith(__dirname)) {
            return res.status(403).json({ error: 'Доступ запрещен' });
        }
        res.sendFile(safePath);
    });
});

app.get('/data/site_data.json', (req, res) => {
    const safePath = path.resolve(__dirname, 'data', 'site_data.json');
    if (!safePath.startsWith(__dirname)) {
        return res.status(403).json({ error: 'Доступ запрещен' });
    }
    res.sendFile(safePath);
});

// Редирект с корня на index.html
app.get('/', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'index.html'));
});

// Валидация сложности пароля (минимум 8 символов, хотя бы одна буква и одна цифра)
function validatePasswordStrength(password) {
    if (!password || password.length < 8) return false;
    return /[a-zA-Zа-яА-Я]/.test(password) && /\d/.test(password);
}

// Хэширование пароля через bcryptjs (10 раундов соли)
function hashPassword(password) {
    return bcrypt.hashSync(password, 10);
}

// Проверка пароля
function verifyPassword(password, hash) {
    return bcrypt.compareSync(password, hash);
}

// Асинхронное чтение JSON-файлов
async function readJsonFile(filePath, defaultValue = {}) {
    try {
        const content = await fs.promises.readFile(filePath, 'utf8');
        return JSON.parse(content);
    } catch (e) {
        return defaultValue;
    }
}

// Асинхронное сохранение JSON-файлов
async function writeJsonFile(filePath, data) {
    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// Вспомогательные функции для работы с JWT без внешних зависимостей
function base64UrlEncode(str) {
    return Buffer.from(str)
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

function base64UrlDecode(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) {
        str += '=';
    }
    return Buffer.from(str, 'base64').toString('utf8');
}

function signJwt(payload) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const signatureInput = `${encodedHeader}.${encodedPayload}`;
    const signature = crypto
        .createHmac('sha256', SESSION_SECRET)
        .update(signatureInput)
        .digest('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
    return `${signatureInput}.${signature}`;
}

function verifyJwt(token) {
    try {
        if (typeof token !== 'string') return null;
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        
        const [encodedHeader, encodedPayload, signature] = parts;
        if (!encodedHeader || !encodedPayload || !signature) return null;
        
        const signatureInput = `${encodedHeader}.${encodedPayload}`;
        const expectedSignature = crypto
            .createHmac('sha256', SESSION_SECRET)
            .update(signatureInput)
            .digest('base64')
            .replace(/=/g, '')
            .replace(/\+/g, '-')
            .replace(/\//g, '_');
            
        if (signature !== expectedSignature) return null;
        
        const decodedPayload = base64UrlDecode(encodedPayload);
        if (!decodedPayload) return null;
        
        const payload = JSON.parse(decodedPayload);
        if (!payload || typeof payload !== 'object') return null;
        
        if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
            return null; // Токен истек
        }
        return payload;
    } catch (e) {
        return null;
    }
}

// Парсер кук из заголовка запроса
function parseCookies(req) {
    const list = {};
    const rc = req.headers.cookie;
    if (rc) {
        rc.split(';').forEach(cookie => {
            const parts = cookie.split('=');
            list[parts.shift().trim()] = decodeURI(parts.join('=')).trim();
        });
    }
    return list;
}

// Инициализация файла пользователей users.json
const USERS_PATH = path.join(__dirname, 'data', 'users.json');

function getDefaultUsersData() {
    return {
        roles: {
            admin: [
                "manage_users", "system_settings", "backup_restore", "manage_layout",
                "edit_content", "delete_content",
                "section_hero", "section_about", "section_benefits", "section_beforeafter",
                "section_portfolio", "section_services", "section_cabinet", "section_contacts", "section_footer", "section_reviews"
            ],
            editor: [
                "manage_layout", "edit_content", "delete_content",
                "section_hero", "section_about", "section_benefits", "section_beforeafter",
                "section_portfolio", "section_services", "section_cabinet", "section_contacts", "section_footer", "section_reviews"
            ]
        },
        users: [
            {
                username: 'admin',
                passwordHash: hashPassword(ADMIN_PASSWORD),
                role: 'admin'
            }
        ]
    };
}

function migrateUsersData(data) {
    let modified = false;
    
    // Автоматическая миграция старых SHA-256 хэшей на bcryptjs
    data.users = data.users.map(u => {
        if (u.passwordHash && u.passwordHash.length === 64 && !u.passwordHash.startsWith('$2')) {
            if (process.env.NODE_ENV !== 'production') {
                console.log(`[Security Migration] Перехешируем пароль пользователя ${u.username} с SHA-256 на bcryptjs.`);
            }
            u.passwordHash = hashPassword(u.username === 'admin' ? ADMIN_PASSWORD : 'nailsvibe2026');
            modified = true;
        }
        return u;
    });

    if (!data.roles) {
        data.roles = {};
        modified = true;
    }

    const fullAdminPerms = [
        "manage_users", "system_settings", "backup_restore", "manage_layout",
        "edit_content", "delete_content",
        "section_hero", "section_about", "section_benefits", "section_beforeafter",
        "section_portfolio", "section_services", "section_cabinet", "section_contacts", "section_footer", "section_reviews"
    ];
    const fullEditorPerms = [
        "manage_layout", "edit_content", "delete_content",
        "section_hero", "section_about", "section_benefits", "section_beforeafter",
        "section_portfolio", "section_services", "section_cabinet", "section_contacts", "section_footer", "section_reviews"
    ];

    if (!data.roles.admin || data.roles.admin.length < fullAdminPerms.length) {
        data.roles.admin = fullAdminPerms;
        modified = true;
    }
    if (!data.roles.editor || data.roles.editor.length < fullEditorPerms.length) {
        data.roles.editor = fullEditorPerms;
        modified = true;
    }

    return modified;
}

async function initializeUsersFile() {
    const dir = path.dirname(USERS_PATH);
    try {
        await fs.promises.mkdir(dir, { recursive: true });
        
        let fileExists = false;
        try {
            await fs.promises.access(USERS_PATH);
            fileExists = true;
        } catch (e) {
            // Файл не существует
        }

        if (!fileExists) {
            const defaultUsers = getDefaultUsersData();
            await writeJsonFile(USERS_PATH, defaultUsers);
            if (process.env.NODE_ENV !== 'production') {
                console.log('Инициализирован файл пользователей users.json с дефолтными ролями и пользователем admin.');
            }
        } else {
            const data = await readJsonFile(USERS_PATH);
            const modified = migrateUsersData(data);
            if (modified) {
                await writeJsonFile(USERS_PATH, data);
                if (process.env.NODE_ENV !== 'production') {
                    console.log('Выполнена автоматическая миграция структуры users.json.');
                }
            }
        }
    } catch (e) {
        if (process.env.NODE_ENV !== 'production') {
            console.error('Ошибка инициализации users.json:', e);
        }
    }
}
initializeUsersFile().catch(err => {
    if (process.env.NODE_ENV !== 'production') {
        console.error('Ошибка инициализации пользователей при запуске:', err);
    }
});

// Проверка авторизации, сессии и прав доступа (ролей и разрешений)
const requireAuth = (requiredPermission = null) => {
    return async (req, res, next) => {
        const cookies = parseCookies(req);
        let token = cookies['nails_session'];
        
        // Фолбек на заголовок Authorization для API-клиентов
        if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
            token = req.headers.authorization.split(' ')[1];
        }
        
        if (!token) {
            return res.status(401).json({ error: 'Требуется авторизация' });
        }
        
        const payload = verifyJwt(token);
        if (!payload) {
            res.clearCookie('nails_session');
            return res.status(401).json({ error: 'Недействительный или истекший токен сессии' });
        }
        
        // Проверяем пользователя в базе
        try {
            const usersData = await readJsonFile(USERS_PATH, { users: [], roles: {} });
            const user = usersData.users.find(u => u.username === payload.username);
            
            if (!user) {
                res.clearCookie('nails_session');
                return res.status(401).json({ error: 'Пользователь больше не существует' });
            }
            
            // Защита: разлогин при смене пароля. Сверяем хэш пароля.
            if (user.passwordHash !== payload.passwordHash) {
                res.clearCookie('nails_session');
                return res.status(401).json({ error: 'Сессия устарела из-за смены пароля. Войдите заново' });
            }
            // Защита: разлогин при изменении роли
            if (user.role !== payload.role) {
                res.clearCookie('nails_session');
                return res.status(401).json({ error: 'Ваша роль была изменена. Войдите заново' });
            }
            
            const userRole = user.role;
            const rolePermissions = usersData.roles[userRole] || [];
            
            // Роль 'admin' имеет все разрешения по умолчанию
            if (requiredPermission && userRole !== 'admin') {
                if (!rolePermissions.includes(requiredPermission)) {
                    return res.status(403).json({ error: 'Недостаточно прав для выполнения этого действия' });
                }
            }
            
            req.user = {
                username: user.username,
                role: userRole,
                permissions: rolePermissions
            };
            
            next();
        } catch (e) {
            console.error('Ошибка middleware авторизации:', e);
            res.status(500).json({ error: 'Внутренняя ошибка сервера' });
        }
    };
};

// Настройка multer для загрузки изображений портфолио (асинхронно)
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const dir = path.join(__dirname, 'public', 'images');
        try {
            await fs.promises.mkdir(dir, { recursive: true });
            cb(null, dir);
        } catch (err) {
            cb(err);
        }
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, 'upload-' + uniqueSuffix + ext);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 30 * 1024 * 1024 }, // 30 MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|webp|gif|mp4|mov|webm|avi/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype) || file.mimetype.startsWith('video/');
        if (extname && mimetype) {
            return cb(null, true);
        }
        cb(new Error('Разрешены только изображения и видео (jpeg, jpg, png, webp, gif, mp4, mov, webm)'));
    }
});

// Настройка multer для загрузки файлов резервных копий (асинхронно)
const uploadBackup = multer({
    storage: multer.diskStorage({
        destination: async (req, file, cb) => {
            const dir = path.join(__dirname, 'data');
            try {
                await fs.promises.mkdir(dir, { recursive: true });
                cb(null, dir);
            } catch (err) {
                cb(err);
            }
        },
        filename: (req, file, cb) => {
            cb(null, 'temp-restore.json');
        }
    }),
    limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB limit
    fileFilter: (req, file, cb) => {
        if (path.extname(file.originalname).toLowerCase() === '.json') {
            return cb(null, true);
        }
        cb(new Error('Разрешены только файлы резервных копий JSON (.json)'));
    }
});

// API: Вход в админ-панель
app.post('/api/login', loginLimiter, async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Имя пользователя и пароль не указаны' });
    }
    
    try {
        const usersData = await readJsonFile(USERS_PATH, { users: [], roles: {} });
        const user = usersData.users.find(u => u.username === username);
        
        if (user && verifyPassword(password, user.passwordHash)) {
            const payload = {
                username: user.username,
                role: user.role,
                passwordHash: user.passwordHash,
                exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60 // 7 дней в секундах
            };
            
            const token = signJwt(payload);
            
            // Устанавливаем куку (всегда secure в целях безопасности)
            res.cookie('nails_session', token, {
                httpOnly: true,
                secure: true,
                sameSite: 'strict',
                maxAge: 7 * 24 * 60 * 60 * 1000 // 7 дней
            });
            
            const permissions = usersData.roles[user.role] || [];
            return res.json({ 
                success: true, 
                token, 
                username: user.username, 
                role: user.role,
                permissions
            });
        }
    } catch (e) {
        console.error('Ошибка входа:', e);
    }
    
    res.status(401).json({ error: 'Неверное имя пользователя или пароль' });
});

// API: Проверка валидности токена
app.get('/api/verify-token', async (req, res) => {
    const cookies = parseCookies(req);
    let token = cookies['nails_session'];
    
    if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        token = req.headers.authorization.split(' ')[1];
    }
    
    if (!token) {
        return res.json({ valid: false });
    }
    
    const payload = verifyJwt(token);
    if (!payload) {
        return res.json({ valid: false });
    }
    
    try {
        const usersData = await readJsonFile(USERS_PATH, { users: [], roles: {} });
        const user = usersData.users.find(u => u.username === payload.username);
        
        if (user && user.passwordHash === payload.passwordHash) {
            const permissions = usersData.roles[user.role] || [];
            res.json({ 
                valid: true, 
                username: user.username, 
                role: user.role, 
                permissions 
            });
        } else {
            res.json({ valid: false });
        }
    } catch (e) {
        res.json({ valid: false });
    }
});

// API: Выход (удаление сессии)
app.post('/api/logout', (req, res) => {
    res.clearCookie('nails_session');
    res.json({ success: true });
});

// API: Изменение собственного пароля
app.post('/api/change-password', requireAuth(), async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Укажите текущий и новый пароли' });
    }
    
    // Валидация сложности пароля
    if (!validatePasswordStrength(newPassword)) {
        return res.status(400).json({ error: 'Новый пароль должен содержать не менее 8 символов, включая как минимум одну букву и одну цифру' });
    }
    
    try {
        const usersData = await readJsonFile(USERS_PATH, { users: [] });
        const userIndex = usersData.users.findIndex(u => u.username === req.user.username);
        
        if (userIndex === -1) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        const user = usersData.users[userIndex];
        if (!verifyPassword(currentPassword, user.passwordHash)) {
            return res.status(400).json({ error: 'Неверный текущий пароль' });
        }
        
        // Перезаписываем хэш
        user.passwordHash = hashPassword(newPassword);
        await writeJsonFile(USERS_PATH, usersData);
        
        // Так как хэш пароля изменился, при следующем запросе middleware requireAuth 
        // увидит несовпадение payload.passwordHash с базой и автоматически сбросит сессию!
        res.json({ success: true, message: 'Пароль успешно изменен' });
    } catch (e) {
        console.error('Ошибка смены пароля:', e);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// Валидация структуры данных сайта (site_data.json)
function validateSiteData(data) {
    if (!data || typeof data !== 'object') return false;
    const requiredKeys = ['blocksVisibility', 'blocksOrder', 'salonName', 'masterName'];
    for (const key of requiredKeys) {
        if (!(key in data)) return false;
    }
    if (!Array.isArray(data.blocksOrder)) return false;
    if (typeof data.blocksVisibility !== 'object') return false;
    return true;
}

// API: Сохранение site_data.json (доступно с правами edit_content)
app.post('/api/save-data', requireAuth('edit_content'), async (req, res) => {
    const dataPath = path.join(__dirname, 'data', 'site_data.json');
    const newData = req.body;
    
    if (!validateSiteData(newData)) {
        return res.status(400).json({ error: 'Некорректная структура данных сайта' });
    }
    
    try {
        // Проверка прав на изменение структуры (layout)
        let dataExists = false;
        try {
            await fs.promises.access(dataPath);
            dataExists = true;
        } catch (e) {}

        if (dataExists) {
            const currentData = await readJsonFile(dataPath);
            const orderChanged = JSON.stringify(currentData.blocksOrder) !== JSON.stringify(newData.blocksOrder);
            const visibilityChanged = JSON.stringify(currentData.blocksVisibility) !== JSON.stringify(newData.blocksVisibility);
            
            if ((orderChanged || visibilityChanged) && req.user.role !== 'admin' && !req.user.permissions.includes('manage_layout')) {
                return res.status(403).json({ error: 'Недостаточно прав для изменения макета/структуры разделов сайта' });
            }
        }
        
        await writeJsonFile(dataPath, newData);
        res.json({ success: true, message: 'Данные успешно сохранены' });
    } catch (error) {
        console.error('Ошибка записи site_data.json:', error);
        res.status(500).json({ error: 'Не удалось сохранить данные на сервере' });
    }
});

// API: Загрузка изображения портфолио (доступно с правами edit_content)
app.post('/api/upload-image', requireAuth('edit_content'), upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Файл не загружен' });
    }
    const relativePath = `/public/images/${req.file.filename}`;
    res.json({ 
        success: true, 
        message: 'Изображение успешно загружено', 
        path: relativePath 
    });
}, (err, req, res, next) => { // eslint-disable-line no-unused-vars
    res.status(400).json({ error: err.message });
});

// API: Скачивание резервной копии (доступно с правами backup_restore)
app.get('/api/backup', requireAuth('backup_restore'), async (req, res) => {
    const dataPath = path.join(__dirname, 'data', 'site_data.json');
    try {
        await fs.promises.access(dataPath);
        res.download(dataPath, 'site_data_backup.json');
    } catch (e) {
        return res.status(404).json({ error: 'Файл данных не найден' });
    }
});

// API: Восстановление резервной копии (доступно с правами backup_restore)
app.post('/api/restore', requireAuth('backup_restore'), uploadBackup.single('backupFile'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Файл бэкапа не предоставлен' });
    }
    
    try {
        const backupContent = await fs.promises.readFile(req.file.path, 'utf8');
        const parsedData = JSON.parse(backupContent);
        
        if (!validateSiteData(parsedData)) {
            throw new Error('Некорректная структура бэкапа NailsVibe (отсутствуют обязательные разделы)');
        }
        
        const dataPath = path.join(__dirname, 'data', 'site_data.json');
        await writeJsonFile(dataPath, parsedData);
        
        await fs.promises.unlink(req.file.path);
        res.json({ success: true, message: 'Данные успешно восстановлены' });
    } catch (error) {
        let fileExists = false;
        try {
            await fs.promises.access(req.file.path);
            fileExists = true;
        } catch (e) {}
        if (req.file && fileExists) {
            await fs.promises.unlink(req.file.path);
        }
        console.error('Ошибка восстановления бэкапа:', error);
        res.status(400).json({ error: `Недействительный файл бэкапа: ${error.message}` });
    }
});

// API: Получить список пользователей (только для manage_users)
app.get('/api/users', requireAuth('manage_users'), async (req, res) => {
    try {
        const usersData = await readJsonFile(USERS_PATH, { users: [] });
        const sanitizedUsers = usersData.users.map(u => ({ username: u.username, role: u.role }));
        res.json(sanitizedUsers);
    } catch (e) {
        res.status(500).json({ error: 'Не удалось получить список пользователей' });
    }
});

// API: Добавить пользователя (только для manage_users)
app.post('/api/users', requireAuth('manage_users'), async (req, res) => {
    const { username, password, role } = req.body;
    if (!username || !password || !role) {
        return res.status(400).json({ error: 'Укажите имя пользователя, пароль и роль' });
    }
    
    // Валидация сложности пароля
    if (!validatePasswordStrength(password)) {
        return res.status(400).json({ error: 'Пароль должен содержать не менее 8 символов, включая как минимум одну букву и одну цифру' });
    }
    
    try {
        const usersData = await readJsonFile(USERS_PATH, { users: [], roles: {} });
        
        // Проверяем валидность роли (роль должна быть в списке ролей)
        if (role !== 'admin' && (!usersData.roles || !usersData.roles[role])) {
            return res.status(400).json({ error: 'Выбранная роль не существует' });
        }
        
        if (usersData.users.some(u => u.username === username)) {
            return res.status(400).json({ error: 'Пользователь с таким именем уже существует' });
        }
        
        usersData.users.push({
            username,
            passwordHash: hashPassword(password),
            role
        });
        
        await writeJsonFile(USERS_PATH, usersData);
        res.json({ success: true, message: 'Пользователь успешно добавлен' });
    } catch (e) {
        console.error('Ошибка добавления пользователя:', e);
        res.status(500).json({ error: 'Не удалось добавить пользователя' });
    }
});

// API: Изменить роль пользователя (только для manage_users)
app.put('/api/users/:username', requireAuth('manage_users'), async (req, res) => {
    const usernameToUpdate = req.params.username;
    const { role } = req.body;
    
    if (usernameToUpdate === 'admin') {
        return res.status(400).json({ error: 'Нельзя изменять роль главного администратора admin' });
    }
    if (!role) {
        return res.status(400).json({ error: 'Укажите новую роль' });
    }
    
    try {
        const usersData = await readJsonFile(USERS_PATH, { users: [], roles: {} });
        const user = usersData.users.find(u => u.username === usernameToUpdate);
        
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        // Проверяем валидность роли
        if (role !== 'admin' && (!usersData.roles || !usersData.roles[role])) {
            return res.status(400).json({ error: 'Выбранная роль не существует' });
        }
        
        user.role = role;
        await writeJsonFile(USERS_PATH, usersData);
        res.json({ success: true, message: 'Роль пользователя успешно обновлена' });
    } catch (e) {
        console.error('Ошибка изменения роли пользователя:', e);
        res.status(500).json({ error: 'Не удалось обновить роль пользователя' });
    }
});

// API: Удалить пользователя (только для manage_users)
app.delete('/api/users/:username', requireAuth('manage_users'), async (req, res) => {
    const usernameToDelete = req.params.username;
    if (usernameToDelete === 'admin') {
        return res.status(400).json({ error: 'Нельзя удалить главного администратора admin' });
    }
    
    try {
        const usersData = await readJsonFile(USERS_PATH, { users: [] });
        const initialLength = usersData.users.length;
        usersData.users = usersData.users.filter(u => u.username !== usernameToDelete);
        
        if (usersData.users.length === initialLength) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        await writeJsonFile(USERS_PATH, usersData);
        res.json({ success: true, message: 'Пользователь успешно удален' });
    } catch (e) {
        console.error('Ошибка удаления пользователя:', e);
        res.status(500).json({ error: 'Не удалось удалить пользователя' });
    }
});

// API: Получить все роли (доступно manage_users)
app.get('/api/roles', requireAuth('manage_users'), async (req, res) => {
    try {
        const usersData = await readJsonFile(USERS_PATH, { roles: {} });
        res.json(usersData.roles || {});
    } catch (e) {
        res.status(500).json({ error: 'Не удалось получить роли' });
    }
});

// API: Создать или обновить кастомную роль (доступно manage_users)
app.post('/api/roles', requireAuth('manage_users'), async (req, res) => {
    const { name, permissions } = req.body;
    if (!name || !Array.isArray(permissions)) {
        return res.status(400).json({ error: 'Неверные параметры запроса' });
    }
    
    const cleanName = name.trim().toLowerCase();
    if (cleanName === 'admin') {
        return res.status(400).json({ error: 'Роль admin является системной' });
    }
    
    const validPermissions = [
        "manage_users", "system_settings", "backup_restore", "manage_layout",
        "edit_content", "delete_content",
        "section_hero", "section_about", "section_benefits", "section_beforeafter",
        "section_portfolio", "section_services", "section_cabinet", "section_contacts", "section_footer"
    ];
    if (permissions.some(p => !validPermissions.includes(p))) {
        return res.status(400).json({ error: 'Недопустимые разрешения' });
    }
    
    try {
        const usersData = await readJsonFile(USERS_PATH, { users: [], roles: {} });
        if (!usersData.roles) usersData.roles = {};
        
        usersData.roles[cleanName] = permissions;
        await writeJsonFile(USERS_PATH, usersData);
        res.json({ success: true, message: 'Роль успешно создана/обновлена' });
    } catch (e) {
        res.status(500).json({ error: 'Не удалось сохранить роль' });
    }
});

// API: Удалить роль (доступно manage_users)
app.delete('/api/roles/:roleName', requireAuth('manage_users'), async (req, res) => {
    const roleToDelete = req.params.roleName.trim().toLowerCase();
    if (roleToDelete === 'admin' || roleToDelete === 'editor') {
        return res.status(400).json({ error: 'Системные роли не могут быть удалены' });
    }
    
    try {
        const usersData = await readJsonFile(USERS_PATH, { users: [], roles: {} });
        if (!usersData.roles || !usersData.roles[roleToDelete]) {
            return res.status(404).json({ error: 'Роль не найдена' });
        }
        
        delete usersData.roles[roleToDelete];
        
        // Пользователей этой роли переводим на 'editor'
        usersData.users.forEach(u => {
            if (u.role === roleToDelete) {
                u.role = 'editor';
            }
        });
        
        await writeJsonFile(USERS_PATH, usersData);
        res.json({ success: true, message: 'Роль успешно удалена' });
    } catch (e) {
        res.status(500).json({ error: 'Не удалось удалить роль' });
    }
});

function decodeHtmlEntities(str) {
    return str
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'");
}

function normalizeAppDate(dateStr) {
    if (!dateStr) return new Date().toISOString().split('T')[0];
    const months = {
        jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
        jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
        янв: '01', фев: '02', мар: '03', апр: '04', май: '05', июн: '06',
        июл: '07', авг: '08', сен: '09', окт: '10', ноя: '11', дек: '12'
    };
    const clean = dateStr.toLowerCase().replace(/[^a-zа-я0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    const parts = clean.split(' ');
    if (parts.length >= 3) {
        const day = parts[0].padStart(2, '0');
        const monthName = parts[1].substring(0, 3);
        const year = parts[2];
        const month = months[monthName] || '05';
        return `${year}-${month}-${day}`;
    }
    return dateStr;
}

function parseDikidiAppReviews(html) {
    const reviewsList = [];
    const optionsMatch = html.match(/data-options\s*=\s*(['"])([\s\S]*?)\1/);
    if (!optionsMatch) return reviewsList;

    try {
        const decodedJson = decodeHtmlEntities(optionsMatch[2]);
        const dataOptions = JSON.parse(decodedJson);
        const viewHtml = dataOptions.step_data?.view || '';
        
        if (viewHtml) {
            const parts = viewHtml.split(/<div class="review\s+/);
            for (let i = 1; i < parts.length; i++) {
                const part = parts[i];
                
                const nameMatch = part.match(/<span class="username">([\s\S]*?)<\/span>/);
                const name = nameMatch ? nameMatch[1].trim() : 'Клиент DIKIDI';
                if (name === 'iVan' || name === 'Service' || name === 'Название') continue;

                const dateMatch = part.match(/<div class="date">([\s\S]*?)<\/div>/);
                const rawDateStr = dateMatch ? dateMatch[1].replace(/\s+/g, ' ').trim() : '';
                const date = normalizeAppDate(rawDateStr);

                const ratingMatch = part.match(/style="--stars:\s*(\d+)px;"/);
                let rating = 5;
                if (ratingMatch) {
                    rating = Math.round(parseInt(ratingMatch[1], 10) / 26);
                }

                const textBlockIndex = part.indexOf('<div class="text">');
                let text = '';
                if (textBlockIndex !== -1) {
                    const textSub = part.substring(textBlockIndex + '<div class="text">'.length);
                    const boundaryIndex = textSub.search(/<(?:div class="images"|div class="toolbar"|div class="images-gallery")/);
                    const textContent = boundaryIndex !== -1 ? textSub.substring(0, boundaryIndex) : textSub;
                    text = textContent.replace(/<[^>]*>/g, '').trim();
                }

                if (text) {
                    reviewsList.push({
                        id: 'imported_dkd_' + Math.random().toString(36).substr(2, 9),
                        name,
                        text,
                        rating,
                        date,
                        source: 'dikidi',
                        hidden: false
                    });
                }
            }
        }
    } catch (jsonErr) {
        console.error('[Auto-Import] Ошибка разбора JSON-настроек из DIKIDI App:', jsonErr);
    }
    return reviewsList;
}

function parseDikidiNetReviews(html) {
    const reviewsList = [];
    const reviewBlockRegex = /<div class="nr-review">([\s\S]*?)<\/div>\s*<\/div>/g;
    let blockMatch;
    
    while ((blockMatch = reviewBlockRegex.exec(html)) !== null) {
        const blockHtml = blockMatch[1];
        
        const nameMatch = blockHtml.match(/<span class="nr-name">([\s\S]*?)<\/span>/);
        const name = nameMatch ? nameMatch[1].trim() : 'Клиент DIKIDI';
        if (name === 'iVan' || name === 'Service' || name === 'Название') continue;

        const dateMatch = blockHtml.match(/<div class="nr-datetime">([\s\S]*?)<\/div>/);
        let dateStr = dateMatch ? dateMatch[1].trim() : '';
        let date = new Date().toISOString().split('T')[0];
        if (dateStr) {
            date = dateStr.replace(/ в.*$/, '');
        }

        const ratingMatch = blockHtml.match(/<div class="nr-rating-stars-value"\s+style="width:\s*(\d+)%;"/);
        let rating = 5;
        if (ratingMatch) {
            const widthPercent = parseInt(ratingMatch[1], 10);
            rating = Math.round(widthPercent / 20);
        }

        const textMatch = blockHtml.match(/<div class="nr-review-text">([\s\S]*?)<\/div>/);
        const text = textMatch ? textMatch[1].replace(/<[^>]*>/g, '').trim() : '';
        
        if (text) {
            reviewsList.push({
                id: 'imported_dkd_' + Math.random().toString(36).substr(2, 9),
                name,
                text,
                rating,
                date,
                source: 'dikidi',
                hidden: false
            });
        }
    }
    return reviewsList;
}

// Вспомогательная функция для скрейпинга и сохранения отзывов DIKIDI
async function fetchAndSaveDikidiReviews(dikidiId) {
    const SITE_DATA_PATH = path.join(__dirname, 'data', 'site_data.json');
    let siteData;
    try {
        siteData = await readJsonFile(SITE_DATA_PATH);
    } catch (e) {
        throw new Error('Не удалось прочитать site_data.json');
    }

    const appUrl = `https://dikidi.app/${dikidiId}?p=1.pi-pr`;
    const netUrl = `https://dikidi.net/${dikidiId}`;
    let reviewsList = [];

    try {
        console.log(`[Auto-Import] Попытка импорта отзывов DIKIDI (App-виджет) с URL: ${appUrl}`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        
        const response = await fetch(appUrl, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7'
            }
        });
        clearTimeout(timeoutId);

        if (response.ok) {
            const html = await response.text();
            reviewsList = parseDikidiAppReviews(html);
        }
    } catch (e) {
        console.warn('[Auto-Import] Не удалось загрузить отзывы через DIKIDI App-виджет, пробуем fallback на Net-каталог:', e.message);
    }

    if (reviewsList.length === 0) {
        try {
            console.log(`[Auto-Import] Запуск резервного импорта отзывов DIKIDI (Net-каталог) с URL: ${netUrl}`);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);
            
            const response = await fetch(netUrl, {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7'
                }
            });
            clearTimeout(timeoutId);

            if (response.ok) {
                const html = await response.text();
                reviewsList = parseDikidiNetReviews(html);
            }
        } catch (fallbackErr) {
            console.error('[Auto-Import] Ошибка резервного импорта DIKIDI:', fallbackErr);
        }
    }

    if (reviewsList.length === 0) {
        return { addedCount: 0 };
    }

    if (!siteData.reviews) siteData.reviews = [];
    let addedCount = 0;
    reviewsList.forEach(imported => {
        const exists = siteData.reviews.some(r => r.text.toLowerCase() === imported.text.toLowerCase());
        if (!exists) {
            siteData.reviews.unshift(imported);
            addedCount++;
        }
    });

    if (addedCount > 0) {
        await writeJsonFile(SITE_DATA_PATH, siteData);
        console.log(`[Auto-Import] Успешно импортировано новых отзывов: ${addedCount}`);
    } else {
        console.log(`[Auto-Import] Новых отзывов не найдено.`);
    }

    return { addedCount };
}

let lastDikidiImportTime = 0;
const IMPORT_INTERVAL_MS = 3 * 60 * 60 * 1000; // 3 часа

async function autoImportDikidiReviews() {
    const now = Date.now();
    if (now - lastDikidiImportTime < IMPORT_INTERVAL_MS) {
        return; // Еще не прошло 3 часа
    }
    
    // Обновляем время сразу, чтобы предотвратить параллельные запуски
    lastDikidiImportTime = now;
    
    try {
        const SITE_DATA_PATH = path.join(__dirname, 'data', 'site_data.json');
        const siteData = await readJsonFile(SITE_DATA_PATH);
        if (!siteData || !siteData.blocksOrder) {
            console.error('[Auto-Import] Не удалось прочитать site_data.json для автоимпорта');
            return;
        }
        
        const dikidiId = siteData.dikidiId || '1433946';
        console.log(`[Auto-Import] Запуск автоматического импорта отзывов DIKIDI для ID: ${dikidiId}`);
        const result = await fetchAndSaveDikidiReviews(dikidiId);
        console.log(`[Auto-Import] Автоматический импорт завершен. Добавлено отзывов: ${result.addedCount}`);
    } catch (err) {
        console.error('[Auto-Import] Ошибка при автоматическом импорте:', err.message);
    }
}

// API: Полуавтоматический импорт отзывов (доступно edit_content)
app.post('/api/import-reviews', requireAuth('edit_content'), async (req, res) => {
    const { source } = req.body;
    if (!source || (source !== 'dikidi' && source !== 'yandex')) {
        return res.status(400).json({ error: 'Неверный источник для импорта' });
    }

    if (source === 'dikidi') {
        const SITE_DATA_PATH = path.join(__dirname, 'data', 'site_data.json');
        const siteData = await readJsonFile(SITE_DATA_PATH);
        if (!siteData || !siteData.blocksOrder) {
            return res.status(500).json({ error: 'Не удалось прочитать site_data.json' });
        }
        const dikidiId = siteData.dikidiId || '1433946';

        try {
            const result = await fetchAndSaveDikidiReviews(dikidiId);
            return res.json({
                success: true,
                importedCount: result.addedCount,
                message: `Успешно импортировано новых отзывов из DIKIDI: ${result.addedCount}`
            });
        } catch (err) {
            return res.status(500).json({ error: err.message || 'Ошибка импорта' });
        }
    }

    if (source === 'yandex') {
        return res.json({
            success: false,
            message: 'Прямой импорт отзывов с Яндекс Карт заблокирован защитой от роботов (капчей). Для автоматического отображения отзывов с Яндекса используйте официальный виджет в настройках.'
        });
    }
});

// Перенаправление остальных GET-запросов на index.html
app.get('*', (req, res, next) => {
    if (req.path.includes('.') || req.path.startsWith('/api')) {
        return next();
    }
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Запуск сервера
if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, () => {
        console.log(`=======================================================`);
        console.log(`  NailsVibe Server запущен и доступен по адресу:`);
        console.log(`  http://localhost:${PORT}`);
        console.log(`=======================================================`);
        
        // Запуск автоимпорта отзывов DIKIDI при старте сервера с небольшой задержкой
        setTimeout(() => {
            autoImportDikidiReviews().catch(err => console.error('[Auto-Import] Ошибка автоимпорта при старте:', err));
        }, 2000);
    });
}

// Игнорируем SIGHUP для корректной работы в фоне при закрытии сессии терминала
process.on('SIGHUP', () => {
    console.log('[Server] Получен SIGHUP, игнорируем для продолжения работы в фоне.');
});

if (process.env.NODE_ENV === 'test') {
    module.exports = {
        hashPassword,
        verifyPassword,
        base64UrlEncode,
        base64UrlDecode,
        signJwt,
        verifyJwt,
        parseCookies,
        validatePasswordStrength,
        validateSiteData,
        decodeHtmlEntities,
        normalizeAppDate,
        parseDikidiAppReviews,
        parseDikidiNetReviews
    };
}
