const test = require('node:test');
const assert = require('node:assert');

// Устанавливаем NODE_ENV в 'test' перед импортом
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test_secret_key_12345';

const {
    hashPassword,
    verifyPassword,
    base64UrlEncode,
    base64UrlDecode,
    signJwt,
    verifyJwt,
    parseCookies,
    validatePasswordStrength,
    validateSiteData
} = require('../server.js');

test('hashPassword and verifyPassword', () => {
    const password = 'StrongPassword123';
    const hash = hashPassword(password);
    
    assert.ok(hash.startsWith('$2'), 'Hash should be a bcrypt hash starting with $2');
    assert.ok(verifyPassword(password, hash), 'Should verify correct password');
    assert.ok(!verifyPassword('WrongPassword', hash), 'Should reject incorrect password');
});

test('base64UrlEncode and base64UrlDecode', () => {
    const original = 'Hello World! + / =';
    const encoded = base64UrlEncode(original);
    
    assert.ok(!encoded.includes('='), 'Base64Url should not contain =');
    assert.ok(!encoded.includes('+'), 'Base64Url should not contain +');
    assert.ok(!encoded.includes('/'), 'Base64Url should not contain /');
    
    const decoded = base64UrlDecode(encoded);
    assert.strictEqual(decoded, original, 'Decoded string should match original');
});

test('signJwt and verifyJwt success', () => {
    const payload = { username: 'testuser', role: 'admin', exp: Math.floor(Date.now() / 1000) + 60 };
    const token = signJwt(payload);
    
    assert.ok(typeof token === 'string', 'Token should be a string');
    assert.strictEqual(token.split('.').length, 3, 'Token should contain 3 parts');
    
    const verified = verifyJwt(token);
    assert.ok(verified, 'Should verify valid token');
    assert.strictEqual(verified.username, 'testuser');
    assert.strictEqual(verified.role, 'admin');
});

test('verifyJwt validation and error handling', () => {
    // 1. Невалидный формат токена (не 3 части)
    assert.strictEqual(verifyJwt('invalid_token'), null);
    
    // 2. Истекший токен
    const expiredPayload = { username: 'olduser', exp: Math.floor(Date.now() / 1000) - 10 };
    const expiredToken = signJwt(expiredPayload);
    assert.strictEqual(verifyJwt(expiredToken), null, 'Expired token should return null');
    
    // 3. Измененная подпись
    const validPayload = { username: 'testuser', exp: Math.floor(Date.now() / 1000) + 60 };
    const validToken = signJwt(validPayload);
    const parts = validToken.split('.');
    parts[2] = 'manipulated_signature';
    const modifiedToken = parts.join('.');
    assert.strictEqual(verifyJwt(modifiedToken), null, 'Modified signature should return null');
    
    // 4. Невалидный тип аргумента
    assert.strictEqual(verifyJwt(null), null);
    assert.strictEqual(verifyJwt(undefined), null);
    assert.strictEqual(verifyJwt({}), null);
});

test('parseCookies', () => {
    const req = {
        headers: {
            cookie: 'nails_session=token123; other_cookie=value456; space_cookie = value789'
        }
    };
    const cookies = parseCookies(req);
    assert.strictEqual(cookies['nails_session'], 'token123');
    assert.strictEqual(cookies['other_cookie'], 'value456');
    assert.strictEqual(cookies['space_cookie'], 'value789');
    
    const emptyReq = { headers: {} };
    const emptyCookies = parseCookies(emptyReq);
    assert.deepStrictEqual(emptyCookies, {});
});

test('validatePasswordStrength', () => {
    assert.ok(validatePasswordStrength('Password123'), 'Valid password with letters and digits');
    assert.ok(validatePasswordStrength('пароль123'), 'Valid password with Russian letters and digits');
    assert.ok(!validatePasswordStrength('12345678'), 'Only digits should be invalid');
    assert.ok(!validatePasswordStrength('abcdefgh'), 'Only letters should be invalid');
    assert.ok(!validatePasswordStrength('Short1'), 'Short password (less than 8 chars) should be invalid');
    assert.ok(!validatePasswordStrength(null), 'Null should be invalid');
});

test('validateSiteData', () => {
    const validData = {
        blocksVisibility: {},
        blocksOrder: [],
        salonName: 'Test Salon',
        masterName: 'Test Master'
    };
    assert.ok(validateSiteData(validData), 'Valid structure should pass');
    
    const missingKey = {
        blocksVisibility: {},
        blocksOrder: [],
        salonName: 'Test Salon'
    };
    assert.ok(!validateSiteData(missingKey), 'Missing masterName should fail');
    
    const invalidType = {
        blocksVisibility: {},
        blocksOrder: 'not_an_array',
        salonName: 'Test Salon',
        masterName: 'Test Master'
    };
    assert.ok(!validateSiteData(invalidType), 'Invalid blocksOrder type should fail');

    const invalidCollectionType = {
        blocksVisibility: {},
        blocksOrder: [],
        salonName: 'Test Salon',
        masterName: 'Test Master',
        categories: 'not_an_array'
    };
    assert.ok(!validateSiteData(invalidCollectionType), 'Invalid categories type should fail');

    const invalidObjectType = {
        blocksVisibility: {},
        blocksOrder: [],
        salonName: 'Test Salon',
        masterName: 'Test Master',
        contacts: 'not_an_object'
    };
    assert.ok(!validateSiteData(invalidObjectType), 'Invalid contacts type should fail');
    
    assert.ok(!validateSiteData(null), 'Null should fail');
});
