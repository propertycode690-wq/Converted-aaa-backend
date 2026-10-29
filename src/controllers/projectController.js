const prisma = require('../config/db');

/**
 * Generate human-readable Project Code e.g. "PRJ-2026-001"
 */
const generateProjectCode = async () => {
  const currentYear = new Date().getFullYear();
  const count = await prisma.project.count();
  const sequence = String(count + 1).padStart(3, '0');
  return `PRJ-${currentYear}-${sequence}`;
};

/**
 * GET /api/v1/projects
 * List all projects with filtering, search, and role-based scoping
 */
exports.getProjects = async (req, res) => {
  try {
    const { status, clientId, projectManagerId, deliveryManagerId, health, search } = req.query;
    const user = req.user;

    const where = {};

    // Role-based scoping: Consultants/Operations see projects they manage or are assigned to
    if (user && !['admin', 'super_admin', 'finance'].includes(user.role)) {
      where.OR = [
        { projectManagerId: user.id },
        { deliveryManagerId: user.id },
        { tasks: { some: { assignedToId: user.id } } }
      ];
    }

    if (status && status !== 'ALL') where.status = status;
    if (health && health !== 'ALL') where.health = health;
    if (clientId) where.clientId = clientId;
    if (projectManagerId) where.projectManagerId = projectManagerId;
    if (deliveryManagerId) where.deliveryManagerId = deliveryManagerId;
    if (search) {
      where.OR = [
        ...(where.OR || []),
        { name: { contains: search } },
        { projectCode: { contains: search } },
        { serviceType: { contains: search } }
      ];
    }

    const projects = await prisma.project.findMany({
      where,
      include: {
        client: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true, clientCode: true }
        },
        projectManager: {
          select: { id: true, fullName: true, email: true, role: true }
        },
        deliveryManager: {
          select: { id: true, fullName: true, email: true, role: true }
        },
        _count: {
          select: { tasks: true, milestones: true, handovers: true, timeLogs: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ success: true, count: projects.length, data: projects });
  } catch (error) {
    console.error('[ProjectController: getProjects] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve projects.', error: error.message });
  }
};

/**
 * GET /api/v1/projects/:id
 * Retrieve a single project with its full breakdown
 */
exports.getProjectById = async (req, res) => {
  try {
    const { id } = req.params;

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        client: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true, clientCode: true }
        },
        projectManager: {
          select: { id: true, fullName: true, email: true, hotlineNumber: true }
        },
        deliveryManager: {
          select: { id: true, fullName: true, email: true, hotlineNumber: true }
        },
        milestones: {
          orderBy: { createdAt: 'asc' },
          include: {
            tasks: {
              select: { id: true, title: true, status: true, priority: true, actualHours: true, estimatedHours: true }
            }
          }
        },
        tasks: {
          orderBy: { createdAt: 'desc' },
          include: {
            assignedTo: {
              select: { id: true, fullName: true, email: true }
            },
            milestone: {
              select: { id: true, title: true }
            }
          }
        },
        handovers: {
          orderBy: { createdAt: 'desc' },
          include: {
            signedOffBy: {
              select: { id: true, fullName: true, email: true }
            }
          }
        },
        timeLogs: {
          orderBy: { workDate: 'desc' },
          take: 50,
          include: {
            user: { select: { id: true, fullName: true } },
            task: { select: { id: true, title: true } }
          }
        },
        reviews: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }

    // Calculate aggregated metrics
    const totalHoursLogged = project.timeLogs.reduce((acc, log) => acc + (log.hours || 0), 0);
    const completedTasksCount = project.tasks.filter(t => t.status === 'DONE').length;
    const taskCompletionRate = project.tasks.length > 0
      ? Math.round((completedTasksCount / project.tasks.length) * 100)
      : 0;

    res.json({
      success: true,
      data: {
        ...project,
        metrics: {
          totalHoursLogged,
          completedTasksCount,
          totalTasksCount: project.tasks.length,
          taskCompletionRate
        }
      }
    });
  } catch (error) {
    console.error('[ProjectController: getProjectById] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve project details.', error: error.message });
  }
};

/**
 * POST /api/v1/projects
 * Create a new IT Project
 */
