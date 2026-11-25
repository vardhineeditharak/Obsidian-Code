import { Router, Response } from 'express';
import { z } from 'zod';
import { dbStore } from '../dbStore';
import { authenticateJWT, requireProjectRole, AuthRequest, param } from '../middleware/auth';
import { emitProjectEvent } from '../websocket/projectEvents';

const router = Router();

const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(500).optional(),
  template: z.enum(['blank', 'web', 'node', 'algorithms']).default('blank'),
});

const updateProjectSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  isPublic: z.boolean().optional(),
});

const updateMemberRoleSchema = z.object({
  role: z.enum(['owner', 'editor', 'viewer']),
});

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function seedProjectTemplateFiles(
  projectId: string,
  name: string,
  template: 'blank' | 'web' | 'node' | 'algorithms'
): Promise<void> {
  const safeHtmlName = escapeHtml(name);
  const safeJsNameLiteral = JSON.stringify(name);

  if (template === 'web') {
    await dbStore.createFile({
      projectId,
      name: 'index.html',
      path: 'index.html',
      isFolder: false,
      language: 'html',
      content: `<!DOCTYPE html>
<html>
  <head>
    <title>${safeHtmlName}</title>
    <link rel="stylesheet" href="style.css">
  </head>
  <body>
    <h1>Welcome to ${safeHtmlName}</h1>
    <p id="counter">Click count: 0</p>
    <button onclick="increment()">Click Me</button>
    <script src="app.js"></script>
  </body>
</html>`,
    });

    await dbStore.createFile({
      projectId,
      name: 'style.css',
      path: 'style.css',
      isFolder: false,
      language: 'css',
      content: `body {
  font-family: sans-serif;
  background: #f7f7f4;
  color: #26251e;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  margin: 0;
}

button {
  background: #26251e;
  color: #f7f7f4;
  border: none;
  padding: 10px 20px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: opacity 0.15s ease;
}

button:hover {
  opacity: 0.9;
}`,
    });

    await dbStore.createFile({
      projectId,
      name: 'app.js',
      path: 'app.js',
      isFolder: false,
      language: 'javascript',
      content: `let count = 0;

function increment() {
  count += 1;
  const el = document.getElementById('counter');
  if (el) {
    el.innerText = 'Click count: ' + count;
  }
}
`,
    });
    return;
  }

  if (template === 'algorithms') {
    await dbStore.createFile({
      projectId,
      name: 'solution.js',
      path: 'solution.js',
      isFolder: false,
      language: 'javascript',
      content: `// Collaborative Algorithm Sandbox
function binarySearch(arr, target) {
  let left = 0;
  let right = arr.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (arr[mid] === target) return mid;
    if (arr[mid] < target) left = mid + 1;
    else right = mid - 1;
  }

  return -1;
}

const numbers = [1, 3, 5, 7, 9, 11, 13, 15, 17];
console.log('Search for 7:', binarySearch(numbers, 7));
console.log('Search for 12:', binarySearch(numbers, 12));
`,
    });
    return;
  }

  if (template === 'node') {
    await dbStore.createFile({
      projectId,
      name: 'index.js',
      path: 'index.js',
      isFolder: false,
      language: 'javascript',
      content: `// Node.js Application
console.log('Running on Node.js:', process.version);

function greet(user) {
  return \`Welcome to \${user}!\`;
}

console.log(greet(${safeJsNameLiteral}));
`,
    });

    await dbStore.createFile({
      projectId,
      name: 'package.json',
      path: 'package.json',
      isFolder: false,
      language: 'json',
      content: JSON.stringify(
        {
          name: name.toLowerCase().replace(/[^a-z0-9-_]/g, '-') || 'obsidian-project',
          version: '1.0.0',
          main: 'index.js',
          scripts: {
            start: 'node index.js',
          },
        },
        null,
        2
      ),
    });
    return;
  }

  // Blank template
  await dbStore.createFile({
    projectId,
    name: 'main.js',
    path: 'main.js',
    isFolder: false,
    language: 'javascript',
    content: `// Welcome to Obsidian Code
console.log('Hello from ' + ${safeJsNameLiteral} + '!');
`,
  });

  await dbStore.createFile({
    projectId,
    name: 'README.md',
    path: 'README.md',
    isFolder: false,
    language: 'markdown',
    content: `# ${name}

Your team's shared workspace for code.
Start editing files, collaborate in real time, and share your project.
`,
  });
}

