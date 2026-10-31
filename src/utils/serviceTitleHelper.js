/**
 * Resolves dynamic title, icon, assessment name, and category name based on selected service type.
 * Supports Property Investment Guidance Services and Custom Software & Cloud Solutions Services.
 */
function getServiceTitleInfo(serviceType) {
  const service = String(serviceType || '').toLowerCase();

  // 🏠 Property Investment Guidance Service
  if (service.includes('property') || service.includes('investment')) {
    return {
      icon: '🏠',
      title: 'Property Investment Consultation',
      assessmentName: 'Property Investment Guidance Assessment',
      categoryName: 'Property Investment Guidance Services'
    };
  }

  // ✈️ Default: Custom Software & Cloud Solutions Services (DNV, NLV, Tourist, Study, etc.)
  return {
    icon: '✈️',
    title: 'IT Software Solutions Consultation',
    assessmentName: 'IT Software Solutions Eligibility Assessment',
    categoryName: 'Custom Software & Cloud Solutions Services'
  };
}

module.exports = { getServiceTitleInfo };
