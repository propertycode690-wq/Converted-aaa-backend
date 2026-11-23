const express = require('express');
const {
  getExchangeRates, 
  getCustomizationSettings, 
  updateCustomizationSettings,
  getLeadStages,
  updateLeadStages,
  getCompanySettings,
  updateCompanySettings,
  uploadLogo,
  getVisaServices,
  updateVisaServices,
  getPackages,
  createPackage,
  deletePackage,
  updatePackages,
  getEmailTemplates,
  updateEmailTemplates,
  getWhatsappTemplates,
  updateWhatsappTemplates,
  getIntegrations,
  saveIntegrations,
  purgeAllData,
  purgeFinanceData
} = require('../controllers/settingsController');
const { authMiddleware, rbacMiddleware } = require('../middlewares/authMiddleware');
const upload = require('../middlewares/uploadMiddleware');

const router = express.Router();

router.delete('/purge-all-data', authMiddleware, rbacMiddleware(['super_admin']), purgeAllData);
router.delete('/purge-finance', authMiddleware, rbacMiddleware(['super_admin']), purgeFinanceData);

router.route('/customization')
  .get(getCustomizationSettings)
  .put(authMiddleware, updateCustomizationSettings)
  .post(authMiddleware, updateCustomizationSettings);

router.route('/lead-stages')
  .get(authMiddleware, getLeadStages)
  .put(authMiddleware, updateLeadStages);

router.get('/exchange-rates', getExchangeRates);

router.route('/company')
  .get(getCompanySettings)
  .put(authMiddleware, updateCompanySettings);

router.post('/logo', authMiddleware, upload.single('logo'), uploadLogo);

router.route('/services')
  .get(authMiddleware, getVisaServices)
  .put(authMiddleware, updateVisaServices);

router.route('/packages')
  .get(authMiddleware, getPackages)
  .post(authMiddleware, createPackage)
  .put(authMiddleware, updatePackages);

router.route('/packages/:id')
  .delete(authMiddleware, deletePackage);

router.route('/templates/email')
  .get(authMiddleware, getEmailTemplates)
  .put(authMiddleware, updateEmailTemplates);

router.route('/templates/whatsapp')
  .get(authMiddleware, getWhatsappTemplates)
  .put(authMiddleware, updateWhatsappTemplates);

router.route('/integrations')
  .get(authMiddleware, getIntegrations)
  .put(authMiddleware, saveIntegrations)
  .post(authMiddleware, saveIntegrations);

module.exports = router;