// List projects for current user
router.get('/', authenticateJWT, async (req: AuthRequest, res: Response) => {
  const projects = await dbStore.findProjectsForUser(req.user!.userId);
  return res.json(projects);
});

// Create project with template files
router.post('/', authenticateJWT, async (req: AuthRequest, res: Response) => {
  const result = createProjectSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ message: 'Validation failed', errors: result.error.issues });
  }

  const { name, description, template } = result.data;
  const project = await dbStore.createProject(name, req.user!.userId, description);
  await seedProjectTemplateFiles(String(project._id), name, template);

  return res.status(201).json(project);
});

// Get project details + user's role + members
router.get(
  '/:projectId',
  authenticateJWT,
  requireProjectRole(['owner', 'editor', 'viewer']),
  async (req: AuthRequest, res: Response) => {
    const projectId = param(req.params.projectId);
    const project = await dbStore.findProjectById(projectId);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const members = await dbStore.getProjectMembers(projectId);
    return res.json({
      project: {
        ...project,
        members,
      },
      userRole: req.projectRole,
    });
  }
);

// Update project (Owner only)
router.patch(
  '/:projectId',
  authenticateJWT,
  requireProjectRole(['owner']),
  async (req: AuthRequest, res: Response) => {
    const parsed = updateProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Validation failed', errors: parsed.error.issues });
    }

    const projectId = param(req.params.projectId);
    const updated = await dbStore.updateProject(projectId, parsed.data);
    if (!updated) {
      return res.status(404).json({ message: 'Project not found' });
    }

    emitProjectEvent({
      type: 'project:updated',
      projectId,
      project: updated,
    });
    return res.json(updated);
  }
);

// Delete project (Owner only)
router.delete(
  '/:projectId',
  authenticateJWT,
  requireProjectRole(['owner']),
  async (req: AuthRequest, res: Response) => {
    await dbStore.deleteProject(param(req.params.projectId));
    return res.json({ message: 'Project deleted successfully' });
  }
);

// Update member role (Owner only)
router.patch(
  '/:projectId/members/:userId',
  authenticateJWT,
  requireProjectRole(['owner']),
  async (req: AuthRequest, res: Response) => {
    const parsed = updateMemberRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Validation failed', errors: parsed.error.issues });
    }

    const projectId = param(req.params.projectId);
    const targetUserId = param(req.params.userId);
    const { role } = parsed.data;

    const members = await dbStore.getProjectMembers(projectId);
    const targetMember = members.find((m) => String(m.userId) === targetUserId);
    if (!targetMember) {
      return res.status(404).json({ message: 'Member not found' });
    }

    if (targetMember.role === 'owner' && role !== 'owner') {
      const ownerCount = members.filter((m) => m.role === 'owner').length;
      if (ownerCount <= 1) {
        return res.status(400).json({ message: 'Cannot demote the last remaining owner' });
      }
    }

    const updated = await dbStore.updateMemberRole(projectId, targetUserId, role);
    emitProjectEvent({
      type: 'member:role-updated',
      projectId,
      userId: targetUserId,
      role,
    });
    return res.json({ message: 'Member role updated successfully', member: updated });
  }
);

// Remove member (Owner or Self)
router.delete(
  '/:projectId/members/:userId',
  authenticateJWT,
  requireProjectRole(['owner', 'editor', 'viewer']),
  async (req: AuthRequest, res: Response) => {
    const projectId = param(req.params.projectId);
    const targetUserId = param(req.params.userId);
    const isSelf = targetUserId === req.user!.userId;

    if (!isSelf && req.projectRole !== 'owner') {
      return res.status(403).json({ message: 'Only owners can remove other members' });
    }

    const members = await dbStore.getProjectMembers(projectId);
    const targetMember = members.find((m) => String(m.userId) === targetUserId);
    if (!targetMember) {
      return res.status(404).json({ message: 'Member not found' });
    }

    if (targetMember.role === 'owner') {
      const ownerCount = members.filter((m) => m.role === 'owner').length;
      if (ownerCount <= 1) {
        return res.status(400).json({ message: 'Cannot remove the last remaining owner' });
      }
    }

    await dbStore.removeMember(projectId, targetUserId);
    emitProjectEvent({
      type: 'member:removed',
      projectId,
      userId: targetUserId,
    });
    return res.json({ message: 'Member removed successfully' });
  }
);

export const projectRoutes = router;
