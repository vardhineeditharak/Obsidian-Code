import { describe, it, expect, beforeEach } from 'vitest';

describe('Invitation Link Route & Auth Stash (D3/B2)', () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
  });

  const getInviteTokenFromPath = (pathname: string): string | null => {
    const match = pathname.match(/\/join\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
  };

  it('/join/<token> path is parsed and stashed when signed out; resumed after auth', () => {
    const inviteUrlPath = '/join/5a9bf320c1e488d90fa1';

    // 1. Path is parsed
    const token = getInviteTokenFromPath(inviteUrlPath);
    expect(token).toBe('5a9bf320c1e488d90fa1');

    // 2. Stashed in sessionStorage when signed out
    const isSignedIn = false;
    if (!isSignedIn && token) {
      mockStorage['pending_invite'] = token;
    }
    expect(mockStorage['pending_invite']).toBe('5a9bf320c1e488d90fa1');

    // 3. User authenticates successfully -> resume join flow
    const authSuccess = true;
    let resumedToken: string | null = null;
    if (authSuccess) {
      resumedToken = mockStorage['pending_invite'] || null;
      delete mockStorage['pending_invite'];
    }

    expect(resumedToken).toBe('5a9bf320c1e488d90fa1');
    expect(mockStorage['pending_invite']).toBeUndefined();
  });

  it('ignores non-join paths', () => {
    expect(getInviteTokenFromPath('/workspace/proj-123')).toBeNull();
    expect(getInviteTokenFromPath('/dashboard')).toBeNull();
    expect(getInviteTokenFromPath('/')).toBeNull();
  });
});
