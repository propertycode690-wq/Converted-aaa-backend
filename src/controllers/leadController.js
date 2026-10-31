const prisma = require('../config/db');

const getLeads = async (req, res) => {
  try {
    const isConsultant = req.user && (req.user.role === 'consultant' || req.user.role === 'agent');
    const whereClause = isConsultant ? { assignedToId: req.user.id } : {};

    // 1. Fetch lightweight sorted lead IDs (sorts only UUIDs to prevent MySQL sort_buffer_size overflow code 1038)
    const leadIds = await prisma.lead.findMany({
      where: whereClause,
      select: { id: true },
      orderBy: { createdAt: 'desc' }
    });

    if (!leadIds || leadIds.length === 0) {
      return res.json([]);
    }

    const idList = leadIds.map(l => l.id);

    // 2. Fetch full lead objects using primary key list (zero SQL sort memory overhead)
    const leads = await prisma.lead.findMany({
      where: { id: { in: idList } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        nationality: true,
        countryOfResidence: true,
        preferredLanguage: true,
        serviceType: true,
        applicantsCount: true,
        source: true,
        campaignId: true,
        status: true,
        notes: true,
        timeline: true,
        qualificationData: true,
        dependentsDetails: true,
        meetingPreferredDate: true,
        meetingPreferredTime: true,
        meetingPreferredLanguage: true,
        meetingNotes: true,
        formSubmittedAt: true,
        preferableArea: true,
        budget: true,
        companyName: true,
        dealValue: true,
        currency: true,
        sourceLanguage: true,
        targetLanguage: true,
        wordCount: true,
        createdAt: true,
        updatedAt: true,
        assignedToId: true,
        assignedAt: true,
        nextFollowUpDate: true,
        clientId: true,
        assignedTo: {
          select: { fullName: true }
        },
        client: {
          select: {
            id: true,
            clientCode: true,
            documents: {
              select: { id: true, name: true, status: true, url: true }
            },
            payments: {
              select: {
                id: true,
                amount: true,
                totalPaid: true,
                status: true,
                paidAt: true,
                transactionId: true,
                gatewayId: true,
                paymentMethod: true,
                invoiceNumber: true
              },
              orderBy: { createdAt: 'desc' }
            },
            communications: {
              select: {
                id: true,
                channel: true,
                direction: true,
                deliveryStatus: true,
                externalProviderId: true,
                failureReason: true,
                createdAt: true
              },
              orderBy: { createdAt: 'desc' }
            }
          }
        }
      }
    });

    // 3. Preserve the exact createdAt desc order
    const leadMap = new Map(leads.map(l => [l.id, l]));
    const sortedLeads = idList.map(id => leadMap.get(id)).filter(Boolean);

    // 4. Map to frontend expectation
    const mapped = sortedLeads.map((l, idx) => {
      const autoCode = l.client?.clientCode || `CID-${12001 + (sortedLeads.length - 1 - idx)}`;
      return {
        ...l,
        createdDate: l.createdAt,
        assignedAt: l.assignedAt || l.createdAt,
        name: `${l.firstName} ${l.lastName}`,
        serviceId: l.serviceType,
        assignedConsultantId: l.assignedToId,
        assignedConsultantName: l.assignedTo?.fullName,
        clientCode: autoCode,
        displayId: autoCode,
        documents: l.client?.documents || [],
        payments: l.client?.payments || [],
        payment: l.client?.payments?.[0] || null,
        communications: l.client?.communications || []
      };
    });
    res.json(mapped);
  } catch (error) {
    console.error('Error fetching leads:', error);
    res.status(500).json({ message: 'Server error fetching leads', error: error.message });
  }
};

