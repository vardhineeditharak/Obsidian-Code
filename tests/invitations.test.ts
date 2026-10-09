import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { AddressInfo } from 'net';
import { dbStore } from '../server/dbStore';
import { config } from '../server/config';
import { invitationRoutes } from '../server/routes/invitationRoutes';

describe('Invitation Security & Lifecycle (S7 Fix)', () => {
  let server: http.Server;
  let baseUrl: string;

  const ownerId = 'invite-owner-1';
  const joinerId = 'invite-joiner-1';

  let ownerToken: string;
  let joinerToken: string;

  const createToken = (userId: string, email: string, name: string) =>
    jwt.sign({ userId, email, name }, config.JWT_SECRET, { expiresIn: '1h' });

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api', invitationRoutes);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const port = (server.address() as AddressInfo).port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    ownerToken = createToken(ownerId, 'owner@invite.com', 'Owner');
    joinerToken = createToken(joinerId, 'joiner@invite.com', 'Joiner');
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('second accept of the same token returns 410', async () => {
    const project = await dbStore.createProject('Single Use Invite Project', ownerId);
    const token = 'token-single-use-test-123';
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await dbStore.createInvitation(project._id.toString(), token, 'editor', ownerId, expiresAt);

    // First accept - should succeed
    const firstRes = await fetch(`${baseUrl}/api/invitations/${token}/accept`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${joinerToken}`,
      },
    });
    expect(firstRes.status).toBe(200);

    // Second accept of the same token - should return 410 Gone
    const secondRes = await fetch(`${baseUrl}/api/invitations/${token}/accept`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${joinerToken}`,
      },
    });
    expect(secondRes.status).toBe(410);
    const body = await secondRes.json();
    expect(body.message).toBe('Invitation has already been used');
  });

  it("accepting a viewer invite does not lower an existing owner's role", async () => {
    const project = await dbStore.createProject('Role Protection Project', ownerId);
    const initialRole = await dbStore.getMemberRole(project._id.toString(), ownerId);
    expect(initialRole).toBe('owner');

    const token = 'token-viewer-downgrade-test-456';
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await dbStore.createInvitation(project._id.toString(), token, 'viewer', ownerId, expiresAt);

    // Owner accepts the viewer invitation
    const acceptRes = await fetch(`${baseUrl}/api/invitations/${token}/accept`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
      },
    });
    expect(acceptRes.status).toBe(200);

    // Verify role is still 'owner'
    const finalRole = await dbStore.getMemberRole(project._id.toString(), ownerId);
    expect(finalRole).toBe('owner');

    // Also test dbStore.addMember directly to ensure no downgrade
    await dbStore.addMember(project._id.toString(), ownerId, 'viewer');
    const directRole = await dbStore.getMemberRole(project._id.toString(), ownerId);
    expect(directRole).toBe('owner');
  });
});
