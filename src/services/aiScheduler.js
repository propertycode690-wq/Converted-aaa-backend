/**
 * 24/7 Autonomous AI Background Scheduler
 * Runs periodic monitoring jobs and dispatches CRM events to the AI Supervisor
 */

const ceoSupervisorAi = require('./aiEmployees/ceoSupervisorAi');

class AiScheduler {
  constructor() {
    this.intervals = [];
    this.isRunning = false;
    this.lastHeartbeat = null;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastHeartbeat = new Date();
    console.log('[AI 24/7 Scheduler] Starting autonomous background workers...');

    // 1. Every 5 Minutes: Due follow-ups & SLA checks
    const fiveMinInterval = setInterval(async () => {
      this.lastHeartbeat = new Date();
      try {
        await ceoSupervisorAi.routeEvent('cron:5min', {});
      } catch (err) {
        console.error('[AI Scheduler 5min error]:', err.message);
      }
    }, 5 * 60 * 1000);
    this.intervals.push(fiveMinInterval);

    // 2. Every 15 Minutes: Project deadlines & blocker detection
    const fifteenMinInterval = setInterval(async () => {
      this.lastHeartbeat = new Date();
      try {
        await ceoSupervisorAi.routeEvent('cron:15min', {});
      } catch (err) {
        console.error('[AI Scheduler 15min error]:', err.message);
      }
    }, 15 * 60 * 1000);
    this.intervals.push(fifteenMinInterval);

    // 3. Hourly: Overdue invoice check & billing audits
    const hourlyInterval = setInterval(async () => {
      this.lastHeartbeat = new Date();
      try {
        await ceoSupervisorAi.routeEvent('cron:hourly', {});
      } catch (err) {
        console.error('[AI Scheduler Hourly error]:', err.message);
      }
    }, 60 * 60 * 1000);
    this.intervals.push(hourlyInterval);

    console.log('[AI 24/7 Scheduler] Background timers initialized successfully.');
  }

  stop() {
    for (const interval of this.intervals) {
      clearInterval(interval);
    }
    this.intervals = [];
    this.isRunning = false;
    console.log('[AI 24/7 Scheduler] Background timers stopped.');
  }

  getHeartbeat() {
    return {
      isRunning: this.isRunning,
      lastHeartbeat: this.lastHeartbeat || new Date(),
      activeTimerCount: this.intervals.length
    };
  }
}

module.exports = new AiScheduler();

