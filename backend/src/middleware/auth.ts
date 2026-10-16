import { NextFunction, Request, Response } from 'express';
import { AccessTokenPayload, verifyAccessToken } from '../utils/jwt';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }
  try {
    req.user = verifyAccessToken(header.slice('Bearer '.length));
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireRole(role: 'parent' | 'student') {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.role !== role) {
      return res.status(403).json({ error: `${role} role required` });
    }
    return next();
  };
}

// Verifies the requester belongs to the family group they're trying to read/write.
// Every family-scoped endpoint must call this — never trust client-supplied role checks alone.
export function requireSameFamilyGroup(paramName: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const targetFamilyGroupId = req.params[paramName];
    if (!req.user?.familyGroupId || req.user.familyGroupId !== targetFamilyGroupId) {
      return res.status(403).json({ error: 'Not a member of this family group' });
    }
    return next();
  };
}