const createLead = async (req, res) => {
  try {
    const {
      firstName, 
      lastName, 
      email, 
      phone, 
      companyName,
      dealValue,
      currency,
      source, 
      campaignId, 
      serviceType, 
      serviceId, 
      nationality, 
      countryOfResidence,
      preferredLanguage, 
      applicantsCount,
      dependentsDetails,
      meetingPreferredDate,
      meetingPreferredTime,
      meetingPreferredLanguage,
      meetingNotes,
      qualificationData,
      preferableArea,
      budget,
      sourceLanguage,
      targetLanguage,
      wordCount
    } = req.body;

    // Graceful fallback for IT service leads where nationality/residence may not be mandatory
    const safeNationality = nationality || 'Not Specified';
    const safeCountry = countryOfResidence || 'International';

    // Same-Day Booking Restriction
    if (meetingPreferredDate) {
      const todayStr = new Date().toISOString().split('T')[0];
      const { getCustomization } = require('./settingsController');
      const settings = getCustomization();
      const allowSameDay = Boolean(settings.flowAutomationSettings?.allowSameDayBooking);

      if (allowSameDay) {
        if (meetingPreferredDate < todayStr) {
          return res.status(400).json({
            success: false,
            message: 'Past dates cannot be booked.'
          });
        }
      } else {
        if (meetingPreferredDate <= todayStr) {
          return res.status(400).json({
            success: false,
            message: 'Booking date must be at least the next calendar day.'
          });
        }
      }
    }
    
    const safeEmail = email ? email.trim().toLowerCase() : '';
    // Normalize phone number to check for existing lead (last 10 digits to match with or without country code)
    const cleanPhone = phone ? phone.replace(/\D/g, '') : '';
    const matchDigits = cleanPhone.length >= 10 ? cleanPhone.slice(-10) : cleanPhone;

    // 1. Check blocked client
    const blockedClient = await prisma.client.findFirst({
      where: {
        isBlocked: true,
        OR: [
          ...(safeEmail ? [{ email: safeEmail }] : []),
          ...(matchDigits ? [{ phone: { contains: matchDigits } }] : [])
        ]
      }
    });

    if (blockedClient) {
      return res.status(403).json({
        code: 'BLOCKED',
        message: 'Your booking cannot be processed automatically. Contact support.'
      });
    }

    // 2. Check blacklist first
    const blacklisted = await prisma.blacklistedClient.findFirst({
      where: {
        OR: [
          ...(safeEmail ? [{ email: safeEmail }] : []),
          ...(matchDigits ? [{ phone: { contains: matchDigits } }] : [])
        ]
      }
    });

    const { isNameSimilar } = require('../utils/fuzzyMatch');
    const blacklist = await prisma.blacklistedClient.findMany();
    const fullNameInput = `${firstName || ''} ${lastName || ''}`.trim();
    const matchesBlacklistByName = blacklist.some(b => isNameSimilar(fullNameInput, b.name));

    if (blacklisted || matchesBlacklistByName) {
      return res.status(403).json({
        code: 'BLACKLISTED',
        message: 'This profile is not eligible for further eligibility assessments due to a previous missed appointment.'
      });
    }

    // 2b. Check if an active Client already exists with this email or phone
    const existingClient = await prisma.client.findFirst({
      where: {
        OR: [
          ...(safeEmail ? [{ email: safeEmail }] : []),
          ...(matchDigits ? [{ phone: { contains: matchDigits } }] : [])
        ]
      }
    });

    if (existingClient) {
      return res.status(409).json({
        code: 'EXISTING_CLIENT',
        message: 'An active client profile already exists under this email or phone number. A new lead cannot be created.'
      });
    }
    
    // 3. Check for Duplicate Active Bookings for Public Form Submissions
    if (!req.user) {
      const latestLead = await prisma.lead.findFirst({
        where: {
          OR: [
            ...(safeEmail ? [{ email: safeEmail }] : []),
            ...(matchDigits ? [{ phone: { contains: matchDigits } }] : [])
          ]
        },
        select: {
          id: true,
          email: true,
          phone: true,
          status: true,
          createdAt: true
        },
        orderBy: { createdAt: 'desc' }
      });

      const inactiveStatuses = ['Lost Lead', 'Spam', 'Cold Lead', 'No Show', 'Completed', 'Cancelled', 'Canceled', 'Refused', 'Meeting Completed', 'Meeting Cancelled'];
      
      if (latestLead && !inactiveStatuses.includes(latestLead.status)) {
        return res.status(409).json({
          code: 'DUPLICATE_LEAD',
          message: 'An active booking or application already exists under this email or phone number.'
        });
      }
    }

    let lead = null;

    // Smart auto-assign: prefer property specialist for Property Investment leads
    const finalServiceType = serviceType || serviceId || '';
    const isPropertyLead = finalServiceType.toLowerCase().includes('property') || finalServiceType.toLowerCase().includes('investment');
    let assignedToId = null;
    if (isPropertyLead) {
      // Try to find a property specialist first
      const propertySpecialists = await prisma.user.findMany({ where: { role: 'consultant', isPropertySpecialist: true } });
      if (propertySpecialists.length > 0) {
        assignedToId = propertySpecialists[0].id;
      } else {
        // Fallback to any available consultant
        const consultants = await prisma.user.findMany({ where: { role: 'consultant' } });
        assignedToId = consultants.length > 0 ? consultants[0].id : null;
      }
    } else {
      // Normal assignment for non-property leads
      let ruleMatched = false;
      const settings = await prisma.companySetting.findFirst({
        select: { routingRules: true }
      }).catch(() => null);
      if (settings && settings.routingRules && Array.isArray(settings.routingRules)) {
        const leadNat = (nationality || '').toLowerCase();
        const leadCountry = (countryOfResidence || '').toLowerCase();
        
        const rule = settings.routingRules.find(r => {
          const ruleNat = (r.nationality || '').toLowerCase();
          const ruleCountry = (r.country || '').toLowerCase();
          const natMatch = ruleNat && leadNat.includes(ruleNat);
          const countryMatch = ruleCountry && leadCountry.includes(ruleCountry);
          return natMatch || countryMatch;
        });
        
        if (rule && rule.consultantId) {
          assignedToId = rule.consultantId;
          ruleMatched = true;
        }
      }

      if (!ruleMatched) {
        // Normal round-robin assignment fallback
        const consultants = await prisma.user.findMany({ where: { role: 'consultant' } });
        assignedToId = consultants.length > 0 ? consultants[0].id : null;
      }
    }

    // Create new lead (compatible with Railway schema)
    lead = await prisma.lead.create({
        data: {
          firstName: firstName || '',
          lastName: lastName || '',
          email: safeEmail || email || '',
          phone: phone || '',
          source: source || 'Website',
          campaignId,
          serviceType: serviceType || serviceId,
          nationality: safeNationality,
          countryOfResidence: safeCountry,
          preferredLanguage: preferredLanguage || 'English',
          applicantsCount: applicantsCount ? String(applicantsCount) : undefined,
          dependentsDetails: dependentsDetails || undefined,
          meetingPreferredDate,
          meetingPreferredTime,
          meetingPreferredLanguage,
          meetingNotes,
          qualificationData: qualificationData || undefined,
          assignedToId,
          assignedAt: assignedToId ? new Date() : null,
          preferableArea: preferableArea || null,
          budget: budget || null,
          companyName: companyName || qualificationData?.companyName || null,
          dealValue: (dealValue !== undefined && dealValue !== null && dealValue !== '') ? Number(dealValue) : null,
          currency: currency || 'USD',
          sourceLanguage: sourceLanguage || null,
          targetLanguage: targetLanguage || null,
          wordCount: wordCount ? parseInt(wordCount, 10) : null,
          formSubmittedAt: meetingPreferredDate ? new Date() : undefined,
          status: meetingPreferredDate ? 'Form Submitted' : 'New Lead'
        }
      });
      console.log(`New Lead created (ID: ${lead.id}, Phone: ${lead.phone})`);

      // Trigger In-App Notifications for all staff
      const { createLeadNotification } = require('./notificationController');
      createLeadNotification({
        leadName: `${lead.firstName} ${lead.lastName}`,
        email: lead.email,
        phone: lead.phone,
        country: lead.countryOfResidence,
        serviceCategory: lead.serviceType,
        appointmentDate: lead.meetingPreferredDate ? `${lead.meetingPreferredDate} ${lead.meetingPreferredTime || ''}` : null,
        reqApp: req.app
      }).catch(err => console.error('[Lead Notification Error]:', err.message));

      if (req.app && lead.meetingPreferredDate && lead.meetingPreferredTime) {
        const io = req.app.get('io');
        if (io) {
          io.emit('public-slot-booked', {
            date: lead.meetingPreferredDate,
            timeSlot: lead.meetingPreferredTime
          });
        }
      }

    // Dispatch consultation sync, Zoom meeting creation, WhatsApp, & Emails asynchronously in background
    // Respond immediately to prevent HTTP network timeouts (150ms response time)
    syncLeadConsultation(lead.id, req.app).catch(syncErr => {
      console.error('[SYNC] Background error in syncLeadConsultation:', syncErr.message);
    });

    return res.status(201).json({
      success: true,
      ...lead
    });
  } catch (error) {
    console.error('Error in createLead:', error);
    res.status(500).json({ message: 'Server error creating lead', error: error.message });
  }
};

