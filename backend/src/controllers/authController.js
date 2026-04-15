import { login, signup } from '../services/authService.js';

export async function signupUser(req, res, next) {
  try {
    const result = await signup(req.body);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function loginUser(req, res, next) {
  try {
    const result = await login(req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function currentUser(req, res, next) {
  try {
    res.json({ user: req.user });
  } catch (error) {
    next(error);
  }
}
