import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { dbStore } from '../dbStore';

export function param(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    email: string;
    name: string;
  };
  projectRole?: 'owner' | 'editor' | 'viewer';
}

export function authenticateJWT(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const cookieToken = req.cookies?.obsidian_token;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : cookieToken;

  if (!token) {
    return res.status(401).json({ message: 'Authentication required. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET) as { userId: string; email: string; name: string };
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
}

export function requireProjectRole(allowedRoles: ('owner' | 'editor' | 'viewer')[]) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const projectId = param(req.params.projectId) || (typeof req.body?.projectId === 'string' ? req.body.projectId : '');
    if (!projectId) {
      return res.status(400).json({ message: 'Missing projectId' });
    }

    const role = await dbStore.getMemberRole(projectId, req.user.userId);
    if (!role) {
      // Check if project is public and only viewer is requested
      const project = await dbStore.findProjectById(projectId);
      if (project && project.isPublic && allowedRoles.includes('viewer')) {
        req.projectRole = 'viewer';
        return next();
      }
      return res.status(403).json({ message: 'Access denied. You are not a member of this project.' });
    }

    if (!allowedRoles.includes(role)) {
      return res.status(403).json({
        message: `Permission denied. Role '${role}' is not permitted to perform this action.`,
      });
    }

    req.projectRole = role;
    next();
  };
}