const assignLead = async (req, res) => {
  try {
    if (req.user && (req.user.role === 'consultant' || req.user.role === 'agent')) {
      return res.status(403).json({ message: 'Access denied. Only administrators and operations managers can assign leads.' });
    }
    const { leadId, agentId } = req.body;
    const lead = await prisma.lead.update({
      where: { id: leadId },
      data: { assignedToId: agentId, assignedAt: new Date() },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        assignedToId: true,
        assignedAt: true,
        clientId: true
      }
    });

    // Update consultant on any existing active (non-cancelled) consultation directly in DB
    await prisma.consultation.updateMany({
      where: { leadId, status: { notIn: ['Cancelled'] } },
      data: { consultantId: agentId, status: 'Scheduled', assignedAt: new Date() }
    }).catch(err => console.warn('[assignLead] Consultation update warning:', err.message));

    // Also trigger consultation sync to ensure meeting record exists
    syncLeadConsultation(leadId, req.app).catch(err => console.warn('[assignLead] syncLeadConsultation warning:', err.message));

    // Also update associated client assignedToId if exists
    if (lead.clientId) {
      await prisma.client.update({
        where: { id: lead.clientId },
        data: { assignedToId: agentId, assignedAt: new Date() }
      }).catch(err => console.warn('[assignLead] Client update warning:', err.message));
    }

    res.json(lead);
  } catch (error) {
    console.error('Error assigning lead:', error);
    res.status(500).json({ message: 'Server error assigning lead', error: error.message });
  }
};

