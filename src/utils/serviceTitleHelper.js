/**
 * Resolves dynamic title, icon, assessment name, and category name based on selected IT service type.
 * Kiaan Technologies IT Services Platform.
 */
function getServiceTitleInfo(serviceType) {
  const service = String(serviceType || '').toLowerCase();

  if (service.includes('cloud') || service.includes('devops')) {
    return {
      icon: '☁️',
      title: 'Cloud & DevOps Architecture Consultation',
      assessmentName: 'Cloud Infrastructure & Security Assessment',
      categoryName: 'Cloud & Infrastructure Services'
    };
  }

  if (service.includes('ai') || service.includes('automation')) {
    return {
      icon: '🤖',
      title: 'AI Engineering & Workflow Automation Consultation',
      assessmentName: 'AI & Data Readiness Assessment',
      categoryName: 'AI & Automation Solutions'
    };
  }

  // Default: Custom Software & IT Solutions
  return {
    icon: '💻',
    title: 'Custom Software & Architecture Consultation',
    assessmentName: 'IT Project Scope & Technical Assessment',
    categoryName: 'Custom Software & IT Services'
  };
}

module.exports = { getServiceTitleInfo };
