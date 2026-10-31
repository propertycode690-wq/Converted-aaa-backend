const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const getFileUrl = (file) => {
  if (!file) return '';
  if (file.location) return file.location;
  if (file.path) {
    try {
      if (fs.existsSync(file.path)) {
        const fileBuffer = fs.readFileSync(file.path);
        const mimeType = file.mimetype || 'application/pdf';
        return `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
      }
    } catch (err) {
      console.warn('[getFileUrl] Could not convert file to Data URI:', err.message);
    }
  }
  return `/uploads/${file.filename}`;
};
const { extractText } = require('unpdf');

exports.createEligibilityBooking = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      nationality,
      countryOfResidence,
      preferredLanguage,
      serviceType,
      applicantsCount,
      deviceFingerprint,
      date,
      timeSlot,
      selectedVisa,
      preferableArea,
      budget,
      sourceLanguage,
      targetLanguage,
      wordCount,
    } = req.body;

    // Same-Day Booking Restriction
    if (date) {
      const todayStr = new Date().toISOString().split('T')[0];
      const { getCustomization } = require('./settingsController');
      const settings = getCustomization();
      const allowSameDay = Boolean(settings.flowAutomationSettings?.allowSameDayBooking);

      if (allowSameDay) {
        if (date < todayStr) {
          return res.status(400).json({
            success: false,
            message: 'Past dates cannot be booked.'
          });
        }
      } else {
        if (date <= todayStr) {
          return res.status(400).json({
            success: false,
            message: 'Booking date must be at least the next calendar day.'
          });
        }
      }
    }

    // 1. Anti-Fraud & Identity Normalization
    const normalizedPhone = phone.replace(/[\s\-\+]/g, ''); // strip spaces, dashes, country code prefix (naively for now)

    // 2. Check for Blocking (Cross-Device Detection)
    const blockedClient = await prisma.client.findFirst({
      where: {
        isBlocked: true,
        OR: [
          { email: email.toLowerCase() },
          { phone: { contains: normalizedPhone } }, // Fuzzy match
          ...(deviceFingerprint ? [{ deviceFingerprint }] : [])
        ]
      }
    });

    if (blockedClient) {
      return res.status(403).json({
        success: false,
        code: 'BLOCKED',
        message: 'Your booking cannot be processed automatically. Contact support.',
      });
    }

    // 2b. Check for BlacklistedClient (missed prior appointments)
    const blacklisted = await prisma.blacklistedClient.findFirst({
      where: {
        OR: [
          { email: email.toLowerCase() },
          { phone: { contains: normalizedPhone } }
        ]
      }
    });

    const { isNameSimilar } = require('../utils/fuzzyMatch');
    const blacklist = await prisma.blacklistedClient.findMany();
    const fullNameInput = `${firstName || ''} ${lastName || ''}`.trim();
    const matchesBlacklistByName = blacklist.some(b => isNameSimilar(fullNameInput, b.name));

    if (blacklisted || matchesBlacklistByName) {
      return res.status(403).json({
        success: false,
        code: 'BLACKLISTED',
        message: 'This profile is not eligible for further eligibility assessments due to a previous missed appointment.',
      });
    }

    // 2b. Check if an active Client already exists with this email or phone
    const existingClient = await prisma.client.findFirst({
      where: {
        OR: [
          { email: email.toLowerCase() },
          { phone: { contains: normalizedPhone } }
        ]
      }
    });

    if (existingClient) {
      return res.status(409).json({
        success: false,
        code: 'EXISTING_CLIENT',
        message: 'An active client profile already exists under this email/phone number.'
      });
    }

    // 2c. Check for Duplicate Active Bookings (Status-aware based on Most Recent Lead)
    const latestLead = await prisma.lead.findFirst({
      where: {
        OR: [
          { email: email.toLowerCase() },
          { phone: { contains: normalizedPhone } }
        ]
      },
      orderBy: { createdAt: 'desc' }
    });

    const inactiveStatuses = ['Lost Lead', 'Spam', 'Cold Lead', 'No Show', 'Completed', 'Cancelled', 'Canceled', 'Refused', 'Meeting Completed', 'Meeting Cancelled'];
    
    if (latestLead && !inactiveStatuses.includes(latestLead.status)) {
      return res.status(409).json({
        success: false,
        code: 'DUPLICATE_LEAD',
        message: 'You already have an active booking or application under this email/phone.',
      });
    }

    // 3. Smart Consultant Assignment matching
    const consultants = await prisma.user.findMany({
      where: { role: 'consultant' },
      include: {
        _count: {
          select: { assignedLeads: true }
        }
      }
    });

    let bestConsultantId = null;
    let highestScore = -999;
    let minActiveLeads = Infinity;

    for (const consultant of consultants) {
      let score = 0;

      // Spoken Language Match
      if (preferredLanguage && consultant.spokenLanguages) {
        try {
          const spoken = Array.isArray(consultant.spokenLanguages)
            ? consultant.spokenLanguages
            : JSON.parse(JSON.stringify(consultant.spokenLanguages));
          if (spoken.map(s => s.toLowerCase()).includes(preferredLanguage.toLowerCase())) {
            score += 10;
          }
        } catch (e) {
          console.warn("Spoken languages parsing failed:", e.message);
        }
      }

      // Property Specialist Match
      const normalizedService = (serviceType || '').toLowerCase();
      if (normalizedService.includes('property')) {
        if (consultant.isPropertySpecialist) {
          score += 20;
        } else {
          score -= 10;
        }
      } else {
        // Visa/Residency or Case Assessment Match
        const visa = (selectedVisa || '').toLowerCase();
        if (visa && consultant.visaExpertise) {
          try {
            const expertise = Array.isArray(consultant.visaExpertise)
              ? consultant.visaExpertise
              : JSON.parse(JSON.stringify(consultant.visaExpertise));
            if (expertise.map(v => v.toLowerCase()).includes(visa)) {
              score += 15;
            }
          } catch (e) {
            console.warn("Visa expertise parsing failed:", e.message);
          }
        }
      }

      // Nationality Match
      if (nationality && consultant.nationalities) {
        try {
          const natList = Array.isArray(consultant.nationalities)
            ? consultant.nationalities
            : JSON.parse(JSON.stringify(consultant.nationalities));
          if (natList.map(n => n.toLowerCase()).includes(nationality.toLowerCase())) {
            score += 5;
          }
        } catch (e) {
          console.warn("Nationalities parsing failed:", e.message);
        }
      }

      // Load-balancing helper
      const activeLeadsCount = consultant._count?.assignedLeads || 0;

      // Selection logic: Highest score. Tiebreaker is lower workload.
      if (score > highestScore) {
        highestScore = score;
        bestConsultantId = consultant.id;
        minActiveLeads = activeLeadsCount;
      } else if (score === highestScore) {
        if (activeLeadsCount < minActiveLeads) {
          bestConsultantId = consultant.id;
          minActiveLeads = activeLeadsCount;
        }
      }
    }

    // 4. Find or Create Client
    let client = await prisma.client.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (!client) {
      client = await prisma.client.create({
        data: {
          firstName,
          lastName,
          email: email.toLowerCase(),
          phone,
          nationality,
          countryOfResidence,
          preferredLanguage,
          serviceType,
          applicantsCount,
          deviceFingerprint,
          preferableArea: preferableArea || null,
          budget: budget || null,
          sourceLanguage: sourceLanguage || null,
          targetLanguage: targetLanguage || null,
          wordCount: wordCount ? parseInt(wordCount, 10) : null,
          status: 'Waiting for Assessment',
          assignedToId: bestConsultantId
        }
      });
    } else {
      // Update device fingerprint & assignment if missing
      await prisma.client.update({
        where: { id: client.id },
        data: {
          deviceFingerprint: deviceFingerprint || undefined,
          assignedToId: client.assignedToId || bestConsultantId,
          preferableArea: preferableArea || undefined,
          budget: budget || undefined
        }
      });
    }

    // 5. Create Lead (if doesn't exist for UI compatibility)
    let lead = await prisma.lead.findUnique({ where: { clientId: client.id } });
    if (!lead) {
      lead = await prisma.lead.create({
        data: {
          firstName, lastName, email: email.toLowerCase(), phone, nationality, countryOfResidence,
          preferredLanguage, serviceType, applicantsCount, status: 'Meeting Scheduled',
          clientId: client.id,
          assignedToId: bestConsultantId,
          preferableArea: preferableArea || null,
          budget: budget || null,
          sourceLanguage: sourceLanguage || null,
          targetLanguage: targetLanguage || null,
          wordCount: wordCount ? parseInt(wordCount, 10) : null
        }
      });
    } else {
      lead = await prisma.lead.update({
        where: { id: lead.id },
        data: {
          status: 'Meeting Scheduled',
          assignedToId: lead.assignedToId || bestConsultantId,
          preferableArea: preferableArea || undefined,
          budget: budget || undefined,
          sourceLanguage: sourceLanguage || undefined,
          targetLanguage: targetLanguage || undefined,
          wordCount: wordCount ? parseInt(wordCount, 10) : undefined
        }
      });
    }

    console.log(`[BOOKING] Booking submission received for: ${firstName} ${lastName} (${email})`);
    console.log(`[BOOKING] Consultant assigned: ${bestConsultantId}`);

    // 6. Create Application Cycle
    const appCycle = await prisma.applicationCycle.create({
      data: {
        clientId: client.id,
        serviceType,
        status: 'Assessment Booked'
      }
    });

    // Idempotency check: Reuse existing consultation or meetingLink if available
    let existingConsultation = await prisma.consultation.findFirst({
      where: { leadId: lead.id }
    });

    // Meeting Flow Removed: Set meetingLink to null, no Zoom meeting generated
    const meetingLink = null;
    const consultationStatus = 'Inquiry Received';

    // 7. Create or Update Booking (Consultation)
    let consultation;
    if (!existingConsultation) {
      consultation = await prisma.consultation.create({
        data: {
          date: date || new Date().toISOString().split('T')[0],
          timeSlot: timeSlot || 'TBD',
          status: consultationStatus,
          leadId: lead.id,
          meetingLink: null,
          consultantId: bestConsultantId,
          type: (serviceType || '').toLowerCase().includes('property') ? 'property_guidance' : 'eligibility'
        }
      });
    } else {
      consultation = await prisma.consultation.update({
        where: { id: existingConsultation.id },
        data: {
          date: date || existingConsultation.date,
          timeSlot: timeSlot || existingConsultation.timeSlot,
          status: consultationStatus,
          meetingLink: null,
          consultantId: bestConsultantId
        }
      });
    }

    await prisma.lead.update({
      where: { id: lead.id },
      data: { status: 'New Lead' }
    }).catch(err => console.error('[BOOKING] Failed to update lead status:', err.message));
    console.log(`[BOOKING] Consultation marked Inquiry Received for Lead ID: ${lead.id}`);

    // 7. Create CRM Notification Record & Broadcast Real-Time Socket Event
    try {
      await prisma.notification.create({
        data: {
          userId: bestConsultantId || 'admin',
          type: 'new_booking',
          title: 'New Client Inquiry Received 📩',
          body: `New inquiry submitted by ${firstName} ${lastName} (${serviceType || 'General'}).`,
          clientId: client.id
        }
      });
    } catch (notifErr) {
      console.warn('[CRM Notification] Failed to create DB notification:', notifErr.message);
    }

    try {
      const io = req.app.get('io');
      if (io) {
        io.to('role:admin').to('role:consultant').to(`user:${bestConsultantId}`).emit('new_booking', {
          consultation,
          client,
          lead
        });
        console.log(`[SOCKET] new_booking emitted for Consultation ID: ${consultation.id}`);
      }
    } catch (ioErr) {
      console.warn('[SOCKET] Broadcast warning:', ioErr.message);
    }

    // Trigger In-App Notifications for all staff
    try {
      const { createLeadNotification } = require('./notificationController');
      createLeadNotification({
        leadName: `${firstName} ${lastName}`,
        email: email.toLowerCase(),
        phone,
        country: countryOfResidence,
        serviceCategory: serviceType,
        appointmentDate: date ? `${date} ${timeSlot || ''}` : null,
        reqApp: req.app
      }).catch(err => console.error('[Booking Notification Error]:', err.message));
    } catch (notifErr) {
      console.error('[Booking Notification Init Error]:', notifErr.message);
    }

    return res.status(201).json({
      success: true,
      message: 'Inquiry received successfully',
      data: { consultation, client }
    });

  } catch (error) {
    console.error('Eligibility Booking Error:', error);
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};

async function getTranslationRate(sourceLanguage) {
  const lang = (sourceLanguage || 'English').toLowerCase().trim();

  // Try to load dynamic rates from DB settings
  try {
    const settings = await prisma.companySetting.findFirst({
      select: { swornTranslationRates: true }
    }).catch(() => null);
    if (settings && settings.swornTranslationRates) {
      const rates = typeof settings.swornTranslationRates === 'string'
        ? JSON.parse(settings.swornTranslationRates)
        : settings.swornTranslationRates;

      if (Array.isArray(rates)) {
        const found = rates.find(r => {
          const n = (r.name || '').toLowerCase();
          return (lang.includes('urdu') && n.includes('urdu')) ||
                 (lang.includes('arabic') && n.includes('arabic')) ||
                 (lang.includes('english') && n.includes('english')) ||
                 n.includes(lang);
        });
        if (found && found.rate !== undefined) {
          return parseFloat(found.rate);
        }
      } else if (typeof rates === 'object') {
        if (lang.includes('urdu') && rates.urduToSpanish) return parseFloat(rates.urduToSpanish);
        if (lang.includes('arabic') && rates.arabicToSpanish) return parseFloat(rates.arabicToSpanish);
        if (lang.includes('english') && rates.englishToSpanish) return parseFloat(rates.englishToSpanish);
      }
    }
  } catch (e) {
    console.warn("Failed to fetch custom translation rates:", e.message);
  }

  // Fallback defaults
  if (lang.includes('urdu')) {
    return 0.40;
  }
  if (lang.includes('arabic')) {
    return 0.25;
  }
  // Default (English)
  return 0.15;
}

async function calculateSwornTranslationPrice(wordCount, sourceLanguage) {
  const rate = await getTranslationRate(sourceLanguage);
  const subtotal = parseFloat((wordCount * rate).toFixed(2));
  const vat = parseFloat((subtotal * 0.05).toFixed(2));
  const total = parseFloat((subtotal + vat).toFixed(2));
  return { rate, subtotal, vat, total };
}

exports.uploadTranslationDocument = async (req, res) => {
  try {
    let files = [];
    if (req.files && req.files.length > 0) {
      const documentsOnly = req.files.filter(f => f.fieldname === 'documents');
      files = documentsOnly.length > 0 ? documentsOnly : req.files;
    } else if (req.file) {
      files = [req.file];
    }

    if (files.length === 0) {
      return res.status(400).json({ success: false, message: 'No document uploaded. Please upload at least one PDF.' });
    }

    // Parse metadata sent from client for each document (if sent as JSON string or array)
    let documentsMetadata = [];
    if (req.body.documentsMetadata) {
      try {
        documentsMetadata = typeof req.body.documentsMetadata === 'string'
          ? JSON.parse(req.body.documentsMetadata)
          : req.body.documentsMetadata;
      } catch (e) {
        console.warn('Error parsing documentsMetadata:', e.message);
      }
    }

    const {
      firstName,
      lastName,
      email,
      phone,
      nationality,
      countryOfResidence,
      targetLanguage
    } = req.body;

    const fs = require('fs');
    const parsedDocuments = [];
    let totalWordCount = 0;
    let totalSubtotal = 0;
    let totalVat = 0;
    let grandTotal = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const docMeta = documentsMetadata[i] || {};
      const docLang = docMeta.documentLanguage || docMeta.sourceLanguage || req.body.documentLanguage || req.body.sourceLanguage || 'English';
      const docCategory = docMeta.category || req.body.category || 'Passport';

      // Obtain file buffer from RAM or disk
      let fileBuffer = file.buffer;
      if (!fileBuffer && file.path && fs.existsSync(file.path)) {
        fileBuffer = fs.readFileSync(file.path);
      }
      if (!fileBuffer) {
        fileBuffer = new Uint8Array(0);
      }

      // Parse PDF using unpdf extractText with a 5-second timeout protection
      let docWordCount = 0;
      try {
        const extractPromise = extractText(new Uint8Array(fileBuffer));
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('PDF text extraction timed out (5s limit)')), 5000)
        );
        const pdfData = await Promise.race([extractPromise, timeoutPromise]).catch(err => {
          console.warn(`[PDF Parse Sworn Translation] Text extraction failed for ${file.originalname}:`, err.message);
          return { text: '' };
        });
        const text = Array.isArray(pdfData.text) ? pdfData.text.join(' ') : (pdfData.text || '');
        docWordCount = text.trim().split(/\s+/).filter(word => word.length > 0).length;
      } catch (err) {
        console.warn(`Error extracting text for ${file.originalname}:`, err.message);
      }

      const priceDetails = await calculateSwornTranslationPrice(docWordCount, docLang);

      const fileUrl = getFileUrl(file);
      const fileSizeMb = file.size ? (file.size / 1024 / 1024).toFixed(2) : '0.10';

      const docObj = {
        name: file.originalname || `Document_${i + 1}.pdf`,
        category: docCategory,
        url: fileUrl,
        size: `${fileSizeMb} MB`,
        documentLanguage: docLang,
        sourceLanguage: docLang,
        targetLanguage: targetLanguage || 'Spanish',
        wordCount: docWordCount,
        rate: priceDetails.rate,
        subtotal: priceDetails.subtotal,
        vat: priceDetails.vat,
        estimatedPrice: priceDetails.total,
        uploadedAt: new Date().toISOString()
      };

      parsedDocuments.push(docObj);
      totalWordCount += docWordCount;
      totalSubtotal += priceDetails.subtotal;
      totalVat += priceDetails.vat;
      grandTotal += priceDetails.total;
    }

    totalSubtotal = parseFloat(totalSubtotal.toFixed(2));
    totalVat = parseFloat(totalVat.toFixed(2));
    grandTotal = parseFloat(grandTotal.toFixed(2));

    // Save/Update Lead in CRM database upon requesting quote
    if (firstName && lastName && email) {
      try {
        const orConditions = [{ email: email.toLowerCase() }];
        if (phone && String(phone).trim()) {
          orConditions.push({ phone: String(phone).trim() });
        }
        let lead = await prisma.lead.findFirst({
          where: { OR: orConditions }
        });

        const primaryDoc = parsedDocuments[0] || {};
        const primaryDocLang = parsedDocuments.map(d => d.documentLanguage).join(', ');

        const leadData = {
          firstName,
          lastName,
          email: email.toLowerCase(),
          phone: (phone && String(phone).trim()) ? String(phone).trim() : '-',
          nationality: nationality || null,
          countryOfResidence: countryOfResidence || null,
          serviceType: 'Spanish Sworn Translation',
          status: 'Payment Not Completed',
          sourceLanguage: primaryDocLang || 'English',
          targetLanguage: targetLanguage || 'Spanish',
          wordCount: totalWordCount,
          qualificationData: {
            serviceType: 'Spanish Sworn Translation',
            documents: parsedDocuments,
            documentName: parsedDocuments.map(d => d.name).join(', '),
            documentUrl: primaryDoc.url,
            documentSize: primaryDoc.size,
            wordCount: totalWordCount,
            sourceLanguage: primaryDocLang,
            targetLanguage: targetLanguage || 'Spanish',
            subtotal: totalSubtotal,
            vat: totalVat,
            estimatedPrice: grandTotal,
            uploadedAt: new Date().toISOString()
          }
        };

        if (!lead) {
          await prisma.lead.create({ data: leadData });
        } else {
          let existingQual = lead.qualificationData || {};
          if (typeof existingQual !== 'object') existingQual = {};
          await prisma.lead.update({
            where: { id: lead.id },
            data: {
              ...leadData,
              qualificationData: {
                ...existingQual,
                ...leadData.qualificationData
              }
            }
          });
        }
      } catch (crmErr) {
        console.warn('[CRM Save Warning in Upload]:', crmErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        documents: parsedDocuments,
        wordCount: totalWordCount,
        totalWordCount,
        rate: parsedDocuments[0]?.rate || 0.15,
        subtotal: totalSubtotal,
        vat: totalVat,
        estimatedPrice: grandTotal,
        currency: 'EUR'
      }
    });

  } catch (error) {
    console.error('PDF Parse Error:', error);
    return res.status(500).json({ success: false, error: 'Failed to parse PDF document' });
  }
};

exports.checkoutTranslationDocument = async (req, res) => {
  const crypto = require('crypto');
  const bcrypt = require('bcrypt');

  try {
    let files = [];
    if (req.files && req.files.length > 0) {
      const documentsOnly = req.files.filter(f => f.fieldname === 'documents');
      files = documentsOnly.length > 0 ? documentsOnly : req.files;
    } else if (req.file) {
      files = [req.file];
    }

    const {
      firstName,
      lastName,
      email,
      phone,
      nationality,
      countryOfResidence,
      targetLanguage,
      wordCount,
      estimatedPrice
    } = req.body;

    if (!firstName || !lastName || !email) {
      return res.status(400).json({ success: false, message: 'Missing required client details' });
    }

    let documentsMetadata = [];
    if (req.body.documentsMetadata) {
      try {
        documentsMetadata = typeof req.body.documentsMetadata === 'string'
          ? JSON.parse(req.body.documentsMetadata)
          : req.body.documentsMetadata;
      } catch (e) {}
    }

    const fs = require('fs');
    const parsedDocuments = [];
    let calculatedTotalWords = 0;
    let calculatedTotal = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const docMeta = documentsMetadata[i] || {};
      const docLang = docMeta.documentLanguage || docMeta.sourceLanguage || 'English';
      const docCategory = docMeta.category || 'Translation Document';
      const docWordCount = docMeta.wordCount || 0;
      const priceDetails = await calculateSwornTranslationPrice(docWordCount, docLang);

      const fileUrl = getFileUrl(file);
      const fileSizeMb = file.size ? (file.size / 1024 / 1024).toFixed(2) : '0.10';

      const docItem = {
        name: file.originalname || `Document_${i + 1}.pdf`,
        category: docCategory,
        url: fileUrl,
        size: `${fileSizeMb} MB`,
        documentLanguage: docLang,
        sourceLanguage: docLang,
        targetLanguage: targetLanguage || 'Spanish',
        wordCount: docWordCount,
        rate: priceDetails.rate,
        subtotal: priceDetails.subtotal,
        vat: priceDetails.vat,
        estimatedPrice: priceDetails.total,
        uploadedAt: new Date().toISOString()
      };

      parsedDocuments.push(docItem);
      calculatedTotalWords += docWordCount;
      calculatedTotal += priceDetails.total;
    }

    let finalPrice = calculatedTotal > 0 ? parseFloat(calculatedTotal.toFixed(2)) : 15.00;
    if (estimatedPrice) {
      const parsedReqPrice = parseFloat(estimatedPrice);
      if (!isNaN(parsedReqPrice) && parsedReqPrice > 0) {
        finalPrice = parsedReqPrice;
      }
    }

    const finalWordCount = wordCount ? parseInt(wordCount, 10) : calculatedTotalWords;

    // 1. Find or create Lead (Sworn Translation stays strictly in Lead section)
    const orConditions = [{ email: email.toLowerCase() }];
    if (phone && String(phone).trim()) {
      orConditions.push({ phone: String(phone).trim() });
    }
    let lead = await prisma.lead.findFirst({
      where: { OR: orConditions }
    });

    const primaryDoc = parsedDocuments[0] || {};
    const primaryDocLang = parsedDocuments.map(d => d.documentLanguage).filter(Boolean).join(', ') || req.body.sourceLanguage || 'English';

    const existingQual = (lead?.qualificationData && typeof lead.qualificationData === 'object') ? lead.qualificationData : {};
    const finalDocumentsList = parsedDocuments.length > 0 ? parsedDocuments : (Array.isArray(existingQual.documents) ? existingQual.documents : []);
    const finalDocNames = finalDocumentsList.map(d => d.name).join(', ') || primaryDoc.name || existingQual.documentName || 'Translation Document.pdf';
    const finalDocUrl = primaryDoc.url || existingQual.documentUrl || (finalDocumentsList[0]?.url) || '';
    const finalDocSize = primaryDoc.size || existingQual.documentSize || (finalDocumentsList[0]?.size) || '0.10 MB';

    const calculatedSubtotal = calculatedTotal > 0 
      ? parseFloat((calculatedTotal / 1.05).toFixed(2)) 
      : (existingQual.subtotal ? parseFloat(existingQual.subtotal) : parseFloat((finalPrice / 1.05).toFixed(2)));
    const calculatedVat = calculatedTotal > 0 
      ? parseFloat((calculatedTotal - calculatedSubtotal).toFixed(2)) 
      : (existingQual.vat ? parseFloat(existingQual.vat) : parseFloat((finalPrice - calculatedSubtotal).toFixed(2)));

    const leadPayload = {
      firstName,
      lastName,
      email: email.toLowerCase(),
      phone: (phone && String(phone).trim()) ? String(phone).trim() : '-',
      nationality: nationality || null,
      countryOfResidence: countryOfResidence || null,
      serviceType: 'Spanish Sworn Translation',
      status: 'Payment Not Completed',
      sourceLanguage: primaryDocLang,
      targetLanguage: targetLanguage || 'Spanish',
      wordCount: finalWordCount,
      qualificationData: {
        ...existingQual,
        serviceType: 'Spanish Sworn Translation',
        documents: finalDocumentsList,
        documentName: finalDocNames,
        documentUrl: finalDocUrl,
        documentSize: finalDocSize,
        wordCount: finalWordCount,
        sourceLanguage: primaryDocLang,
        targetLanguage: targetLanguage || 'Spanish',
        subtotal: calculatedSubtotal,
        vat: calculatedVat,
        estimatedPrice: finalPrice,
        uploadedAt: existingQual.uploadedAt || new Date().toISOString()
      }
    };

    if (!lead) {
      lead = await prisma.lead.create({ data: leadPayload });
    } else {
      lead = await prisma.lead.update({
        where: { id: lead.id },
        data: leadPayload
      });
    }

    const frontendUrl = process.env.FRONTEND_URL || req.headers.origin || 'http://localhost:5173';
    let paymentUrl = `${frontendUrl}/#/public/translation?success=true&leadId=${lead.id}`;
    let stripeSessionId = null;

    const stripeSecret = process.env.STRIPE_SECRET_KEY;
    if (stripeSecret && stripeSecret.startsWith('sk_')) {
      try {
        const stripe = require('stripe')(stripeSecret);
        const stripeAmount = Math.round(finalPrice * 100);

        const session = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          line_items: [{
            price_data: {
              currency: 'eur',
              product_data: {
                name: 'Certified Spanish Sworn Translation',
                description: `Official Sworn Translation for ${firstName} ${lastName} (${finalWordCount} words)`
              },
              unit_amount: stripeAmount,
            },
            quantity: 1,
          }],
          mode: 'payment',
          customer_email: email,
          success_url: `${frontendUrl}/#/public/payment-success?session_id={CHECKOUT_SESSION_ID}&leadId=${lead.id}&type=translation`,
          cancel_url: `${frontendUrl}/#/public/translation?leadId=${lead.id}&cancelled=true`,
          client_reference_id: lead.id,
          metadata: {
            leadId: lead.id,
            serviceType: 'Spanish Sworn Translation',
            wordCount: String(finalWordCount),
            amount: String(finalPrice)
          }
        });

        if (session && session.url) {
          paymentUrl = session.url;
          stripeSessionId = session.id;
        }
      } catch (stripeErr) {
        console.error('[Stripe Session Creation Error]:', stripeErr.message);
      }
    }

    return res.status(201).json({
      success: true,
      message: 'Sworn translation document lead submitted successfully',
      data: {
        leadId: lead.id,
        paymentUrl,
        stripeSessionId,
        estimatedPrice: finalPrice
      }
    });

  } catch (error) {
    console.error('Translation Checkout Error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Internal Server Error during checkout' });
  }
};