const updateLeadStatus = async (req, res) => {
  try {
    const { leadId, status } = req.body;
    if (!leadId) {
      return res.status(400).json({ message: 'leadId is required' });
    }
    const existingLead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { id: true, assignedToId: true }
    });
    if (!existingLead) {
      return res.status(404).json({ message: 'Lead not found' });
    }
    if (req.user && (req.user.role === 'consultant' || req.user.role === 'agent')) {
      if (existingLead.assignedToId !== req.user.id) {
        return res.status(403).json({ message: 'Access denied. You can only update status for your assigned leads.' });
      }
    }
    const lead = await prisma.lead.update({
      where: { id: leadId },
      data: { status },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        status: true,
        meetingPreferredDate: true,
        meetingPreferredTime: true
      }
    });

    if (status === 'Eligible') {
      try {
        const { autoConvertLeadToClient } = require('./consultationController');
        await autoConvertLeadToClient(lead.id);
      } catch (convErr) {
        console.error('[updateLeadStatus] Failed autoConvertLeadToClient:', convErr.message);
      }
    }

    if (status === 'No Show' || status === 'No-Show') {
      try {
        await prisma.blacklistedClient.upsert({
          where: { email: lead.email.toLowerCase() },
          update: { phone: lead.phone || '' },
          create: {
            email: lead.email.toLowerCase(),
            name: `${lead.firstName} ${lead.lastName}`,
            phone: lead.phone || ''
          }
        });
        console.log(`[Blacklist] Blacklisted client on No Show status: ${lead.email}`);
      } catch (dbErr) {
        console.error('[Blacklist] Failed to insert blacklist record:', dbErr.message);
      }
    }

    if (status === 'Meeting Cancelled' || status === 'Cancelled') {
      try {
        // Update active consultations to Cancelled
        await prisma.consultation.updateMany({
          where: { leadId: lead.id, status: { notIn: ['Cancelled', 'Completed'] } },
          data: { status: 'Cancelled' }
        }).catch(err => console.warn('[updateLeadStatus] Consultation cancel warning:', err.message));
      } catch (cancelErr) {
        console.error('[updateLeadStatus] Failed to process cancellation:', cancelErr.message);
      }
    }

    const { logActivity } = require('../services/auditService');
    const actorName = req.user ? (req.user.fullName || req.user.email) : 'System';
    const actorRole = req.user ? (req.user.role || 'staff') : 'system';
    logActivity({
      leadId: lead.id,
      actorId: req.user?.id || 'system',
      actorName,
      actorRole,
      action: 'STATUS_CHANGED',
      description: `Lead status updated to "${status}" by ${actorName}.`
    });

    res.json(lead);
  } catch (error) {
    res.status(500).json({ message: 'Server error updating status' });
  }
};