exports.createProject = async (req, res) => {
  try {
    const {
      name,
      description,
      serviceType,
      clientId,
      projectManagerId,
      deliveryManagerId,
      budget,
      currency,
      priority,
      status,
      startDate,
      deadline,
      repositoryUrl,
      stagingUrl,
      productionUrl,
      techStack
    } = req.body;

    if (!name || !clientId) {
      return res.status(400).json({ success: false, message: 'Project name and clientId are required.' });
    }

    // Verify client exists
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) {
      return res.status(404).json({ success: false, message: 'Client not found.' });
    }

    const projectCode = await generateProjectCode();

    const newProject = await prisma.project.create({
      data: {
        projectCode,
        name,
        description: description || null,
        serviceType: serviceType || 'Custom Software',
        clientId,
        projectManagerId: projectManagerId || null,
        deliveryManagerId: deliveryManagerId || null,
        budget: budget ? parseFloat(budget) : 0,
        currency: currency || 'USD',
        priority: priority || 'MEDIUM',
        status: status || 'PLANNING',
        health: 'ON_TRACK',
        startDate: startDate ? new Date(startDate) : new Date(),
        deadline: deadline ? new Date(deadline) : null,
        repositoryUrl: repositoryUrl || null,
        stagingUrl: stagingUrl || null,
        productionUrl: productionUrl || null,
        techStack: techStack || []
      },
      include: {
        client: {
          select: { id: true, firstName: true, lastName: true, email: true }
        },
        projectManager: {
          select: { id: true, fullName: true, email: true }
        }
      }
    });

    res.status(201).json({ success: true, message: 'Project created successfully.', data: newProject });
  } catch (error) {
    console.error('[ProjectController: createProject] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to create project.', error: error.message });
  }
};

/**
 * PUT /api/v1/projects/:id
 * Update project details, timeline, or status
 */
exports.updateProject = async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;

    const existing = await prisma.project.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }

    const updatePayload = {};
    if (data.name !== undefined) updatePayload.name = data.name;
    if (data.description !== undefined) updatePayload.description = data.description;
    if (data.serviceType !== undefined) updatePayload.serviceType = data.serviceType;
    if (data.status !== undefined) {
      updatePayload.status = data.status;
      if (data.status === 'COMPLETED' && !existing.completedAt) {
        updatePayload.completedAt = new Date();
      }
    }
    if (data.priority !== undefined) updatePayload.priority = data.priority;
    if (data.health !== undefined) updatePayload.health = data.health;
    if (data.budget !== undefined) updatePayload.budget = parseFloat(data.budget);
    if (data.spentBudget !== undefined) updatePayload.spentBudget = parseFloat(data.spentBudget);
    if (data.currency !== undefined) updatePayload.currency = data.currency;
    if (data.projectManagerId !== undefined) updatePayload.projectManagerId = data.projectManagerId || null;
    if (data.deliveryManagerId !== undefined) updatePayload.deliveryManagerId = data.deliveryManagerId || null;
    if (data.startDate !== undefined) updatePayload.startDate = data.startDate ? new Date(data.startDate) : null;
    if (data.deadline !== undefined) updatePayload.deadline = data.deadline ? new Date(data.deadline) : null;
    if (data.repositoryUrl !== undefined) updatePayload.repositoryUrl = data.repositoryUrl;
    if (data.stagingUrl !== undefined) updatePayload.stagingUrl = data.stagingUrl;
    if (data.productionUrl !== undefined) updatePayload.productionUrl = data.productionUrl;
    if (data.techStack !== undefined) updatePayload.techStack = data.techStack;

    const updated = await prisma.project.update({
      where: { id },
      data: updatePayload,
      include: {
        client: { select: { id: true, firstName: true, lastName: true } },
        projectManager: { select: { id: true, fullName: true } }
      }
    });

    res.json({ success: true, message: 'Project updated successfully.', data: updated });
  } catch (error) {
    console.error('[ProjectController: updateProject] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to update project.', error: error.message });
  }
};

/**
 * DELETE /api/v1/projects/:id
 * Delete project (Admin / Super Admin only)
 */
exports.deleteProject = async (req, res) => {
  try {
    const { id } = req.params;

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found.' });
    }

    await prisma.project.delete({ where: { id } });
    res.json({ success: true, message: 'Project deleted successfully.' });
  } catch (error) {
    console.error('[ProjectController: deleteProject] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete project.', error: error.message });
  }
};

