const prisma = require('../config/db');

/**
 * GET /api/v1/dashboard/metrics
 * Comprehensive, database-backed IT CRM metrics with role-based scoping
 */
exports.getDashboardMetrics = async (req, res) => {
  try {
    const user = req.user;
    const isGlobalRole = ['admin', 'super_admin'].includes(user?.role);
    const isConsultant = user?.role === 'consultant';
    const isOperations = user?.role === 'operations';
    const isMarketing = user?.role === 'marketing';
    const isFinance = user?.role === 'finance';

    // 1. PROJECTS BREAKDOWN
    const projectWhere = {};
    if (!isGlobalRole && !isFinance && user?.id) {
      projectWhere.OR = [
        { projectManagerId: user.id },
        { deliveryManagerId: user.id },
        { tasks: { some: { assignedToId: user.id } } }
      ];
    }

    const projects = await prisma.project.findMany({
      where: projectWhere,
      select: {
        id: true,
        status: true,
        health: true,
        budget: true,
        spentBudget: true,
        deadline: true,
        completedAt: true,
        createdAt: true
      }
    }).catch(err => {
      console.warn('[Dashboard] Project table not migrated or unavailable:', err.message);
      return [];
    });

    const projectCounts = {
      total: projects.length,
      planning: projects.filter(p => p.status === 'PLANNING').length,
      inProgress: projects.filter(p => p.status === 'IN_PROGRESS').length,
      qaUat: projects.filter(p => p.status === 'QA_UAT' || p.status === 'IN_REVIEW').length,
      completed: projects.filter(p => p.status === 'COMPLETED').length,
      onHold: projects.filter(p => p.status === 'ON_HOLD').length
    };

    const projectHealth = {
      onTrack: projects.filter(p => p.health === 'ON_TRACK').length,
      atRisk: projects.filter(p => p.health === 'AT_RISK').length,
      delayed: projects.filter(p => p.health === 'DELAYED').length
    };

    // Calculate on-time delivery rate
    const completedProjects = projects.filter(p => p.status === 'COMPLETED');
    const onTimeProjects = completedProjects.filter(p => !p.deadline || !p.completedAt || p.completedAt <= p.deadline);
    const onTimeDeliveryRate = completedProjects.length > 0
      ? Math.round((onTimeProjects.length / completedProjects.length) * 100)
      : 100;

    // 2. TASKS & SPRINT VELOCITY
    const taskWhere = {};
    if (isOperations && user?.id) {
      taskWhere.assignedToId = user.id;
    } else if (projectWhere.OR) {
      taskWhere.project = projectWhere;
    }

    const tasks = await prisma.projectTask.findMany({
      where: taskWhere,
      select: { id: true, status: true, priority: true, actualHours: true, estimatedHours: true }
    }).catch(() => []);

    const taskCounts = {
      total: tasks.length,
      todo: tasks.filter(t => t.status === 'TODO').length,
      inProgress: tasks.filter(t => t.status === 'IN_PROGRESS').length,
      qa: tasks.filter(t => t.status === 'QA' || t.status === 'IN_REVIEW' || t.status === 'UAT').length,
      done: tasks.filter(t => t.status === 'DONE').length
    };

    // 3. TIME TRACKING
    const timeLogWhere = {};
    if (!isGlobalRole && !isFinance && user?.id) {
      timeLogWhere.userId = user.id;
    }
    const timeLogs = await prisma.projectTimeLog.findMany({
      where: timeLogWhere,
      select: { hours: true, workDate: true }
    }).catch(() => []);

    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    let totalHoursLogged = 0;
    let weekHoursLogged = 0;
    let monthHoursLogged = 0;

    for (const log of timeLogs) {
      totalHoursLogged += log.hours || 0;
      const logDate = new Date(log.workDate);
      if (logDate >= startOfWeek) weekHoursLogged += log.hours || 0;
      if (logDate >= startOfMonth) monthHoursLogged += log.hours || 0;
    }

    // 4. LEADS & IT CHANNELS
    const leadWhere = {};
    if (isConsultant && user?.id) {
      leadWhere.assignedToId = user.id;
    }

    const leads = await prisma.lead.findMany({
      where: leadWhere,
      select: { id: true, status: true, source: true, serviceType: true, dealValue: true, currency: true, createdAt: true }
    });

    const openStages = ['New Lead', 'New Inquiry', 'Contacted', 'Qualified', 'In Discussion', 'Assessment Scheduled', 'Discovery Scheduled', 'Requirement Analysis', 'Proposal Sent', 'Negotiation'];
    const wonStages = ['Deal Won', 'Won', 'Completed', 'Client Created', 'Payment Received', 'Converted'];

    const leadCounts = {
      total: leads.length,
      newLeads: leads.filter(l => l.status === 'New Lead' || l.status === 'New Inquiry').length,
      inProgress: leads.filter(l => openStages.includes(l.status) && l.status !== 'New Lead' && l.status !== 'New Inquiry').length,
      converted: leads.filter(l => wonStages.includes(l.status)).length,
      // Sales Pipeline KPIs (Deal Value)
      openPipelineValue: leads.filter(l => openStages.includes(l.status)).reduce((sum, l) => sum + (Number(l.dealValue) || 0), 0),
      wonContractValue: leads.filter(l => wonStages.includes(l.status)).reduce((sum, l) => sum + (Number(l.dealValue) || 0), 0),
      averageDealSize: (() => {
        const wonWithValues = leads.filter(l => wonStages.includes(l.status) && Number(l.dealValue) > 0);
        return wonWithValues.length > 0 ? (wonWithValues.reduce((sum, l) => sum + Number(l.dealValue), 0) / wonWithValues.length) : 0;
      })()
    };

    // Group leads by IT Service Type
    const leadsByService = {};
    const leadsBySource = {};
    for (const l of leads) {
      const sType = l.serviceType || 'General IT Inquiry';
      leadsByService[sType] = (leadsByService[sType] || 0) + 1;

      const src = l.source || 'Direct / Website';
      leadsBySource[src] = (leadsBySource[src] || 0) + 1;
    }

    // 5. FINANCIAL METRICS
    let totalProjectBudget = 0;
    let totalBudgetSpent = 0;
    for (const p of projects) {
      totalProjectBudget += p.budget || 0;
      totalBudgetSpent += p.spentBudget || 0;
    }

    const payments = await prisma.payment.findMany({
      select: { amount: true, totalPaid: true, status: true }
    }).catch(() => []);

    let totalRevenuePaid = 0;
    let totalPendingInvoices = 0;
    for (const p of payments) {
      if (p.status === 'Paid') {
        totalRevenuePaid += p.totalPaid || p.amount || 0;
      } else if (p.status === 'Pending') {
        totalPendingInvoices += p.amount || 0;
      }
    }

    // 6. REPUTATION & REVIEWS
    const reviews = await prisma.review.findMany({
      select: { rating: true, sentiment: true, provider: true }
    }).catch(() => []);

    const reviewStats = {
      total: reviews.length,
      averageRating: reviews.length > 0
        ? parseFloat((reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(2))
        : 5.0,
      positiveCount: reviews.filter(r => r.sentiment === 'POSITIVE').length,
      neutralCount: reviews.filter(r => r.sentiment === 'NEUTRAL').length,
      negativeCount: reviews.filter(r => r.sentiment === 'NEGATIVE').length
    };

    res.json({
      success: true,
      data: {
        role: user?.role || 'consultant',
        projects: {
          counts: projectCounts,
          health: projectHealth,
          onTimeDeliveryRate
        },
        tasks: taskCounts,
        timeTracking: {
          totalHoursLogged: Math.round(totalHoursLogged * 10) / 10,
          weekHoursLogged: Math.round(weekHoursLogged * 10) / 10,
          monthHoursLogged: Math.round(monthHoursLogged * 10) / 10
        },
        leads: {
          counts: leadCounts,
          byService: leadsByService,
          bySource: leadsBySource
        },
        financials: {
          totalProjectBudget: Math.round(totalProjectBudget),
          totalBudgetSpent: Math.round(totalBudgetSpent),
          totalRevenuePaid: Math.round(totalRevenuePaid),
          totalPendingInvoices: Math.round(totalPendingInvoices)
        },
        reputation: reviewStats
      }
    });
  } catch (error) {
    console.error('[DashboardController: getDashboardMetrics] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve dashboard metrics.', error: error.message });
  }
};

/**
 * GET /api/v1/dashboard/recent-activity
 * Recent actions across projects, leads, and reviews
 */
exports.getRecentActivity = async (req, res) => {
  try {
    const recentProjects = await prisma.project.findMany({
      take: 5,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, name: true, projectCode: true, status: true, updatedAt: true }
    }).catch(() => []);

    const recentTimeLogs = await prisma.projectTimeLog.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { fullName: true } },
        project: { select: { name: true, projectCode: true } }
      }
    }).catch(() => []);

    const recentReviews = await prisma.review.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: { id: true, provider: true, authorName: true, rating: true, sentiment: true, createdAt: true }
    }).catch(() => []);

    res.json({
      success: true,
      data: {
        recentProjects,
        recentTimeLogs,
        recentReviews
      }
    });
  } catch (error) {
    console.error('[DashboardController: getRecentActivity] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve recent activity.', error: error.message });
  }
};