const deleteLead = async (req, res) => {
  try {
    if (req.user && req.user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Only Super Admin has permission to delete leads.' });
    }
    const { id } = req.params;

    // Fetch lead first to get clientId if present
    const existingLead = await prisma.lead.findUnique({
      where: { id },
      select: { id: true, clientId: true, meetingPreferredDate: true, meetingPreferredTime: true }
    });

    if (existingLead) {
      // Delete associated consultations matching leadId OR clientId to prevent lingering orphan records
      await prisma.consultation.deleteMany({
        where: {
          OR: [
            { leadId: id },
            ...(existingLead.clientId ? [{ clientId: existingLead.clientId }] : [])
          ]
        }
      });
    }

    // Delete the lead with explicit select
    const lead = await prisma.lead.delete({
      where: { id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        status: true
      }
    });

    if (req.app) {
      const io = req.app.get('io');
      if (io) {
        io.emit('public-slot-booked');
      }
    }

    res.json({ success: true, message: 'Lead deleted successfully', lead });
  } catch (error) {
    console.error('Error deleting lead:', error.message);
    res.status(500).json({ message: 'Server error deleting lead', error: error.message });
  }
};

const getLeadById = async (req, res) => {
  try {
    const { id } = req.params;
    const lead = await prisma.lead.findUnique({
      where: { id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        nationality: true,
        countryOfResidence: true,
        preferredLanguage: true,
        serviceType: true,
        applicantsCount: true,
        source: true,
        campaignId: true,
        status: true,
        notes: true,
        timeline: true,
        qualificationData: true,
        dependentsDetails: true,
        meetingPreferredDate: true,
        meetingPreferredTime: true,
        meetingPreferredLanguage: true,
        meetingNotes: true,
        formSubmittedAt: true,
        preferableArea: true,
        budget: true,
        companyName: true,
        dealValue: true,
        currency: true,
        sourceLanguage: true,
        targetLanguage: true,
        wordCount: true,
        createdAt: true,
        updatedAt: true,
        assignedToId: true,
        assignedAt: true,
        nextFollowUpDate: true,
        clientId: true,
        assignedTo: {
          select: { id: true, fullName: true }
        },
        client: {
          select: {
            id: true,
            clientCode: true,
            documents: {
              select: { id: true, name: true, status: true, url: true }
            }
          }
        }
      }
    });
    if (!lead) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    if (req.user && (req.user.role === 'consultant' || req.user.role === 'agent')) {
      if (lead.assignedToId !== req.user.id) {
        return res.status(403).json({ message: 'Access denied. You can only view your assigned leads.' });
      }
    }

    const autoCode = lead.client?.clientCode || `CID-12001`;
    const mapped = {
      ...lead,
      name: `${lead.firstName || ''} ${lead.lastName || ''}`.trim(),
      serviceId: lead.serviceType,
      assignedConsultantId: lead.assignedToId,
      assignedConsultantName: lead.assignedTo?.fullName,
      clientCode: autoCode,
      displayId: autoCode,
      documents: lead.client?.documents || []
    };
    res.json(mapped);
  } catch (error) {
    console.error('[getLeadById Error]:', error.message);
    res.status(500).json({ message: 'Server error fetching lead details', error: error.message });
  }
};

