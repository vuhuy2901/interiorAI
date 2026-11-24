import { Router } from 'express';
import type { Db } from '@paperclipai/db';
import { assertAuthenticated, assertCompanyAccess } from './authz.js';
import * as tokenAnalytics from '../services/token-analytics.js';

export function tokenAnalyticsRoutes(db: Db) {
  const router = Router();

  function getDateRange(query: any): { startDate: Date; endDate: Date } {
    const range = query.range || 'last_30_days';
    const endDate = new Date();
    let startDate = new Date();

    switch (range) {
      case 'today':
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'yesterday':
        startDate.setDate(startDate.getDate() - 1);
        startDate.setHours(0, 0, 0, 0);
        endDate.setDate(endDate.getDate() - 1);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'last_7_days':
        startDate.setDate(startDate.getDate() - 7);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'last_30_days':
        startDate.setDate(startDate.getDate() - 30);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'this_month':
        startDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
        break;
      case 'all_time':
        startDate = new Date('2020-01-01');
        break;
      case 'custom':
        if (query.startDate) startDate = new Date(query.startDate);
        if (query.endDate) endDate = new Date(query.endDate);
        break;
    }

    return { startDate, endDate };
  }

  router.get('/companies/:companyId/token-analytics/summary', async (req, res) => {
    try {
      assertAuthenticated(req);
      const { companyId } = req.params;
      assertCompanyAccess(req, companyId);
      const { startDate, endDate } = getDateRange(req.query);
      const summary = await tokenAnalytics.getCompanyTokenSummary(db, companyId, startDate, endDate);
      res.json(summary);
    } catch (err) {
      console.error('[TokenAnalytics] Summary error:', err);
      res.status(500).json({ error: 'Failed to fetch token summary' });
    }
  });

  router.get('/companies/:companyId/token-analytics/agents', async (req, res) => {
    try {
      assertAuthenticated(req);
      const { companyId } = req.params;
      assertCompanyAccess(req, companyId);
      const { startDate, endDate } = getDateRange(req.query);
      const agents = await tokenAnalytics.getAgentTokenUsage(db, companyId, startDate, endDate);
      res.json(agents);
    } catch (err) {
      console.error('[TokenAnalytics] Agents error:', err);
      res.status(500).json({ error: 'Failed to fetch agent token usage' });
    }
  });

  router.get('/companies/:companyId/token-analytics/timeseries', async (req, res) => {
    try {
      assertAuthenticated(req);
      const { companyId } = req.params;
      assertCompanyAccess(req, companyId);
      const { startDate, endDate } = getDateRange(req.query);
      const bucket = (req.query.bucket as 'hour' | 'day') || 'hour';
      const timeseries = await tokenAnalytics.getTokenUsageTimeseries(db, companyId, startDate, endDate, bucket);
      res.json(timeseries);
    } catch (err) {
      console.error('[TokenAnalytics] Timeseries error:', err);
      res.status(500).json({ error: 'Failed to fetch token timeseries' });
    }
  });

  router.get('/companies/:companyId/token-analytics/models', async (req, res) => {
    try {
      assertAuthenticated(req);
      const { companyId } = req.params;
      assertCompanyAccess(req, companyId);
      const { startDate, endDate } = getDateRange(req.query);
      const models = await tokenAnalytics.getModelTokenBreakdown(db, companyId, startDate, endDate);
      res.json(models);
    } catch (err) {
      console.error('[TokenAnalytics] Models error:', err);
      res.status(500).json({ error: 'Failed to fetch model token breakdown' });
    }
  });

  router.get('/companies/:companyId/token-analytics/projects', async (req, res) => {
    try {
      assertAuthenticated(req);
      const { companyId } = req.params;
      assertCompanyAccess(req, companyId);
      const { startDate, endDate } = getDateRange(req.query);
      const projects = await tokenAnalytics.getProjectTokenUsage(db, companyId, startDate, endDate);
      res.json(projects);
    } catch (err) {
      console.error('[TokenAnalytics] Projects error:', err);
      res.status(500).json({ error: 'Failed to fetch project token usage' });
    }
  });

  router.get('/agents/:agentId/token-analytics/history', async (req, res) => {
    try {
      assertAuthenticated(req);
      const { agentId } = req.params;
      const { startDate, endDate } = getDateRange(req.query);
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);
      const history = await tokenAnalytics.getAgentRunTokenHistory(db, agentId, startDate, endDate, limit);
      res.json(history);
    } catch (err) {
      console.error('[TokenAnalytics] History error:', err);
      res.status(500).json({ error: 'Failed to fetch agent run history' });
    }
  });

  return router;
}

export default tokenAnalyticsRoutes;
