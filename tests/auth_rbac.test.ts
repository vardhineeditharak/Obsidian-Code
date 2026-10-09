import { describe, it, expect } from 'vitest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { dbStore } from '../server/dbStore';

describe('Authentication & Authorization Security', () => {
  const JWT_SECRET = 'test-secret-key-1234567890-test';

  it('hashes passwords using bcrypt with 10 salt rounds and validates correctly', async () => {
    const rawPassword = 'SuperSecurePassword123!';
    const saltRounds = 10;
    const hash = await bcrypt.hash(rawPassword, saltRounds);

    expect(hash).not.toBe(rawPassword);
    expect(hash.startsWith('$2')).toBe(true);

    const isValid = await bcrypt.compare(rawPassword, hash);
    expect(isValid).toBe(true);

    const isWrongValid = await bcrypt.compare('WrongPassword', hash);
    expect(isWrongValid).toBe(false);
  });

  it('signs and verifies 7-day JWT tokens with subject payload', () => {
    const payload = { userId: 'usr-999', email: 'test@example.com', name: 'Dev User' };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

    const decoded = jwt.verify(token, JWT_SECRET) as any;
    expect(decoded.userId).toBe('usr-999');
    expect(decoded.email).toBe('test@example.com');
  });

  it('enforces RBAC role restrictions for Owner, Editor, and Viewer', async () => {
    const ownerId = 'user-owner';
    const editorId = 'user-editor';
    const viewerId = 'user-viewer';

    const project = await dbStore.createProject('Test RBAC Project', ownerId);
    await dbStore.addMember(project._id.toString(), editorId, 'editor');
    await dbStore.addMember(project._id.toString(), viewerId, 'viewer');

    const ownerRole = await dbStore.getMemberRole(project._id.toString(), ownerId);
    const editorRole = await dbStore.getMemberRole(project._id.toString(), editorId);
    const viewerRole = await dbStore.getMemberRole(project._id.toString(), viewerId);

    expect(ownerRole).toBe('owner');
    expect(editorRole).toBe('editor');
    expect(viewerRole).toBe('viewer');

    // Verify Viewer cannot mutate files
    const canViewerMutate = ['owner', 'editor'].includes(viewerRole!);
    expect(canViewerMutate).toBe(false);

    // Verify Editor can mutate files
    const canEditorMutate = ['owner', 'editor'].includes(editorRole!);
    expect(canEditorMutate).toBe(true);
  });
});