const updateLead = async (req, res) => {
  try {
    const { id } = req.params;
    const existingLead = await prisma.lead.findUnique({
      where: { id },
      select: { id: true, assignedToId: true }
    });
    if (!existingLead) {
      return res.status(404).json({ message: 'Lead not found' });
    }
    const isConsultant = req.user && (req.user.role === 'consultant' || req.user.role === 'agent');
    if (isConsultant && existingLead.assignedToId !== req.user.id) {
      return res.status(403).json({ message: 'Access denied. You can only update your assigned leads.' });
    }
    const { 
      firstName, 
      lastName, 
      email, 
      phone, 
      companyName,
      dealValue,
      currency,
      nationality, 
      preferredLanguage, 
      serviceId, 
      applicantsCount, 
      source, 
      campaignId, 
      status, 
      notes, 
      timeline, 
      qualificationData,
      assignedConsultantId,
      preferableArea,
      budget,
      sourceLanguage,
      targetLanguage,
      wordCount,
      nextFollowUpDate
    } = req.body;

    const lead = await prisma.lead.update({
      where: { id },
      data: {
        firstName,
        lastName,
        email,
        phone,
        nationality,
        preferredLanguage,
        serviceType: serviceId,
        applicantsCount: applicantsCount ? String(applicantsCount) : undefined,
        source,
        campaignId,
        status,
        notes,
        timeline,
        qualificationData,
        assignedToId: isConsultant ? existingLead.assignedToId : assignedConsultantId,
        ...((!isConsultant && assignedConsultantId) ? { assignedAt: new Date() } : {}),
        nextFollowUpDate: nextFollowUpDate !== undefined ? (nextFollowUpDate ? new Date(nextFollowUpDate) : null) : undefined,
        preferableArea: preferableArea !== undefined ? preferableArea : undefined,
        budget: budget !== undefined ? budget : undefined,
        companyName: companyName !== undefined ? (companyName ? String(companyName).trim() : null) : (qualificationData?.companyName !== undefined ? qualificationData.companyName : undefined),
        dealValue: dealValue !== undefined ? (dealValue === null || dealValue === '' ? null : (!isNaN(Number(dealValue)) ? Number(dealValue) : null)) : undefined,
        currency: currency !== undefined ? (currency ? String(currency).trim() : 'USD') : undefined,
        sourceLanguage: sourceLanguage !== undefined ? sourceLanguage : undefined,
        targetLanguage: targetLanguage !== undefined ? targetLanguage : undefined,
        wordCount: wordCount !== undefined ? (wordCount ? parseInt(wordCount, 10) : null) : undefined
      }
    });

    if (assignedConsultantId) {
      await prisma.consultation.updateMany({
        where: { leadId: lead.id },
        data: { consultantId: assignedConsultantId }
      }).catch(err => console.warn('[updateLead] Consultation update warning:', err.message));
    }

    if (notes !== undefined && notes !== null) {
      try {
        const { logActivity } = require('../services/auditService');
        const actorName = req.user ? (req.user.fullName || req.user.email) : 'Staff';
        const actorRole = req.user ? (req.user.role || 'staff') : 'staff';
        logActivity({
          leadId: lead.id,
          actorId: req.user?.id || 'system',
          actorName,
          actorRole,
          action: 'NOTE_ADDED',
          description: `Case file note updated by ${actorName}.`
        });
      } catch (logErr) {
        console.warn('[updateLead] logActivity warning:', logErr.message);
      }
    }

    const mapped = {
      ...lead,
      name: `${lead.firstName} ${lead.lastName}`,
      serviceId: lead.serviceType,
      assignedConsultantId: lead.assignedToId
    };
    res.json(mapped);
  } catch (error) {
    res.status(500).json({ message: 'Server error updating lead', error: error.message });
  }
};

