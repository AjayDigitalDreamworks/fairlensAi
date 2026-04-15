import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env.js';
import { User } from '../models/User.js';

const TOKEN_VERSION = 1;
const PASSWORD_ITERATIONS = 210000;
const PASSWORD_KEY_LENGTH = 64;
const PASSWORD_DIGEST = 'sha512';

export async function signup({ name, email, password }) {
  const normalized = validateAuthInput({ name, email, password, requireName: true });
  const existing = await User.findOne({ email: normalized.email }).lean();
  if (existing) {
    const error = new Error('An account with this email already exists.');
    error.status = 409;
    throw error;
  }

  const passwordRecord = hashPassword(normalized.password);
  let user;
  try {
    user = await User.create({
      id: uuidv4(),
      name: normalized.name,
      email: normalized.email,
      passwordHash: passwordRecord.hash,
      passwordSalt: passwordRecord.salt,
      passwordIterations: passwordRecord.iterations,
    });
  } catch (error) {
    if (error?.code === 11000) {
      const conflict = new Error('An account with this email already exists.');
      conflict.status = 409;
      throw conflict;
    }
    throw error;
  }

  return buildAuthResponse(user);
}

export async function login({ email, password }) {
  const normalized = validateAuthInput({ email, password });
  const user = await User.findOne({ email: normalized.email });
  if (!user || !verifyPassword(normalized.password, user)) {
    const error = new Error('Invalid email or password.');
    error.status = 401;
    throw error;
  }

  return buildAuthResponse(user);
}

export async function getUserFromToken(token) {
  const payload = verifyToken(token);
  let user;
  try {
    user = await User.findOne({ id: payload.sub }).lean();
  } catch (error) {
    error.status = 503;
    throw error;
  }
  if (!user) {
    const error = new Error('User session no longer exists.');
    error.status = 401;
    throw error;
  }
  return sanitizeUser(user);
}

export async function authenticateRequest(req, res, next) {
  const token = getTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  try {
    req.user = await getUserFromToken(token);
    req.auth = { sub: req.user.id, email: req.user.email, name: req.user.name };
    next();
  } catch (error) {
    res.status(error.status || 401).json({ message: error.message || 'Invalid session.' });
  }
}

export function getTokenFromRequest(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice('Bearer '.length).trim();
  if (req.method === 'GET' && typeof req.query?.token === 'string') return req.query.token;
  return '';
}

function buildAuthResponse(user) {
  const safeUser = sanitizeUser(user);
  return {
    user: safeUser,
    token: signToken({
      sub: safeUser.id,
      email: safeUser.email,
      name: safeUser.name,
    }),
  };
}

function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
  };
}

function validateAuthInput({ name = '', email = '', password = '', requireName = false }) {
  const normalized = {
    name: String(name || '').trim(),
    email: String(email || '').trim().toLowerCase(),
    password: String(password || ''),
  };

  if (requireName && normalized.name.length < 2) {
    const error = new Error('Name must be at least 2 characters.');
    error.status = 400;
    throw error;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email)) {
    const error = new Error('Enter a valid email address.');
    error.status = 400;
    throw error;
  }

  if (normalized.password.length < 8) {
    const error = new Error('Password must be at least 8 characters.');
    error.status = 400;
    throw error;
  }

  return normalized;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto
    .pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, PASSWORD_KEY_LENGTH, PASSWORD_DIGEST)
    .toString('hex');
  return { salt, hash, iterations: PASSWORD_ITERATIONS };
}

function verifyPassword(password, user) {
  const inputHash = crypto
    .pbkdf2Sync(password, user.passwordSalt, user.passwordIterations, PASSWORD_KEY_LENGTH, PASSWORD_DIGEST)
    .toString('hex');
  const stored = Buffer.from(user.passwordHash, 'hex');
  const incoming = Buffer.from(inputHash, 'hex');
  return stored.length === incoming.length && crypto.timingSafeEqual(stored, incoming);
}

function signToken(payload) {
  const now = Math.floor(Date.now() / 1000);
  const body = {
    ...payload,
    ver: TOKEN_VERSION,
    iat: now,
    exp: now + env.authTokenTtlHours * 60 * 60,
  };
  const encodedHeader = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const encodedPayload = base64url(JSON.stringify(body));
  const signature = createSignature(`${encodedHeader}.${encodedPayload}`);
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function verifyToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) {
    const error = new Error('Invalid session token.');
    error.status = 401;
    throw error;
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const expected = createSignature(`${encodedHeader}.${encodedPayload}`);
  if (!safeEqual(signature, expected)) {
    const error = new Error('Invalid session token.');
    error.status = 401;
    throw error;
  }

  let header;
  let payload;
  try {
    header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    const error = new Error('Invalid session token.');
    error.status = 401;
    throw error;
  }

  if (header.alg !== 'HS256' || header.typ !== 'JWT') {
    const error = new Error('Invalid session token.');
    error.status = 401;
    throw error;
  }

  if (!payload.sub || payload.ver !== TOKEN_VERSION || typeof payload.exp !== 'number' || payload.exp <= Math.floor(Date.now() / 1000)) {
    const error = new Error('Session expired. Please log in again.');
    error.status = 401;
    throw error;
  }

  return payload;
}

function createSignature(value) {
  return crypto.createHmac('sha256', env.authTokenSecret).update(value).digest('base64url');
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}
