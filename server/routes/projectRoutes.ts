import { Router, Response } from 'express';
import { z } from 'zod';
import { dbStore } from '../dbStore';
import { authenticateJWT, requireProjectRole, AuthRequest, param } from '../middleware/auth';
import { YjsWebSocketServer } from '../websocket/yjsServer';

const router = Router();

const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  template: z.enum(['blank', 'web', 'node', 'algorithms']).default('blank'),
});

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

  // Seed template files based on selection
  if (template === 'web') {
    await dbStore.createFile({
      projectId: project._id.toString(),
      name: 'index.html',
      path: 'index.html',
      isFolder: false,
      language: 'html',
      content: `<!DOCTYPE html>
<html>
  <head>
    <title>${name}</title>
    <link rel="stylesheet" href="style.css">
  </head>
  <body>
    <h1>Welcome to ${name}</h1>
    <p id="counter">Click count: 0</p>
    <button onclick="increment()">Click Me</button>
    <script src="app.js"></script>
  </body>
</html>`,
    });

    await dbStore.createFile({
      projectId: project._id.toString(),
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
      projectId: project._id.toString(),
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
  } else if (template === 'algorithms') {
    await dbStore.createFile({
      projectId: project._id.toString(),
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
  } else if (template === 'node') {
    await dbStore.createFile({
      projectId: project._id.toString(),
      name: 'index.js',
      path: 'index.js',
      isFolder: false,
      language: 'javascript',
      content: `// Node.js Application
console.log('Running on Node.js:', process.version);

function greet(user) {
  return \`Welcome to \${user}!\`;
}

console.log(greet('${name}'));
`,
    });

    await dbStore.createFile({
      projectId: project._id.toString(),
      name: 'package.json',
      path: 'package.json',
      isFolder: false,
      language: 'json',
      content: JSON.stringify(
        {
          name: name.toLowerCase().replace(/[^a-z0-9-_]/g, '-'),
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
  } else {
    // Blank template
    await dbStore.createFile({
      projectId: project._id.toString(),
      name: 'main.js',
      path: 'main.js',
      isFolder: false,
      language: 'javascript',
      content: `// Welcome to Obsidian Code
console.log('Hello from ' + '${name}' + '!');
`,
    });

    await dbStore.createFile({
      projectId: project._id.toString(),
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

  const projectObj = project && typeof (project as any).toObject === 'function'
    ? (project as any).toObject()
    : project && (project as any)._doc
      ? { ...(project as any)._doc }
      : project;

  return res.status(201).json(projectObj);
});

// Get project details + user's role + members
router.get('/:projectId', authenticateJWT, requireProjectRole(['owner', 'editor', 'viewer']), async (req: AuthRequest, res: Response) => {
  const project = await dbStore.findProjectById(param(req.params.projectId));
  if (!project) {
    return res.status(404).json({ message: 'Project not found' });
  }

  const members = await dbStore.getProjectMembers(param(req.params.projectId));

  const rawProject = typeof (project as any).toObject === 'function'
    ? (project as any).toObject()
    : (project as any)._doc
      ? { ...(project as any)._doc }
      : project;

  return res.json({
    project: {
      ...rawProject,
      members,
    },
    userRole: req.projectRole,
  });
});

// Update project (Owner only)
router.patch('/:projectId', authenticateJWT, requireProjectRole(['owner']), async (req: AuthRequest, res: Response) => {
  const updateData: any = {};
  if (req.body.name !== undefined) updateData.name = req.body.name;
  if (req.body.description !== undefined) updateData.description = req.body.description;
  if (req.body.isPublic !== undefined) updateData.isPublic = req.body.isPublic;

  const updated = await dbStore.updateProject(param(req.params.projectId), updateData);
  const updatedObj = updated && typeof (updated as any).toObject === 'function'
    ? (updated as any).toObject()
    : updated && (updated as any)._doc
      ? { ...(updated as any)._doc }
      : updated;
  return res.json(updatedObj);
});

// Delete project (Owner only)
router.delete('/:projectId', authenticateJWT, requireProjectRole(['owner']), async (req: AuthRequest, res: Response) => {
  await dbStore.deleteProject(param(req.params.projectId));
  return res.json({ message: 'Project deleted successfully' });
});

// Update member role (Owner only)
router.patch('/:projectId/members/:userId', authenticateJWT, requireProjectRole(['owner']), async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    role: z.enum(['owner', 'editor', 'viewer']),
  });

  const parsed = schema.safeParse(req.body);
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

  // Guard: cannot demote the last remaining owner
  if (targetMember.role === 'owner' && role !== 'owner') {
    const ownerCount = members.filter((m) => m.role === 'owner').length;
    if (ownerCount <= 1) {
      return res.status(400).json({ message: 'Cannot demote the last remaining owner' });
    }
  }

  const updated = await dbStore.updateMemberRole(projectId, targetUserId, role);

  YjsWebSocketServer.getInstance()?.updateClientRole(projectId, targetUserId, role);
  YjsWebSocketServer.getInstance()?.broadcastProjectEvent(projectId, {
    type: 'role:updated',
    userId: targetUserId,
    role,
  });

  return res.json({ message: 'Member role updated successfully', member: updated });
});

// Remove member (Owner or Self)
router.delete('/:projectId/members/:userId', authenticateJWT, requireProjectRole(['owner', 'editor', 'viewer']), async (req: AuthRequest, res: Response) => {
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

  // Guard: cannot remove the last remaining owner
  if (targetMember.role === 'owner') {
    const ownerCount = members.filter((m) => m.role === 'owner').length;
    if (ownerCount <= 1) {
      return res.status(400).json({ message: 'Cannot remove the last remaining owner' });
    }
  }

  await dbStore.removeMember(projectId, targetUserId);

  YjsWebSocketServer.getInstance()?.broadcastProjectEvent(projectId, {
    type: 'member:removed',
    userId: targetUserId,
  });

  return res.json({ message: 'Member removed successfully' });
});

export const projectRoutes = router;