// Find lead by ID — used by public self-fill form to securely retrieve details
async function getPublicLeadDetails(req, res) {
  try {
    const { id } = req.params;
    let lead = await prisma.lead.findFirst({
      where: {
        OR: [
          { id: id },
          { clientId: id }
        ]
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        nationality: true,
        countryOfResidence: true,
        preferredLanguage: true,
        serviceType: true,
        meetingPreferredDate: true,
        meetingPreferredTime: true,
        meetingPreferredLanguage: true,
        meetingNotes: true,
        formSubmittedAt: true,
        clientId: true
      }
    });

    if (!lead) {
      const clientObj = await prisma.client.findUnique({
        where: { id },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          nationality: true,
          countryOfResidence: true,
          preferredLanguage: true,
          serviceType: true
        }
      });

      if (clientObj) {
        return res.json({
          id: clientObj.id,
          clientId: clientObj.id,
          firstName: clientObj.firstName,
          lastName: clientObj.lastName,
          email: clientObj.email,
          phone: clientObj.phone,
          nationality: clientObj.nationality,
          countryOfResidence: clientObj.countryOfResidence,
          preferredLanguage: clientObj.preferredLanguage,
          serviceType: clientObj.serviceType,
          isClient: true
        });
      }

      return res.status(404).json({ message: 'No lead or client found with this ID' });
    }

    res.json({
      id: lead.id,
      clientId: lead.clientId || lead.id,
      firstName: lead.firstName,
      lastName: lead.lastName,
      email: lead.email,
      phone: lead.phone,
      nationality: lead.nationality,
      countryOfResidence: lead.countryOfResidence,
      preferredLanguage: lead.preferredLanguage,
      serviceType: lead.serviceType,
      meetingPreferredDate: lead.meetingPreferredDate,
      meetingPreferredTime: lead.meetingPreferredTime,
      meetingPreferredLanguage: lead.meetingPreferredLanguage,
      meetingNotes: lead.meetingNotes,
      formSubmittedAt: lead.formSubmittedAt,
      isClient: !!lead.clientId
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching details', error: error.message });
  }
}

// Update meeting preferences — called when lead submits self-fill form
async function updateMeetingPreference(req, res) {
  try {
    const { id } = req.params;
    const {
      firstName,
      lastName,
      email,
      phone,
      nationality,
      preferredLanguage,
      meetingPreferredDate,
      meetingPreferredTime,
      meetingPreferredLanguage,
      meetingNotes,
      qualificationData,
      serviceType,
      serviceId
    } = req.body;

    // Same-Day Booking Restriction
    if (meetingPreferredDate) {
      const todayStr = new Date().toISOString().split('T')[0];
      const { getCustomization } = require('./settingsController');
      const settings = getCustomization();
      const allowSameDay = Boolean(settings.flowAutomationSettings?.allowSameDayBooking);

      if (allowSameDay) {
        if (meetingPreferredDate < todayStr) {
          return res.status(400).json({
            success: false,
            message: 'Past dates cannot be booked.'
          });
        }
      } else {
        if (meetingPreferredDate <= todayStr) {
          return res.status(400).json({
            success: false,
            message: 'Booking date must be at least the next calendar day.'
          });
        }
      }
    }

    // Check if ID belongs to an existing converted Client (match by Client ID or linked Lead ID)
    const clientObj = await prisma.client.findFirst({
      where: {
        OR: [
          { id: id },
          { lead: { id: id } }
        ]
      },
      include: { lead: true }
    });

    if (clientObj) {
      const consultation = await prisma.consultation.create({
        data: {
          clientId: clientObj.id,
          leadId: clientObj.lead?.id || null,
          date: meetingPreferredDate || new Date().toISOString().split('T')[0],
          timeSlot: meetingPreferredTime || 'TBD',
          durationMinutes: 30,
          type: 'follow_up',
          status: 'Inquiry Received',
          consultantId: clientObj.assignedToId || undefined,
          internalNotes: meetingNotes || 'Client Follow-up Request',
          meetingLink: null,
          zoomMeetingId: null
        }
      });

      return res.json({
        success: true,
        message: 'Inquiry received successfully!',
        consultation,
        meetingLink: null
      });
    }

    const lead = await prisma.lead.update({
      where: { id },
      data: {
        firstName,
        lastName,
        phone,
        nationality,
        preferredLanguage,
        meetingPreferredDate,
        meetingPreferredTime,
        meetingPreferredLanguage,
        meetingNotes,
        qualificationData: qualificationData || undefined,
        serviceType: serviceType || serviceId || undefined,
        formSubmittedAt: new Date(),
        status: 'Form Submitted'
      }
    });

    // Auto-create/update consultation — runs in background, does NOT block response
    res.json({
      success: true,
      message: 'Shukriya! Aapki details save ho gayi hain. Hum jald hi aapse contact karenge.',
      lead: {
        id: lead.id,
        firstName: lead.firstName,
        formSubmittedAt: lead.formSubmittedAt
      }
    });

    // 🔔 Trigger In-App Notifications for all staff (same as createLead)
    const { createLeadNotification } = require('./notificationController');
    createLeadNotification({
      leadName: `${lead.firstName} ${lead.lastName}`,
      email: lead.email,
      phone: lead.phone,
      country: lead.countryOfResidence,
      serviceCategory: lead.serviceType,
      appointmentDate: lead.meetingPreferredDate ? `${lead.meetingPreferredDate} ${lead.meetingPreferredTime || ''}` : null,
      reqApp: req.app
    }).catch(err => console.error('[Meeting Pref Notification Error]:', err.message));

    if (req.app && lead.meetingPreferredDate && lead.meetingPreferredTime) {
      const io = req.app.get('io');
      if (io) {
        io.emit('public-slot-booked', {
          date: lead.meetingPreferredDate,
          timeSlot: lead.meetingPreferredTime
        });
      }
    }

    syncLeadConsultation(lead.id, req.app).catch(err => console.error('[BG] syncLeadConsultation failed:', err.message));

  } catch (error) {
    res.status(500).json({ message: 'Server error saving meeting preferences', error: error.message });
  }
}

// Sync Consultation Session and generate/update meeting details and link
async function syncLeadConsultation(leadId, reqApp = null) {
  try {
    console.log(`[BOOKING] Booking submission received for Lead ID: ${leadId}`);
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        serviceType: true,
        meetingPreferredDate: true,
        meetingPreferredTime: true,
        meetingNotes: true,
        formSubmittedAt: true,
        assignedToId: true
      }
    });
    if (!lead) {
      console.log(`[BOOKING] Lead not found for Lead ID: ${leadId}`);
      return;
    }

    console.log(`[BOOKING] Consultant assigned: ${lead.assignedToId || 'Unassigned'} for Lead: ${lead.firstName} ${lead.lastName}`);

    const isTranslation = (lead.serviceType || '').toLowerCase().includes('translation') || (lead.serviceType || '').toLowerCase().includes('sworn');
    if (isTranslation) {
      return;
    }

    const { getCustomization } = require('./settingsController');
    const settings = getCustomization();
    const duration = settings.flowAutomationSettings?.defaultMeetingDuration || 30;

    let consultation = await prisma.consultation.findFirst({
      where: { leadId: lead.id }
    });

    const fallbackDate = lead.formSubmittedAt ? new Date(lead.formSubmittedAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
    const meetingDate = lead.meetingPreferredDate || fallbackDate;
    const meetingTime = lead.meetingPreferredTime || 'TBD / Flexible';

    // 1. Meeting Flow Removed: Set meetingLink to null, no Zoom meeting generated
    let meetingLink = null;

    // Determine Consultation / Inquiry status
    const consultationStatus = lead.assignedToId ? 'Inquiry Assigned' : 'Inquiry Received';

    if (!consultation) {
      consultation = await prisma.consultation.create({
        data: {
          date: meetingDate,
          timeSlot: meetingTime,
          durationMinutes: Number(duration),
          status: consultationStatus,
          leadId: lead.id,
          consultantId: lead.assignedToId || null,
          internalNotes: lead.meetingNotes || '',
          meetingLink: null
        }
      });
      console.log(`[INQUIRY] Created consultation/inquiry record (ID: ${consultation.id}) with status: ${consultationStatus}`);
    } else {
      consultation = await prisma.consultation.update({
        where: { id: consultation.id },
        data: {
          date: meetingDate,
          timeSlot: meetingTime,
          status: consultationStatus,
          consultantId: lead.assignedToId || consultation.consultantId || null,
          internalNotes: lead.meetingNotes || consultation.internalNotes || '',
          meetingLink: null
        }
      });
      console.log(`[INQUIRY] Updated consultation/inquiry record (ID: ${consultation.id}) with status: ${consultationStatus}`);
    }

    // Clean up any stale duplicate Pending Acceptance cards for this lead
    await prisma.consultation.deleteMany({
      where: {
        leadId: lead.id,
        id: { not: consultation.id },
        status: 'Pending Acceptance'
      }
    }).catch(err => console.warn('[INQUIRY] Cleanup duplicate consultation warning:', err.message));

    // Update Lead status to New Lead
    await prisma.lead.update({
      where: { id: lead.id },
      data: { status: 'New Lead' }
    }).catch(err => console.error('[INQUIRY] Failed to update lead status:', err.message));
    console.log(`[INQUIRY] Lead marked as New Lead for Lead ID: ${lead.id}`);

    // Socket.io Notification to CRM Staff
      try {
        if (reqApp) {
          const io = reqApp.get('io');
          if (io) {
            io.to('role:admin').to('role:consultant').to(`user:${lead.assignedToId}`).emit('new_booking', {
              consultation,
              lead
            });
            console.log(`[SOCKET] new_booking emitted for Consultation ID: ${consultation.id}`);
          }
        }
      } catch (socketErr) {
        console.warn('[SOCKET] Broadcast warning:', socketErr.message);
      }

    return consultation;
  } catch (error) {
    console.error('Error in syncLeadConsultation:', error);
    return null;
  }
}

module.exports = { 
  getLeads, 
  createLead, 
  assignLead, 
  updateLeadStatus, 
  deleteLead,
  getLeadById, 
  updateLead, 
  getPublicLeadDetails, 
  updateMeetingPreference 
};