exports.verifyPrefillToken = async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).json({ success: false, message: 'Token is required' });
    }

    const jwt = require('jsonwebtoken');
    const { JWT_SECRET } = require('../config/jwt');
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtErr) {
      return res.status(401).json({ success: false, message: 'Invalid or expired re-booking token' });
    }

    const { clientId } = decoded;
    if (!clientId) {
      return res.status(400).json({ success: false, message: 'Invalid token payload' });
    }

    // Retrieve client details
    const client = await prisma.client.findUnique({
      where: { id: clientId }
    });

    if (!client) {
      return res.status(404).json({ success: false, message: 'Client not found' });
    }

    return res.status(200).json({
      success: true,
      data: {
        firstName: client.firstName,
        lastName: client.lastName,
        email: client.email,
        phone: client.phone,
        nationality: client.nationality || '',
        countryOfResidence: client.countryOfResidence || '',
        preferredLanguage: client.preferredLanguage || 'English',
        serviceType: client.serviceType || '',
        applicantsCount: client.applicantsCount || 'Main Only',
        preferableArea: client.preferableArea || '',
        budget: client.budget || ''
      }
    });

  } catch (error) {
    console.error('Error verifying prefill token:', error);
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};

const consultationController = require('./consultationController');

exports.getRescheduleDetails = consultationController.getPublicConsultationDetails;
exports.rescheduleBooking = consultationController.publicRescheduleConsultation;
exports.cancelBooking = consultationController.publicCancelConsultation;

