const fs = require('fs');
const path = require('path');

console.log('--- Applying Phase 2: IT Lead Management UI Adaptation ---');

// Helper to normalize CRLF
function replaceInFile(filePath, replacements) {
  let content = fs.readFileSync(filePath, 'utf8');
  let isCRLF = content.includes('\r\n');
  let modified = false;

  for (const { target, replacement } of replacements) {
    if (typeof target === 'string') {
      const targetNormal = isCRLF ? target.replace(/\n/g, '\r\n') : target.replace(/\r\n/g, '\n');
      const replNormal = isCRLF ? replacement.replace(/\n/g, '\r\n') : replacement.replace(/\r\n/g, '\n');
      if (content.includes(targetNormal)) {
        content = content.replace(targetNormal, replNormal);
        modified = true;
      } else if (content.includes(target)) {
        content = content.replace(target, replacement);
        modified = true;
      } else {
        console.warn(`[WARN] Target not found in ${path.basename(filePath)}:\n${target.substring(0, 80)}...`);
      }
    } else if (target instanceof RegExp) {
      if (target.test(content)) {
        content = content.replace(target, replacement);
        modified = true;
      } else {
        console.warn(`[WARN] Regex target not found in ${path.basename(filePath)}: ${target}`);
      }
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✓ Updated ${path.basename(filePath)}`);
  }
}

// =========================================================================
// 1. Update LeadSelfFillForm.jsx
// =========================================================================
const leadFormPath = path.join(__dirname, '../../frontend/src/pages/public/LeadSelfFillForm.jsx');
let leadFormContent = fs.readFileSync(leadFormPath, 'utf8');

// A. Update initial form state with IT fields
leadFormContent = leadFormContent.replace(
  `serviceId: "dnv",\n    applicantsCount: "Main Only",\n    dependentsDetails: [],`,
  `serviceId: "custom_software",\n    companyName: "",\n    budget: "$10,000 - $25,000",\n    targetTimeline: "1 - 3 months",\n    applicantsCount: "Main Only",\n    dependentsDetails: [],`
);
leadFormContent = leadFormContent.replace(
  `serviceId: "dnv",\r\n    applicantsCount: "Main Only",\r\n    dependentsDetails: [],`,
  `serviceId: "custom_software",\r\n    companyName: "",\r\n    budget: "$10,000 - $25,000",\r\n    targetTimeline: "1 - 3 months",\r\n    applicantsCount: "Main Only",\r\n    dependentsDetails: [],`
);

// B. Update Heading & Description
leadFormContent = leadFormContent.replace(
  `{rescheduleConsultationId ? "Reschedule Assessment 🔄" : (isClientRebook ? "Schedule Follow-up Meeting 📅" : "Book Assessment 📅")}`,
  `{rescheduleConsultationId ? "Reschedule Discovery Call 🔄" : (isClientRebook ? "Schedule Project Follow-up 📅" : "Schedule IT Project Discovery Call 🚀")}`
);

leadFormContent = leadFormContent.replace(
  `{isClientRebook ? "Select your preferred date and time slot below to schedule a follow-up consultation with your Case Officer." : "Please provide your details and choose a convenient date/time for your Free 20-Minute Eligibility Assessment."}`,
  `{isClientRebook ? "Select your preferred date and time slot below to schedule a follow-up discussion with your Solutions Consultant." : "Share your project requirements and select a convenient date/time for a 1-on-1 discovery and technical consultation with our engineering team."}`
);

// C. Replace Service Category & Category Dropdown with IT Project Domain
const oldServiceCategoryBlockRegex = /\{\/\* Service Category Dropdown \*\/\}[\s\S]*?<\/div>\s*<\/div>/;
const newServiceCategoryBlock = `{/* IT Project Domain Selection */}
                <div style={{ marginBottom: "20px" }}>
                  <label style={labelStyle}>Select IT Project Domain / Service *</label>
                  <select
                    value={form.serviceId}
                    onChange={(e) => {
                      setError("");
                      handleChange("serviceId", e.target.value);
                    }}
                    style={{ ...inputStyle, color: "#fff", border: "1px solid rgba(102, 126, 234, 0.4)" }}
                  >
                    <option value="custom_software" style={{ background: "#24243e" }}>💻 Custom Software & SaaS Development</option>
                    <option value="web_mobile" style={{ background: "#24243e" }}>📱 Web & Mobile App Development</option>
                    <option value="ai_automation" style={{ background: "#24243e" }}>🤖 AI & Intelligent Automation Solutions</option>
                    <option value="cloud_devops" style={{ background: "#24243e" }}>☁️ Cloud Architecture, DevOps & Infrastructure</option>
                    <option value="ui_ux_design" style={{ background: "#24243e" }}>🎨 UI/UX Design & Product Prototyping</option>
                    <option value="dedicated_team" style={{ background: "#24243e" }}>👥 Dedicated Engineering Teams & Staffing</option>
                  </select>
                </div>`;

if (oldServiceCategoryBlockRegex.test(leadFormContent)) {
  leadFormContent = leadFormContent.replace(oldServiceCategoryBlockRegex, newServiceCategoryBlock);
}

// D. Add Company Name input right after Name & Phone inputs
const oldCountryGridRegex = /<div className="lead-form-grid-2col">\s*<SearchableCountrySelect\s*label="Nationality \*"[\s\S]*?<\/div>/;
const newCountryGrid = `<div className="lead-form-grid-2col">
                  <div>
                    <label style={labelStyle}>Company / Organization Name</label>
                    <input
                      value={form.companyName || ""}
                      onChange={(e) => handleChange("companyName", e.target.value)}
                      placeholder="e.g. Acme Innovations LLC"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <SearchableCountrySelect
                      label="Country / Primary Location *"
                      value={form.countryOfResidence}
                      onChange={(val) => {
                        handleChange("countryOfResidence", val);
                        handleChange("nationality", val);
                      }}
                      options={ALL_COUNTRIES}
                      placeholder="Select Country"
                      disabled={isExistingLead}
                      labelStyle={labelStyle}
                      inputStyle={inputStyle}
                    />
                  </div>
                </div>`;

if (oldCountryGridRegex.test(leadFormContent)) {
  leadFormContent = leadFormContent.replace(oldCountryGridRegex, newCountryGrid);
}

// E. Replace Visa Program & Dependents with Budget, Timeline & Project Brief
const oldVisaAndDepsRegex = /\{\/\* Section: Visa Program \(only for visa category\) \*\/\}[\s\S]*?\{\/\* Section: Sworn Translation redirect notice \*\/\}[\s\S]*?<\/div>\s*\)\}/;
const newBudgetAndBrief = `{/* Project Commercials: Budget & Timeline */}
                <div className="lead-form-grid-2col" style={{ marginBottom: "20px" }}>
                  <div>
                    <label style={labelStyle}>Estimated Project Budget Range *</label>
                    <select
                      value={form.budget || "$10,000 - $25,000"}
                      onChange={(e) => handleChange("budget", e.target.value)}
                      style={{ ...inputStyle, color: "#fff" }}
                    >
                      <option value="< $5,000 (MVP / Pilot)" style={{ background: "#24243e" }}>Under $5,000 (MVP / Proof of Concept)</option>
                      <option value="$5,000 - $15,000 (Standard)" style={{ background: "#24243e" }}>$5,000 - $15,000 (Standard Project)</option>
                      <option value="$15,000 - $35,000 (Growth)" style={{ background: "#24243e" }}>$15,000 - $35,000 (Growth Platform)</option>
                      <option value="$35,000 - $75,000 (Enterprise)" style={{ background: "#24243e" }}>$35,000 - $75,000 (Enterprise Solution)</option>
                      <option value="$75,000+ (Large Scale / Retainer)" style={{ background: "#24243e" }}>$75,000+ (Large Scale / Retainer)</option>
                      <option value="Flexible / To be scoped" style={{ background: "#24243e" }}>Flexible / Need Scoping Assistance</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Target Launch / Timeline</label>
                    <select
                      value={form.targetTimeline || "1 - 3 months"}
                      onChange={(e) => handleChange("targetTimeline", e.target.value)}
                      style={{ ...inputStyle, color: "#fff" }}
                    >
                      <option value="Urgent (< 1 month)" style={{ background: "#24243e" }}>Urgent (&lt; 1 month)</option>
                      <option value="1 - 3 months" style={{ background: "#24243e" }}>1 - 3 months</option>
                      <option value="3 - 6 months" style={{ background: "#24243e" }}>3 - 6 months</option>
                      <option value="6+ months" style={{ background: "#24243e" }}>6+ months</option>
                      <option value="Flexible" style={{ background: "#24243e" }}>Flexible / Exploring Ideas</option>
                    </select>
                  </div>
                </div>

                {/* Project Brief / Technical Scope */}
                <div style={{ marginBottom: "20px" }}>
                  <label style={labelStyle}>Project Overview / Technical Brief</label>
                  <textarea
                    rows={3}
                    value={form.meetingNotes || ""}
                    onChange={(e) => handleChange("meetingNotes", e.target.value)}
                    placeholder="Briefly describe your product goals, key features, target platform (Web/iOS/Android), or preferred tech stack..."
                    style={{
                      ...inputStyle,
                      minHeight: "80px",
                      resize: "vertical",
                      fontFamily: "inherit"
                    }}
                  />
                </div>`;

if (oldVisaAndDepsRegex.test(leadFormContent)) {
  leadFormContent = leadFormContent.replace(oldVisaAndDepsRegex, newBudgetAndBrief);
}

// F. Update handleSubmit payload mapping to pass IT fields cleanly
const oldPayloadPrepRegex = /\/\/ Prepare payload\s*const payload = \{[\s\S]*?payload\.serviceType = form\.serviceId;\s*\}/;
const newPayloadPrep = `// Prepare payload
    const payload = {
      ...form,
      nationality: form.nationality || form.countryOfResidence || "Global",
      serviceType: form.serviceId || "Custom Software & SaaS Development",
      budget: form.budget || "$10,000 - $25,000",
      meetingNotes: form.meetingNotes || "",
      qualificationData: {
        companyName: form.companyName || "",
        targetTimeline: form.targetTimeline || "1 - 3 months",
        budget: form.budget || "$10,000 - $25,000",
        projectScope: form.meetingNotes || ""
      },
      preferredLanguage: finalPrefLang,
      meetingPreferredLanguage: finalMeetingLang
    };`;

if (oldPayloadPrepRegex.test(leadFormContent)) {
  leadFormContent = leadFormContent.replace(oldPayloadPrepRegex, newPayloadPrep);
}

fs.writeFileSync(leadFormPath, leadFormContent, 'utf8');
console.log('✓ Successfully adapted LeadSelfFillForm.jsx for IT lead inquiries');

// =========================================================================
// 2. Update Lead Lists (SuperAdminLeadList.jsx, AdminLeadList.jsx, LeadList.jsx, etc.)
// =========================================================================
const leadListFiles = [
  path.join(__dirname, '../../frontend/src/pages/leads/SuperAdminLeadList.jsx'),
  path.join(__dirname, '../../frontend/src/pages/leads/AdminLeadList.jsx'),
  path.join(__dirname, '../../frontend/src/pages/leads/LeadList.jsx'),
  path.join(__dirname, '../../frontend/src/pages/leads/OperationsLeadList.jsx'),
  path.join(__dirname, '../../frontend/src/pages/leads/AgentLeadList.jsx')
];

for (const fPath of leadListFiles) {
  if (!fs.existsSync(fPath)) continue;
  let code = fs.readFileSync(fPath, 'utf8');

  // A. Replace Category Tabs if present
  const oldTabs = `<Tab value="all" label="💼 All Categories" sx={{ fontWeight: 700, textTransform: 'none' }} />
          <Tab value="visa" label="✈️ Spain Visa & Case Assessment" sx={{ fontWeight: 700, textTransform: 'none' }} />
          <Tab value="property" label="🏠 Property Investment Guidance" sx={{ fontWeight: 700, textTransform: 'none' }} />
          <Tab value="translation" label="📄 Sworn Translation" sx={{ fontWeight: 700, textTransform: 'none' }} />`;
  
  const newTabs = `<Tab value="all" label="💼 All IT Inquiries" sx={{ fontWeight: 700, textTransform: 'none' }} />
          <Tab value="software" label="💻 Software & SaaS" sx={{ fontWeight: 700, textTransform: 'none' }} />
          <Tab value="mobile_web" label="📱 Web & Mobile Apps" sx={{ fontWeight: 700, textTransform: 'none' }} />
          <Tab value="ai_cloud" label="🤖 AI & Cloud Solutions" sx={{ fontWeight: 700, textTransform: 'none' }} />`;

  code = code.replace(oldTabs, newTabs);
  code = code.replace(oldTabs.replace(/\n/g, '\r\n'), newTabs.replace(/\n/g, '\r\n'));

  // B. Replace Tab filtering logic if present
  const oldTabFilter = `if (activeCategoryTab === 'visa') {
        const isVisa = !l.serviceType?.toLowerCase().includes('property') && !l.serviceType?.toLowerCase().includes('translation');
        if (!isVisa) return false;
      } else if (activeCategoryTab === 'property') {
        if (!l.serviceType?.toLowerCase().includes('property') && !l.preferableArea) return false;
      } else if (activeCategoryTab === 'translation') {
        if (!l.serviceType?.toLowerCase().includes('translation') && !l.sourceLanguage) return false;
      }`;

  const newTabFilter = `if (activeCategoryTab === 'software') {
        const isSoftware = l.serviceType?.toLowerCase().includes('software') || l.serviceType?.toLowerCase().includes('saas') || l.serviceId === 'custom_software';
        if (!isSoftware) return false;
      } else if (activeCategoryTab === 'mobile_web') {
        const isMobileWeb = l.serviceType?.toLowerCase().includes('web') || l.serviceType?.toLowerCase().includes('mobile') || l.serviceId === 'web_mobile';
        if (!isMobileWeb) return false;
      } else if (activeCategoryTab === 'ai_cloud') {
        const isAiCloud = l.serviceType?.toLowerCase().includes('ai') || l.serviceType?.toLowerCase().includes('cloud') || l.serviceId === 'ai_automation' || l.serviceId === 'cloud_devops';
        if (!isAiCloud) return false;
      }`;

  code = code.replace(oldTabFilter, newTabFilter);
  code = code.replace(oldTabFilter.replace(/\n/g, '\r\n'), newTabFilter.replace(/\n/g, '\r\n'));

  // C. Update Name column to show Contact & Company Name
  const oldNameCol = `label: 'Name',\n      sortable: true,\n      render: (row) => \`\${row.firstName} \${row.lastName}\``;
  const newNameCol = `label: 'Contact & Company',\n      sortable: true,\n      render: (row) => {
        const comp = row.qualificationData?.companyName || row.companyName;
        return (
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {\`\${row.firstName} \${row.lastName}\`}
            </Typography>
            {comp && (
              <Typography variant="caption" sx={{ color: 'secondary.main', fontWeight: 600, display: 'block' }}>
                🏢 {comp}
              </Typography>
            )}
          </Box>
        );
      }`;

  code = code.replace(oldNameCol, newNameCol);
  code = code.replace(oldNameCol.replace(/\n/g, '\r\n'), newNameCol.replace(/\n/g, '\r\n'));

  // Also match single-line render
  const oldNameColSingle = `label: 'Name',\n      sortable: true,\n      render: (row) => \`\${row.firstName} \${row.lastName}\` },`;
  const newNameColSingle = `label: 'Contact & Company',\n      sortable: true,\n      render: (row) => {
        const comp = row.qualificationData?.companyName || row.companyName;
        return (
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {\`\${row.firstName} \${row.lastName}\`}
            </Typography>
            {comp && (
              <Typography variant="caption" sx={{ color: 'secondary.main', fontWeight: 600, display: 'block' }}>
                🏢 {comp}
              </Typography>
            )}
          </Box>
        );
      } },`;
  code = code.replace(oldNameColSingle, newNameColSingle);
  code = code.replace(oldNameColSingle.replace(/\n/g, '\r\n'), newNameColSingle.replace(/\n/g, '\r\n'));

  // D. Update Service Column to show IT Service and add Budget column
  const oldServiceCol = `id: 'service',\n      label: 'Service',\n      render: (row) => SERVICES.find((s) => s.id === row.serviceId)?.name || row.serviceId\n    },`;
  const newServiceCol = `id: 'service',\n      label: 'IT Service',\n      render: (row) => {
        const matched = SERVICES.find((s) => s.id === row.serviceId || s.id === row.serviceType);
        return matched?.name || row.serviceType || row.serviceId || 'IT Service';
      }\n    },\n    {\n      id: 'budget',\n      label: 'Budget',\n      sortable: true,\n      render: (row) => row.budget || row.qualificationData?.budget || '-'\n    },`;

  code = code.replace(oldServiceCol, newServiceCol);
  code = code.replace(oldServiceCol.replace(/\n/g, '\r\n'), newServiceCol.replace(/\n/g, '\r\n'));

  // Single line service col variant
  const oldServiceColSingle = `id: 'service',\n      label: 'Service',\n      render: (row) => SERVICES.find((s) => s.id === row.serviceId)?.name || row.serviceId },`;
  const newServiceColSingle = `id: 'service',\n      label: 'IT Service',\n      render: (row) => {
        const matched = SERVICES.find((s) => s.id === row.serviceId || s.id === row.serviceType);
        return matched?.name || row.serviceType || row.serviceId || 'IT Service';
      } },\n    {\n      id: 'budget',\n      label: 'Budget',\n      sortable: true,\n      render: (row) => row.budget || row.qualificationData?.budget || '-'\n    },`;
  code = code.replace(oldServiceColSingle, newServiceColSingle);
  code = code.replace(oldServiceColSingle.replace(/\n/g, '\r\n'), newServiceColSingle.replace(/\n/g, '\r\n'));

  // E. Replace Add Modal section heading & labels
  code = code.replace('Visa & Case Setup', 'IT Project & Scope Setup');
  code = code.replace('Visa Service', 'IT Service / Project Type');

  fs.writeFileSync(fPath, code, 'utf8');
  console.log(`✓ Updated ${path.basename(fPath)}`);
}

console.log('--- Phase 2 Leads Script Execution Finished ---');