// ==========================================
// MILESTONES & SPRINTS
// ==========================================

exports.createMilestone = async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const { title, description, milestoneType, status, startDate, dueDate } = req.body;

    if (!title) {
      return res.status(400).json({ success: false, message: 'Milestone title is required.' });
    }

    const milestone = await prisma.projectMilestone.create({
      data: {
        projectId,
        title,
        description: description || null,
        milestoneType: milestoneType || 'SPRINT',
        status: status || 'PENDING',
        startDate: startDate ? new Date(startDate) : null,
        dueDate: dueDate ? new Date(dueDate) : null
      }
    });

    res.status(201).json({ success: true, message: 'Milestone/Sprint created.', data: milestone });
  } catch (error) {
    console.error('[ProjectController: createMilestone] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to create milestone.', error: error.message });
  }
};

exports.updateMilestone = async (req, res) => {
  try {
    const { milestoneId } = req.params;
    const { title, description, status, startDate, dueDate, milestoneType } = req.body;

    const data = {};
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;
    if (milestoneType !== undefined) data.milestoneType = milestoneType;
    if (status !== undefined) {
      data.status = status;
      if (status === 'COMPLETED') data.completedAt = new Date();
    }
    if (startDate !== undefined) data.startDate = startDate ? new Date(startDate) : null;
    if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;

    const updated = await prisma.projectMilestone.update({
      where: { id: milestoneId },
      data
    });

    res.json({ success: true, message: 'Milestone updated.', data: updated });
  } catch (error) {
    console.error('[ProjectController: updateMilestone] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to update milestone.', error: error.message });
  }
};

exports.deleteMilestone = async (req, res) => {
  try {
    const { milestoneId } = req.params;
    await prisma.projectMilestone.delete({ where: { id: milestoneId } });
    res.json({ success: true, message: 'Milestone deleted.' });
  } catch (error) {
    console.error('[ProjectController: deleteMilestone] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete milestone.', error: error.message });
  }
};

// ==========================================
// TASKS
// ==========================================

exports.createTask = async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const { title, description, milestoneId, taskType, priority, status, estimatedHours, assignedToId, dueDate } = req.body;

    if (!title) {
      return res.status(400).json({ success: false, message: 'Task title is required.' });
    }

    const task = await prisma.projectTask.create({
      data: {
        projectId,
        milestoneId: milestoneId || null,
        title,
        description: description || null,
        taskType: taskType || 'FEATURE',
        priority: priority || 'MEDIUM',
        status: status || 'TODO',
        estimatedHours: estimatedHours ? parseFloat(estimatedHours) : 0,
        assignedToId: assignedToId || null,
        dueDate: dueDate ? new Date(dueDate) : null
      },
      include: {
        assignedTo: { select: { id: true, fullName: true, email: true } },
        milestone: { select: { id: true, title: true } }
      }
    });

    res.status(201).json({ success: true, message: 'Task created.', data: task });
  } catch (error) {
    console.error('[ProjectController: createTask] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to create task.', error: error.message });
  }
};

exports.updateTask = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { title, description, milestoneId, taskType, priority, status, estimatedHours, actualHours, assignedToId, dueDate } = req.body;

    const data = {};
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;
    if (milestoneId !== undefined) data.milestoneId = milestoneId || null;
    if (taskType !== undefined) data.taskType = taskType;
    if (priority !== undefined) data.priority = priority;
    if (estimatedHours !== undefined) data.estimatedHours = parseFloat(estimatedHours);
    if (actualHours !== undefined) data.actualHours = parseFloat(actualHours);
    if (assignedToId !== undefined) data.assignedToId = assignedToId || null;
    if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;
    if (status !== undefined) {
      data.status = status;
      if (status === 'DONE') data.completedAt = new Date();
    }

    const updated = await prisma.projectTask.update({
      where: { id: taskId },
      data,
      include: {
        assignedTo: { select: { id: true, fullName: true, email: true } },
        milestone: { select: { id: true, title: true } }
      }
    });

    res.json({ success: true, message: 'Task updated.', data: updated });
  } catch (error) {
    console.error('[ProjectController: updateTask] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to update task.', error: error.message });
  }
};

exports.deleteTask = async (req, res) => {
  try {
    const { taskId } = req.params;
    await prisma.projectTask.delete({ where: { id: taskId } });
    res.json({ success: true, message: 'Task deleted.' });
  } catch (error) {
    console.error('[ProjectController: deleteTask] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete task.', error: error.message });
  }
};

// ==========================================
// TIME TRACKING
// ==========================================

exports.logTime = async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const { taskId, hours, workDate, description, isBillable } = req.body;
    const userId = req.user?.id;

    if (!hours || isNaN(hours)) {
      return res.status(400).json({ success: false, message: 'Valid hours value is required.' });
    }
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User authentication required to log time.' });
    }

    const parsedHours = parseFloat(hours);

    const log = await prisma.projectTimeLog.create({
      data: {
        projectId,
        taskId: taskId || null,
        userId,
        hours: parsedHours,
        workDate: workDate ? new Date(workDate) : new Date(),
        description: description || null,
        isBillable: isBillable !== undefined ? Boolean(isBillable) : true
      },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
        task: { select: { id: true, title: true } }
      }
    });

    // Update actualHours on the related task if present
    if (taskId) {
      await prisma.projectTask.update({
        where: { id: taskId },
        data: {
          actualHours: { increment: parsedHours }
        }
      });
    }

    res.status(201).json({ success: true, message: 'Time logged successfully.', data: log });
  } catch (error) {
    console.error('[ProjectController: logTime] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to log time.', error: error.message });
  }
};

exports.deleteTimeLog = async (req, res) => {
  try {
    const { logId } = req.params;
    const existing = await prisma.projectTimeLog.findUnique({ where: { id: logId } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Time log not found.' });
    }

    // Deduct actualHours from task if linked
    if (existing.taskId) {
      await prisma.projectTask.update({
        where: { id: existing.taskId },
        data: {
          actualHours: { decrement: existing.hours }
        }
      }).catch(() => null);
    }

    await prisma.projectTimeLog.delete({ where: { id: logId } });
    res.json({ success: true, message: 'Time log deleted.' });
  } catch (error) {
    console.error('[ProjectController: deleteTimeLog] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete time log.', error: error.message });
  }
};

// ==========================================
// QA, UAT, DEPLOYMENT & HANDOVER
// ==========================================

exports.createHandover = async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const { stage, status, releaseNotes, checklist } = req.body;

    if (!stage) {
      return res.status(400).json({ success: false, message: 'Handover stage (QA, UAT, STAGING, PRODUCTION, HANDOVER) is required.' });
    }

    const handover = await prisma.projectHandover.create({
      data: {
        projectId,
        stage,
        status: status || 'PENDING',
        releaseNotes: releaseNotes || null,
        checklist: checklist || []
      }
    });

    res.status(201).json({ success: true, message: 'Handover record created.', data: handover });
  } catch (error) {
    console.error('[ProjectController: createHandover] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to create handover record.', error: error.message });
  }
};

exports.signOffHandover = async (req, res) => {
  try {
    const { handoverId } = req.params;
    const { status, releaseNotes, checklist, signOffByName } = req.body;
    const userId = req.user?.id;

    const data = {
      status: status || 'SIGNED_OFF',
      signOffDate: new Date(),
      signedOffById: userId || null,
      signOffByName: signOffByName || req.user?.fullName || 'Authorized Lead'
    };
    if (releaseNotes !== undefined) data.releaseNotes = releaseNotes;
    if (checklist !== undefined) data.checklist = checklist;

    const updated = await prisma.projectHandover.update({
      where: { id: handoverId },
      data,
      include: {
        signedOffBy: { select: { id: true, fullName: true, email: true } },
        project: { select: { id: true, name: true, projectCode: true } }
      }
    });

    // If Handover is PRODUCTION or HANDOVER and signed off, optionally set project status
    if (updated.stage === 'HANDOVER' && updated.status === 'SIGNED_OFF') {
      await prisma.project.update({
        where: { id: updated.projectId },
        data: { status: 'COMPLETED', completedAt: new Date() }
      }).catch(() => null);
    } else if (updated.stage === 'QA' && updated.status === 'PASSED') {
      await prisma.project.update({
        where: { id: updated.projectId },
        data: { status: 'QA_UAT' }
      }).catch(() => null);
    }

    res.json({ success: true, message: 'Handover sign-off recorded.', data: updated });
  } catch (error) {
    console.error('[ProjectController: signOffHandover] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to sign off handover.', error: error.message });
  }
};
